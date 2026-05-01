import { ExportEngine } from "../src/retrieval/export";
import { GraphModel } from "../src/graph/index";
import {
  GraphEdge,
  GraphNode,
  ProjectMetadata,
  SourceSpan,
} from "../src/types/models";

describe("ExportEngine", () => {
  let engine: ExportEngine;
  let graph: GraphModel;
  const metadata: ProjectMetadata = {
    name: "test-project",
    root: "/test",
    language: "typescript",
    fileCount: 1,
    symbolCount: 3,
    edgeCount: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    graph = new GraphModel();
    engine = new ExportEngine(graph, metadata);
  });

  it("should export to JSON", () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false,
    };

    const json = engine.exportAsJSON(queryResult);
    expect(json).toBeTruthy();

    const parsed = JSON.parse(json);
    expect(parsed.project).toEqual(metadata);
    expect(parsed.exportFormat).toBe("json");
  });

  it("should export to YAML", () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false,
    };

    const yaml = engine.exportAsYAML(queryResult);
    expect(yaml).toBeTruthy();
    expect(yaml).toContain("project:");
  });

  it("should export for AI with rules", () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false,
    };

    const aiExport = engine.exportForAI(queryResult, "test-module");
    expect(aiExport.exportFormat).toBe("ai");
    expect(aiExport.rules).toBeTruthy();
    expect(aiExport.rules.length).toBeGreaterThan(0);
    expect(aiExport.focus).toBe("test-module");
  });

  it("should add AI summary, canonical names, and call chains", () => {
    const span: SourceSpan = {
      file: "/test/src/index.ts",
      startLine: 1,
      endLine: 1,
      startCol: 1,
      endCol: 10,
    };
    const makeNode = (
      id: string,
      name: string,
      semanticPath?: string,
    ): GraphNode => ({
      id,
      type: "function",
      name,
      fullName: `/test/src/index.ts::${name}`,
      semanticPath,
      location: span,
      provenance: {
        nodeId: id,
        type: "parser",
        source: [span],
        confidence: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    });
    const makeEdge = (
      id: string,
      type: GraphEdge["type"],
      from: string,
      to: string,
    ): GraphEdge => ({
      id,
      type,
      from,
      to,
      resolved: true,
      provenance: {
        nodeId: id,
        type: "parser",
        source: [span],
        confidence: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    });
    const queryResult = {
      nodes: [
        makeNode("main", "main", "project.index.main"),
        makeNode("handler", "handler", "project.api.handler"),
      ],
      edges: [
        makeEdge("entry-main", "ENTRY_POINT", "project", "main"),
        makeEdge("main-handler", "CALLS", "main", "handler"),
      ],
      truncated: false,
    };

    const aiExport = engine.exportForAI(queryResult);

    expect(aiExport.version).toBe("codebrain-ai/v3-hierarchical");
    expect(aiExport.fingerprint).toBeTruthy();
    expect(aiExport.summary?.entryPoints).toContain("project.index.main");
    expect(aiExport.callChains).toEqual([
      ["project.index.main", "project.api.handler"],
    ]);
    expect(aiExport.nodes[0].canonicalName).toBeTruthy();
    expect(aiExport.nodes[0].importance).toBeGreaterThanOrEqual(0);
  });

  it("should include provenance in exports", () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false,
    };

    const json = engine.exportAsJSON(queryResult);
    const parsed = JSON.parse(json);
    expect(parsed.exportedAt).toBeTruthy();
  });

  it("should export module summaries", () => {
    const fileSpan: SourceSpan = {
      file: "/test/src/retrieval/export.ts",
      startLine: 1,
      endLine: 1,
      startCol: 1,
      endCol: 20,
    };
    const queryResult = {
      nodes: [
        {
          id: "file-export",
          type: "file",
          name: "export.ts",
          fullName: "/test/src/retrieval/export.ts",
          location: fileSpan,
          metadata: { filePath: "/test/src/retrieval/export.ts" },
          provenance: {
            nodeId: "file-export",
            type: "parser",
            source: [fileSpan],
            confidence: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
        {
          id: "fn-exportForAI",
          type: "function",
          name: "exportForAI",
          fullName: "/test/src/retrieval/export.ts::exportForAI",
          location: fileSpan,
          metadata: { filePath: "/test/src/retrieval/export.ts", exported: true },
          provenance: {
            nodeId: "fn-exportForAI",
            type: "parser",
            source: [fileSpan],
            confidence: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ] as GraphNode[],
      edges: [
        {
          id: "defines-export",
          type: "DEFINES",
          from: "file-export",
          to: "fn-exportForAI",
          resolved: true,
          provenance: {
            nodeId: "defines-export",
            type: "parser",
            source: [fileSpan],
            confidence: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ] as GraphEdge[],
      truncated: false,
    };

    const modules = engine.exportModules(queryResult);
    expect(modules).toContain("# code-brain modules export");
    expect(modules).toContain("src/retrieval");
    expect(modules).toContain("exportForAI");
  });
});
