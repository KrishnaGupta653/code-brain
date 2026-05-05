/**
 * Graph Analytics Module
 * 
 * Implements graph algorithms for code intelligence:
 * - PageRank: Importance scoring based on graph topology
 * - Tarjan's SCC: Strongly connected components (dependency cycles)
 * - Dead code detection: Unreachable symbols
 * - Betweenness centrality: Bridge node detection
 * - Call count analysis: In/out degree metrics
 */

import { GraphModel } from './model.js';
import { GraphNode } from '../types/models.js';

export class GraphAnalytics {
  constructor(private graph: GraphModel) {}

  /**
   * Run all analytics and update node metadata.
   */
  run(): void {
    const pr = this.pagerank();
    const bridges = this.betweennessCentrality(pr);
    const dead = this.detectDeadCode();
    const sccs = this.tarjanSCC();

    // Write results back to nodes
    for (const node of this.graph.getNodes()) {
      node.importance = parseFloat((pr.get(node.id) ?? 0).toFixed(4));
      node.metadata = {
        ...(node.metadata ?? {}),
        isBridge: bridges.has(node.id),
        isDead: dead.has(node.id),
      };
    }

    // Tag SCC members (cycles)
    for (const scc of sccs) {
      for (const id of scc) {
        const node = this.graph.getNode(id);
        if (node) {
          node.metadata = {
            ...(node.metadata ?? {}),
            inCycle: true,
            cycleSize: scc.length,
          };
        }
      }
    }
  }

  /**
   * PageRank algorithm for importance scoring.
   * Damping factor 0.85, 50 iterations.
   */
  pagerank(damping = 0.85, iterations = 50): Map<string, number> {
    const nodes = this.graph.getNodes();
    const N = nodes.length;
    if (N === 0) return new Map();

    const scores = new Map<string, number>(nodes.map(n => [n.id, 1 / N]));
    const next = new Map<string, number>();

    for (let iter = 0; iter < iterations; iter++) {
      next.clear();
      nodes.forEach(n => next.set(n.id, (1 - damping) / N));

      // Dangling node mass: nodes with no outgoing edges distribute their mass uniformly
      let danglingMass = 0;
      for (const n of nodes) {
        if (this.graph.getOutgoingEdges(n.id).length === 0) {
          danglingMass += scores.get(n.id) ?? 0;
        }
      }
      const danglingContrib = damping * danglingMass / N;

      for (const edge of this.graph.getEdges()) {
        const outDeg = Math.max(1, this.graph.getOutgoingEdges(edge.from).length);
        const contrib = damping * (scores.get(edge.from) ?? 0) / outDeg;
        next.set(edge.to, (next.get(edge.to) ?? 0) + contrib);
      }

      nodes.forEach(n => next.set(n.id, (next.get(n.id) ?? 0) + danglingContrib));

      // Normalize
      const total = Array.from(next.values()).reduce((a, b) => a + b, 0);
      if (total > 0) next.forEach((v, k) => next.set(k, v / total));

      scores.clear();
      next.forEach((v, k) => scores.set(k, v));
    }
    return scores;
  }

  /**
   * Tarjan's algorithm for strongly connected components (cycles).
   */
  tarjanSCC(): string[][] {
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let idx = 0;

    const strongconnect = (v: string): void => {
      index.set(v, idx);
      lowlink.set(v, idx);
      idx++;
      stack.push(v);
      onStack.add(v);

      for (const edge of this.graph.getOutgoingEdges(v)) {
        const w = edge.to;
        if (!index.has(w)) {
          strongconnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
        }
      }

      if (lowlink.get(v) === index.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        if (scc.length > 1) sccs.push(scc);
      }
    };

    for (const node of this.graph.getNodes()) {
      if (!index.has(node.id)) strongconnect(node.id);
    }
    return sccs;
  }

