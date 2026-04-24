import { GraphModel, createGraphNode, createGraphEdge } from '../src/graph/index';

describe('GraphModel', () => {
  let graph: GraphModel;

  beforeEach(() => {
    graph = new GraphModel();
  });

  it('should add and retrieve nodes', () => {
    const node = createGraphNode(
      'node-1',
      'function',
      'testFunc',
      { file: 'test.ts', startLine: 1, endLine: 1, startCol: 0, endCol: 10 }
    );

    graph.addNode(node);
    expect(graph.getNode('node-1')).toBe(node);
  });

  it('should add and retrieve edges', () => {
    const node1 = createGraphNode(
      'node-1',
      'function',
      'func1',
      { file: 'test.ts', startLine: 1, endLine: 1, startCol: 0, endCol: 10 }
    );
    const node2 = createGraphNode(
      'node-2',
      'function',
      'func2',
      { file: 'test.ts', startLine: 5, endLine: 5, startCol: 0, endCol: 10 }
    );

    graph.addNode(node1);
    graph.addNode(node2);

    const edge = createGraphEdge(
      'edge-1',
      'CALLS',
      'node-1',
      'node-2',
      true
    );

    graph.addEdge(edge);

    expect(graph.getEdge('edge-1')).toBe(edge);
    expect(graph.getOutgoingEdges('node-1')).toContain(edge);
    expect(graph.getIncomingEdges('node-2')).toContain(edge);
  });

  it('should find paths between nodes', () => {
    const node1 = createGraphNode('node-1', 'function', 'func1', {
      file: 'test.ts',
      startLine: 1,
      endLine: 1,
      startCol: 0,
      endCol: 10
    });
    const node2 = createGraphNode('node-2', 'function', 'func2', {
      file: 'test.ts',
      startLine: 5,
      endLine: 5,
      startCol: 0,
      endCol: 10
    });
    const node3 = createGraphNode('node-3', 'function', 'func3', {
      file: 'test.ts',
      startLine: 10,
      endLine: 10,
      startCol: 0,
      endCol: 10
    });

    graph.addNode(node1);
    graph.addNode(node2);
    graph.addNode(node3);

    const edge1 = createGraphEdge('edge-1', 'CALLS', 'node-1', 'node-2', true);
    const edge2 = createGraphEdge('edge-2', 'CALLS', 'node-2', 'node-3', true);

    graph.addEdge(edge1);
    graph.addEdge(edge2);

    const path = graph.findPath('node-1', 'node-3');
    expect(path).toEqual(['node-1', 'node-2', 'node-3']);
  });

  it('should calculate statistics', () => {
    const node1 = createGraphNode('node-1', 'class', 'MyClass', {
      file: 'test.ts',
      startLine: 1,
      endLine: 1,
      startCol: 0,
      endCol: 10
    });
    const node2 = createGraphNode('node-2', 'method', 'method1', {
      file: 'test.ts',
      startLine: 5,
      endLine: 5,
      startCol: 0,
      endCol: 10
    });

    graph.addNode(node1);
    graph.addNode(node2);

    const edge = createGraphEdge('edge-1', 'OWNS', 'node-1', 'node-2', true);
    graph.addEdge(edge);

    const stats = graph.getStats();

    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
    expect(stats.nodesByType['class']).toBe(1);
    expect(stats.nodesByType['method']).toBe(1);
    expect(stats.edgesByType['OWNS']).toBe(1);
  });
});
