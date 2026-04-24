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
});