  /**
   * Detect dead code: symbols with no incoming edges and not exported/entry points.
   */
  detectDeadCode(): Set<string> {
    const dead = new Set<string>();
    for (const node of this.graph.getNodes()) {
      if (['project', 'file', 'config', 'doc'].includes(node.type)) continue;

      const isExported = node.metadata?.isExported === true;
      const isEntry = node.metadata?.isEntryPoint === true;
      const isTest = node.type === 'test' || node.location?.file?.includes('test') || node.location?.file?.includes('spec');

      if (isExported || isEntry || isTest) continue;

      const callers = this.graph.getIncomingEdges(node.id)
        .filter(e => e.type === 'CALLS' || e.type === 'USES' || e.type === 'REFERENCES');
      if (callers.length === 0) dead.add(node.id);
    }
    return dead;
  }

  /**
   * Betweenness centrality (Brandes algorithm) to find bridge nodes.
   * Uses top-30% by PageRank as sources for efficiency on large graphs.
   */
  betweennessCentrality(pageRankScores: Map<string, number>): Set<string> {
    const nodes = this.graph.getNodes();
    if (nodes.length === 0) return new Set();

    const betweenness = new Map<string, number>(nodes.map(n => [n.id, 0]));

    // Use all nodes as sources for graphs < 5000 nodes
    // For larger graphs, sample top-30% by PageRank as sources
    const sources = nodes.length < 5000
      ? nodes
      : [...nodes].sort((a, b) => (pageRankScores.get(b.id) ?? 0) - (pageRankScores.get(a.id) ?? 0))
          .slice(0, Math.ceil(nodes.length * 0.3));

    for (const s of sources) {
      const stack: string[] = [];
      const pred = new Map<string, string[]>(nodes.map(n => [n.id, []]));
      const sigma = new Map<string, number>(nodes.map(n => [n.id, 0]));
      const dist = new Map<string, number>(nodes.map(n => [n.id, -1]));
      sigma.set(s.id, 1);
      dist.set(s.id, 0);

      let head = 0;
      const queue = [s.id];
      while (head < queue.length) {
        const v = queue[head++];
        stack.push(v);
        for (const edge of this.graph.getOutgoingEdges(v)) {
          const w = edge.to;
          if (dist.get(w) === -1) {
            queue.push(w);
            dist.set(w, dist.get(v)! + 1);
          }
          if (dist.get(w) === dist.get(v)! + 1) {
            sigma.set(w, sigma.get(w)! + sigma.get(v)!);
            pred.get(w)!.push(v);
          }
        }
      }

      const delta = new Map<string, number>(nodes.map(n => [n.id, 0]));
      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred.get(w)!) {
          delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
        }
        if (w !== s.id) betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
      }
    }

    // Normalize and mark top-15% as bridges
    const maxBetweenness = Math.max(...betweenness.values(), 1);
    betweenness.forEach((v, k) => betweenness.set(k, v / maxBetweenness));
    const threshold = 0.85;
    return new Set([...betweenness.entries()].filter(([, v]) => v >= threshold).map(([k]) => k));
  }

  /**
   * Populate call count metadata (in/out degree for CALLS edges).
   */
  populateCallCounts(): void {
    for (const node of this.graph.getNodes()) {
      const incoming = this.graph.getIncomingEdges(node.id).filter(e => e.type === 'CALLS').length;
      const outgoing = this.graph.getOutgoingEdges(node.id).filter(e => e.type === 'CALLS').length;
      node.metadata = {
        ...(node.metadata ?? {}),
        callCountIn: incoming,
        callCountOut: outgoing,
      };
    }
  }

  /**
   * Topological sort (Kahn's algorithm) on IMPORTS + DEPENDS_ON edges.
   * Returns build order. Length < node count means cycles exist.
   */
  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const nodes = this.graph.getNodes();
    for (const n of nodes) inDegree.set(n.id, 0);

    for (const edge of this.graph.getEdges()) {
      if (edge.type !== 'IMPORTS' && edge.type !== 'DEPENDS_ON') continue;
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    let head = 0;
    const queue: string[] = [];
    for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
    const order: string[] = [];

    while (head < queue.length) {
      const v = queue[head++];
      order.push(v);
      for (const edge of this.graph.getOutgoingEdges(v)) {
        if (edge.type !== 'IMPORTS' && edge.type !== 'DEPENDS_ON') continue;
        const newDeg = (inDegree.get(edge.to) ?? 1) - 1;
        inDegree.set(edge.to, newDeg);
        if (newDeg === 0) queue.push(edge.to);
      }
    }
    return order;
  }
}
