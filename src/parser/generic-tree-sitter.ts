import fs from 'fs';
import crypto from 'crypto';
import Parser from 'tree-sitter';
import {
  ParsedFile,
  ParsedImport,
  ParsedSymbol,
  ParsedExport,
  SourceSpan,
} from '../types/models.js';
import { detectLanguage, logger, ParserError } from '../utils/index.js';
import { FallbackParser } from './fallback.js';

type NodeKind = 'class' | 'function' | 'method' | 'variable' | 'constant' | 'interface' | 'enum' | 'type';

interface GenericTreeSitterConfig {
  language: string;
  treeSitterLanguage: unknown;
  declarationTypes: Record<string, NodeKind>;
  importTypes?: string[];
  entryPointNames?: string[];
  configFilePattern?: RegExp;
  testFilePattern?: RegExp;
  shouldIncludeDeclaration?: (node: Parser.SyntaxNode) => boolean;
  shouldIncludeImport?: (node: Parser.SyntaxNode) => boolean;
  extractName?: (node: Parser.SyntaxNode) => string | null;
  extractImportModule?: (node: Parser.SyntaxNode) => string | null;
}

const NAME_NODE_TYPES = new Set([
  'identifier',
  'type_identifier',
  'field_identifier',
  'property_identifier',
  'simple_identifier',
  'constant',
  'name',
  'variable',
  'constructor',
]);

export class GenericTreeSitterParser {
  private static parsers = new WeakMap<object, Parser>();

