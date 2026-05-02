import { parentPort, workerData } from 'worker_threads';
import { Parser } from './index.js';
import { ParsedFile } from '../types/models.js';

interface WorkerMessage {
  type: 'parse';
  filePath: string;
  progressBuffer?: SharedArrayBuffer;
}

interface WorkerResult {
  success: boolean;
  filePath: string;
  result?: ParsedFile;
  error?: string;
}

if (parentPort) {
  const { filePath, progressBuffer } = workerData as WorkerMessage;
  
  try {
    const result = Parser.parseFile(filePath);
    
    // Increment progress counter atomically if buffer provided
    if (progressBuffer) {
      const progressCounter = new Int32Array(progressBuffer);
      Atomics.add(progressCounter, 0, 1);
    }
    
    const response: WorkerResult = {
      success: true,
      filePath,
      result,
    };
    parentPort.postMessage(response);
  } catch (error) {
    // Increment progress counter even on error
    if (progressBuffer) {
      const progressCounter = new Int32Array(progressBuffer);
      Atomics.add(progressCounter, 0, 1);
    }
    
    const response: WorkerResult = {
      success: false,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    };
    parentPort.postMessage(response);
  }
}
