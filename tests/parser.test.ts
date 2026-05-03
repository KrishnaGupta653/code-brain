import { Parser } from '../src/parser/index';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Mock ora to prevent dynamic import issues during test teardown
jest.mock('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    text: '',
  }))
}));

describe('Parser', () => {
  it('should parse TypeScript file', () => {
    const testFile = path.join(os.tmpdir(), 'test.ts');
    const content = `
      export function hello(name: string): string {
        return \`Hello, \${name}!\`;
      }

      export class MyClass {
        method1() {}
      }

      export interface MyInterface {
        prop: string;
      }
    `;

    fs.writeFileSync(testFile, content);

    const parsed = Parser.parseFile(testFile);

    expect(parsed.language).toBe('typescript');
    expect(parsed.symbols.length).toBeGreaterThan(0);
    expect(parsed.symbols.some(s => s.name === 'hello')).toBe(true);
    expect(parsed.symbols.some(s => s.name === 'MyClass')).toBe(true);
    expect(parsed.symbols.some(s => s.name === 'MyInterface')).toBe(true);

    fs.unlinkSync(testFile);
  });

  it('should extract imports', () => {
    const testFile = path.join(os.tmpdir(), 'test-imports.ts');
    const content = `
      import { something } from './module.js';
      import { other } from "another-module";
      import defaultExport from './default.js';
    `;

    fs.writeFileSync(testFile, content);
    const parsed = Parser.parseFile(testFile);

    expect(parsed.imports.length).toBeGreaterThan(0);
    expect(parsed.imports.some(imp => imp.module === './module.js')).toBe(true);
    expect(parsed.imports.some(imp => imp.module === 'another-module')).toBe(true);
    expect(
      parsed.imports.some(
        imp => imp.module === './module.js' && imp.bindings.some(binding => binding.localName === 'something')
      )
    ).toBe(true);

    fs.unlinkSync(testFile);
  });

  it('should extract exports', () => {
    const testFile = path.join(os.tmpdir(), 'test-exports.ts');
    const content = `
      export function foo() {}
      export class Bar {}
      export { baz };
    `;

    fs.writeFileSync(testFile, content);
    const parsed = Parser.parseFile(testFile);

    expect(parsed.exports.length).toBeGreaterThan(0);
    expect(parsed.exports.some(exp => exp.exportedName === 'foo')).toBe(true);
    expect(parsed.exports.some(exp => exp.exportedName === 'Bar')).toBe(true);
    expect(parsed.exports.some(exp => exp.exportedName === 'baz')).toBe(true);

    fs.unlinkSync(testFile);
  });

  it('should extract default exports and reexports', () => {
    const testFile = path.join(os.tmpdir(), 'test-default-reexports.ts');
    const content = `
      export default function main() {}
      export { helper as renamedHelper } from './helper.js';
      export * from './barrel.js';
    `;

    fs.writeFileSync(testFile, content);
    const parsed = Parser.parseFile(testFile);

    expect(parsed.exports.some(exp => exp.exportedName === 'default')).toBe(true);
    expect(parsed.exports.some(exp => exp.exportedName === 'renamedHelper' && exp.kind === 'reexport')).toBe(true);
    expect(parsed.exports.some(exp => exp.exportedName === '*' && exp.kind === 'reexport')).toBe(true);

    fs.unlinkSync(testFile);
  });

  it('should extract constructors, method calls, decorators, and unresolved calls', () => {
    const testFile = path.join(os.tmpdir(), 'test-calls-decorators.ts');
    const content = `
      @Controller()
      export class ApiController {
        run() {
          const service = new ApiService();
          return service.handle(missingCall());
        }
      }

      class ApiService {
        handle(value: unknown) {
          return value;
        }
      }
    `;

    fs.writeFileSync(testFile, content);
    const parsed = Parser.parseFile(testFile);
    const controller = parsed.symbols.find(symbol => symbol.name === 'ApiController');
    const run = parsed.symbols.find(symbol => symbol.owner === 'ApiController' && symbol.name === 'run');

    expect(controller?.decorators).toContain('Controller');
    expect(run?.calls?.some(call => call.name === 'ApiService')).toBe(true);
    expect(run?.calls?.some(call => call.fullName === 'service.handle')).toBe(true);
    expect(run?.calls?.some(call => call.name === 'missingCall')).toBe(true);

    fs.unlinkSync(testFile);
  });

  it('should label fallback languages by extension', () => {
    const cases = [
      { name: 'sample.rs', language: 'rust', content: 'use std::fmt;\nfn main() {}' },
      { name: 'sample.cs', language: 'csharp', content: 'using System;\npublic class Sample { public void Run() {} }' },
      { name: 'sample.rb', language: 'ruby', content: 'require "json"\ndef run\nend' },
      { name: 'sample.php', language: 'php', content: '<?php\nfunction run() {}\n' },
      { name: 'Dockerfile', language: 'dockerfile', content: 'FROM node:20\nRUN npm ci' },
    ];

    for (const testCase of cases) {
      const testFile = path.join(os.tmpdir(), testCase.name);
      fs.writeFileSync(testFile, testCase.content);

      const parsed = Parser.parseFile(testFile);

      expect(parsed.language).toBe(testCase.language);
      fs.unlinkSync(testFile);
    }
  });

  it('should parse additional tree-sitter backed languages', () => {
    const cases = [
      {
        name: 'sample.rs',
        language: 'rust',
        content: 'use std::fmt;\npub struct Thing;\npub fn main() {}',
        symbols: ['Thing', 'main'],
      },
      {
        name: 'sample.cs',
        language: 'csharp',
        content: 'using System;\npublic class Thing { public void Run() {} }',
        symbols: ['Thing', 'Run'],
      },
      {
        name: 'sample.c',
        language: 'c',
        content: '#include <stdio.h>\ntypedef struct Thing { int x; } Thing;\nint main() { return 0; }',
        symbols: ['Thing', 'main'],
      },
      {
        name: 'sample.cpp',
        language: 'cpp',
        content: '#include <vector>\nclass Thing { public: void run(); };\nint main() { return 0; }',
        symbols: ['Thing', 'main'],
      },
      {
        name: 'sample.rb',
        language: 'ruby',
        content: 'require "json"\nclass Thing\n  def run\n  end\nend\ndef helper\nend',
        symbols: ['Thing', 'run', 'helper'],
      },
      {
        name: 'sample.php',
        language: 'php',
        content: '<?php\nuse Foo\\Bar;\nclass Thing { public function run() {} }\nfunction helper() {}',
        symbols: ['Thing', 'run', 'helper'],
      },
      {
        name: 'sample.kt',
        language: 'kotlin',
        content: 'package demo\nimport kotlin.collections.List\nclass Thing {\n  fun run() { }\n}\nfun main() { }',
        symbols: ['Thing', 'run', 'main'],
      },
      {
        name: 'sample.scala',
        language: 'scala',
        content: 'package demo\nimport scala.collection.mutable\nclass Thing { def run(): Unit = {} }\nobject Main { def main(args: Array[String]): Unit = {} }',
        symbols: ['Thing', 'run', 'Main', 'main'],
      },
      {
        name: 'sample.ex',
        language: 'elixir',
        content: 'defmodule Demo.Thing do\n  import Enum\n  def run do\n    :ok\n  end\nend',
        symbols: ['Demo.Thing', 'run'],
      },
      {
        name: 'sample.hs',
        language: 'haskell',
        content: 'module Main where\nimport Data.List\ndata Thing = Thing\nmain = putStrLn "hi"\nhelper x = x',
        symbols: ['Thing', 'main', 'helper'],
      },
    ];

    for (const testCase of cases) {
      const testFile = path.join(os.tmpdir(), testCase.name);
      fs.writeFileSync(testFile, testCase.content);

      const parsed = Parser.parseFile(testFile);

      expect(parsed.language).toBe(testCase.language);
      for (const symbol of testCase.symbols) {
        expect(parsed.symbols.some(s => s.name === symbol)).toBe(true);
      }
      expect(parsed.imports.length).toBeGreaterThanOrEqual(1);
      fs.unlinkSync(testFile);
    }
  });
});
