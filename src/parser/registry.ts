import { ParsedFile } from '../types/models.js';

type ParserImpl = {
  parseFile: (filePath: string) => ParsedFile;
};

const extMap: Map<string, ParserImpl> = new Map();
let defaultParser: ParserImpl | null = null;

export function registerParserForExtension(ext: string, parser: ParserImpl) {
  extMap.set(ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`, parser);
}

export function registerDefaultParser(parser: ParserImpl) {
  defaultParser = parser;
}

export function parseFileWithRegistry(filePath: string): ParsedFile {
  const ext = (() => {
    const idx = filePath.lastIndexOf('.');
    return idx >= 0 ? filePath.slice(idx).toLowerCase() : '';
  })();

  const parser = extMap.get(ext) || defaultParser;
  if (!parser) {
    throw new Error(`No parser registered for extension '${ext}' and no default parser available`);
  }

  return parser.parseFile(filePath);
}

export type { ParserImpl };
