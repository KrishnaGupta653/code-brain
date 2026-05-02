import fs from 'fs';
import crypto from 'crypto';
import { ParsedFile, ParsedSymbol, ParsedImport, ParsedExport } from '../types/models.js';
import { detectLanguage, ParserError } from '../utils/index.js';

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
        /fn\s+([A-Za-z_$][\w$]*)\s*\(/g, // Rust
        /func\s+([A-Za-z_$][\w$]*)\s*\(/g, // Swift
        /fun\s+([A-Za-z_$][\w$]*)\s*\(/g, // Kotlin
        /sub\s+([A-Za-z_$][\w$]*)\s*(?:\(|\{)/g, // Perl
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

      const declarationPatterns: Array<{ re: RegExp; type: ParsedSymbol['type'] }> = [
        /\b(?:pub\s+)?(?:struct|class|interface|trait|enum|object)\s+([A-Za-z_$][\w$]*)/g,
        /\b(?:data|newtype|type)\s+([A-Z][\w']*)/g,
        /\bdefmodule\s+([A-Za-z_][\w.?!]*)/g,
      ].map((re) => ({ re, type: 'class' as ParsedSymbol['type'] }));

      const seenSymbols = new Set(symbols.map((symbol) => `${symbol.type}:${symbol.name}`));
      for (const { re, type } of declarationPatterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const name = m[1];
          const key = `${type}:${name}`;
          if (seenSymbols.has(key)) continue;
          seenSymbols.add(key);
          symbols.push({
            name,
            type,
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
      const importRe = /^\s*(?:#include|import|using|require|include|from|use|mod|package)\b.*$/gm;
      let im: RegExpExecArray | null;
      while ((im = importRe.exec(content)) !== null) {
        imports.push({ module: im[0].trim(), location: { file: filePath, startLine: content.slice(0, im.index).split('\n').length, endLine: content.slice(0, im.index + im[0].length).split('\n').length, startCol: 1, endCol: im[0].length + 1 }, bindings: [] });
      }

      return {
        path: filePath,
        language: detectLanguage(filePath),
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

