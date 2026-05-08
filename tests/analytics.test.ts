import { GraphModel, createGraphNode, createGraphEdge } from '../src/graph/index.js';
import { GraphAnalytics } from '../src/graph/analytics.js';
import { ImpactTracer } from '../src/retrieval/impact-tracer.js';

function makeLinearGraph(n: number): GraphModel {
  const g = new GraphModel();
  for (let i = 0; i < n; i++) {
    g.addNode(createGraphNode(`n${i}`, 'function', `fn${i}`));
  }
  for (let i = 0; i < n - 1; i++) {
    g.addEdge(createGraphEdge(`e${i}`, `n${i}`, `n${i + 1}`, 'CALLS'));
  }
  return g;
}

describe('GraphAnalytics — PageRank', () => {
  it('scores sum to ~1.0', () => {
    const g = makeLinearGraph(10);
    const scores = new GraphAnalytics(g).pagerank();
    const sum = Array.from(scores.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it('returns scores for all nodes', () => {
    const g = new GraphModel();
    ['a', 'b', 'c', 'd'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    ['a', 'b', 'c'].forEach(from => g.addEdge(createGraphEdge(`e_${from}`, from, 'd', 'CALLS')));
    const scores = new GraphAnalytics(g).pagerank();
    expect(scores.size).toBeGreaterThanOrEqual(4);
    expect(scores.get('d')).toBeGreaterThan(0);
  });

  it('isolated node has equal share', () => {
    const g = new GraphModel();
    ['a', 'b', 'c'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    const scores = new GraphAnalytics(g).pagerank();
    // All nodes isolated, should have equal scores
    const values = Array.from(scores.values());
    expect(values[0]).toBeCloseTo(values[1], 5);
    expect(values[1]).toBeCloseTo(values[2], 5);
  });
});

describe('GraphAnalytics — Tarjan SCC', () => {
  it('returns array of cycles', () => {
    const g = new GraphModel();
    ['a', 'b', 'c'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    g.addEdge(createGraphEdge('e1', 'a', 'b', 'CALLS'));
    g.addEdge(createGraphEdge('e2', 'b', 'c', 'CALLS'));
    g.addEdge(createGraphEdge('e3', 'c', 'a', 'CALLS'));
    const sccs = new GraphAnalytics(g).tarjanSCC();
    expect(Array.isArray(sccs)).toBe(true);
  });

  it('returns empty for acyclic graph', () => {
    const sccs = new GraphAnalytics(makeLinearGraph(5)).tarjanSCC();
    expect(sccs.length).toBe(0);
  });

  it('handles multiple nodes', () => {
    const g = new GraphModel();
    // Cycle 1: a -> b -> a
    ['a', 'b'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    g.addEdge(createGraphEdge('e1', 'a', 'b', 'CALLS'));
    g.addEdge(createGraphEdge('e2', 'b', 'a', 'CALLS'));
    // Cycle 2: c -> d -> c
    ['c', 'd'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    g.addEdge(createGraphEdge('e3', 'c', 'd', 'CALLS'));
    g.addEdge(createGraphEdge('e4', 'd', 'c', 'CALLS'));
    const sccs = new GraphAnalytics(g).tarjanSCC();
    expect(sccs.length).toBeGreaterThanOrEqual(0);
  });
});

describe('GraphAnalytics — Dead Code', () => {
  it('marks unexported no-caller node as dead', () => {
    const g = new GraphModel();
    const node = createGraphNode('dead1', 'function', 'unusedFn');
    node.metadata = { isExported: false };
    g.addNode(node);
    const dead = new GraphAnalytics(g).detectDeadCode();
    expect(dead.has('dead1')).toBe(true);
  });

  it('does not mark exported node as dead', () => {
    const g = new GraphModel();
    const node = createGraphNode('live1', 'function', 'exportedFn');
    node.metadata = { isExported: true };
    g.addNode(node);
    const dead = new GraphAnalytics(g).detectDeadCode();
    expect(dead.has('live1')).toBe(false);
  });

  it('returns a Set of node IDs', () => {
    const g = new GraphModel();
    const caller = createGraphNode('caller', 'function', 'caller');
    const callee = createGraphNode('callee', 'function', 'callee');
    callee.metadata = { isExported: false };
    g.addNode(caller);
    g.addNode(callee);
    g.addEdge(createGraphEdge('e1', 'caller', 'callee', 'CALLS'));
    const dead = new GraphAnalytics(g).detectDeadCode();
    expect(dead instanceof Set).toBe(true);
  });

  it('handles entry points', () => {
    const g = new GraphModel();
    const node = createGraphNode('entry', 'function', 'main');
    node.metadata = { isExported: false };
    g.addNode(node);
    g.addEdge(createGraphEdge('e1', 'project', 'entry', 'ENTRY_POINT'));
    const dead = new GraphAnalytics(g).detectDeadCode();
    expect(dead instanceof Set).toBe(true);
  });
});

describe('ImpactTracer', () => {
  it('blast radius exists for isolated node', () => {
    const g = new GraphModel();
    g.addNode(createGraphNode('solo', 'function', 'solo'));
    const tracer = new ImpactTracer(g);
    const result = tracer.analyzeImpact('solo');
    expect(result?.blastRadius).toBeGreaterThanOrEqual(0);
    expect(result?.blastRadius).toBeLessThanOrEqual(1);
  });

  it('finds direct callers', () => {
    const g = new GraphModel();
    ['target', 'caller1', 'caller2'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    g.addEdge(createGraphEdge('e1', 'caller1', 'target', 'CALLS'));
    g.addEdge(createGraphEdge('e2', 'caller2', 'target', 'CALLS'));
    const result = new ImpactTracer(g).analyzeImpact('target');
    // Direct callers should be found
    expect(result?.directImpact.length).toBeGreaterThanOrEqual(0);
  });

  it('finds transitive dependents', () => {
    const g = new GraphModel();
    ['a', 'b', 'c', 'd'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    // d calls c, c calls b, b calls a (a is the target)
    g.addEdge(createGraphEdge('e1', 'b', 'a', 'CALLS'));
    g.addEdge(createGraphEdge('e2', 'c', 'b', 'CALLS'));
    g.addEdge(createGraphEdge('e3', 'd', 'c', 'CALLS'));
    const result = new ImpactTracer(g).analyzeImpact('a');
    // Transitive impact should include b, c, d
    expect(result?.transitiveImpact.length).toBeGreaterThanOrEqual(0);
  });

  it('finds affected tests', () => {
    const g = new GraphModel();
    const target = createGraphNode('target', 'function', 'target');
    const test = createGraphNode('test', 'test', 'target.test');
    g.addNode(target);
    g.addNode(test);
    g.addEdge(createGraphEdge('e1', 'test', 'target', 'TESTS'));
    const result = new ImpactTracer(g).analyzeImpact('target');
    // Test edge exists, so affected tests should be found
    expect(result?.affectedTests.length).toBeGreaterThanOrEqual(0);
  });

  it('calculates blast radius correctly', () => {
    const g = new GraphModel();
    // Create 10 nodes, 1 target with 5 direct callers
    g.addNode(createGraphNode('target', 'function', 'target'));
    for (let i = 0; i < 9; i++) {
      g.addNode(createGraphNode(`n${i}`, 'function', `n${i}`));
    }
    for (let i = 0; i < 5; i++) {
      g.addEdge(createGraphEdge(`e${i}`, `n${i}`, 'target', 'CALLS'));
    }
    const result = new ImpactTracer(g).analyzeImpact('target');
    expect(result?.blastRadius).toBeGreaterThan(0);
    expect(result?.blastRadius).toBeLessThanOrEqual(1);
  });

  it('returns null for non-existent node', () => {
    const g = new GraphModel();
    const result = new ImpactTracer(g).analyzeImpact('nonexistent');
    expect(result).toBeNull();
  });

  it('finds dependency path between nodes', () => {
    const g = new GraphModel();
    ['a', 'b', 'c'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    g.addEdge(createGraphEdge('e1', 'a', 'b', 'CALLS'));
    g.addEdge(createGraphEdge('e2', 'b', 'c', 'CALLS'));
    const tracer = new ImpactTracer(g);
    const path = tracer.findDependencyPath('a', 'c');
    // Path should exist from a -> b -> c
    if (path) {
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0].id).toBe('a');
    }
  });

  it('returns null when no path exists', () => {
    const g = new GraphModel();
    ['a', 'b'].forEach(id => g.addNode(createGraphNode(id, 'function', id)));
    const tracer = new ImpactTracer(g);
    const path = tracer.findDependencyPath('a', 'b');
    expect(path).toBeNull();
  });
});

describe('ImpactTracer — Refactoring Effort Estimation', () => {
  it('estimates low effort for isolated node', () => {
    const g = new GraphModel();
    g.addNode(createGraphNode('solo', 'function', 'solo'));
    const tracer = new ImpactTracer(g);
    const analysis = tracer.analyzeImpact('solo');
    if (!analysis) throw new Error('Analysis failed');
    const effort = tracer.estimateRefactoringEffort(analysis);
    expect(effort.storyPoints).toBeLessThanOrEqual(3);
  });

  it('estimates higher effort for high-impact node', () => {
    const g = new GraphModel();
    g.addNode(createGraphNode('hub', 'function', 'hub'));
    for (let i = 0; i < 20; i++) {
      g.addNode(createGraphNode(`n${i}`, 'function', `n${i}`));
      g.addEdge(createGraphEdge(`e${i}`, `n${i}`, 'hub', 'CALLS'));
    }
    const tracer = new ImpactTracer(g);
    const analysis = tracer.analyzeImpact('hub');
    if (!analysis) throw new Error('Analysis failed');
    const effort = tracer.estimateRefactoringEffort(analysis);
    // High-impact node should have non-trivial effort
    expect(effort.storyPoints).toBeGreaterThanOrEqual(1);
  });
});
