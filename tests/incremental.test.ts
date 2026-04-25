import fs from "fs";
import path from "path";
import os from "os";
import { initCommand } from "../src/cli/commands/init";
import { indexCommand } from "../src/cli/commands/index";
import { updateCommand } from "../src/cli/commands/update";
import { getDbPath } from "../src/utils/index";
import { SQLiteStorage } from "../src/storage/index";

describe("Incremental Indexing", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-brain-incremental-"));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it("should detect file modifications and update graph", async () => {
    // Setup initial repo
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const fileA = path.join(srcDir, "a.ts");
    const fileB = path.join(srcDir, "b.ts");

    fs.writeFileSync(
      fileA,
      `
      export function foo() {
        return 42;
      }
    `,
    );

    fs.writeFileSync(
      fileB,
      `
      export function bar() {
        return 100;
      }
    `,
    );

    // Initial index
    await initCommand(testDir);
    await indexCommand(testDir);

    // Get initial state
    const storage1 = new SQLiteStorage(getDbPath(testDir));
    const graph1 = storage1.loadGraph(testDir);
    const nodeCount1 = graph1.getStats().nodeCount;
    storage1.close();

    expect(nodeCount1).toBeGreaterThan(0);

    // Modify fileA
    fs.writeFileSync(
      fileA,
      `
      export function foo() {
        return 42;
      }

      export function newFunc() {
        return 99;
      }
    `,
    );

    // Update
    await updateCommand(testDir);

    // Verify graph was updated
    const storage2 = new SQLiteStorage(getDbPath(testDir));
    const graph2 = storage2.loadGraph(testDir);
    const nodeCount2 = graph2.getStats().nodeCount;
    storage2.close();

    expect(nodeCount2).toBeGreaterThan(nodeCount1);

    // Verify newFunc exists
    const newFuncNode = graph2.getNodes().find((n) => n.name === "newFunc");
    expect(newFuncNode).toBeDefined();
  });

  it("should handle file deletion", async () => {
    // Setup initial repo with 2 files
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const fileA = path.join(srcDir, "a.ts");
    const fileB = path.join(srcDir, "b.ts");

    fs.writeFileSync(
      fileA,
      `
      export class ClassA {
        method() {}
      }
    `,
    );

    fs.writeFileSync(
      fileB,
      `
      import { ClassA } from './a';
      export class ClassB extends ClassA {}
    `,
    );

    // Initial index
    await initCommand(testDir);
    await indexCommand(testDir);

    const storage1 = new SQLiteStorage(getDbPath(testDir));
    const graph1 = storage1.loadGraph(testDir);
    const nodeCountBefore = graph1.getStats().nodeCount;
    storage1.close();

    // Delete fileA
    fs.unlinkSync(fileA);

    // Update
    await updateCommand(testDir);

    // Verify nodes from deleted file are gone
    const storage2 = new SQLiteStorage(getDbPath(testDir));
    const graph2 = storage2.loadGraph(testDir);
    const nodeCountAfter = graph2.getStats().nodeCount;
    storage2.close();

    expect(nodeCountAfter).toBeLessThan(nodeCountBefore);

    // ClassA should not exist
    const classANode = graph2.getNodes().find((n) => n.name === "ClassA");
    expect(classANode).toBeUndefined();
  });

  it("should propagate updates to dependent files", async () => {
    // Setup initial repo with import chain
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const fileA = path.join(srcDir, "a.ts");
    const fileB = path.join(srcDir, "b.ts");
    const fileC = path.join(srcDir, "c.ts");

    fs.writeFileSync(fileA, "export function funcA() {}");
    fs.writeFileSync(
      fileB,
      `import { funcA } from './a'; export function funcB() { funcA(); }`,
    );
    fs.writeFileSync(
      fileC,
      `import { funcB } from './b'; export function funcC() { funcB(); }`,
    );

    // Initial index
    await initCommand(testDir);
    await indexCommand(testDir);

    const storage1 = new SQLiteStorage(getDbPath(testDir));
    const graph1 = storage1.loadGraph(testDir);
    const edgeCountBefore = graph1.getStats().edgeCount;
    storage1.close();

    // Modify fileA - add new export
    fs.writeFileSync(
      fileA,
      `export function funcA() {} export function funcA2() {}`,
    );

    // Update should re-index A, B, C
    await updateCommand(testDir);

    const storage2 = new SQLiteStorage(getDbPath(testDir));
    const graph2 = storage2.loadGraph(testDir);
    const edgeCountAfter = graph2.getStats().edgeCount;
    storage2.close();

    // Should have same or more edges
    expect(edgeCountAfter).toBeGreaterThanOrEqual(edgeCountBefore);

    // funcA2 should exist
    const funcA2Node = graph2.getNodes().find((n) => n.name === "funcA2");
    expect(funcA2Node).toBeDefined();
  });

  it("should skip update when no changes detected", async () => {
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const fileA = path.join(srcDir, "a.ts");
    fs.writeFileSync(fileA, "export function func() {}");

    // Initial index
    await initCommand(testDir);
    await indexCommand(testDir);

    const storage1 = new SQLiteStorage(getDbPath(testDir));
    const graph1 = storage1.loadGraph(testDir);
    const edgeCountBefore = graph1.getStats().edgeCount;
    storage1.close();

    // Don't modify anything
    // Call update - should detect no changes
    await updateCommand(testDir);

    const storage2 = new SQLiteStorage(getDbPath(testDir));
    const graph2 = storage2.loadGraph(testDir);
    const edgeCountAfter = graph2.getStats().edgeCount;
    storage2.close();

    // Edge count should be identical
    expect(edgeCountAfter).toBe(edgeCountBefore);
  });

  it("should maintain graph integrity across incremental updates", async () => {
    const srcDir = path.join(testDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const fileA = path.join(srcDir, "a.ts");
    const fileB = path.join(srcDir, "b.ts");

    fs.writeFileSync(fileA, "export function funcA() {}");
    fs.writeFileSync(
      fileB,
      `import { funcA } from './a'; export function funcB() { funcA(); }`,
    );

    // Full index
    await initCommand(testDir);
    await indexCommand(testDir);

    const storage1 = new SQLiteStorage(getDbPath(testDir));
    const graph1 = storage1.loadGraph(testDir);
    const edges1 = graph1.getEdges();
    storage1.close();

    // Incremental update (no changes)
    await updateCommand(testDir);

    const storage2 = new SQLiteStorage(getDbPath(testDir));
    const graph2 = storage2.loadGraph(testDir);
    const edges2 = graph2.getEdges();
    storage2.close();

    // Same number of edges
    expect(edges2.length).toBe(edges1.length);

    // All edges still have valid from/to nodes
    const nodeIds = new Set(graph2.getNodes().map((n) => n.id));
    for (const edge of edges2) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });
});
