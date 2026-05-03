import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { ParsedFile } from '../types/models.js';
import { logger } from '../utils/index.js';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WorkerResult {
  success: boolean;
  filePath: string;
  result?: ParsedFile;
  error?: string;
}

interface ProgressCallback {
  (current: number, total: number): void;
}

export class ParallelParser {
  private maxWorkers: number;

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers || Math.max(1, os.cpus().length - 1);
  }

  async parseFiles(
    filePaths: string[],
    onProgress?: ProgressCallback
  ): Promise<Map<string, ParsedFile>> {
    if (filePaths.length === 0) {
      return new Map();
    }

    // For small batches, don't use workers (overhead not worth it)
    if (filePaths.length < 10) {
      return this.parseSequential(filePaths, onProgress);
    }

    logger.debug(`Parsing ${filePaths.length} files with ${this.maxWorkers} workers`);

    const results = new Map<string, ParsedFile>();
    const errors: string[] = [];
    
    // Create shared buffer for progress tracking (thread-safe counter)
    const progressBuffer = new SharedArrayBuffer(4); // 4 bytes for Int32
    const progressCounter = new Int32Array(progressBuffer);
    progressCounter[0] = 0; // Initialize to 0
    
    // Process files in batches
    const batchSize = Math.ceil(filePaths.length / this.maxWorkers);
    const batches: string[][] = [];
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      batches.push(filePaths.slice(i, i + batchSize));
    }

    // Start progress monitoring if callback provided
    let progressInterval: NodeJS.Timeout | undefined;
    if (onProgress) {
      progressInterval = setInterval(() => {
        const current = Atomics.load(progressCounter, 0);
        onProgress(current, filePaths.length);
      }, 100); // Update every 100ms
    }

    const workerPromises = batches.map(batch => 
      this.processBatch(batch, progressBuffer)
    );
    const batchResults = await Promise.all(workerPromises);

    // Stop progress monitoring
    if (progressInterval) {
      clearInterval(progressInterval);
      // Final progress update
      if (onProgress) {
        onProgress(filePaths.length, filePaths.length);
      }
    }

    for (const batchResult of batchResults) {
      for (const [filePath, result] of batchResult.results) {
        results.set(filePath, result);
      }
      errors.push(...batchResult.errors);
    }

    if (errors.length > 0) {
      logger.warn(`Failed to parse ${errors.length} files`);
      errors.slice(0, 5).forEach(err => logger.debug(err));
    }

    return results;
  }

  private async processBatch(
    filePaths: string[],
    progressBuffer: SharedArrayBuffer
  ): Promise<{
    results: Map<string, ParsedFile>;
    errors: string[];
  }> {
    const results = new Map<string, ParsedFile>();
    const errors: string[] = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.parseFileInWorker(filePath, progressBuffer);
        results.set(filePath, result);
      } catch (error) {
        const errorMsg = `Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.debug(errorMsg); // Add debug logging
        // Still increment progress counter on error
        const progressCounter = new Int32Array(progressBuffer);
        Atomics.add(progressCounter, 0, 1);
      }
    }

    return { results, errors };
  }

  private parseFileInWorker(
    filePath: string,
    progressBuffer: SharedArrayBuffer
  ): Promise<ParsedFile> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'worker.js');
      
      const worker = new Worker(workerPath, {
        workerData: { 
          type: 'parse', 
          filePath,
          progressBuffer 
        },
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Worker timeout for ${filePath}`));
      }, 30000); // 30 second timeout

      worker.on('message', (message: WorkerResult) => {
        clearTimeout(timeout);
        if (message.success && message.result) {
          resolve(message.result);
        } else {
          reject(new Error(message.error || 'Unknown worker error'));
        }
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  private async parseSequential(
    filePaths: string[],
    onProgress?: ProgressCallback
  ): Promise<Map<string, ParsedFile>> {
    const { Parser } = await import('./index.js');
    const { PdfParser } = await import('./pdf.js');
    const results = new Map<string, ParsedFile>();

    let processed = 0;
    for (const filePath of filePaths) {
      try {
        // Use async PDF parser for PDF files
        let result: ParsedFile;
        if (filePath.toLowerCase().endsWith('.pdf')) {
          result = await PdfParser.parseFileAsync(filePath);
        } else {
          result = Parser.parseFile(filePath);
        }
        
        results.set(filePath, result);
        processed++;
        if (onProgress) {
          onProgress(processed, filePaths.length);
        }
      } catch (error) {
        logger.debug(`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        processed++;
        if (onProgress) {
          onProgress(processed, filePaths.length);
        }
      }
    }

    return results;
  }
}
