/**
 * Pattern Query Engine — Query the graph with structural patterns.
 * 
 * Enables queries like:
 * - "Find all functions that call X but don't handle errors"
 * - "Find all classes that implement interface Y but don't have tests"
 * - "Find all routes that don't have authentication"
 * - "Find all functions with >5 parameters"
 * 
 * This is a killer feature that no competitor has.
 */

import { GraphModel } from '../graph/index.js';
import { GraphNode, GraphEdge, NodeType, EdgeType } from '../types/models.js';
import { logger } from '../utils/index.js';

export interface PatternQuery {
  /** Pattern description (for logging) */
  description: string;
  
  /** Node filters */
  nodeFilter?: NodeFilter;
  
  /** Edge pattern (structural constraints) */
  edgePattern?: EdgePattern;
  
  /** Negative constraints (must NOT match) */
  notPattern?: EdgePattern;
  
  /** Metadata constraints */
  metadataFilter?: MetadataFilter;
}

export interface NodeFilter {
  types?: NodeType[];
  namePattern?: RegExp;
  filePattern?: RegExp;
  hasMetadata?: string[];
  minImportance?: number;
}

export interface EdgePattern {
  /** Edge type to match */
  type: EdgeType;
  
  /** Direction: 'incoming' or 'outgoing' */
  direction: 'incoming' | 'outgoing';
  
  /** Optional target node filter */
  targetFilter?: NodeFilter;
  
  /** Minimum/maximum count */
  minCount?: number;
  maxCount?: number;
}

export interface MetadataFilter {
  /** Required metadata keys */
  required?: string[];
  
  /** Forbidden metadata keys */
  forbidden?: string[];
  
  /** Key-value matches */
  matches?: Record<string, unknown>;
}

export interface PatternMatch {
  node: GraphNode;
  matchedEdges: GraphEdge[];
  reason: string;
}

export class PatternQueryEngine {
  constructor(private graph: GraphModel) {}

  /**
   * Execute a pattern query.
   */
  query(pattern: PatternQuery): PatternMatch[] {
    logger.info(`Executing pattern query: ${pattern.description}`);

    // Step 1: Filter nodes by node filter
    let candidates = this.graph.getNodes();
    if (pattern.nodeFilter) {
      candidates = this.filterNodes(candidates, pattern.nodeFilter);
    }

    logger.debug(`After node filter: ${candidates.length} candidates`);

    // Step 2: Apply edge pattern (positive constraint)
    if (pattern.edgePattern) {
      candidates = this.filterByEdgePattern(candidates, pattern.edgePattern, true);
    }

    logger.debug(`After edge pattern: ${candidates.length} candidates`);

    // Step 3: Apply negative pattern (must NOT match)
    if (pattern.notPattern) {
      candidates = this.filterByEdgePattern(candidates, pattern.notPattern, false);
    }

    logger.debug(`After not pattern: ${candidates.length} candidates`);

    // Step 4: Apply metadata filter
    if (pattern.metadataFilter) {
      candidates = this.filterByMetadata(candidates, pattern.metadataFilter);
    }

    logger.debug(`Final matches: ${candidates.length}`);

    // Build match results
    return candidates.map(node => ({
      node,
      matchedEdges: this.getMatchedEdges(node, pattern),
      reason: this.explainMatch(node, pattern),
    }));
  }

