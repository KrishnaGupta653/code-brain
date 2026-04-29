import fs from 'fs';
import crypto from 'crypto';
import { ParsedFile, ParsedSymbol, ParsedImport, ParsedExport } from '../types/models.js';
import { ParserError } from '../utils/index.js';

export class FallbackParser {
  static parseFile(filePath: string): ParsedFile {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const symbols: ParsedSymbol[] = [];
      const imports: ParsedImport[] = [];
      const exports: ParsedExport[] = [];
      const entryPoints: string[] = [];

      // Attempt to find simple function-like definitions across languages
      const funcPatterns = [
        /function\s+([A-Za-z_$][\w$]*)\s*\(/g, // JS, TS, PHP
        /def\s+([A-Za-z_$][\w$]*)\s*\(/g, // Python, Ruby
        /(?:public|protected|private)?\s+(?:static\s+)?[\w<>,\s\[\]]+\s+([A-Za-z_$][\w$]*)\s*\(/g, // Java, C#, C++
      ];

      for (const re of funcPatterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const name = m[1];
          symbols.push({
            name,
            type: name === 'main' ? 'function' : 'function',
            location: {
              file: filePath,
              startLine: content.slice(0, m.index).split('\n').length,
              endLine: content.slice(0, m.index + m[0].length).split('\n').length,
              startCol: content.slice(0, m.index).split('\n').slice(-1)[0].length + 1,
              endCol: content.slice(0, m.index + m[0].length).split('\n').slice(-1)[0].length + 1,
              text: m[0],
            },
            isExported: false,
          });
        }
      }

      // Very simple import detection (languages vary widely)
      const importRe = /^\s*(?:import|using|require)\b.*$/gm;
      let im: RegExpExecArray | null;
      while ((im = importRe.exec(content)) !== null) {
        imports.push({ module: im[0].trim(), location: { file: filePath, startLine: content.slice(0, im.index).split('\n').length, endLine: content.slice(0, im.index + im[0].length).split('\n').length, startCol: 1, endCol: im[0].length + 1 }, bindings: [] });
      }

      return {
        path: filePath,
        language: 'unknown',
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        symbols,
        imports,
        exports,
        entryPoints,
        isTestFile: /@Test\b|\bdescribe\b|\bpytest\b/.test(content),
        isConfigFile: false,
      };
    } catch (error) {
      throw new ParserError(`Fallback parser failed for file: ${filePath}`, error);
    }
  }
}

