import fs from 'fs';
import os from 'os';
import path from 'path';
import { Server } from 'http';
import { initCommand } from '../src/cli/commands/init';
import { indexCommand } from '../src/cli/commands/index';
import { createGraphServer } from '../src/server/index';

describe('Graph server API', () => {
  let testDir: string;
  let serverObj: { server: Server; wss: any; broadcast: (message: unknown) => void } | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-brain-server-'));
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'main.ts'),
      `
      export function helper() {
        return 1;
      }

      export function main() {
        return helper();
      }
    `
    );

    await initCommand(testDir);
    await indexCommand(testDir);
    serverObj = await createGraphServer(testDir, 0);
    const address = serverObj.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP test server');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (serverObj) {
      await new Promise<void>(resolve => serverObj!.server.close(() => resolve()));
      serverObj.wss.close();
      serverObj = null;
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should expose rich graph, node, path, analytics, and source APIs', async () => {
    // Request level 2 for full detail
    const graphResponse = await fetch(`${baseUrl}/api/graph?level=2`);
    expect(graphResponse.ok).toBe(true);
    const graphPayload = await graphResponse.json();
    expect(graphPayload.nodes.length).toBeGreaterThan(0);
    expect(graphPayload.analytics.health.nodeCount).toBe(graphPayload.stats.nodeCount);

    const mainNode = graphPayload.nodes.find((node: { name: string }) => node.name === 'main');
    const helperNode = graphPayload.nodes.find((node: { name: string }) => node.name === 'helper');
    expect(mainNode).toBeDefined();
    expect(helperNode).toBeDefined();

    const nodeResponse = await fetch(`${baseUrl}/api/node/${encodeURIComponent(mainNode.id)}`);
    expect(nodeResponse.ok).toBe(true);
    const nodePayload = await nodeResponse.json();
    expect(nodePayload.vscodeUri).toContain('vscode://file/');
    expect(nodePayload.relationSummary).toBeDefined();
    expect(nodePayload.sourcePreview.file).toContain('main.ts');

    const sourceParams = new URLSearchParams({
      file: nodePayload.sourcePreview.file,
      startLine: String(nodePayload.sourcePreview.startLine),
      endLine: String(nodePayload.sourcePreview.endLine)
    });
    const sourceResponse = await fetch(`${baseUrl}/api/source?${sourceParams}`);
    expect(sourceResponse.ok).toBe(true);
    const sourcePayload = await sourceResponse.json();
    expect(sourcePayload.lines.some((line: { highlighted: boolean }) => line.highlighted)).toBe(true);

    const pathResponse = await fetch(
      `${baseUrl}/api/path?from=${encodeURIComponent(mainNode.id)}&to=${encodeURIComponent(helperNode.id)}`
    );
    expect(pathResponse.ok).toBe(true);
    const pathPayload = await pathResponse.json();
    expect(pathPayload.path.length).toBeGreaterThanOrEqual(2);
    expect(pathPayload.edges.length).toBeGreaterThanOrEqual(1);

    const analyticsResponse = await fetch(`${baseUrl}/api/analytics`);
    expect(analyticsResponse.ok).toBe(true);
    const analyticsPayload = await analyticsResponse.json();
    expect(analyticsPayload.hubs.length).toBeGreaterThan(0);
  });

  it('should reject source reads outside the project root', async () => {
    const outsideFile = path.join(testDir, '..', 'outside.ts');
    const response = await fetch(
      `${baseUrl}/api/source?file=${encodeURIComponent(outsideFile)}&startLine=1&endLine=1`
    );
    expect(response.status).toBe(403);
  });
});
