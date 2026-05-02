/**
 * Export benchmark and knowledge-contract tests.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import { GraphBuilder } from "../src/graph/builder.js";
import { ExportEngine } from "../src/retrieval/export.js";
import { ProjectMetadata, QueryResult } from "../src/types/models.js";

describe("Export Benchmark Tests", () => {
  let testRoot: string;
  let queryResult: QueryResult;
  let exporter: ExportEngine;

  beforeAll(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-brain-export-benchmark-"));
    createBenchmarkFixtures(testRoot, 40);

    const graph = new GraphBuilder().buildFromRepository(testRoot);
    const stats = graph.getStats();
    const project: ProjectMetadata = {
      name: "benchmark",
      root: testRoot,
      language: "typescript",
      fileCount: stats.nodesByType.file || 0,
      symbolCount: stats.nodeCount - (stats.nodesByType.file || 0) - (stats.nodesByType.project || 0),
      edgeCount: stats.edgeCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    queryResult = {
      nodes: graph.getNodes(),
      edges: graph.getEdges(),
      truncated: false,
    };
    exporter = new ExportEngine(graph, project, testRoot);
  });

  afterAll(() => {
    if (testRoot && fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it("exports a medium graph quickly", () => {
    const start = Date.now();
    const result = exporter.exportForAI(queryResult, undefined, undefined, 50_000);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
    expect(result.nodes.length).toBeGreaterThan(50);
    expect(result.edges.length).toBeGreaterThan(20);
  });

  it("includes the premium knowledge JSON contract", () => {
    const result = exporter.exportForAI(queryResult, undefined, undefined, 50_000, 120);

    expect(result.knowledge?.schemaVersion).toBe("codebrain-knowledge/v1");
    expect(result.knowledge?.algorithms.length).toBeGreaterThanOrEqual(4);
    expect(result.knowledge?.architecture.hotspots.length).toBeGreaterThan(0);
    expect(result.knowledge?.graphHealth.nodeCount).toBe(result.query.nodeCount);
    expect(result.layoutHints?.recommendedAlgorithm).toContain("forceatlas2");
  });

  it("respects a tight top-node export while preserving edge consistency", () => {
    const result = exporter.exportForAI(queryResult, undefined, undefined, 20_000, 25);
    const nodeIds = new Set(result.nodes.map((node) => node.id));

    expect(result.nodes.length).toBeLessThanOrEqual(25);
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });

  it("keeps AI export within an approximate token budget", () => {
    const maxTokens = 6000;
    const result = exporter.exportForAI(queryResult, undefined, undefined, maxTokens, 35);
    const estimatedTokens = Math.ceil(JSON.stringify(result).length / 4);

    expect(estimatedTokens).toBeLessThanOrEqual(maxTokens * 1.2);
  });
});

function createBenchmarkFixtures(root: string, modules: number): void {
  const srcDir = path.join(root, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(
    path.join(srcDir, "main.ts"),
    `
import { createRouter } from "./router";
import { Service0 } from "./modules/service0";

export function main() {
  const router = createRouter();
  return new Service0().handle(router);
}
    `.trim(),
  );

  fs.writeFileSync(
    path.join(srcDir, "router.ts"),
    `
export function createRouter() {
  return { path: "/api" };
}
    `.trim(),
  );

  const modulesDir = path.join(srcDir, "modules");
  fs.mkdirSync(modulesDir, { recursive: true });

  for (let index = 0; index < modules; index++) {
    const nextImport = index + 1 < modules
      ? `import { Service${index + 1} } from "./service${index + 1}";`
      : "";
    const nextCall = index + 1 < modules
      ? `return new Service${index + 1}().handle(input);`
      : "return input;";

    fs.writeFileSync(
      path.join(modulesDir, `service${index}.ts`),
      `
${nextImport}

export interface IService${index} {
  handle(input: unknown): unknown;
}

export class Service${index} implements IService${index} {
  handle(input: unknown): unknown {
    ${nextCall}
  }
}
      `.trim(),
    );
  }
}
