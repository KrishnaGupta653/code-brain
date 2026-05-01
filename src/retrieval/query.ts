import { GraphModel } from '../graph/index.js';
import { GraphEdge, GraphNode, NodeType, QueryResult } from '../types/models.js';
import { SQLiteStorage } from '../storage/index.js';

export class QueryEngine {
  private storage?: SQLiteStorage;
  private projectRoot?: string;

  // Pre-built bundle patterns for domain-focused exports
  readonly BUNDLE_PATTERNS: Record<string, {
    namePatterns?: string[];
    types?: NodeType[];
    edgeTypes?: string[];
  }> = {
    auth: {
      namePatterns: ['auth', 'login', 'logout', 'session', 'token', 'jwt', 'oauth', 'password', 'credential', 'permission', 'role', 'user', 'account']
    },
    api: {
      types: ['route']
    },
    tests: {
      types: ['test']
    },
    database: {
      namePatterns: ['storage', 'model', 'schema', 'migration', 'repository', 'db', 'sql', 'query', 'entity', 'table', 'orm']
    },
    config: {
      types: ['config']
    },
    core: {
      edgeTypes: ['ENTRY_POINT']
    },
  };

  constructor(private graph: GraphModel, storage?: SQLiteStorage, projectRoot?: string) {
    this.storage = storage;
    this.projectRoot = projectRoot;
  }

  getGraph(): GraphModel {
    return this.graph;
  }

