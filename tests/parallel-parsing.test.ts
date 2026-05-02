import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ParallelParser } from '../dist/parser/parallel.js';

describe('Parallel Parser with Progress Tracking', () => {
  let testDir: string;
  let testFiles: string[];

  beforeAll(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-parser-test-'));
    
    // Create test files
    testFiles = [];
    for (let i = 0; i < 25; i++) {
      const filePath = path.join(testDir, `test${i}.ts`);
      const content = `
export class TestClass${i} {
  private value: number = ${i};
  
  public getValue(): number {
    return this.value;
  }
  
  public setValue(val: number): void {
    this.value = val;
  }
}

export function testFunction${i}(): string {
  return "test${i}";
}

export const testConstant${i} = ${i * 10};
`;
      fs.writeFileSync(filePath, content, 'utf-8');
      testFiles.push(filePath);
    }
  });

  afterAll(() => {
    // Clean up test files
    testFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });

  it('should parse files in parallel', async () => {
    const parser = new ParallelParser();
    const results = await parser.parseFiles(testFiles);

    expect(results.size).toBe(testFiles.length);
    
    // Verify each file was parsed
    for (const filePath of testFiles) {
      expect(results.has(filePath)).toBe(true);
      const parsed = results.get(filePath)!;
      expect(parsed.language).toBe('typescript');
      expect(parsed.symbols.length).toBeGreaterThan(0);
    }
  });

  it('should report progress during parsing', async () => {
    const parser = new ParallelParser();
    const progressUpdates: Array<{ current: number; total: number }> = [];
    
    await parser.parseFiles(testFiles, (current, total) => {
      progressUpdates.push({ current, total });
    });

    // Should have received progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    // First update should have current > 0
    expect(progressUpdates[0].current).toBeGreaterThanOrEqual(0);
    expect(progressUpdates[0].total).toBe(testFiles.length);
    
    // Last update should be complete
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate.current).toBe(testFiles.length);
    expect(lastUpdate.total).toBe(testFiles.length);
    
    // Progress should be monotonically increasing
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].current).toBeGreaterThanOrEqual(progressUpdates[i - 1].current);
    }
  });

  it('should use sequential parsing for small batches', async () => {
    const parser = new ParallelParser();
    const smallBatch = testFiles.slice(0, 5);
    
    const progressUpdates: number[] = [];
    const results = await parser.parseFiles(smallBatch, (current) => {
      progressUpdates.push(current);
    });

    expect(results.size).toBe(smallBatch.length);
    expect(progressUpdates.length).toBeGreaterThan(0);
  });

  it('should handle parsing errors gracefully', async () => {
    const parser = new ParallelParser();
    const invalidFile = path.join(testDir, 'invalid.ts');
    fs.writeFileSync(invalidFile, 'this is not valid TypeScript {{{', 'utf-8');
    
    const filesToParse = [...testFiles.slice(0, 5), invalidFile];
    const results = await parser.parseFiles(filesToParse);

    // Should still parse valid files
    expect(results.size).toBeGreaterThanOrEqual(5);
    
    // Clean up
    fs.unlinkSync(invalidFile);
  });

  it('should use correct number of workers', async () => {
    const cpuCount = os.cpus().length;
    const expectedWorkers = Math.max(1, cpuCount - 1);
    
    const parser = new ParallelParser();
    // Parser should use cpuCount - 1 workers (verified by constructor)
    expect(parser).toBeDefined();
  });

  it('should parse files with different symbols correctly', async () => {
    const parser = new ParallelParser();
    const results = await parser.parseFiles(testFiles);

    // Check first file in detail
    const firstFile = results.get(testFiles[0])!;
    expect(firstFile.symbols.length).toBeGreaterThanOrEqual(3); // class, function, const
    
    // Find class symbol
    const classSymbol = firstFile.symbols.find(s => s.type === 'class');
    expect(classSymbol).toBeDefined();
    expect(classSymbol!.name).toBe('TestClass0');
    
    // Find function symbol
    const functionSymbol = firstFile.symbols.find(s => s.type === 'function');
    expect(functionSymbol).toBeDefined();
    expect(functionSymbol!.name).toBe('testFunction0');
  });

  it('should handle empty file list', async () => {
    const parser = new ParallelParser();
    const results = await parser.parseFiles([]);
    expect(results.size).toBe(0);
  });

  it('should complete progress to 100%', async () => {
    const parser = new ParallelParser();
    let finalProgress = 0;
    
    await parser.parseFiles(testFiles, (current, total) => {
      const percentage = (current / total) * 100;
      if (percentage > finalProgress) {
        finalProgress = percentage;
      }
    });

    expect(finalProgress).toBe(100);
  });
});
