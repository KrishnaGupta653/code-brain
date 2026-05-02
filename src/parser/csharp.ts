import fs from 'fs';
import crypto from 'crypto';
import Parser from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import {
  ParsedFile,
  ParsedImport,
  ParsedSymbol,
  ParsedExport,
  ParsedParam,
  SourceSpan,
} from '../types/models.js';
import { ParserError, logger } from '../utils/index.js';

export class CSharpParser {
  private static parser: Parser | null = null;

  private static getParser(): Parser {
    if (!this.parser) {
      this.parser = new Parser();
      this.parser.setLanguage(CSharp);
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

      // Extract using directives
      const usingNodes = this.findNodesByType(root, 'using_directive');
      for (const usingNode of usingNodes) {
        const nameNode = usingNode.childForFieldName('name');
        if (nameNode) {
          imports.push({
            module: nameNode.text,
            location: this.nodeToSpan(filePath, usingNode, content),
            bindings: [],
          });
        }
      }

      // Extract namespace
      let namespaceName = '';
      const namespaceNodes = this.findNodesByType(root, 'namespace_declaration');
      if (namespaceNodes.length > 0) {
        const nameNode = namespaceNodes[0].childForFieldName('name');
        if (nameNode) {
          namespaceName = nameNode.text;
        }
      }

      // Extract classes, interfaces, structs, enums
      this.extractTypes(root, filePath, content, symbols, exports, entryPoints, namespaceName);

      return {
        path: filePath,
        language: 'csharp',
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile: this.isTestFile(filePath, content),
        isConfigFile: filePath.endsWith('.csproj') || filePath.endsWith('.sln'),
      };
    } catch (error) {
      throw new ParserError(`Failed to parse C# file: ${filePath}`, error);
    }
  }

  private static extractTypes(
    root: Parser.SyntaxNode,
    filePath: string,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    entryPoints: Set<string>,
    namespaceName: string
  ): void {
    const typeNodes = this.findNodesByType(root, 'class_declaration')
      .concat(this.findNodesByType(root, 'interface_declaration'))
      .concat(this.findNodesByType(root, 'struct_declaration'))
      .concat(this.findNodesByType(root, 'enum_declaration'));

    for (const typeNode of typeNodes) {
      const nameNode = typeNode.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const modifiers = this.extractModifiers(typeNode);
      const isPublic = modifiers.includes('public');
      const kind = typeNode.type.replace('_declaration', '');

      const nodeType = kind === 'interface' ? 'interface' : kind === 'enum' ? 'enum' : 'class';

      symbols.push({
        name,
        type: nodeType,
        location: this.nodeToSpan(filePath, typeNode, content),
        isExported: isPublic,
        metadata: {
          modifiers,
          namespace: namespaceName,
          kind,
        },
      });

      if (isPublic) {
        exports.push({
          name,
          exportedName: name,
          location: this.nodeToSpan(filePath, typeNode, content),
          kind: 'named',
        });
      }

      // Extract methods
      const bodyNode = typeNode.childForFieldName('body');
      if (bodyNode) {
        this.extractMethods(filePath, bodyNode, content, symbols, entryPoints, name);
      }
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
      const isStatic = modifiers.includes('static');
      const isPublic = modifiers.includes('public');
      const params = this.extractParameters(methodNode);
      const returnType = this.extractReturnType(methodNode);

      // Check for Main method (entry point)
      const isMain = name === 'Main' && isStatic;
      if (isMain) {
        entryPoints.add(`${className}.Main`);
      }

      // Check for test attributes
      const isTest = this.hasAttribute(methodNode, 'Test') || 
                     this.hasAttribute(methodNode, 'Fact') ||
                     this.hasAttribute(methodNode, 'Theory');

      symbols.push({
        name,
        type: 'method',
        location: this.nodeToSpan(filePath, methodNode, content),
        isExported: false,
        params,
        returnType,
        metadata: {
          modifiers,
          isStatic,
          isTest,
          className,
        },
      });
    }
  }

