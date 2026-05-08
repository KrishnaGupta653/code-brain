import { TypeScriptParser } from './typescript.js';
import { JavaParser } from './java.js';
import { PythonParser } from './python.js';
import { GoParser } from './go.js';
import { FallbackParser } from './fallback.js';
import { PdfParser } from './pdf.js';
import {
  CParser,
  CppParser,
  CSharpParser,
  ElixirParser,
  HaskellParser,
  KotlinParser,
  PhpParser,
  RubyParser,
  RustParser,
  ScalaParser,
  SwiftParser,
  DartParser,
  LuaParser,
  BashParser,
  SqlParser,
  HclParser,
  DockerfileParser,
  CssParser,
  HtmlParser,
  VueParser,
  SvelteParser,
  TomlParser,
  YamlParser,
  JsonParser,
} from './extended.js';
import { parseFileWithRegistry, registerParserForExtension, registerDefaultParser } from './registry.js';
import { ParsedFile } from '../types/models.js';
import { isSupportedSourceFile } from '../utils/index.js';

// register known parsers
registerParserForExtension('.ts', TypeScriptParser);
registerParserForExtension('.tsx', TypeScriptParser);
registerParserForExtension('.js', TypeScriptParser);
registerParserForExtension('.jsx', TypeScriptParser);
registerParserForExtension('.mjs', TypeScriptParser);
registerParserForExtension('.cjs', TypeScriptParser);
registerParserForExtension('.java', JavaParser);
registerParserForExtension('.py', PythonParser);
registerParserForExtension('.go', GoParser);
registerParserForExtension('.rs', RustParser);
registerParserForExtension('.cs', CSharpParser);
registerParserForExtension('.c', CParser);
registerParserForExtension('.h', CParser);
registerParserForExtension('.cpp', CppParser);
registerParserForExtension('.cc', CppParser);
registerParserForExtension('.cxx', CppParser);
registerParserForExtension('.hpp', CppParser);
registerParserForExtension('.hh', CppParser);
registerParserForExtension('.hxx', CppParser);
registerParserForExtension('.rb', RubyParser);
registerParserForExtension('.php', PhpParser);
registerParserForExtension('.kt', KotlinParser);
registerParserForExtension('.kts', KotlinParser);
registerParserForExtension('.scala', ScalaParser);
registerParserForExtension('.sc', ScalaParser);
registerParserForExtension('.ex', ElixirParser);
registerParserForExtension('.exs', ElixirParser);
registerParserForExtension('.hs', HaskellParser);
registerParserForExtension('.lhs', HaskellParser);

// Tier 1 — high demand languages (Phase 3)
registerParserForExtension('.swift', SwiftParser);
registerParserForExtension('.dart', DartParser);
registerParserForExtension('.lua', LuaParser);
registerParserForExtension('.sh', BashParser);
registerParserForExtension('.bash', BashParser);

// Tier 2 — infrastructure/DevOps (Phase 3)
registerParserForExtension('.sql', SqlParser);
registerParserForExtension('.tf', HclParser);
registerParserForExtension('.hcl', HclParser);
registerParserForExtension('Dockerfile', DockerfileParser);

// Tier 3 — frontend/config (Phase 3)
registerParserForExtension('.css', CssParser);
registerParserForExtension('.scss', CssParser);
registerParserForExtension('.html', HtmlParser);
registerParserForExtension('.vue', VueParser);
registerParserForExtension('.svelte', SvelteParser);
registerParserForExtension('.toml', TomlParser);
registerParserForExtension('.yaml', YamlParser);
registerParserForExtension('.yml', YamlParser);
registerParserForExtension('.json', JsonParser);
registerParserForExtension('.json5', JsonParser);

// Multi-modal parsers
registerParserForExtension('.pdf', PdfParser);

// fallback parser for other textual files
registerDefaultParser(FallbackParser);

export class Parser {
  static parseFile(filePath: string): ParsedFile {
    if (!isSupportedSourceFile(filePath)) {
      throw new Error(`Unsupported file type: ${filePath}`);
    }
    return parseFileWithRegistry(filePath);
  }

  static canParse(filePath: string): boolean {
    return isSupportedSourceFile(filePath);
  }
}

export {
  TypeScriptParser,
  JavaParser,
  PythonParser,
  GoParser,
  RustParser,
  CSharpParser,
  CParser,
  CppParser,
  RubyParser,
  PhpParser,
  KotlinParser,
  ScalaParser,
  ElixirParser,
  HaskellParser,
  SwiftParser,
  DartParser,
  LuaParser,
  BashParser,
  SqlParser,
  HclParser,
  DockerfileParser,
  CssParser,
  HtmlParser,
  VueParser,
  SvelteParser,
  TomlParser,
  YamlParser,
  JsonParser,
  FallbackParser,
  PdfParser,
};
