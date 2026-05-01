import { parentPort, workerData } from 'worker_threads';
import { Parser } from './index.js';
import { ParsedFile } from '../types/models.js';

interface WorkerMessage {
  type: 'parse';
  filePath: string;
}

interface WorkerResult {
  success: boolean;
  filePath: string;
  result?: ParsedFile;
  error?: string;
}

if (parentPort) {
  const { filePath } = workerData as WorkerMessage;
  
  try {
    const result = Parser.parseFile(filePath);
    const response: WorkerResult = {
      success: true,
      filePath,
      result,
    };
    parentPort.postMessage(response);
  } catch (error) {
    const response: WorkerResult = {
      success: false,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    };
    parentPort.postMessage(response);
  }
}