  /**
   * Filter nodes by node filter.
   */
  private filterNodes(nodes: GraphNode[], filter: NodeFilter): GraphNode[] {
    return nodes.filter(node => {
      // Type filter
      if (filter.types && !filter.types.includes(node.type)) {
        return false;
      }

      // Name pattern
      if (filter.namePattern && !filter.namePattern.test(node.name)) {
        return false;
      }

      // File pattern
      if (filter.filePattern) {
        const file = node.location?.file || '';
        if (!filter.filePattern.test(file)) {
          return false;
        }
      }

      // Metadata keys
      if (filter.hasMetadata) {
        for (const key of filter.hasMetadata) {
          if (!(key in (node.metadata || {}))) {
            return false;
          }
        }
      }

      // Importance threshold
      if (filter.minImportance !== undefined) {
        if ((node.importance || 0) < filter.minImportance) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Filter nodes by edge pattern.
   */
  private filterByEdgePattern(
    nodes: GraphNode[],
    pattern: EdgePattern,
    mustMatch: boolean
  ): GraphNode[] {
    return nodes.filter(node => {
      const edges = pattern.direction === 'incoming'
        ? this.graph.getIncomingEdges(node.id)
        : this.graph.getOutgoingEdges(node.id);

      // Filter by edge type
      const matchingEdges = edges.filter(e => e.type === pattern.type);

      // Apply target filter if specified
      let filteredEdges = matchingEdges;
      if (pattern.targetFilter) {
        filteredEdges = matchingEdges.filter(edge => {
          const targetId = pattern.direction === 'incoming' ? edge.from : edge.to;
          const target = this.graph.getNode(targetId);
          if (!target) return false;
          return this.filterNodes([target], pattern.targetFilter!).length > 0;
        });
      }

      const count = filteredEdges.length;

      // Check count constraints
      let matchesCount = true;
      if (pattern.minCount !== undefined && count < pattern.minCount) {
        matchesCount = false;
      }
      if (pattern.maxCount !== undefined && count > pattern.maxCount) {
        matchesCount = false;
      }

      // Return based on mustMatch flag
      return mustMatch ? matchesCount : !matchesCount;
    });
  }

  /**
   * Filter nodes by metadata.
   */
  private filterByMetadata(nodes: GraphNode[], filter: MetadataFilter): GraphNode[] {
    return nodes.filter(node => {
      const metadata = node.metadata || {};

      // Required keys
      if (filter.required) {
        for (const key of filter.required) {
          if (!(key in metadata)) {
            return false;
          }
        }
      }

      // Forbidden keys
      if (filter.forbidden) {
        for (const key of filter.forbidden) {
          if (key in metadata) {
            return false;
          }
        }
      }

      // Key-value matches
      if (filter.matches) {
        for (const [key, value] of Object.entries(filter.matches)) {
          if (metadata[key] !== value) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Get edges that matched the pattern for a node.
   */
  private getMatchedEdges(node: GraphNode, pattern: PatternQuery): GraphEdge[] {
    if (!pattern.edgePattern) return [];

    const edges = pattern.edgePattern.direction === 'incoming'
      ? this.graph.getIncomingEdges(node.id)
      : this.graph.getOutgoingEdges(node.id);

    return edges.filter(e => e.type === pattern.edgePattern!.type);
  }

  /**
   * Explain why a node matched the pattern.
   */
  private explainMatch(node: GraphNode, pattern: PatternQuery): string {
    const parts: string[] = [];

    if (pattern.nodeFilter?.types) {
      parts.push(`type=${node.type}`);
    }

    if (pattern.edgePattern) {
      const count = this.getMatchedEdges(node, pattern).length;
      parts.push(`${pattern.edgePattern.type} ${pattern.edgePattern.direction}=${count}`);
    }

    if (pattern.notPattern) {
      parts.push(`NOT ${pattern.notPattern.type}`);
    }

    return parts.join(', ');
  }

  // ============================================================================
  // Predefined Patterns (Common Queries)
  // ============================================================================

  /**
   * Find functions that call X but don't handle errors.
   */
  findFunctionsCallingWithoutErrorHandling(targetName: string): PatternMatch[] {
    return this.query({
      description: `Functions calling ${targetName} without error handling`,
      nodeFilter: {
        types: ['function', 'method'],
      },
      edgePattern: {
        type: 'CALLS',
        direction: 'outgoing',
        targetFilter: {
          namePattern: new RegExp(targetName, 'i'),
        },
        minCount: 1,
      },
      metadataFilter: {
        forbidden: ['hasErrorHandling', 'hasTryCatch'],
      },
    });
  }

  /**
   * Find classes without tests.
   */
  findClassesWithoutTests(): PatternMatch[] {
    return this.query({
      description: 'Classes without tests',
      nodeFilter: {
        types: ['class'],
      },
      notPattern: {
        type: 'TESTS',
        direction: 'incoming',
        minCount: 1,
      },
    });
  }

  /**
   * Find routes without authentication.
   */
  findRoutesWithoutAuth(): PatternMatch[] {
    return this.query({
      description: 'Routes without authentication',
      nodeFilter: {
        types: ['route'],
      },
      notPattern: {
        type: 'CALLS',
        direction: 'outgoing',
        targetFilter: {
          namePattern: /auth|authenticate|verify|check.*auth/i,
        },
        minCount: 1,
      },
    });
  }

  /**
   * Find functions with high complexity (many callees).
   */
  findComplexFunctions(minCallees: number = 10): PatternMatch[] {
    return this.query({
      description: `Functions with >${minCallees} callees`,
      nodeFilter: {
        types: ['function', 'method'],
      },
      edgePattern: {
        type: 'CALLS',
        direction: 'outgoing',
        minCount: minCallees,
      },
    });
  }

  /**
   * Find dead exports (exported but never imported).
   */
  findDeadExports(): PatternMatch[] {
    return this.query({
      description: 'Dead exports (exported but never imported)',
      nodeFilter: {
        types: ['function', 'class', 'constant', 'variable'],
      },
      edgePattern: {
        type: 'EXPORTS',
        direction: 'incoming',
        minCount: 1,
      },
      notPattern: {
        type: 'IMPORTS',
        direction: 'incoming',
        minCount: 1,
      },
    });
  }

  /**
   * Find orphaned functions (no callers, not exported, not entry point).
   */
  findOrphanedFunctions(): PatternMatch[] {
    return this.query({
      description: 'Orphaned functions (no callers, not exported)',
      nodeFilter: {
        types: ['function', 'method'],
      },
      notPattern: {
        type: 'CALLS',
        direction: 'incoming',
        minCount: 1,
      },
      metadataFilter: {
        forbidden: ['isExported', 'isEntryPoint'],
      },
    });
  }

  /**
   * Find circular dependencies.
   */
  findCircularDependencies(): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const visited = new Set<string>();

    for (const node of this.graph.getNodes()) {
      if (visited.has(node.id)) continue;

      const cycle = this.detectCycleFrom(node.id, new Set(), []);
      if (cycle.length > 0) {
        // Mark all nodes in cycle as visited
        cycle.forEach(id => visited.add(id));

        // Add match for first node in cycle
        const cycleNodes = cycle.map(id => this.graph.getNode(id)).filter((n): n is GraphNode => n !== null);
        matches.push({
          node,
          matchedEdges: [],
          reason: `Part of cycle: ${cycleNodes.map(n => n.name).join(' → ')}`,
        });
      }
    }

    return matches;
  }

  /**
   * Detect cycle from a starting node using DFS.
   */
  private detectCycleFrom(
    nodeId: string,
    visiting: Set<string>,
    path: string[]
  ): string[] {
    if (visiting.has(nodeId)) {
      // Found cycle
      const cycleStart = path.indexOf(nodeId);
      return path.slice(cycleStart);
    }

    visiting.add(nodeId);
    path.push(nodeId);

    const outgoing = this.graph.getOutgoingEdges(nodeId)
      .filter(e => e.type === 'IMPORTS' || e.type === 'DEPENDS_ON');

    for (const edge of outgoing) {
      const cycle = this.detectCycleFrom(edge.to, new Set(visiting), [...path]);
      if (cycle.length > 0) {
        return cycle;
      }
    }

    return [];
  }

  /**
   * Find bridge nodes (removing them disconnects the graph).
   */
  findBridgeNodes(): PatternMatch[] {
    return this.query({
      description: 'Bridge nodes (critical for connectivity)',
      metadataFilter: {
        matches: {
          isBridge: true,
        },
      },
    });
  }

  /**
   * Find entry points.
   */
  findEntryPoints(): PatternMatch[] {
    return this.query({
      description: 'Entry points',
      metadataFilter: {
        matches: {
          isEntryPoint: true,
        },
      },
    });
  }

  /**
   * Find high-importance nodes.
   */
  findHighImportanceNodes(minImportance: number = 0.7): PatternMatch[] {
    return this.query({
      description: `High-importance nodes (importance ≥ ${minImportance})`,
      nodeFilter: {
        minImportance,
      },
    });
  }
}
