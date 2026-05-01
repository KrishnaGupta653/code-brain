import fs from 'fs';
import crypto from 'crypto';
import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import {
  ParsedFile,
  ParsedImport,
  ParsedSymbol,
  ParsedExport,
  ParsedParam,
  SourceSpan,
} from '../types/models.js';
import { ParserError, logger } from '../utils/index.js';

// Python framework decorator mappings
const PYTHON_FRAMEWORK_DECORATORS = {
  // Flask
  flask: {
    routes: ['route', 'app.route'],
    blueprints: ['blueprint'],
  },
  // FastAPI
  fastapi: {
    routes: ['get', 'post', 'put', 'delete', 'patch'],
    dependencies: ['Depends'],
  },
  // Django
  django: {
    views: ['api_view', 'action'],
    permissions: ['permission_classes'],
  },
  // Pytest
  pytest: {
    tests: ['pytest.fixture', 'fixture', 'pytest.mark'],
  },
};

export class PythonParser {
  private static parser: Parser | null = null;

  private static getParser(): Parser {
    if (!this.parser) {
      this.parser = new Parser();
      this.parser.setLanguage(Python);
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

      // Extract imports
      this.extractImports(filePath, root, content, imports);

      // Extract top-level definitions
      this.extractDefinitions(filePath, root, content, symbols, exports, entryPoints);

      return {
        path: filePath,
        language: 'python',
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile: this.isTestFile(filePath, content),
        isConfigFile: this.isConfigFile(filePath),
      };
    } catch (error) {
      throw new ParserError(`Failed to parse Python file: ${filePath}`, error);
    }
  }

  private static extractImports(
    filePath: string,
    root: Parser.SyntaxNode,
    content: string,
    imports: ParsedImport[]
  ): void {
    const importNodes = root.children.filter(n => 
      n.type === 'import_statement' || n.type === 'import_from_statement'
    );

    for (const importNode of importNodes) {
      if (importNode.type === 'import_statement') {
        // import foo, bar
        const nameNodes = importNode.children.filter(n => n.type === 'dotted_name' || n.type === 'aliased_import');
        for (const nameNode of nameNodes) {
          const module = nameNode.type === 'aliased_import' 
            ? nameNode.children[0]?.text || nameNode.text
            : nameNode.text;
          imports.push({
            module,
            location: this.nodeToSpan(filePath, importNode, content),
            bindings: [],
          });
        }
      } else if (importNode.type === 'import_from_statement') {
        // from foo import bar
        const moduleNode = importNode.children.find(n => n.type === 'dotted_name');
        const module = moduleNode?.text || '';
        imports.push({
          module,
          location: this.nodeToSpan(filePath, importNode, content),
          bindings: [],
        });
      }
    }
  }

  private static extractDefinitions(
    filePath: string,
    root: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    entryPoints: Set<string>
  ): void {
    for (const node of root.children) {
      if (node.type === 'function_definition') {
        this.extractFunction(filePath, node, content, symbols, exports, entryPoints);
      } else if (node.type === 'class_definition') {
        this.extractClass(filePath, node, content, symbols, exports);
      } else if (node.type === 'expression_statement' || node.type === 'assignment') {
        this.extractVariable(filePath, node, content, symbols);
      }
    }
  }

  private static extractFunction(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[],
    entryPoints: Set<string>
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const decorators = this.extractDecorators(node);
    const isPrivate = name.startsWith('_');
    const isTest = decorators.some(d => d.includes('test')) || name.startsWith('test_');
    const params = this.extractParameters(node);
    const returnType = this.extractReturnType(node);
    const frameworkInfo = this.detectPythonFramework(decorators);

    symbols.push({
      name,
      type: 'function',
      location: this.nodeToSpan(filePath, node, content),
      isExported: !isPrivate,
      params,
      returnType,
      decorators: decorators.length > 0 ? decorators : undefined,
      metadata: {
        ...(frameworkInfo && {
          framework: frameworkInfo.framework,
          frameworkRole: frameworkInfo.role,
        }),
        isTest,
        isAsync: node.children.some(c => c.type === 'async'),
      },
    });

    if (!isPrivate) {
      exports.push({
        name,
        exportedName: name,
        location: this.nodeToSpan(filePath, node, content),
        kind: 'named',
      });
    }

    // Check for main entry point
    if (name === 'main') {
      entryPoints.add('main');
    }
  }

  private static extractClass(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    exports: ParsedExport[]
  ): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const decorators = this.extractDecorators(node);
    const isPrivate = name.startsWith('_');

    symbols.push({
      name,
      type: 'class',
      location: this.nodeToSpan(filePath, node, content),
      isExported: !isPrivate,
      metadata: {
        decorators,
      },
    });

    if (!isPrivate) {
      exports.push({
        name,
        exportedName: name,
        location: this.nodeToSpan(filePath, node, content),
        kind: 'named',
      });
    }

