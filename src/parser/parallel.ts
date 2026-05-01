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

export class ParallelParser {
  private maxWorkers: number;

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers || Math.max(1, os.cpus().length - 1);
  }

  async parseFiles(filePaths: string[]): Promise<Map<string, ParsedFile>> {
    if (filePaths.length === 0) {
      return new Map();
    }

    // For small batches, don't use workers (overhead not worth it)
    if (filePaths.length < 10) {
      return this.parseSequential(filePaths);
    }

    logger.debug(`Parsing ${filePaths.length} files with ${this.maxWorkers} workers`);

    const results = new Map<string, ParsedFile>();
    const errors: string[] = [];
    
    // Process files in batches
    const batchSize = Math.ceil(filePaths.length / this.maxWorkers);
    const batches: string[][] = [];
    
    for (let i = 0; i < filePaths.length; i += batchSize) {
      batches.push(filePaths.slice(i, i + batchSize));
    }

    const workerPromises = batches.map(batch => this.processBatch(batch));
    const batchResults = await Promise.all(workerPromises);

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

  private async processBatch(filePaths: string[]): Promise<{
    results: Map<string, ParsedFile>;
    errors: string[];
  }> {
    const results = new Map<string, ParsedFile>();
    const errors: string[] = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.parseFileInWorker(filePath);
        results.set(filePath, result);
      } catch (error) {
        const errorMsg = `Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
      }
    }

    return { results, errors };
  }

  private parseFileInWorker(filePath: string): Promise<ParsedFile> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'worker.js');
      
      const worker = new Worker(workerPath, {
        workerData: { type: 'parse', filePath },
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

  private async parseSequential(filePaths: string[]): Promise<Map<string, ParsedFile>> {
    const { Parser } = await import('./index.js');
    const results = new Map<string, ParsedFile>();

    for (const filePath of filePaths) {
      try {
        const result = Parser.parseFile(filePath);
        results.set(filePath, result);
      } catch (error) {
        logger.debug(`Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return results;
  }
}
