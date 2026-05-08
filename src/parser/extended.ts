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

// New language parsers (Phase 3)

// Helper function to safely import optional tree-sitter languages
function tryImport(moduleName: string): any | null {
  try {
    return require(moduleName);
  } catch {
    return null;
  }
}

export class SwiftParser {
  static parseFile(filePath: string): ParsedFile {
    const Swift = tryImport('tree-sitter-swift');
    if (!Swift) {
      throw new Error('tree-sitter-swift not installed. Run: npm install tree-sitter-swift');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'swift',
      treeSitterLanguage: Swift,
      declarationTypes: {
        class_declaration: 'class',
        struct_declaration: 'class',
        protocol_declaration: 'interface',
        function_declaration: 'function',
        enum_declaration: 'enum',
      },
      importTypes: ['import_declaration'],
      testFilePattern: /(Test|Spec)\.swift$/,
    });
  }
}

export class DartParser {
  static parseFile(filePath: string): ParsedFile {
    const Dart = tryImport('tree-sitter-dart');
    if (!Dart) {
      throw new Error('tree-sitter-dart not installed. Run: npm install tree-sitter-dart');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'dart',
      treeSitterLanguage: Dart,
      declarationTypes: {
        class_definition: 'class',
        function_signature: 'function',
        method_signature: 'function',
      },
      importTypes: ['import_specification'],
      testFilePattern: /_test\.dart$/,
    });
  }
}

export class LuaParser {
  static parseFile(filePath: string): ParsedFile {
    const Lua = tryImport('tree-sitter-lua');
    if (!Lua) {
      throw new Error('tree-sitter-lua not installed. Run: npm install tree-sitter-lua');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'lua',
      treeSitterLanguage: Lua,
      declarationTypes: {
        function_declaration: 'function',
        local_function: 'function',
        function_definition: 'function',
      },
      importTypes: [],
      testFilePattern: /_spec\.lua$/,
    });
  }
}

export class BashParser {
  static parseFile(filePath: string): ParsedFile {
    const Bash = tryImport('tree-sitter-bash');
    if (!Bash) {
      throw new Error('tree-sitter-bash not installed. Run: npm install tree-sitter-bash');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'bash',
      treeSitterLanguage: Bash,
      declarationTypes: {
        function_definition: 'function',
      },
      importTypes: [],
      testFilePattern: /_test\.sh$/,
    });
  }
}

export class SqlParser {
  static parseFile(filePath: string): ParsedFile {
    const Sql = tryImport('tree-sitter-sql');
    if (!Sql) {
      throw new Error('tree-sitter-sql not installed. Run: npm install tree-sitter-sql');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'sql',
      treeSitterLanguage: Sql,
      declarationTypes: {
        create_table: 'class',
        create_function: 'function',
        create_procedure: 'function',
        create_view: 'type',
      },
      importTypes: [],
      testFilePattern: /_test\.sql$/,
    });
  }
}

export class HclParser {
  static parseFile(filePath: string): ParsedFile {
    const Hcl = tryImport('tree-sitter-hcl');
    if (!Hcl) {
      throw new Error('tree-sitter-hcl not installed. Run: npm install tree-sitter-hcl');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'hcl',
      treeSitterLanguage: Hcl,
      declarationTypes: {
        block: 'type',
      },
      importTypes: [],
      testFilePattern: /_test\.tf$/,
    });
  }
}

export class DockerfileParser {
  static parseFile(filePath: string): ParsedFile {
    const Dockerfile = tryImport('tree-sitter-dockerfile');
    if (!Dockerfile) {
      throw new Error('tree-sitter-dockerfile not installed. Run: npm install tree-sitter-dockerfile');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'dockerfile',
      treeSitterLanguage: Dockerfile,
      declarationTypes: {
        from_instruction: 'type',
        run_instruction: 'type',
      },
      importTypes: [],
      testFilePattern: /Dockerfile\.test$/,
    });
  }
}

export class CssParser {
  static parseFile(filePath: string): ParsedFile {
    const Css = tryImport('tree-sitter-css');
    if (!Css) {
      throw new Error('tree-sitter-css not installed. Run: npm install tree-sitter-css');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'css',
      treeSitterLanguage: Css,
      declarationTypes: {
        rule_set: 'class',
        keyframes_statement: 'function',
      },
      importTypes: ['import_statement'],
      testFilePattern: /_test\.css$/,
    });
  }
}

export class HtmlParser {
  static parseFile(filePath: string): ParsedFile {
    const Html = tryImport('tree-sitter-html');
    if (!Html) {
      throw new Error('tree-sitter-html not installed. Run: npm install tree-sitter-html');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'html',
      treeSitterLanguage: Html,
      declarationTypes: {
        element: 'class',
      },
      importTypes: [],
      testFilePattern: /_test\.html$/,
    });
  }
}

export class VueParser {
  static parseFile(filePath: string): ParsedFile {
    const Vue = tryImport('tree-sitter-vue');
    if (!Vue) {
      throw new Error('tree-sitter-vue not installed. Run: npm install tree-sitter-vue');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'vue',
      treeSitterLanguage: Vue,
      declarationTypes: {
        component: 'class',
      },
      importTypes: [],
      testFilePattern: /_test\.vue$/,
    });
  }
}

export class SvelteParser {
  static parseFile(filePath: string): ParsedFile {
    const Svelte = tryImport('tree-sitter-svelte');
    if (!Svelte) {
      throw new Error('tree-sitter-svelte not installed. Run: npm install tree-sitter-svelte');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'svelte',
      treeSitterLanguage: Svelte,
      declarationTypes: {
        component: 'class',
      },
      importTypes: [],
      testFilePattern: /_test\.svelte$/,
    });
  }
}

export class TomlParser {
  static parseFile(filePath: string): ParsedFile {
    const Toml = tryImport('tree-sitter-toml');
    if (!Toml) {
      throw new Error('tree-sitter-toml not installed. Run: npm install tree-sitter-toml');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'toml',
      treeSitterLanguage: Toml,
      declarationTypes: {
        table: 'type',
        pair: 'variable',
      },
      importTypes: [],
      testFilePattern: /_test\.toml$/,
    });
  }
}

export class YamlParser {
  static parseFile(filePath: string): ParsedFile {
    const Yaml = tryImport('tree-sitter-yaml');
    if (!Yaml) {
      throw new Error('tree-sitter-yaml not installed. Run: npm install tree-sitter-yaml');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'yaml',
      treeSitterLanguage: Yaml,
      declarationTypes: {
        block_mapping_pair: 'type',
      },
      importTypes: [],
      testFilePattern: /_test\.ya?ml$/,
    });
  }
}

export class JsonParser {
  static parseFile(filePath: string): ParsedFile {
    const Json = tryImport('tree-sitter-json');
    if (!Json) {
      throw new Error('tree-sitter-json not installed. Run: npm install tree-sitter-json');
    }
    return GenericTreeSitterParser.parseFile(filePath, {
      language: 'json',
      treeSitterLanguage: Json,
      declarationTypes: {
        pair: 'variable',
      },
      importTypes: [],
      testFilePattern: /_test\.json$/,
    });
  }
}