    // Extract methods
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      this.extractMethods(filePath, bodyNode, content, symbols, name);
    }
  }

  private static extractMethods(
    filePath: string,
    bodyNode: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[],
    className: string
  ): void {
    const methodNodes = bodyNode.children.filter(n => n.type === 'function_definition');
    
    for (const methodNode of methodNodes) {
      const nameNode = methodNode.childForFieldName('name');
      if (!nameNode) continue;

      const name = nameNode.text;
      const decorators = this.extractDecorators(methodNode);
      const isTest = decorators.some(d => d.includes('test')) || name.startsWith('test_');
      const params = this.extractParameters(methodNode);
      const returnType = this.extractReturnType(methodNode);

      symbols.push({
        name,
        type: 'method',
        location: this.nodeToSpan(filePath, methodNode, content),
        isExported: false,
        params,
        returnType,
        metadata: {
          decorators,
          className,
          isTest,
          isStatic: decorators.includes('@staticmethod'),
          isClassMethod: decorators.includes('@classmethod'),
        },
      });
    }
  }

  private static extractVariable(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    symbols: ParsedSymbol[]
  ): void {
    const assignmentNode = node.type === 'assignment' ? node : node.children.find(c => c.type === 'assignment');
    if (!assignmentNode) return;

    const leftNode = assignmentNode.childForFieldName('left');
    if (!leftNode || leftNode.type !== 'identifier') return;

    const name = leftNode.text;
    if (name.startsWith('_')) return; // Skip private variables

    symbols.push({
      name,
      type: 'variable',
      location: this.nodeToSpan(filePath, node, content),
      isExported: !name.startsWith('_'),
      metadata: {},
    });
  }

  private static extractDecorators(node: Parser.SyntaxNode): string[] {
    const decorators: string[] = [];
    const decoratorNodes = node.children.filter(n => n.type === 'decorator');
    for (const decoratorNode of decoratorNodes) {
      decorators.push(decoratorNode.text);
    }
    return decorators;
  }

  /**
   * Detect Python framework from decorators
   */
  private static detectPythonFramework(decorators: string[]): { framework: string; role: string } | null {
    if (decorators.length === 0) return null;

    for (const [framework, categories] of Object.entries(PYTHON_FRAMEWORK_DECORATORS)) {
      for (const [role, decoratorList] of Object.entries(categories)) {
        for (const decorator of decorators) {
          // Match decorator name (strip @ and arguments)
          const decoratorName = decorator.replace(/^@/, '').split('(')[0].trim();
          if (decoratorList.some(d => decoratorName.includes(d))) {
            return { framework, role };
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract parameters from a Python function/method
   */
  private static extractParameters(node: Parser.SyntaxNode): ParsedParam[] {
    const params: ParsedParam[] = [];
    const parametersNode = node.childForFieldName('parameters');
    
    if (!parametersNode) return params;

    for (const child of parametersNode.children) {
      if (child.type === 'identifier') {
        // Simple parameter without type annotation
        const name = child.text;
        if (name !== 'self' && name !== 'cls') {
          params.push({ name, type: 'unknown', optional: false });
        }
      } else if (child.type === 'typed_parameter') {
        // Parameter with type annotation: name: type
        const nameNode = child.children.find(c => c.type === 'identifier');
        const typeNode = child.children.find(c => c.type === 'type');
        
        if (nameNode) {
          const name = nameNode.text;
          if (name !== 'self' && name !== 'cls') {
            const type = typeNode ? typeNode.text : 'unknown';
            params.push({ name, type, optional: false });
          }
        }
      } else if (child.type === 'default_parameter' || child.type === 'typed_default_parameter') {
        // Parameter with default value: name = value or name: type = value
        // typed_default_parameter is used when there's both type annotation and default value
        const nameNode = child.children.find(c => c.type === 'identifier');
        const typeNode = child.children.find(c => c.type === 'type');
        
        if (nameNode) {
          const name = nameNode.text;
          if (name !== 'self' && name !== 'cls') {
            const type = typeNode ? typeNode.text : 'unknown';
            params.push({ name, type, optional: true });
          }
        }
      }
    }

    return params;
  }

  /**
   * Extract return type from a Python function/method
   */
  private static extractReturnType(node: Parser.SyntaxNode): string {
    const returnTypeNode = node.childForFieldName('return_type');
    if (returnTypeNode) {
      return returnTypeNode.text;
    }
    return 'unknown';
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
    if (/test_.*\.py$/.test(filePath)) return true;
    if (/_test\.py$/.test(filePath)) return true;
    if (/\bpytest\b/.test(content)) return true;
    if (/\bunittest\b/.test(content)) return true;
    return /(?:^|\/)tests?(?:\/|$)/i.test(filePath.replace(/\\/g, '/'));
  }

  private static isConfigFile(filePath: string): boolean {
    const configFiles = ['setup.py', 'setup.cfg', 'pyproject.toml', 'requirements.txt', 'Pipfile'];
    return configFiles.some(cf => filePath.endsWith(cf));
  }

  private static parseFallback(filePath: string, content: string): ParsedFile {
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const symbols: ParsedSymbol[] = [];
    const entryPoints: string[] = [];

    // Extract imports
    const importRe = /^\s*(?:from\s+([\w.]+)\s+)?import\s+(.+)$/gm;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRe.exec(content)) !== null) {
      const module = importMatch[1] || importMatch[2].split(',')[0].trim();
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

    // Extract functions
    const funcRe = /^(?:@[\w.]+\s+)*def\s+(\w+)\s*\(/gm;
    let funcMatch: RegExpExecArray | null;
    while ((funcMatch = funcRe.exec(content)) !== null) {
      const name = funcMatch[1];
      const lineNum = content.slice(0, funcMatch.index).split('\n').length;
      
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
        isExported: !name.startsWith('_'),
        metadata: {},
      });

      if (name === 'main') {
        entryPoints.push('main');
      }
    }

    // Extract classes
    const classRe = /^(?:@[\w.]+\s+)*class\s+(\w+)/gm;
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRe.exec(content)) !== null) {
      const name = classMatch[1];
      const lineNum = content.slice(0, classMatch.index).split('\n').length;
      
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
        isExported: !name.startsWith('_'),
        metadata: {},
      });
    }

    return {
      path: filePath,
      language: 'python',
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      symbols,
      imports,
      exports,
      entryPoints,
      isTestFile: this.isTestFile(filePath, content),
      isConfigFile: this.isConfigFile(filePath),
    };
  }
}
