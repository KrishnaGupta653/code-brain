import fs from 'fs';
import os from 'os';
import path from 'path';
import { initCommand } from '../src/cli/commands/init';
import { indexCommand } from '../src/cli/commands/index';
import { SQLiteStorage } from '../src/storage/index';
import { getDbPath } from '../src/utils/index';

describe('SQLiteStorage', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-brain-storage-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should persist ranking scores and provenance spans', async () => {
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'main.ts'), 'export function main() { return 1; }');

    await initCommand(testDir);
    await indexCommand(testDir);

    const storage = new SQLiteStorage(getDbPath(testDir));
    const graph = storage.loadGraph(testDir);
    const mainNode = graph.getNodes().find(node => node.name === 'main');
    expect(mainNode).toBeDefined();
    expect(mainNode?.provenance.source[0]?.file).toContain('main.ts');

    storage.saveRankingScores(testDir, [
      {
        nodeId: mainNode!.id,
        score: 0.91,
        algorithm: 'test_rank',
        components: { degree: 1 }
      }
    ]);

    const scores = storage.getRankingScores(testDir);
    storage.close();

    expect(scores).toHaveLength(1);
    expect(scores[0].nodeId).toBe(mainNode!.id);
    expect(scores[0].score).toBe(0.91);
    expect(scores[0].components?.degree).toBe(1);
  });

  it('should find the same project when Windows path casing differs', () => {
    if (process.platform !== 'win32') {
      return;
    }

    const dbPath = path.join(testDir, '.codebrain', 'graph.db');
    const storage = new SQLiteStorage(dbPath);
    storage.saveProject({
      name: 'case-test',
      root: testDir,
      language: 'typescript',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fileCount: 0,
      symbolCount: 0,
      edgeCount: 0,
    });

    const alternateCasing = testDir
      .split('')
      .map(char => {
        const lower = char.toLowerCase();
        const upper = char.toUpperCase();
        return char === lower ? upper : lower;
      })
      .join('');

    const project = storage.getProject(alternateCasing);
    storage.close();

    expect(project).not.toBeNull();
    expect(project?.name).toBe('case-test');
  });
});
