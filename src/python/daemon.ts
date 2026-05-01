/**
 * Python Daemon Manager
 * Manages a persistent Python process for analytics to avoid subprocess spawn overhead.
 * Provides 2-4 second speedup per analytics call.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { getPythonScript } from '../utils/index.js';
import { logger } from '../utils/index.js';

export interface DaemonRequest {
  command: 'analyze' | 'ping' | 'shutdown' | 'clear_cache' | 'stats';
  data?: unknown;
  fast?: boolean;
}

export interface DaemonResponse {
  status?: string;
  error?: string;
  cached?: boolean;
  request_count?: number;
  cache_size?: number;
  [key: string]: unknown;
}

export class PythonDaemon extends EventEmitter {
  private process: ChildProcess | null = null;
  private pythonCommand: string;
  private ready: boolean = false;
  private pendingRequests: Map<number, {
    resolve: (value: DaemonResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private requestId: number = 0;
  private buffer: string = '';
  private startTime: number = 0;
  private requestCount: number = 0;

  constructor(pythonCommand: string = 'python3') {
    super();
    this.pythonCommand = pythonCommand;
  }

  /**
   * Start the Python daemon process.
   */
  async start(): Promise<void> {
    if (this.process) {
      logger.debug('Python daemon already running');
      return;
    }

    this.startTime = Date.now();
    const daemonScript = getPythonScript('daemon');

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.pythonCommand, [daemonScript], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Setup stdout handler
        this.process.stdout?.on('data', (data) => {
          this.handleOutput(data.toString());
        });

        // Setup stderr handler
        this.process.stderr?.on('data', (data) => {
          logger.debug('Python daemon stderr:', data.toString());
        });

        // Setup exit handler
        this.process.on('exit', (code, signal) => {
          logger.debug(`Python daemon exited with code ${code}, signal ${signal}`);
          this.ready = false;
          this.process = null;
          this.emit('exit', { code, signal });
          
          // Reject all pending requests
          for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Daemon process exited'));
          }
          this.pendingRequests.clear();
        });

        // Setup error handler
        this.process.on('error', (error) => {
          logger.error('Python daemon error:', error);
          this.emit('error', error);
          reject(error);
        });

        // Wait for ready signal
        const readyTimeout = setTimeout(() => {
          reject(new Error('Python daemon failed to start (timeout)'));
        }, 10000);

        this.once('ready', () => {
          clearTimeout(readyTimeout);
          const startupTime = Date.now() - this.startTime;
          logger.success(`Python daemon started in ${startupTime}ms`);
          resolve();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the Python daemon process.
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      // Try graceful shutdown first
      await this.sendRequest({ command: 'shutdown' }, 5000);
    } catch (error) {
      logger.debug('Graceful shutdown failed, killing process');
    }

    // Force kill if still running
    if (this.process) {
      this.process.kill('SIGTERM');
      
      // Wait a bit, then force kill
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (this.process) {
        this.process.kill('SIGKILL');
      }
    }

    this.ready = false;
    this.process = null;
  }

  /**
   * Check if daemon is ready.
   */
  isReady(): boolean {
    return this.ready && this.process !== null;
  }

  /**
   * Send a request to the daemon.
   */
  async sendRequest(request: DaemonRequest, timeoutMs: number = 30000): Promise<DaemonResponse> {
    if (!this.isReady()) {
      throw new Error('Python daemon not ready');
    }

    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      
      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Send request
      try {
        const requestLine = JSON.stringify(request) + '\n';
        this.process?.stdin?.write(requestLine);
        this.requestCount++;
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Handle output from daemon.
   */
  private handleOutput(data: string): void {
    this.buffer += data;

    // Process complete lines
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.substring(0, newlineIndex).trim();
      this.buffer = this.buffer.substring(newlineIndex + 1);

      if (!line) continue;

      try {
        const response = JSON.parse(line) as DaemonResponse;
        this.handleResponse(response);
      } catch (error) {
        logger.debug('Failed to parse daemon response:', line);
      }
    }
  }

  /**
   * Handle a response from daemon.
   */
  private handleResponse(response: DaemonResponse): void {
    // Handle ready signal
    if (response.status === 'ready') {
      this.ready = true;
      this.emit('ready');
      return;
    }

    // Handle shutdown signal
    if (response.status === 'shutdown') {
      this.ready = false;
      this.emit('shutdown', response);
      return;
    }

    // Resolve pending request (FIFO order)
    const firstPending = this.pendingRequests.entries().next();
    if (!firstPending.done) {
      const [id, pending] = firstPending.value;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      pending.resolve(response);
    }
  }

  /**
   * Get daemon statistics.
   */
  async getStats(): Promise<DaemonResponse> {
    return this.sendRequest({ command: 'stats' });
  }

  /**
   * Ping the daemon to check if it's alive.
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.sendRequest({ command: 'ping' }, 5000);
      return response.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear the daemon's cache.
   */
  async clearCache(): Promise<void> {
    await this.sendRequest({ command: 'clear_cache' });
  }

  /**
   * Get uptime in milliseconds.
   */
  getUptime(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  /**
   * Get request count.
   */
  getRequestCount(): number {
    return this.requestCount;
  }
}

/**
 * Singleton daemon manager.
 */
class DaemonManager {
  private daemon: PythonDaemon | null = null;
  private pythonCommand: string = 'python3';

  /**
   * Get or create daemon instance.
   */
  async getDaemon(pythonCommand?: string): Promise<PythonDaemon> {
    if (pythonCommand) {
      this.pythonCommand = pythonCommand;
    }

    if (!this.daemon || !this.daemon.isReady()) {
      this.daemon = new PythonDaemon(this.pythonCommand);
      await this.daemon.start();
    }

    return this.daemon;
  }

  /**
   * Stop daemon if running.
   */
  async stopDaemon(): Promise<void> {
    if (this.daemon) {
      await this.daemon.stop();
      this.daemon = null;
    }
  }

  /**
   * Check if daemon is running.
   */
  isDaemonRunning(): boolean {
    return this.daemon !== null && this.daemon.isReady();
  }
}

export const daemonManager = new DaemonManager();
