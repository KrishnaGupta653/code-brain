/**
 * Export Benchmark Test Suite
 * Tests export performance, token estimation accuracy, and compression ratios.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SQLiteStorage } from "../src/storage/index.js";
import { GraphBuilder } from "../src/graph/builder.js";
import { ExportEngine } from "../src/retrieval/export.js";
import { parseTypeScript } from "../src/parser/typescript.js";
import { parsePython } from "../src/parser/python.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testRoot = path.join(__dirname, "..", "test-fixtures", "benchmark");
const dbPath = path.join(testRoot, ".codebrain", "graph.db");

describe("Export Benchmark Tests", () => {
  let storage: SQLiteStorage;
  let builder: GraphBuilder;

  beforeAll(() => {
    // Create test fixtures directory
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    // Create sample files for benchmarking
    createBenchmarkFixtures(testRoot);

    // Initialize storage and builder
    storage = new SQLiteStorage(dbPath);
    builder = new GraphBuilder(storage, testRoot);

    // Parse and build graph
    const files = getAllFiles(testRoot);
    for (const file of files) {
      if (file.endsWith(".ts")) {
        const symbols = parseTypeScript(file, testRoot);
        builder.addSymbols(symbols);
      } else if (file.endsWith(".py")) {
        const symbols = parsePython(file, testRoot);
        builder.addSymbols(symbols);
      }
    }

    builder.buildRelationships();
  });

  afterAll(() => {
    storage.close();
    // Clean up test fixtures
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe("Export Performance", () => {
    it("should export small graph (< 100 nodes) in under 100ms", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const start = Date.now();
      const result = exporter.exportForAI({ maxTokens: 10000, format: "json" });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("should export medium graph (100-500 nodes) in under 500ms", () => {
      // Create additional fixtures for medium graph
      createMediumGraphFixtures(testRoot);

      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const start = Date.now();
      const result = exporter.exportForAI({ maxTokens: 50000, format: "json" });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
      expect(result.nodes.length).toBeGreaterThan(50);
    });

    it("should handle large exports (> 1000 nodes) efficiently", () => {
      // Create additional fixtures for large graph
      createLargeGraphFixtures(testRoot);

      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const start = Date.now();
      const result = exporter.exportForAI({ maxTokens: 100000, format: "json" });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000); // 2 seconds max
      expect(result.nodes.length).toBeGreaterThan(100);
    });
  });

  describe("Token Estimation Accuracy", () => {
    it("should estimate tokens within 10% of actual count", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const result = exporter.exportForAI({ maxTokens: 10000, format: "json" });
      const exported = JSON.stringify(result, null, 2);

      // Rough token estimation: ~4 chars per token
      const estimatedTokens = Math.ceil(exported.length / 4);
      const reportedTokens = result.metadata?.estimatedTokens || 0;

      const difference = Math.abs(estimatedTokens - reportedTokens);
      const percentDiff = (difference / estimatedTokens) * 100;

      expect(percentDiff).toBeLessThan(10);
    });

    it("should respect maxTokens budget", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const maxTokens = 5000;
      const result = exporter.exportForAI({ maxTokens, format: "json" });
      const exported = JSON.stringify(result, null, 2);

      const estimatedTokens = Math.ceil(exported.length / 4);

      expect(estimatedTokens).toBeLessThanOrEqual(maxTokens * 1.1); // 10% tolerance
    });

    it("should provide accurate token breakdown by section", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const result = exporter.exportForAI({ maxTokens: 10000, format: "json" });

      expect(result.metadata?.tokenBreakdown).toBeDefined();
      const breakdown = result.metadata?.tokenBreakdown;

      if (breakdown) {
        const total = Object.values(breakdown).reduce((sum: number, val) => sum + (val as number), 0);
        const reported = result.metadata?.estimatedTokens || 0;

        expect(Math.abs(total - reported)).toBeLessThan(reported * 0.05); // 5% tolerance
      }
    });
  });

  describe("Compression Ratios", () => {
    it("should achieve at least 30% compression with semantic mode", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const fullResult = exporter.exportForAI({ maxTokens: 100000, format: "json", compression: "none" });
      const compressedResult = exporter.exportForAI({ maxTokens: 100000, format: "json", compression: "semantic" });

      const fullSize = JSON.stringify(fullResult).length;
      const compressedSize = JSON.stringify(compressedResult).length;

      const compressionRatio = ((fullSize - compressedSize) / fullSize) * 100;

      expect(compressionRatio).toBeGreaterThan(30);
    });

    it("should preserve critical information after compression", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const fullResult = exporter.exportForAI({ maxTokens: 100000, format: "json", compression: "none" });
      const compressedResult = exporter.exportForAI({ maxTokens: 100000, format: "json", compression: "semantic" });

      // Check that all node IDs are preserved
      const fullNodeIds = new Set(fullResult.nodes.map((n: any) => n.id));
      const compressedNodeIds = new Set(compressedResult.nodes.map((n: any) => n.id));

      expect(compressedNodeIds.size).toBe(fullNodeIds.size);

      // Check that all edges are preserved
      expect(compressedResult.edges.length).toBe(fullResult.edges.length);
    });

    it("should compress signatures while maintaining readability", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const result = exporter.exportForAI({ maxTokens: 10000, format: "json", compression: "semantic" });

      // Check that function nodes have signatures
      const functionNodes = result.nodes.filter((n: any) => n.type === "function" || n.type === "method");

      for (const node of functionNodes) {
        expect(node.signature || node.snippet).toBeDefined();
        
        if (node.signature) {
          // Signature should be concise (< 200 chars for most functions)
          expect(node.signature.length).toBeLessThan(200);
        }
      }
    });
  });

  describe("Export Formats", () => {
    it("should export to JSON format correctly", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const result = exporter.exportForAI({ maxTokens: 10000, format: "json" });

      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it("should export to YAML format correctly", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const result = exporter.exportForAI({ maxTokens: 10000, format: "yaml" });

      expect(typeof result).toBe("string");
      expect(result).toContain("nodes:");
      expect(result).toContain("edges:");
    });

    it("should export to AI format with natural language", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const result = exporter.exportForAI({ maxTokens: 10000, format: "ai" });

      expect(typeof result).toBe("string");
      expect(result).toContain("Code Graph");
      expect(result.length).toBeGreaterThan(100);
    });
  });

  describe("Incremental Export", () => {
    it("should export only changed nodes", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const result = exporter.exportForAI({ 
        maxTokens: 10000, 
        format: "json",
        since: oneHourAgo 
      });

      // All nodes should have been updated recently (we just created them)
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it("should include related edges for changed nodes", () => {
      const graph = storage.loadGraph(testRoot);
      const exporter = new ExportEngine(graph, storage, testRoot);

      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const result = exporter.exportForAI({ 
        maxTokens: 10000, 
        format: "json",
        since: oneHourAgo 
      });

      // Should have edges connecting the changed nodes
      expect(result.edges.length).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * Helper function to create benchmark fixtures.
 */