  private static extractModifiers(node: Parser.SyntaxNode): string[] {
    const modifiers: string[] = [];
    for (const child of node.children) {
      if (['public', 'private', 'protected', 'internal', 'static', 'abstract', 'virtual', 'override', 'async'].includes(child.type)) {
        modifiers.push(child.type);
      }
    }
    return modifiers;
  }

  private static hasAttribute(node: Parser.SyntaxNode, attrName: string): boolean {
    const attrList = node.children.find(n => n.type === 'attribute_list');
    return attrList ? attrList.text.includes(attrName) : false;
  }

  private static extractParameters(node: Parser.SyntaxNode): ParsedParam[] {
    const params: ParsedParam[] = [];
    const parametersNode = node.childForFieldName('parameters');
    
    if (!parametersNode) return params;

    for (const child of parametersNode.children) {
      if (child.type === 'parameter') {
        const typeNode = child.childForFieldName('type');
        const nameNode = child.childForFieldName('name');
        
        if (nameNode) {
          const name = nameNode.text;
          const type = typeNode ? typeNode.text : 'object';
          const optional = child.text.includes('=');
          params.push({ name, type, optional });
        }
      }
    }

    return params;
  }

  private static extractReturnType(node: Parser.SyntaxNode): string {
    if (node.type === 'constructor_declaration') {
      return 'void';
    }
    
    const typeNode = node.childForFieldName('type');
    return typeNode ? typeNode.text : 'void';
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
    if (/Test\.cs$/.test(filePath) || /Tests\.cs$/.test(filePath)) return true;
    if (/\[Test\]|\[Fact\]|\[Theory\]/.test(content)) return true;
    return /(?:^|\/)tests?(?:\/|$)/i.test(filePath.replace(/\\/g, '/'));
  }

  private static parseFallback(filePath: string, content: string): ParsedFile {
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const symbols: ParsedSymbol[] = [];
    const entryPoints: string[] = [];

    // Extract using directives
    const usingRe = /^\s*using\s+([\w.]+)\s*;/gm;
    let usingMatch: RegExpExecArray | null;
    while ((usingMatch = usingRe.exec(content)) !== null) {
      const module = usingMatch[1];
      const lineNum = content.slice(0, usingMatch.index).split('\n').length;
      imports.push({
        module,
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: usingMatch[0].length,
        },
        bindings: [],
      });
    }

    // Extract classes, interfaces, structs, enums
    const typeRe = /(?:^|\n)\s*(?:public\s+)?(?:static\s+)?(?:abstract\s+)?(class|interface|struct|enum)\s+(\w+)/g;
    let typeMatch: RegExpExecArray | null;
    while ((typeMatch = typeRe.exec(content)) !== null) {
      const kind = typeMatch[1];
      const name = typeMatch[2];
      const isPublic = typeMatch[0].includes('public');
      const lineNum = content.slice(0, typeMatch.index).split('\n').length;
      
      const nodeType = kind === 'interface' ? 'interface' : kind === 'enum' ? 'enum' : 'class';

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

    // Extract methods
    const methodRe = /(?:^|\n)\s*(?:public\s+)?(?:static\s+)?(?:async\s+)?(?:virtual\s+)?(?:override\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRe.exec(content)) !== null) {
      const name = methodMatch[2];
      const isStatic = methodMatch[0].includes('static');
      const lineNum = content.slice(0, methodMatch.index).split('\n').length;
      
      if (name === 'Main' && isStatic) {
        entryPoints.push('Main');
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
      });
    }

    return {
      path: filePath,
      language: 'csharp',
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      symbols,
      imports,
      exports,
      entryPoints,
      isTestFile: this.isTestFile(filePath, content),
      isConfigFile: filePath.endsWith('.csproj') || filePath.endsWith('.sln'),
    };
  }
}
