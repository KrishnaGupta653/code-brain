import { TypeScriptParser } from './typescript.js';
import { ParsedFile } from '../types/models.js';
import { isSupportedSourceFile } from '../utils/index.js';

export class Parser {
  static parseFile(filePath: string): ParsedFile {
    if (isSupportedSourceFile(filePath)) {
      return TypeScriptParser.parseFile(filePath);
    }

    throw new Error(`Unsupported file type: ${filePath}`);
  }

  static canParse(filePath: string): boolean {
    return isSupportedSourceFile(filePath);
  }
}

export { TypeScriptParser };
