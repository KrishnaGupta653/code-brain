import Rust from 'tree-sitter-rust';
import CSharp from 'tree-sitter-c-sharp';
import Cpp from 'tree-sitter-cpp';
import C from 'tree-sitter-c';
import Ruby from 'tree-sitter-ruby';
import Php from 'tree-sitter-php';
import Kotlin from 'tree-sitter-kotlin';
import Scala from 'tree-sitter-scala';
import Elixir from 'tree-sitter-elixir';
import Haskell from 'tree-sitter-haskell';
import Parser from 'tree-sitter';
import { ParsedFile } from '../types/models.js';
import { GenericTreeSitterParser } from './generic-tree-sitter.js';

// Import dedicated parsers
import { RustParser as RustParserImpl } from './rust.js';
import { CSharpParser as CSharpParserImpl } from './csharp.js';

// Use dedicated Rust parser
export class RustParser {
  static parseFile(filePath: string): ParsedFile {
    return RustParserImpl.parseFile(filePath);
  }
}

// Use dedicated C# parser
export class CSharpParser {
  static parseFile(filePath: string): ParsedFile {
    return CSharpParserImpl.parseFile(filePath);
  }
}

export class CppParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'cpp',
      treeSitterLanguage: Cpp,
      declarationTypes: {
        class_specifier: 'class',
        struct_specifier: 'class',
        enum_specifier: 'enum',
        function_definition: 'function',
        declaration: 'variable',
        type_definition: 'type',
      },
      importTypes: ['preproc_include'],
      testFilePattern: /(_test|test_|tests[\\/]|spec).*\.c(c|pp|xx)?$/i,
    });
  }
}

export class CParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'c',
      treeSitterLanguage: C,
      declarationTypes: {
        struct_specifier: 'class',
        enum_specifier: 'enum',
        function_definition: 'function',
        declaration: 'variable',
        type_definition: 'type',
      },
      importTypes: ['preproc_include'],
      testFilePattern: /(_test|test_|tests[\\/]|spec).*\.c$/i,
    });
  }
}

export class RubyParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'ruby',
      treeSitterLanguage: Ruby,
      declarationTypes: {
        class: 'class',
        module: 'type',
        method: 'function',
        singleton_method: 'function',
      },
      importTypes: [],
      testFilePattern: /(_spec|_test)\.rb$/,
    });
  }
}

export class PhpParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'php',
      treeSitterLanguage: (Php as { php: unknown }).php,
      declarationTypes: {
        class_declaration: 'class',
        interface_declaration: 'interface',
        trait_declaration: 'interface',
        enum_declaration: 'enum',
        method_declaration: 'function',
        function_definition: 'function',
      },
      importTypes: ['namespace_use_declaration'],
      testFilePattern: /(Test|Spec)\.php$/,
    });
  }
}

export class KotlinParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'kotlin',
      treeSitterLanguage: Kotlin,
      declarationTypes: {
        class_declaration: 'class',
        object_declaration: 'class',
        function_declaration: 'function',
        property_declaration: 'variable',
      },
      importTypes: ['import_header'],
      testFilePattern: /(Test|Spec)\.kts?$/,
    });
  }
}

export class ScalaParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'scala',
      treeSitterLanguage: Scala,
      declarationTypes: {
        class_definition: 'class',
        object_definition: 'class',
        trait_definition: 'interface',
        function_definition: 'function',
        val_definition: 'variable',
        var_definition: 'variable',
      },
      importTypes: ['import_declaration'],
      testFilePattern: /(Test|Spec)\.scala$/,
    });
  }
}

function elixirCallTarget(node: Parser.SyntaxNode): string | null {
  return node.type === 'call' ? node.childForFieldName('target')?.text || null : null;
}

function firstElixirArgument(node: Parser.SyntaxNode): string | null {
  const args = node.children.find(child => child.type === 'arguments');
  return args?.namedChildren[0]?.text || null;
}

export class ElixirParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'elixir',
      treeSitterLanguage: Elixir,
      declarationTypes: {
        call: 'function',
      },
      shouldIncludeDeclaration: node => ['defmodule', 'def', 'defp', 'defmacro'].includes(elixirCallTarget(node) || ''),
      extractName: node => firstElixirArgument(node),
      shouldIncludeImport: node => ['import', 'alias', 'require', 'use'].includes(elixirCallTarget(node) || ''),
      extractImportModule: node => firstElixirArgument(node),
      testFilePattern: /_test\.exs$/,
    });
  }
}

export class HaskellParser {
  static parseFile(filePath: string): ParsedFile {
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'haskell',
      treeSitterLanguage: Haskell,
      declarationTypes: {
        data_type: 'type',
        newtype: 'type',
        type_synomym: 'type',
        class: 'interface',
        instance: 'type',
        function: 'function',
        bind: 'function',
      },
      importTypes: ['import'],
      testFilePattern: /(Spec|Test)\.lhs?$|tests[\\/]/,
    });
  }
}
