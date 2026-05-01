import { spawn } from 'child_process';
import crypto from 'crypto';
import { getPythonScript } from '../utils/index.js';
import { AnalyticsResult } from '../types/models.js';
import { logger } from '../utils/index.js';
import { SQLiteStorage } from '../storage/index.js';
import { daemonManager } from './daemon.js';

export class PythonBridge {
  private static useDaemon: boolean = true;

  /**
   * Enable or disable daemon mode.
   */
  static setDaemonMode(enabled: boolean): void {
    this.useDaemon = enabled;
  }

  /**
   * Run analytics using daemon or fallback to subprocess.
   */
  static async runAnalytics(
    graphData: {
      nodes: unknown[];
      edges: unknown[];
    },
    pythonPath?: string,
    storage?: SQLiteStorage,
    projectRoot?: string
  ): Promise<AnalyticsResult> {
    // FILTER: only send structural nodes to Python
    const ANALYTICS_NODE_TYPES = new Set(['file', 'module', 'class', 'function', 'route']);
    const filteredNodes = (graphData.nodes as Array<{id: string; type: string; name: string}>)
      .filter(n => ANALYTICS_NODE_TYPES.has(n.type))
      .map(n => ({ id: n.id, type: n.type, name: n.name })); // strip metadata

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = (graphData.edges as Array<{from: string; to: string; type: string}>)
      .filter(e => filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to))
      .map(e => ({ from: e.from, to: e.to, type: e.type })); // strip metadata

    // Compute graph fingerprint for caching
    const fingerprint = this.computeFingerprint(filteredNodes, filteredEdges);
    
    // Check cache if storage is available
    if (storage && projectRoot) {
      const cached = storage.getAnalyticsCache(projectRoot, 'full_analytics', fingerprint);
      if (cached) {
        logger.debug('Using cached analytics results');
        return this.parseAnalyticsResult(cached);
      }
    }

    const safePayload = { nodes: filteredNodes, edges: filteredEdges, fingerprint };

    // Try daemon mode first
    if (this.useDaemon) {
      try {
        const result = await this.runWithDaemon(safePayload, pythonPath);
        if (result) {
          // Cache the results
          if (storage && projectRoot) {
            storage.saveAnalyticsCache(projectRoot, 'full_analytics', result.rawResult, fingerprint);
          }
          return result.analytics;
        }
      } catch (error) {
        logger.debug('Daemon mode failed, falling back to subprocess:', error);
      }
    }

    // Fallback to subprocess mode
    const candidates = [
      pythonPath,
      process.platform === 'win32' ? 'python' : undefined,
      'python3',
      'python'
    ].filter((value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index
    );

    for (const candidate of candidates) {
      const result = await this.tryRunAnalytics(candidate, safePayload);
      if (result.ok) {
        // Cache the results
        if (storage && projectRoot) {
          storage.saveAnalyticsCache(projectRoot, 'full_analytics', result.rawResult, fingerprint);
        }
        return result.analytics;
      }
    }

    logger.warn('Python analytics unavailable; continuing with deterministic graph only');
    return this.emptyAnalytics();
  }

  private static computeFingerprint(nodes: unknown[], edges: unknown[]): string {
    // Create a stable hash of node and edge IDs
    const nodeIds = (nodes as Array<{id: string}>).map(n => n.id).sort();
    const edgeIds = (edges as Array<{from: string; to: string}>)
      .map(e => `${e.from}->${e.to}`)
      .sort();
    
    const combined = JSON.stringify({ nodes: nodeIds, edges: edgeIds });
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }

  /**
   * Run analytics using persistent daemon.
   */
  private static async runWithDaemon(
    graphData: {
      nodes: unknown[];
      edges: unknown[];
      fingerprint: string;
    },
    pythonPath?: string
  ): Promise<{ analytics: AnalyticsResult; rawResult: unknown } | null> {
    try {
      const daemon = await daemonManager.getDaemon(pythonPath);
      
      const response = await daemon.sendRequest({
        command: 'analyze',
        data: graphData,
        fast: false
      });

      if (response.error) {
        logger.debug('Daemon analytics error:', response.error);
        return null;
      }

      const analytics = this.parseAnalyticsResult(response);
      return { analytics, rawResult: response };
    } catch (error) {
      logger.debug('Daemon request failed:', error);
      return null;
    }
  }

  private static parseAnalyticsResult(data: unknown): AnalyticsResult {
    const results = data as {
      centrality?: Record<string, number>;
      importance?: Record<string, number>;
      communities?: Array<string[]>;
    };

    const centrality = new Map<string, number>(
      Object.entries(results.centrality || {}).map(([nodeId, score]) => [
        nodeId,
        Number(score)
      ])
    );
    const importance = new Map<string, number>(
      Object.entries(results.importance || {}).map(([nodeId, score]) => [
        nodeId,
        Number(score)
      ])
    );

    return {
      centrality,
      communities: results.communities || [],
      keyPaths: [],
      importance
    };
  }

  private static async tryRunAnalytics(
    pythonCommand: string,
    graphData: {
      nodes: unknown[];
      edges: unknown[];
      fingerprint: string;
    }
  ): Promise<{ ok: true; analytics: AnalyticsResult; rawResult: unknown } | { ok: false }> {
    return new Promise(resolve => {
      const pythonScript = getPythonScript('main');

      const python = spawn(pythonCommand, [pythonScript]);
      let output = '';

      // Add timeout
      const timeout = setTimeout(() => {
        python.kill();
        logger.debug(`Python analytics timeout for ${pythonCommand}`);
        resolve({ ok: false });
      }, 30_000); // 30 second timeout

      python.stdout.on('data', data => {
        output += data.toString();
      });

      python.stderr.on('data', data => {
        logger.debug('Python stderr:', data.toString());
      });

      python.on('close', code => {
        clearTimeout(timeout);
        if (code !== 0) {
          logger.debug(`Python analytics failed with ${pythonCommand} (code ${code})`);
          return resolve({ ok: false });
        }

        try {
          const results = JSON.parse(output);
          const analytics = this.parseAnalyticsResult(results);

          resolve({
            ok: true,
            analytics,
            rawResult: results
          });
        } catch (e) {
          logger.debug('Failed to parse analytics output', e);
          resolve({ ok: false });
        }
      });

      python.on('error', err => {
        clearTimeout(timeout);
        logger.debug(`Python process error for ${pythonCommand}:`, err);
        resolve({ ok: false });
      });

      // Send graph data
      python.stdin.write(JSON.stringify(graphData));
      python.stdin.end();
    });
  }

  private static emptyAnalytics(): AnalyticsResult {
    return {
      centrality: new Map(),
      communities: [],
      keyPaths: [],
      importance: new Map()
    };
  }
}
