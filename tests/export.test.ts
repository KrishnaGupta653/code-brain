import { ExportEngine } from '../src/retrieval/export';
import { GraphModel } from '../src/graph/index';
import { ProjectMetadata } from '../src/types/models';

describe('ExportEngine', () => {
  let engine: ExportEngine;
  let graph: GraphModel;
  const metadata: ProjectMetadata = {
    name: 'test-project',
    root: '/test',
    language: 'typescript',
    fileCount: 1,
    symbolCount: 3,
    edgeCount: 2,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  beforeEach(() => {
    graph = new GraphModel();
    engine = new ExportEngine(graph, metadata);
  });

  it('should export to JSON', () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false
    };

    const json = engine.exportAsJSON(queryResult);
    expect(json).toBeTruthy();

    const parsed = JSON.parse(json);
    expect(parsed.project).toEqual(metadata);
    expect(parsed.exportFormat).toBe('json');
  });

  it('should export to YAML', () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false
    };

    const yaml = engine.exportAsYAML(queryResult);
    expect(yaml).toBeTruthy();
    expect(yaml).toContain('project:');
  });

  it('should export for AI with rules', () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false
    };

    const aiExport = engine.exportForAI(queryResult, 'test-module');
    expect(aiExport.exportFormat).toBe('ai');
    expect(aiExport.rules).toBeTruthy();
    expect(aiExport.rules.length).toBeGreaterThan(0);
    expect(aiExport.focus).toBe('test-module');
  });

  it('should include provenance in exports', () => {
    const queryResult = {
      nodes: [],
      edges: [],
      truncated: false
    };

    const json = engine.exportAsJSON(queryResult);
    const parsed = JSON.parse(json);
    expect(parsed.exportedAt).toBeTruthy();
  });
});
