import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import {
  ParsedFile,
  ParsedImport,
  ParsedSymbol,
  ParsedExport,
  SourceSpan,
} from '../types/models.js';
import { ParserError, logger } from '../utils/index.js';

export class JavaParser {
  private static parser: Parser | null = null;

  private static getParser(): Parser {
    if (!this.parser) {
      this.parser = new Parser();
      this.parser.setLanguage(Java);
    }
    return this.parser;
  }

  static parseFile(filePath: string): ParsedFile {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check file size - tree-sitter has limits
      if (content.length > 1000000) { // 1MB limit
        logger.debug(`File too large for tree-sitter, using fallback: ${filePath}`);
        return this.parseFallback(filePath, content);
      }
      
      const parser = this.getParser();
      const tree = parser.parse(content);
      const root = tree.rootNode;

      // Check for parse errors
      if (root.hasError) {
        logger.debug(`Tree-sitter parse errors, using fallback: ${filePath}`);
        return this.parseFallback(filePath, content);
      }

      const imports: ParsedImport[] = [];
      const exports: ParsedExport[] = [];
      const symbols: ParsedSymbol[] = [];
      const entryPoints = new Set<string>();

      // Extract package name
      let packageName = '';
      const packageNode = root.children.find(n => n.type === 'package_declaration');
      if (packageNode) {
        const scopedId = packageNode.childForFieldName('name');
        if (scopedId) {
          packageName = scopedId.text;
        }
      }

      // Extract imports
      const importNodes = root.children.filter(n => n.type === 'import_declaration');
      for (const importNode of importNodes) {
        const scopedId = importNode.childForFieldName('name');
        if (scopedId) {
          const module = scopedId.text;
          const isStatic = importNode.text.includes('static');
          imports.push({
            module,
            location: this.nodeToSpan(filePath, importNode, content),
            bindings: [],
          });
        }
      }

      // Extract classes, interfaces, enums, annotations
      const typeDeclarations = root.children.filter(n =>
        ['class_declaration', 'interface_declaration', 'enum_declaration', 'annotation_type_declaration'].includes(n.type)
      );

      for (const typeNode of typeDeclarations) {
        const nameNode = typeNode.childForFieldName('name');
        if (!nameNode) continue;

        const name = nameNode.text;
        const modifiers = this.extractModifiers(typeNode);
        const isPublic = modifiers.includes('public');
        const isAbstract = modifiers.includes('abstract');
        const annotations = this.extractAnnotations(typeNode);

        symbols.push({
          name,
          type: 'class',
          location: this.nodeToSpan(filePath, typeNode, content),
          isExported: isPublic,
          metadata: {
            modifiers,
            annotations,
            isAbstract,
            packageName,
            kind: typeNode.type.replace('_declaration', ''),
          },
        });

        // Extract methods from this class
        const bodyNode = typeNode.childForFieldName('body');
        if (bodyNode) {
          this.extractMethods(filePath, bodyNode, content, symbols, entryPoints, name);
        }
      }

      // Create exports for public classes
      for (const symbol of symbols) {
        if (symbol.type === 'class' && symbol.isExported) {
          exports.push({
            name: symbol.name,
            exportedName: symbol.name,
            location: symbol.location,
            kind: 'named',
          });
        }
      }

      return {
        path: filePath,
        language: 'java',
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile: this.isTestFile(filePath, content),
        isConfigFile: false,
      };
    } catch (error) {
      throw new ParserError(`Failed to parse Java file: ${filePath}`, error);
    }
  }

  private static extractMethods(
    filePath: string,
    bodyNode: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    entryPoints: Set<string>,
    className: string
  ): void {
    const methodNodes = bodyNode.children.filter(n =>
      ['method_declaration', 'constructor_declaration'].includes(n.type)
    );

    for (const methodNode of methodNodes) {
      const nameNode = methodNode.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const modifiers = this.extractModifiers(methodNode);
      const annotations = this.extractAnnotations(methodNode);
      const isStatic = modifiers.includes('static');
      const isPublic = modifiers.includes('public');

      // Check if this is a main method (entry point)
      const isMain = name === 'main' && isStatic && isPublic;
      if (isMain) {
        entryPoints.add(`${className}.main`);
      }

      // Check if this is a test method
      const isTest = annotations.some(a => a.includes('Test') || a.includes('ParameterizedTest'));

      symbols.push({
        name,
        type: methodNode.type === 'constructor_declaration' ? 'method' : 'method',
        location: this.nodeToSpan(filePath, methodNode, content),
        isExported: false,
        metadata: {
          modifiers,
          annotations,
          isStatic,
          isConstructor: methodNode.type === 'constructor_declaration',
          isTest,
          className,
        },
      });
    }

    // Extract field declarations
    const fieldNodes = bodyNode.children.filter(n => n.type === 'field_declaration');
    for (const fieldNode of fieldNodes) {
      const declaratorNodes = fieldNode.children.filter(n => n.type === 'variable_declarator');
      for (const declarator of declaratorNodes) {
        const nameNode = declarator.childForFieldName('name');
        if (!nameNode) continue;

        const name = nameNode.text;
        const modifiers = this.extractModifiers(fieldNode);
        const annotations = this.extractAnnotations(fieldNode);

        symbols.push({
          name,
          type: 'variable',
          location: this.nodeToSpan(filePath, declarator, content),
          isExported: false,
          metadata: {
            modifiers,
            annotations,
            className,
            isField: true,
          },
        });
      }
    }
  }

  private static extractModifiers(node: Parser.SyntaxNode): string[] {
    const modifiers: string[] = [];
    const modifiersNode = node.children.find(n => n.type === 'modifiers');
    if (modifiersNode) {
      for (const child of modifiersNode.children) {
        if (child.type !== 'marker_annotation' && child.type !== 'annotation') {
          modifiers.push(child.text);
        }
      }
    }
    return modifiers;
  }

  private static extractAnnotations(node: Parser.SyntaxNode): string[] {
    const annotations: string[] = [];
    const modifiersNode = node.children.find(n => n.type === 'modifiers');
    if (modifiersNode) {
      for (const child of modifiersNode.children) {
        if (child.type === 'marker_annotation' || child.type === 'annotation') {
          annotations.push(child.text);
        }
      }
    }
    return annotations;
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
    if (/Test\.java$/.test(filePath)) return true;
    if (/@Test\b/.test(content)) return true;
    return /(?:^|\/)test(?:s)?(?:\/|$)/i.test(filePath.replace(/\\/g, '/'));
  }

  /**
   * Fallback regex-based parser for files that tree-sitter cannot handle
   * (very large files, complex syntax, etc.)
   */
  private static parseFallback(filePath: string, content: string): ParsedFile {
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const symbols: ParsedSymbol[] = [];
    const entryPoints: string[] = [];

    // Extract package name
    let packageName = '';
    const packageMatch = /^\s*package\s+([\w.]+)\s*;/m.exec(content);
    if (packageMatch) {
      packageName = packageMatch[1];
    }

    // Extract imports
    const importRe = /^\s*import\s+(?:static\s+)?([\w.*]+)\s*;/gm;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRe.exec(content)) !== null) {
      const module = importMatch[1];
      const lineNum = content.slice(0, importMatch.index).split('\n').length;
      imports.push({
        module,
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: importMatch[0].length,
        },
        bindings: [],
      });
    }

    // Extract classes, interfaces, enums
    const classRe = /(?:^|\n)\s*(?:@[\w.()]+\s+)*(?:(public|protected|private)\s+)?(?:(static|final|abstract)\s+)*(class|interface|enum)\s+(\w+)/g;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRe.exec(content)) !== null) {
      const name = classMatch[4];
      const visibility = classMatch[1] || 'package-private';
      const modifier = classMatch[2] || '';
      const kind = classMatch[3];
      const lineNum = content.slice(0, classMatch.index).split('\n').length;
      
      const isPublic = visibility === 'public';
      
      symbols.push({
        name,
        type: 'class',
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: classMatch[0].length,
        },
        isExported: isPublic,
        metadata: {
          modifiers: [visibility, modifier].filter(Boolean),
          packageName,
          kind,
        },
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
            endCol: classMatch[0].length,
          },
          kind: 'named',
        });
      }
    }

    // Extract methods (simplified - may have false positives)
    const methodRe = /(?:^|\n)\s*(?:@[\w.()]+\s+)*(?:(public|protected|private)\s+)?(?:(static|final|abstract|synchronized)\s+)*(?:<[^>]+>\s+)?(\w+(?:<[^>]+>)?(?:\[\])*)\s+(\w+)\s*\(/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRe.exec(content)) !== null) {
      const name = methodMatch[4];
      const visibility = methodMatch[1] || 'package-private';
      const modifier = methodMatch[2] || '';
      const lineNum = content.slice(0, methodMatch.index).split('\n').length;
      
      // Check if this is a main method
      const isMain = name === 'main' && modifier === 'static' && visibility === 'public';
      if (isMain) {
        entryPoints.push('main');
      }

      symbols.push({
        name,
        type: 'method',
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: methodMatch[0].length,
        },
        isExported: false,
        metadata: {
          modifiers: [visibility, modifier].filter(Boolean),
        },
      });
    }

    return {
      path: filePath,
      language: 'java',
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      symbols,
      imports,
      exports,
      entryPoints,
      isTestFile: this.isTestFile(filePath, content),
      isConfigFile: false,
    };
  }
}

