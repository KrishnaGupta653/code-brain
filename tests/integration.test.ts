import fs from 'fs';
import path from 'path';
import os from 'os';
import { initCommand } from '../src/cli/commands/init';
import { indexCommand } from '../src/cli/commands/index';
import { exportCommand } from '../src/cli/commands/export';
import { getCodeBrainDir, getDbPath } from '../src/utils/index';

describe('Integration Tests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-brain-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should initialize, index, and export a repository', async () => {
    // Create sample files
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'main.ts'),
      `
      export async function main() {
        const handler = new ApiHandler();
        return handler.process();
      }

      class ApiHandler {
        process() {
          return validate({});
        }
      }

      function validate(input: any) {
        return true;
      }
    `
    );

    fs.writeFileSync(
      path.join(srcDir, 'utils.ts'),
      `
      export function formatOutput(data: any) {
        return JSON.stringify(data);
      }
    `
    );

    // Initialize
    await initCommand(testDir);

    expect(fs.existsSync(getCodeBrainDir(testDir))).toBe(true);
    expect(fs.existsSync(getDbPath(testDir))).toBe(true);
    expect(fs.existsSync(path.join(testDir, '.codebrainrc.json'))).toBe(true);

    // Index
    await indexCommand(testDir);

    // Export
    const jsonExport = await exportCommand(testDir, 'json');
    expect(jsonExport).toBeTruthy();

    const parsed = JSON.parse(jsonExport);
    expect(parsed.project).toBeDefined();
    expect(parsed.nodes.length).toBeGreaterThan(0);
    expect(parsed.edges.length).toBeGreaterThan(0);

    // Export AI format
    const aiExport = await exportCommand(testDir, 'ai');
    expect(aiExport).toBeTruthy();

    const aiParsed = JSON.parse(aiExport);
    expect(aiParsed.exportFormat).toBe('ai');
    expect(aiParsed.rules).toBeDefined();
    expect(aiParsed.rules.length).toBeGreaterThan(0);
    expect(aiParsed.telemetry).toBeDefined();
    expect(aiParsed.telemetry.bundleName).toBeUndefined();
    expect(aiParsed.telemetry.estimatedTokens).toBeGreaterThan(0);

    const moduleExport = await exportCommand(testDir, 'ai', undefined, undefined, undefined, undefined, 'modules');
    expect(moduleExport).toContain('# code-brain modules export');
    expect(moduleExport).toContain('src');
  });

  it('should handle empty repository gracefully', async () => {
    // Initialize empty dir
    await initCommand(testDir);

    // Index (should not crash)
    await expect(indexCommand(testDir)).resolves.not.toThrow();

    // Export (should return empty results)
    const exported = await exportCommand(testDir, 'json');
    const parsed = JSON.parse(exported);

    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].type).toBe('project');
    expect(parsed.edges).toEqual([]);
  });

  it('should update after file changes', async () => {
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'file1.ts'),
      'export function func1() {}'
    );

    // Initial index
    await initCommand(testDir);
    await indexCommand(testDir);

    const export1 = await exportCommand(testDir, 'json');
    const parsed1 = JSON.parse(export1);
    const count1 = parsed1.nodes.length;

    // Add file
    fs.writeFileSync(
      path.join(srcDir, 'file2.ts'),
      'export function func2() {}'
    );

    // Update
    await indexCommand(testDir);

    const export2 = await exportCommand(testDir, 'json');
    const parsed2 = JSON.parse(export2);
    const count2 = parsed2.nodes.length;

    expect(count2).toBeGreaterThan(count1);
  });
});