  static parseFile(filePath: string, config: GenericTreeSitterConfig): ParsedFile {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      if (content.length > 1000000 || typeof config.treeSitterLanguage !== 'object' || config.treeSitterLanguage === null) {
        return FallbackParser.parseFile(filePath);
      }

      let tree: Parser.Tree;
      try {
        const parser = this.getParser(config.treeSitterLanguage);
        tree = parser.parse(content);
      } catch (error) {
        logger.debug(`Tree-sitter setup failed, using fallback: ${filePath}`);
        return FallbackParser.parseFile(filePath);
      }
      const root = tree.rootNode;

      if (root.hasError) {
        logger.debug(`Tree-sitter parse errors, using fallback: ${filePath}`);
        return FallbackParser.parseFile(filePath);
      }

      const symbols: ParsedSymbol[] = [];
      const imports: ParsedImport[] = [];
      const exports: ParsedExport[] = [];
      const entryPoints = new Set<string>();

      this.walk(filePath, root, content, config, symbols, imports, exports, entryPoints);

      return {
        path: filePath,
        language: config.language,
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        symbols,
        imports,
        exports,
        entryPoints: Array.from(entryPoints).sort(),
        isTestFile: this.isTestFile(filePath, content, config),
        isConfigFile: Boolean(config.configFilePattern?.test(filePath)),
      };
    } catch (error) {
      logger.debug(`Tree-sitter parse failed, using fallback: ${filePath}`);
      try {
        return FallbackParser.parseFile(filePath);
      } catch (fallbackError) {
        throw new ParserError(`Failed to parse ${config.language} file: ${filePath}`, fallbackError);
      }
    }
  }

  private static getParser(language: object): Parser {
    let parser = this.parsers.get(language);
    if (!parser) {
      parser = new Parser();
      parser.setLanguage(language);
      this.parsers.set(language, parser);
    }
    return parser;
  }

  private static walk(
    filePath: string,
    node: Parser.SyntaxNode,
    content: string,
    config: GenericTreeSitterConfig,
    symbols: ParsedSymbol[],
    imports: ParsedImport[],
    exports: ParsedExport[],
    entryPoints: Set<string>,
    owner?: string
  ): void {
    if (this.isImportNode(node, config)) {
      imports.push({
        module: config.extractImportModule?.(node) || this.extractImportModule(node),
        location: this.nodeToSpan(filePath, node),
        bindings: [],
      });
    }

    const declarationKind = config.declarationTypes[node.type];
    let nextOwner = owner;
    if (declarationKind && (config.shouldIncludeDeclaration?.(node) ?? true)) {
      const name = config.extractName?.(node) || this.extractName(node);
      if (name) {
        const type = owner && declarationKind === 'function' ? 'method' : declarationKind;
        const isExported = this.isExported(node, name, config.language);
        const location = this.nodeToSpan(filePath, node);

        symbols.push({
          name,
          type,
          location,
          isExported,
          owner,
          metadata: {
            parser: 'tree-sitter',
            nodeType: node.type,
            language: config.language,
          },
        });

        if (isExported && ['class', 'function', 'interface', 'enum', 'type'].includes(type)) {
          exports.push({
            name,
            exportedName: name,
            location,
            kind: 'named',
          });
        }

        if ((config.entryPointNames || ['main']).includes(name)) {
          entryPoints.add(owner ? `${owner}.${name}` : name);
        }

        if (['class', 'interface', 'enum', 'type'].includes(type)) {
          nextOwner = name;
        }
      }
    }

    for (const child of node.namedChildren) {
      this.walk(filePath, child, content, config, symbols, imports, exports, entryPoints, nextOwner);
    }
  }

  private static isImportNode(node: Parser.SyntaxNode, config: GenericTreeSitterConfig): boolean {
    if (config.shouldIncludeImport?.(node)) return true;

    const importTypes = config.importTypes || [
      'import_declaration',
      'use_declaration',
      'using_directive',
      'namespace_use_declaration',
      'preproc_include',
    ];

    if (importTypes.includes(node.type)) return true;

    return (
      config.language === 'ruby' &&
      node.type === 'call' &&
      node.childForFieldName('method')?.text === 'require'
    );
  }

  private static extractImportModule(node: Parser.SyntaxNode): string {
    const pathNode = node.childForFieldName('path') || node.childForFieldName('name') || node.childForFieldName('argument');
    if (pathNode) return pathNode.text.replace(/^['"<]+|['">;]+$/g, '');

    const text = node.text.trim();
    return text
      .replace(/^(use|using|import|require|#include)\s+/, '')
      .replace(/[;]+$/, '')
      .trim();
  }

  private static extractName(node: Parser.SyntaxNode): string | null {
    const directName = node.childForFieldName('name');
    if (directName) return directName.text;

    const declarator = node.childForFieldName('declarator');
    if (declarator) {
      const declaratorName = this.findNameNode(declarator);
      if (declaratorName) return declaratorName.text;
    }

    const type = node.childForFieldName('type');
    if (type) {
      const typeName = this.findNameNode(type);
      if (typeName) return typeName.text;
    }

    const found = this.findNameNode(node);
    return found?.text || null;
  }

  private static findNameNode(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (NAME_NODE_TYPES.has(node.type)) return node;

    for (const child of node.namedChildren) {
      const found = this.findNameNode(child);
      if (found) return found;
    }

    return null;
  }

  private static isExported(node: Parser.SyntaxNode, name: string, language: string): boolean {
    if (language === 'rust') return /\bpub\b/.test(node.text);
    if (language === 'csharp') return /\bpublic\b/.test(node.text);
    if (language === 'ruby') return !name.startsWith('_');
    if (language === 'php') return !name.startsWith('_') && !/\bprivate\b/.test(node.text);
    if (language === 'c' || language === 'cpp') return !name.startsWith('_');
    return !name.startsWith('_');
  }

  private static nodeToSpan(filePath: string, node: Parser.SyntaxNode): SourceSpan {
    return {
      file: filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startCol: node.startPosition.column + 1,
      endCol: node.endPosition.column + 1,
      text: node.text,
    };
  }

  private static isTestFile(filePath: string, content: string, config: GenericTreeSitterConfig): boolean {
    if (config.testFilePattern?.test(filePath)) return true;
    if (/\b(describe|it|test|should|assert|expect)\b/.test(content)) return true;
    return /(?:^|[\\/])tests?(?:[\\/]|$)/i.test(filePath);
  }
}
