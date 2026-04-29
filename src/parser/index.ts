import { TypeScriptParser } from './typescript.js';
import { JavaParser } from './java.js';
import { FallbackParser } from './fallback.js';
import { parseFileWithRegistry, registerParserForExtension, registerDefaultParser } from './registry.js';
import { ParsedFile } from '../types/models.js';
import { isSupportedSourceFile } from '../utils/index.js';

// register known parsers
registerParserForExtension('.ts', TypeScriptParser);
registerParserForExtension('.tsx', TypeScriptParser);
registerParserForExtension('.js', TypeScriptParser);
registerParserForExtension('.jsx', TypeScriptParser);
registerParserForExtension('.mjs', TypeScriptParser);
registerParserForExtension('.cjs', TypeScriptParser);
registerParserForExtension('.java', JavaParser);

// fallback parser for other textual files
registerDefaultParser(FallbackParser);

export class Parser {
  static parseFile(filePath: string): ParsedFile {
    if (!isSupportedSourceFile(filePath)) {
      throw new Error(`Unsupported file type: ${filePath}`);
    }
    return parseFileWithRegistry(filePath);
  }

  static canParse(filePath: string): boolean {
    return isSupportedSourceFile(filePath);
  }
}

export { TypeScriptParser, JavaParser, FallbackParser };
