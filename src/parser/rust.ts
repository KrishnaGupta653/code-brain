import fs from 'fs';
import crypto from 'crypto';
import Parser from 'tree-sitter';
import Rust from 'tree-sitter-rust';
import {
  ParsedFile,
  ParsedImport,
  ParsedSymbol,
  ParsedExport,
  ParsedParam,
  SourceSpan,
} from '../types/models.js';
import { ParserError, logger } from '../utils/index.js';

export class RustParser {
  private static parser: Parser | null = null;

  private static getParser(): Parser {
    if (!this.parser) {
      this.parser = new Parser();
      this.parser.setLanguage(Rust);
    }
    return this.parser;
  }

  static parseFile(filePath: string): ParsedFile {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (content.length > 1000000) {
        logger.debug(`File too large for tree-sitter, using fallback: ${filePath}`);
        return this.parseFallback(filePath, content);
      }
      
      const parser = this.getParser();
      const tree = parser.parse(content);
      const root = tree.rootNode;

      if (root.hasError) {
        logger.debug(`Tree-sitter parse errors, using fallback: ${filePath}`);
        return this.parseFallback(filePath, content);
      }

      const imports: ParsedImport[] = [];
      const exports: ParsedExport[] = [];
      const symbols: ParsedSymbol[] = [];
      const entryPoints = new Set<string>();

      // Extract use declarations (imports)
      this.extractImports(root, filePath, content, imports);

      // Extract items (functions, structs, enums, traits, impls)
      this.extractItems(root, filePath, content, symbols, exports, entryPoints);

      return {
        path: filePath,
        language: 'rust',
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile: this.isTestFile(filePath, content),
        isConfigFile: filePath.endsWith('Cargo.toml'),
      };
    } catch (error) {
      throw new ParserError(`Failed to parse Rust file: ${filePath}`, error);
    }
  }

  private static extractImports(
    root: Parser.SyntaxNode,
    filePath: string,
    content: string,
    imports: ParsedImport[]
  ): void {
    const useDeclarations = this.findNodesByType(root, 'use_declaration');
    
    for (const useNode of useDeclarations) {
      const pathNode = useNode.childForFieldName('argument');
      if (pathNode) {
        const module = pathNode.text.replace(/^use\s+/, '').replace(/;$/, '');
        imports.push({
          module,
          location: this.nodeToSpan(filePath, useNode, content),
          bindings: [],
        });
      }
    }
  }

  private static extractItems(
    root: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    entryPoints: Set<string>
  ): void {
    for (const child of root.children) {
      this.processItem(child, filePath, content, symbols, exports, entryPoints);
    }
  }

  private static processItem(
    node: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    entryPoints: Set<string>
  ): void {
    const isPublic = this.hasVisibility(node, 'pub');

    switch (node.type) {
      case 'function_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;

        const name = nameNode.text;
        const params = this.extractParameters(node);
        const returnType = this.extractReturnType(node);
        const isAsync = node.text.includes('async ');
        const isUnsafe = node.text.includes('unsafe ');
        const isConst = node.text.includes('const ');

        // Check for main function (entry point)
        if (name === 'main') {
          entryPoints.add('main');
        }

        // Check for test attribute
        const isTest = this.hasAttribute(node, 'test') || this.hasAttribute(node, 'tokio::test');

        symbols.push({
          name,
          type: 'function',
          location: this.nodeToSpan(filePath, node, content),
          isExported: isPublic,
          params,
          returnType,
          metadata: {
            isAsync,
            isUnsafe,
            isConst,
            isTest,
          },
        });

        if (isPublic) {
          exports.push({
            name,
            exportedName: name,
            location: this.nodeToSpan(filePath, node, content),
            kind: 'named',
          });
        }
        break;
      }

      case 'struct_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;

        const name = nameNode.text;
        symbols.push({
          name,
          type: 'class',
          location: this.nodeToSpan(filePath, node, content),
          isExported: isPublic,
          metadata: {
            kind: 'struct',
          },
        });

        if (isPublic) {
          exports.push({
            name,
            exportedName: name,
            location: this.nodeToSpan(filePath, node, content),
            kind: 'named',
          });
        }
        break;
      }

      case 'enum_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;

        const name = nameNode.text;
        symbols.push({
          name,
          type: 'enum',
          location: this.nodeToSpan(filePath, node, content),
          isExported: isPublic,
        });

        if (isPublic) {
          exports.push({
            name,
            exportedName: name,
            location: this.nodeToSpan(filePath, node, content),
            kind: 'named',
          });
        }
        break;
      }

      case 'trait_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;

        const name = nameNode.text;
        symbols.push({
          name,
          type: 'interface',
          location: this.nodeToSpan(filePath, node, content),
          isExported: isPublic,
          metadata: {
            kind: 'trait',
          },
        });

        if (isPublic) {
          exports.push({
            name,
            exportedName: name,
            location: this.nodeToSpan(filePath, node, content),
            kind: 'named',
          });
        }
        break;
      }

      case 'impl_item': {
        // Extract methods from impl blocks
        const typeNode = node.childForFieldName('type');
        const traitNode = node.childForFieldName('trait');
        const typeName = typeNode ? typeNode.text : 'unknown';
        const traitName = traitNode ? traitNode.text : null;

        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          for (const child of bodyNode.children) {
            if (child.type === 'function_item') {
              const nameNode = child.childForFieldName('name');
              if (!nameNode) continue;

              const name = nameNode.text;
              const params = this.extractParameters(child);
              const returnType = this.extractReturnType(child);
              const isPublic = this.hasVisibility(child, 'pub');

              symbols.push({
                name,
                type: 'method',
                location: this.nodeToSpan(filePath, child, content),
                isExported: false,
                params,
                returnType,
                metadata: {
                  className: typeName,
                  trait: traitName,
                },
              });
            }
          }
        }
        break;
      }

      case 'mod_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;

        const name = nameNode.text;
        symbols.push({
          name,
          type: 'module',
          location: this.nodeToSpan(filePath, node, content),
          isExported: isPublic,
        });

        // Recursively process module contents
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          for (const child of bodyNode.children) {
            this.processItem(child, filePath, content, symbols, exports, entryPoints);
          }
        }
        break;
      }

      case 'const_item':
      case 'static_item': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;

        const name = nameNode.text;
        symbols.push({
          name,
          type: 'variable',
          location: this.nodeToSpan(filePath, node, content),
          isExported: isPublic,
          metadata: {
            isConst: node.type === 'const_item',
            isStatic: node.type === 'static_item',
          },
        });

        if (isPublic) {
          exports.push({
            name,
            exportedName: name,
            location: this.nodeToSpan(filePath, node, content),
            kind: 'named',
          });
        }
        break;
      }
    }
  }

  private static hasVisibility(node: Parser.SyntaxNode, visibility: string): boolean {
    const visNode = node.children.find(n => n.type === 'visibility_modifier');
    return visNode ? visNode.text.includes(visibility) : false;
  }

  private static hasAttribute(node: Parser.SyntaxNode, attrName: string): boolean {
    const attrNode = node.children.find(n => n.type === 'attribute_item');
    return attrNode ? attrNode.text.includes(attrName) : false;
  }

  private static extractParameters(node: Parser.SyntaxNode): ParsedParam[] {
    const params: ParsedParam[] = [];
    const parametersNode = node.childForFieldName('parameters');
    
    if (!parametersNode) return params;

    for (const child of parametersNode.children) {
      if (child.type === 'parameter') {
        const patternNode = child.childForFieldName('pattern');
        const typeNode = child.childForFieldName('type');
        
        if (patternNode) {
          const name = patternNode.text;
          const type = typeNode ? typeNode.text : 'unknown';
          params.push({ name, type, optional: false });
        }
      } else if (child.type === 'self_parameter') {
        params.push({ name: 'self', type: 'Self', optional: false });
      }
    }

    return params;
  }

  private static extractReturnType(node: Parser.SyntaxNode): string {
    const returnTypeNode = node.childForFieldName('return_type');
    if (returnTypeNode) {
      return returnTypeNode.text.replace(/^->\s*/, '');
    }
    return '()';
  }

  private static findNodesByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
    const results: Parser.SyntaxNode[] = [];
    
    const visit = (n: Parser.SyntaxNode) => {
      if (n.type === type) {
        results.push(n);
      }
      for (const child of n.children) {
        visit(child);
      }
    };
    
    visit(node);
    return results;
  }

  private static nodeToSpan(filePath: string, node: Parser.SyntaxNode, content: string): SourceSpan {
    return {
      file: filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startCol: node.startPosition.column + 1,
      endCol: node.endPosition.column + 1,
      text: node.text,
    };
  }

  private static isTestFile(filePath: string, content: string): boolean {
    if (/_test\.rs$/.test(filePath)) return true;
    if (/#\[test\]/.test(content)) return true;
    if (/#\[cfg\(test\)\]/.test(content)) return true;
    return /(?:^|\/)tests?(?:\/|$)/i.test(filePath.replace(/\\/g, '/'));
  }

  private static parseFallback(filePath: string, content: string): ParsedFile {
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const symbols: ParsedSymbol[] = [];
    const entryPoints: string[] = [];

    // Extract use statements
    const useRe = /^\s*(?:pub\s+)?use\s+([^;]+);/gm;
    let useMatch: RegExpExecArray | null;
    while ((useMatch = useRe.exec(content)) !== null) {
      const module = useMatch[1];
      const lineNum = content.slice(0, useMatch.index).split('\n').length;
      imports.push({
        module,
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: useMatch[0].length,
        },
        bindings: [],
      });
    }

    // Extract functions
    const fnRe = /(?:^|\n)\s*(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?fn\s+(\w+)/g;
    let fnMatch: RegExpExecArray | null;
    while ((fnMatch = fnRe.exec(content)) !== null) {
      const name = fnMatch[1];
      const isPublic = fnMatch[0].includes('pub ');
      const lineNum = content.slice(0, fnMatch.index).split('\n').length;
      
      if (name === 'main') {
        entryPoints.push('main');
      }

      symbols.push({
        name,
        type: 'function',
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: fnMatch[0].length,
        },
        isExported: isPublic,
      });

      if (isPublic) {
        exports.push({
          name,
          exportedName: name,
          location: {
            file: filePath,
            startLine: lineNum,
            endLine: lineNum,
            startCol: 1,
            endCol: fnMatch[0].length,
          },
          kind: 'named',
        });
      }
    }

    // Extract structs, enums, traits
    const typeRe = /(?:^|\n)\s*(?:pub\s+)?(struct|enum|trait)\s+(\w+)/g;
    let typeMatch: RegExpExecArray | null;
    while ((typeMatch = typeRe.exec(content)) !== null) {
      const kind = typeMatch[1];
      const name = typeMatch[2];
      const isPublic = typeMatch[0].includes('pub ');
      const lineNum = content.slice(0, typeMatch.index).split('\n').length;
      
      const nodeType = kind === 'trait' ? 'interface' : kind === 'enum' ? 'enum' : 'class';

      symbols.push({
        name,
        type: nodeType,
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: typeMatch[0].length,
        },
        isExported: isPublic,
        metadata: { kind },
      });

      if (isPublic) {
        exports.push({
          name,
          exportedName: name,
          location: {
            file: filePath,
            startLine: lineNum,
            endLine: lineNum,
            startCol: 1,
            endCol: typeMatch[0].length,
          },
          kind: 'named',
        });
      }
    }

    return {
      path: filePath,
      language: 'rust',
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      symbols,
      imports,
      exports,
      entryPoints,
      isTestFile: this.isTestFile(filePath, content),
      isConfigFile: filePath.endsWith('Cargo.toml'),
    };
  }
}