  findRelated(nodeId: string, depth: number = 2, maxNodes: number = 250): QueryResult {
    const nodes = new Set<string>([nodeId]);
    const edges = new Map<string, GraphEdge>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];
    let truncated = false;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id) || current.currentDepth > depth) {
        continue;
      }

      if (nodes.size >= maxNodes) {
        truncated = true;
        break;
      }

      visited.add(current.id);
      const relatedEdges = [
        ...this.graph.getOutgoingEdges(current.id),
        ...this.graph.getIncomingEdges(current.id)
      ];

      for (const edge of relatedEdges) {
        edges.set(edge.id, edge);
        const nextId = edge.from === current.id ? edge.to : edge.from;
        nodes.add(nextId);

        if (current.currentDepth < depth && !visited.has(nextId)) {
          queue.push({ id: nextId, currentDepth: current.currentDepth + 1 });
        }
      }
    }

    const resultNodes = Array.from(nodes)
      .map(id => this.graph.getNode(id))
      .filter((node): node is GraphNode => Boolean(node))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    return {
      nodes: resultNodes,
      edges: Array.from(edges.values()).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)),
      expandedTo: depth,
      truncated
    };
  }

  findByName(pattern: string, limit: number = 50): GraphNode[] {
    const normalized = pattern.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    // Use FTS5 search if storage is available
    if (this.storage && this.projectRoot) {
      try {
        return this.storage.searchNodes(this.projectRoot, normalized, limit);
      } catch (error) {
        // Fall back to in-memory search if FTS5 fails
      }
    }

    // Fallback: in-memory search
    return this.graph
      .getNodes()
      .filter(node => {
        const haystacks = [
          node.name,
          node.fullName || '',
          node.semanticPath || '',
          String(node.metadata?.filePath || ''),
          node.summary || ''
        ];
        return haystacks.some(value => value.toLowerCase().includes(normalized));
      })
      .sort((a, b) => {
        // Prioritize exact matches
        const aExact = a.name.toLowerCase() === normalized ? 0 : 1;
        const bExact = b.name.toLowerCase() === normalized ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        
        // Then by importance score
        const aScore = a.importanceScore || 0;
        const bScore = b.importanceScore || 0;
        if (aScore !== bScore) return bScore - aScore;
        
        // Finally alphabetically
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);
  }

  findByType(type: NodeType, limit: number = 100): GraphNode[] {
    return this.graph
      .getNodes()
      .filter(node => node.type === type)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  findEntryPoints(): GraphNode[] {
    const entryIds = new Set(
      this.graph
        .getEdgesByType('ENTRY_POINT')
        .map(edge => edge.to)
    );

    return Array.from(entryIds)
      .map(id => this.graph.getNode(id))
      .filter((node): node is GraphNode => Boolean(node))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getModuleGraph(modulePath: string): QueryResult {
    const exact = this.resolveFocus(modulePath);
    if (!exact) {
      return { nodes: [], edges: [], truncated: false };
    }

    return this.findRelated(exact.id, 1);
  }

  getFileSymbols(filePath: string): GraphNode[] {
    const fileNode = this.graph
      .getNodes()
      .find(node => node.type === 'file' && (node.fullName === filePath || node.name === filePath));
    if (!fileNode) {
      return [];
    }

    return this.graph
      .getOutgoingEdges(fileNode.id)
      .filter(edge => edge.type === 'DEFINES')
      .map(edge => this.graph.getNode(edge.to))
      .filter((node): node is GraphNode => Boolean(node))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  }

  resolveFocus(focus: string): GraphNode | null {
    const exactMatches = this.graph.getNodes().filter(node => {
      const names = [node.name, node.fullName || '', String(node.metadata?.filePath || '')];
      return names.includes(focus);
    });

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    const caseInsensitiveExact = this.graph.getNodes().filter(node => {
      const names = [node.name, node.fullName || '', String(node.metadata?.filePath || '')];
      return names.some(value => value.toLowerCase() === focus.toLowerCase());
    });

    if (caseInsensitiveExact.length === 1) {
      return caseInsensitiveExact[0];
    }

    const fuzzy = this.findByName(focus, 10);
    return fuzzy.length === 1 ? fuzzy[0] : null;
  }

  getProjectOverview(maxNodes: number = 160): QueryResult {
    const entryPoints = this.findEntryPoints();
    const seeds = new Set<string>();

    const projectNode = this.graph.getNodes().find(node => node.type === 'project');
    if (projectNode) {
      seeds.add(projectNode.id);
    }

    for (const node of entryPoints) {
      seeds.add(node.id);
    }

    for (const node of this.findByType('route', 20)) {
      seeds.add(node.id);
    }

    for (const node of this.findByType('file', 30)) {
      seeds.add(node.id);
    }

    if (seeds.size === 0) {
      return { nodes: [], edges: [], truncated: false };
    }

    const collectedNodes = new Map<string, GraphNode>();
    const collectedEdges = new Map<string, GraphEdge>();
    let truncated = false;

    for (const seedId of seeds) {
      const result = this.findRelated(seedId, 1, maxNodes);
      for (const node of result.nodes) {
        if (collectedNodes.size >= maxNodes) {
          truncated = true;
          break;
        }
        collectedNodes.set(node.id, node);
      }
      for (const edge of result.edges) {
        collectedEdges.set(edge.id, edge);
      }
      if (truncated) {
        break;
      }
    }

    return {
      nodes: Array.from(collectedNodes.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
      edges: Array.from(collectedEdges.values()).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)),
      truncated
    };
  }

  /**
   * Find all circular import chains using Tarjan's SCC algorithm.
   */
  findCycles(maxCycles: number = 50): GraphNode[][] {
    const cycles: GraphNode[][] = [];
    const index = new Map<string, number>();
    const lowLink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let currentIndex = 0;

    const strongConnect = (nodeId: string): void => {
      if (cycles.length >= maxCycles) return;

      index.set(nodeId, currentIndex);
      lowLink.set(nodeId, currentIndex);
      currentIndex++;
      stack.push(nodeId);
      onStack.add(nodeId);

      // Consider only structural edges for cycle detection
      const structuralEdges = this.graph
        .getOutgoingEdges(nodeId)
        .filter(e => ['IMPORTS', 'DEPENDS_ON', 'CALLS', 'EXTENDS', 'IMPLEMENTS'].includes(e.type));

      for (const edge of structuralEdges) {
        const targetId = edge.to;
        
        if (!index.has(targetId)) {
          strongConnect(targetId);
          lowLink.set(nodeId, Math.min(lowLink.get(nodeId)!, lowLink.get(targetId)!));
        } else if (onStack.has(targetId)) {
          lowLink.set(nodeId, Math.min(lowLink.get(nodeId)!, index.get(targetId)!));
        }
      }

      // If nodeId is a root node, pop the stack and generate an SCC
      if (lowLink.get(nodeId) === index.get(nodeId)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== nodeId);

        // Only report cycles (SCCs with more than 1 node)
        if (scc.length > 1) {
          const cycleNodes = scc
            .map(id => this.graph.getNode(id))
            .filter((n): n is GraphNode => Boolean(n));
          if (cycleNodes.length > 1) {
            cycles.push(cycleNodes);
          }
        }
      }
    };

    // Run Tarjan's algorithm on all nodes
    for (const node of this.graph.getNodes()) {
      if (!index.has(node.id) && cycles.length < maxCycles) {
        strongConnect(node.id);
      }
    }

    return cycles;
  }

  /**
   * Find exported symbols that are never imported.
   */
  findDeadExports(): GraphNode[] {
    const entryPointIds = new Set(
      this.graph.getEdgesByType('ENTRY_POINT').map(e => e.to)
    );

    return this.graph
      .getNodes()
      .filter(node => {
        // Must be exported
        if (!node.metadata?.exported) return false;
        
        // Exclude entry points
        if (entryPointIds.has(node.id)) return false;
        
        // Check if it has any incoming IMPORTS or USES edges
        const incoming = this.graph.getIncomingEdges(node.id);
        const hasImporters = incoming.some(e => 
          e.type === 'IMPORTS' || e.type === 'USES' || e.type === 'CALLS'
        );
        
        return !hasImporters;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find orphaned files (no imports in or out).
   */
  findOrphans(): GraphNode[] {
    return this.graph
      .getNodes()
      .filter(node => {
        if (node.type !== 'file') return false;
        
        const outgoing = this.graph.getOutgoingEdges(node.id);
        const incoming = this.graph.getIncomingEdges(node.id);
        
        const hasImports = outgoing.some(e => e.type === 'IMPORTS' || e.type === 'DEPENDS_ON');
        const hasImporters = incoming.some(e => 
          e.type === 'IMPORTS' || e.type === 'DEPENDS_ON' || e.type === 'OWNS'
        );
        
        return !hasImports && !hasImporters;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all callers of a symbol.
   */
  findCallers(symbolName: string, maxDepth: number = 3): GraphNode[] {
    const target = this.resolveFocus(symbolName);
    if (!target) return [];

    const callers = new Set<string>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: target.id, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const incoming = this.graph.getIncomingEdges(id);
      for (const edge of incoming) {
        if (edge.type === 'CALLS' || edge.type === 'USES') {
          callers.add(edge.from);
          if (depth < maxDepth) {
            queue.push({ id: edge.from, depth: depth + 1 });
          }
        }
      }
    }

    return Array.from(callers)
      .map(id => this.graph.getNode(id))
      .filter((n): n is GraphNode => Boolean(n))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all callees of a symbol.
   */
  findCallees(symbolName: string, maxDepth: number = 3): GraphNode[] {
    const target = this.resolveFocus(symbolName);
    if (!target) return [];

    const callees = new Set<string>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: target.id, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const outgoing = this.graph.getOutgoingEdges(id);
      for (const edge of outgoing) {
        if (edge.type === 'CALLS' || edge.type === 'USES') {
          callees.add(edge.to);
          if (depth < maxDepth) {
            queue.push({ id: edge.to, depth: depth + 1 });
          }
        }
      }
    }

    return Array.from(callees)
      .map(id => this.graph.getNode(id))
      .filter((n): n is GraphNode => Boolean(n))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find shortest path between two symbols.
   */
  findPath(fromName: string, toName: string): GraphNode[] | null {
    const from = this.resolveFocus(fromName);
    const to = this.resolveFocus(toName);
    if (!from || !to) return null;

    const path = this.graph.findPath(from.id, to.id);
    if (!path) return null;

    return path
      .map(id => this.graph.getNode(id))
      .filter((n): n is GraphNode => Boolean(n));
  }

  /**
   * Find all files that import a given file.
   */
  findImporters(filePath: string): GraphNode[] {
    const target = this.resolveFocus(filePath);
    if (!target) return [];

    return this.graph
      .getIncomingEdges(target.id)
      .filter(e => e.type === 'IMPORTS' || e.type === 'DEPENDS_ON')
      .map(e => this.graph.getNode(e.from))
      .filter((n): n is GraphNode => Boolean(n))
      .filter(n => n.type === 'file')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all files imported by a given file.
   */
  findImports(filePath: string): GraphNode[] {
    const target = this.resolveFocus(filePath);
    if (!target) return [];

    return this.graph
      .getOutgoingEdges(target.id)
      .filter(e => e.type === 'IMPORTS' || e.type === 'DEPENDS_ON')
      .map(e => this.graph.getNode(e.to))
      .filter((n): n is GraphNode => Boolean(n))
      .filter(n => n.type === 'file')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find impact of changing a file or symbol (reverse dependencies).
   */
  findImpact(target: string, maxDepth: number = 5): {
    impactedNodes: GraphNode[];
    impactedFiles: GraphNode[];
    criticalDependencies: GraphNode[];
    coveringTests: GraphNode[];
  } {
    const node = this.resolveFocus(target);
    if (!node) {
      return { impactedNodes: [], impactedFiles: [], criticalDependencies: [], coveringTests: [] };
    }

    const impacted = new Set<string>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: node.id, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const incoming = this.graph.getIncomingEdges(id);
      for (const edge of incoming) {
        if (['IMPORTS', 'DEPENDS_ON', 'CALLS', 'USES', 'EXTENDS', 'IMPLEMENTS'].includes(edge.type)) {
          impacted.add(edge.from);
          if (depth < maxDepth) {
            queue.push({ id: edge.from, depth: depth + 1 });
          }
        }
      }
    }

    const impactedNodes = Array.from(impacted)
      .map(id => this.graph.getNode(id))
      .filter((n): n is GraphNode => Boolean(n));

    const impactedFiles = impactedNodes
      .filter(n => n.type === 'file')
      .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0));

    const criticalDependencies = impactedNodes
      .filter(n => (n.importanceScore || 0) > 0.7)
      .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0))
      .slice(0, 10);

    const coveringTests = impactedNodes
      .filter(n => n.type === 'test' || n.metadata?.testFile)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { impactedNodes, impactedFiles, criticalDependencies, coveringTests };
  }

  /**
   * Query a pre-built bundle by name (auth, api, tests, database, config, core)
   */
  queryBundle(bundleName: string, depth: number = 2): QueryResult {
    const pattern = this.BUNDLE_PATTERNS[bundleName];
    if (!pattern) {
      throw new Error(`Unknown bundle: ${bundleName}. Valid bundles: ${Object.keys(this.BUNDLE_PATTERNS).join(', ')}`);
    }

    const seedNodes: GraphNode[] = [];

    // Find nodes by name patterns
    if (pattern.namePatterns?.length) {
      for (const p of pattern.namePatterns) {
        seedNodes.push(...this.findByName(p, 20));
      }
    }

    // Find nodes by type
    if (pattern.types) {
      for (const t of pattern.types) {
        seedNodes.push(...this.findByType(t, 50));
      }
    }

    // Find nodes by edge type
    if (pattern.edgeTypes) {
      for (const et of pattern.edgeTypes) {
        const entryIds = this.graph.getEdges()
          .filter(e => e.type === et)
          .map(e => e.to);
        for (const id of entryIds) {
          const n = this.graph.getNode(id);
          if (n) seedNodes.push(n);
        }
      }
    }

    // Remove duplicates
    const unique = [...new Map(seedNodes.map(n => [n.id, n])).values()];
    
    if (unique.length === 0) {
      return { nodes: [], edges: [], truncated: false };
    }

    // Expand from seeds
    return this.expandFromSeeds(unique, depth);
  }

  private expandFromSeeds(seeds: GraphNode[], depth: number): QueryResult {
    const collectedNodes = new Map<string, GraphNode>();
    const collectedEdges = new Map<string, GraphEdge>();

    for (const seed of seeds) {
      const result = this.findRelated(seed.id, depth, 500);
      for (const node of result.nodes) {
        collectedNodes.set(node.id, node);
      }
      for (const edge of result.edges) {
        collectedEdges.set(edge.id, edge);
      }
    }

    return {
      nodes: Array.from(collectedNodes.values()),
      edges: Array.from(collectedEdges.values()),
      truncated: false
    };
  }
}
