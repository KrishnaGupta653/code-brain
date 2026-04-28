import { TypeScriptParser } from './typescript.js';
import { JavaParser } from './java.js';
import { GenericParser } from './generic.js';
import { ParsedFile } from '../types/models.js';
import {
  isJavascriptFile,
  isJavaFile,
  isTypescriptFile,
  isGenericScannableFile,
} from '../utils/index.js';

export class Parser {
  static parseFile(filePath: string): ParsedFile {
    if (isJavaFile(filePath)) {
      return JavaParser.parseFile(filePath);
    }
    if (isTypescriptFile(filePath) || isJavascriptFile(filePath)) {
      return TypeScriptParser.parseFile(filePath);
    }
    if (isGenericScannableFile(filePath)) {
      return GenericParser.parseFile(filePath);
    }

    throw new Error(`Unsupported file type: ${filePath}`);
  }

  static canParse(filePath: string): boolean {
    return (
      isJavaFile(filePath) ||
      isTypescriptFile(filePath) ||
      isJavascriptFile(filePath) ||
      isGenericScannableFile(filePath)
    );
  }
}

export { TypeScriptParser };
export { JavaParser };
export { GenericParser };