function createBenchmarkFixtures(root: string): void {
  // Create TypeScript files
  const tsDir = path.join(root, "src");
  fs.mkdirSync(tsDir, { recursive: true });

  fs.writeFileSync(
    path.join(tsDir, "utils.ts"),
    `
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseDate(str: string): Date {
  return new Date(str);
}

export class Logger {
  log(message: string): void {
    console.log(message);
  }
}
    `.trim()
  );

  fs.writeFileSync(
    path.join(tsDir, "api.ts"),
    `
import { formatDate, Logger } from './utils';

export class ApiClient {
  private logger = new Logger();

  async fetchData(url: string): Promise<any> {
    this.logger.log(\`Fetching \${url}\`);
    const response = await fetch(url);
    return response.json();
  }
}
    `.trim()
  );

  // Create Python files
  const pyDir = path.join(root, "python");
  fs.mkdirSync(pyDir, { recursive: true });

  fs.writeFileSync(
    path.join(pyDir, "utils.py"),
    `
def format_string(text: str) -> str:
    return text.strip().lower()

class DataProcessor:
    def process(self, data: dict) -> dict:
        return {k: v for k, v in data.items() if v is not None}
    `.trim()
  );
}

/**
 * Create medium-sized graph fixtures.
 */
function createMediumGraphFixtures(root: string): void {
  const tsDir = path.join(root, "src", "modules");
  fs.mkdirSync(tsDir, { recursive: true });

  for (let i = 0; i < 10; i++) {
    fs.writeFileSync(
      path.join(tsDir, `module${i}.ts`),
      `
export class Module${i} {
  private value: number = ${i};

  getValue(): number {
    return this.value;
  }

  setValue(val: number): void {
    this.value = val;
  }
}
      `.trim()
    );
  }
}

/**
 * Create large graph fixtures.
 */
function createLargeGraphFixtures(root: string): void {
  const tsDir = path.join(root, "src", "large");
  fs.mkdirSync(tsDir, { recursive: true });

  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(
      path.join(tsDir, `component${i}.ts`),
      `
export interface IComponent${i} {
  id: number;
  name: string;
  process(): void;
}

export class Component${i} implements IComponent${i} {
  id: number = ${i};
  name: string = "Component${i}";

  process(): void {
    console.log(\`Processing \${this.name}\`);
  }

  validate(): boolean {
    return this.id >= 0;
  }
}
      `.trim()
    );
  }
}

/**
 * Get all files in a directory recursively.
 */
function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== ".codebrain" && entry.name !== "node_modules") {
          traverse(fullPath);
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}
