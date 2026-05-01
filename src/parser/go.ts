import fs from 'fs';
import crypto from 'crypto';
import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import {
  ParsedFile,
  ParsedImport,
  ParsedSymbol,
  ParsedExport,
  ParsedParam,
  SourceSpan,
} from '../types/models.js';
import { ParserError, logger } from '../utils/index.js';

export class GoParser {
  private static parser: Parser | null = null;

  private static getParser(): Parser {
    if (!this.parser) {
      this.parser = new Parser();
      this.parser.setLanguage(Go);
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

      // Extract package name
      let packageName = '';
      const packageNode = root.children.find(n => n.type === 'package_clause');
      if (packageNode) {
        const nameNode = packageNode.childForFieldName('name');
        if (nameNode) {
          packageName = nameNode.text;
        }
      }

      // Extract imports
      this.extractImports(filePath, root, content, imports);

      // Extract top-level declarations
      this.extractDeclarations(filePath, root, content, symbols, exports, entryPoints, packageName);

      return {
        path: filePath,
        language: 'go',
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile: this.isTestFile(filePath),
        isConfigFile: false,
      };
    } catch (error) {
      throw new ParserError(`Failed to parse Go file: ${filePath}`, error);
    }
  }

  private static extractImports(
    filePath: string,
    root: Parser.SyntaxNode,
    content: string,
    imports: ParsedImport[]
  ): void {
    const importNodes = root.children.filter(n => n.type === 'import_declaration');

    for (const importNode of importNodes) {
      const specNodes = importNode.children.filter(n => 
        n.type === 'import_spec' || n.type === 'import_spec_list'
      );

      for (const specNode of specNodes) {
        if (specNode.type === 'import_spec_list') {
          // Multiple imports in parentheses
          const specs = specNode.children.filter(n => n.type === 'import_spec');
          for (const spec of specs) {
            this.extractImportSpec(filePath, spec, content, imports);
          }
        } else {
          // Single import
          this.extractImportSpec(filePath, specNode, content, imports);
        }
      }
    }
  }

  private static extractImportSpec(
    filePath: string,
    specNode: Parser.SyntaxNode,
    content: string,
    imports: ParsedImport[]
  ): void {
    const pathNode = specNode.children.find(n => n.type === 'interpreted_string_literal');
    if (pathNode) {
      const module = pathNode.text.slice(1, -1); // Remove quotes
      imports.push({
        module,
        location: this.nodeToSpan(filePath, specNode, content),
        bindings: [],
      });
    }
  }

  private static extractDeclarations(
    filePath: string,
    root: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    entryPoints: Set<string>,
    packageName: string
  ): void {
    for (const node of root.children) {
      if (node.type === 'function_declaration') {
        this.extractFunction(filePath, node, content, symbols, exports, entryPoints, packageName);
      } else if (node.type === 'method_declaration') {
        this.extractMethod(filePath, node, content, symbols, packageName);
      } else if (node.type === 'type_declaration') {
        this.extractType(filePath, node, content, symbols, exports, packageName);
      } else if (node.type === 'var_declaration' || node.type === 'const_declaration') {
        this.extractVariable(filePath, node, content, symbols, exports, packageName);
      }
    }
  }

  private static extractFunction(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    entryPoints: Set<string>,
    packageName: string
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const isExported = this.isExported(name);
    const isTest = name.startsWith('Test') || name.startsWith('Benchmark') || name.startsWith('Example');
    const params = this.extractParameters(node);
    const returnType = this.extractReturnType(node);

    symbols.push({
      name,
      type: 'function',
      location: this.nodeToSpan(filePath, node, content),
      isExported,
      params,
      returnType,
      metadata: {
        packageName,
        isTest,
      },
    });

    if (isExported) {
      exports.push({
        name,
        exportedName: name,
        location: this.nodeToSpan(filePath, node, content),
        kind: 'named',
      });
    }

    // Check for main entry point
    if (name === 'main' && packageName === 'main') {
      entryPoints.add('main');
    }
  }

  private static extractMethod(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    packageName: string
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const receiverNode = node.childForFieldName('receiver');
    let receiverType = '';
    
    if (receiverNode) {
      const typeNode = receiverNode.children.find(n => 
        n.type === 'type_identifier' || n.type === 'pointer_type'
      );
      if (typeNode) {
        receiverType = typeNode.text;
      }
    }

    const params = this.extractParameters(node);
    const returnType = this.extractReturnType(node);

    symbols.push({
      name,
      type: 'method',
      location: this.nodeToSpan(filePath, node, content),
      isExported: this.isExported(name),
      params,
      returnType,
      metadata: {
        packageName,
        receiverType,
      },
    });
  }

  private static extractType(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    packageName: string
  ): void {
    const specNodes = node.children.filter(n => n.type === 'type_spec');

    for (const specNode of specNodes) {
      const nameNode = specNode.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const isExported = this.isExported(name);
      const typeNode = specNode.childForFieldName('type');
      let kind = 'type';

      if (typeNode) {
        if (typeNode.type === 'struct_type') {
          kind = 'struct';
        } else if (typeNode.type === 'interface_type') {
          kind = 'interface';
        }
      }

      symbols.push({
        name,
        type: 'class', // Map to class for consistency
        location: this.nodeToSpan(filePath, specNode, content),
        isExported,
        metadata: {
          packageName,
          kind,
        },
      });

      if (isExported) {
        exports.push({
          name,
          exportedName: name,
          location: this.nodeToSpan(filePath, specNode, content),
          kind: 'named',
        });
      }
    }
  }

