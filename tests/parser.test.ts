import { Parser } from '../src/parser/index';
import path from 'path';
import os from 'os';
import fs from 'fs';

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

  it('should parse Java file symbols and imports', () => {
    const testFile = path.join(os.tmpdir(), 'TestService.java');
    const content = `
      package com.example.app;

      import java.util.List;
      import com.example.shared.Helper;

      public class TestService extends BaseService implements Runnable {
        public void run() {
          Helper.execute();
        }

        public static void main(String[] args) {
          new TestService().run();
        }
      }
    `;

    fs.writeFileSync(testFile, content);
    const parsed = Parser.parseFile(testFile);

    expect(parsed.language).toBe('java');
    expect(parsed.imports.some(imp => imp.module === 'java.util.List')).toBe(true);
    expect(parsed.imports.some(imp => imp.module === 'com.example.shared.Helper')).toBe(true);
    expect(parsed.symbols.some(s => s.type === 'class' && s.name === 'TestService')).toBe(true);
    expect(parsed.symbols.some(s => s.type === 'method' && s.owner === 'TestService' && s.name === 'run')).toBe(true);
    expect(parsed.entryPoints.some(ep => ep.includes('main'))).toBe(true);

    fs.unlinkSync(testFile);
  });

  it('should heuristically parse Python and Go via generic path', () => {
    const py = path.join(os.tmpdir(), 'codebrain_sample.py');
    fs.writeFileSync(
      py,
      `
import os
from mypkg.util import thing

def greet(name: str) -> str:
  return f"hi {name}"

class Greeter:
  def run(self) -> None:
    pass
`,
    );
    const parsed = Parser.parseFile(py);
    expect(parsed.language).toBe('python');
    expect(parsed.imports.some((i) => i.module.includes('mypkg') || i.module === 'mypkg.util' || i.module === 'os')).toBe(
      true,
    );
    expect(parsed.symbols.some((s) => s.name === 'greet' && s.type === 'function')).toBe(true);
    expect(parsed.symbols.some((s) => s.name === 'Greeter' && s.type === 'class')).toBe(true);
    fs.unlinkSync(py);

    const gopath = path.join(os.tmpdir(), 'codebrain_sample.go');
    fs.writeFileSync(
      gopath,
      `
package main

import "fmt"

func main() {
  fmt.Println("x")
}
`,
    );
    const g = Parser.parseFile(gopath);
    expect(g.language).toBe('go');
    expect(g.imports.some((i) => i.module === 'fmt')).toBe(true);
    expect(g.symbols.some((s) => s.name === 'main')).toBe(true);
    fs.unlinkSync(gopath);
  });
});