  private static extractVariable(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    packageName: string
  ): void {
    const specNodes = node.children.filter(n => n.type === 'var_spec' || n.type === 'const_spec');

    for (const specNode of specNodes) {
      const nameNode = specNode.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const isExported = this.isExported(name);
      const isConst = node.type === 'const_declaration';

      symbols.push({
        name,
        type: 'variable',
        location: this.nodeToSpan(filePath, specNode, content),
        isExported,
        metadata: {
          packageName,
          isConst,
        },
      });

      if (isExported) {
        exports.push({
          name,
          exportedName: name,
          location: this.nodeToSpan(filePath, specNode, content),
          kind: 'named',
        });
      }
    }
  }

  private static isExported(name: string): boolean {
    // In Go, exported names start with uppercase letter
    return name.length > 0 && name[0] === name[0].toUpperCase();
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

  private static isTestFile(filePath: string): boolean {
    return /_test\.go$/.test(filePath);
  }

  /**
   * Extract parameters from a Go function/method
   */
  private static extractParameters(node: Parser.SyntaxNode): ParsedParam[] {
    const params: ParsedParam[] = [];
    const parametersNode = node.childForFieldName('parameters');
    
    if (!parametersNode) return params;

    for (const child of parametersNode.children) {
      if (child.type === 'parameter_declaration') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        
        if (nameNode) {
          const name = nameNode.text;
          const type = typeNode ? typeNode.text : 'unknown';
          params.push({ name, type, optional: false });
        } else if (typeNode) {
          // Unnamed parameter (just type)
          params.push({ name: '_', type: typeNode.text, optional: false });
        }
      } else if (child.type === 'variadic_parameter_declaration') {
        // Variadic parameter: ...Type
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        
        if (nameNode) {
          const name = nameNode.text;
          const type = typeNode ? `...${typeNode.text}` : '...unknown';
          params.push({ name, type, optional: false });
        }
      }
    }

    return params;
  }

  /**
   * Extract return type from a Go function/method
   */
  private static extractReturnType(node: Parser.SyntaxNode): string {
    const resultNode = node.childForFieldName('result');
    
    if (!resultNode) {
      return 'void';
    }

    // Go can have multiple return values
    if (resultNode.type === 'parameter_list') {
      const types: string[] = [];
      for (const child of resultNode.children) {
        if (child.type === 'parameter_declaration') {
          const typeNode = child.childForFieldName('type');
          if (typeNode) {
            types.push(typeNode.text);
          }
        }
      }
      return types.length > 1 ? `(${types.join(', ')})` : types[0] || 'unknown';
    }

    // Single return type
    return resultNode.text;
  }

  private static parseFallback(filePath: string, content: string): ParsedFile {
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const symbols: ParsedSymbol[] = [];
    const entryPoints: string[] = [];

    // Extract package name
    let packageName = '';
    const packageMatch = /^\s*package\s+(\w+)/m.exec(content);
    if (packageMatch) {
      packageName = packageMatch[1];
    }

    // Extract imports
    const importRe = /^\s*import\s+(?:"([^"]+)"|(\([^)]+\)))/gm;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRe.exec(content)) !== null) {
      if (importMatch[1]) {
        const lineNum = content.slice(0, importMatch.index).split('\n').length;
        imports.push({
          module: importMatch[1],
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
    }

    // Extract functions
    const funcRe = /^func\s+(\w+)\s*\(/gm;
    let funcMatch: RegExpExecArray | null;
    while ((funcMatch = funcRe.exec(content)) !== null) {
      const name = funcMatch[1];
      const lineNum = content.slice(0, funcMatch.index).split('\n').length;
      const isExported = this.isExported(name);
      
      symbols.push({
        name,
        type: 'function',
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: funcMatch[0].length,
        },
        isExported,
        metadata: { packageName },
      });

      if (name === 'main' && packageName === 'main') {
        entryPoints.push('main');
      }
    }

    // Extract types
    const typeRe = /^type\s+(\w+)\s+(?:struct|interface)/gm;
    let typeMatch: RegExpExecArray | null;
    while ((typeMatch = typeRe.exec(content)) !== null) {
      const name = typeMatch[1];
      const lineNum = content.slice(0, typeMatch.index).split('\n').length;
      const isExported = this.isExported(name);
      
      symbols.push({
        name,
        type: 'class',
        location: {
          file: filePath,
          startLine: lineNum,
          endLine: lineNum,
          startCol: 1,
          endCol: typeMatch[0].length,
        },
        isExported,
        metadata: { packageName },
      });
    }

    return {
      path: filePath,
      language: 'go',
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      symbols,
      imports,
      exports,
      entryPoints,
      isTestFile: this.isTestFile(filePath),
      isConfigFile: false,
    };
  }
}
