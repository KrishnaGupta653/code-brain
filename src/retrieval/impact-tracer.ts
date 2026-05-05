/**
 * Causal Impact Tracer — Trace the impact of changing a symbol.
 * 
 * Answers questions like:
 * - "If I change function X, what breaks?"
 * - "What tests need to run if I modify class Y?"
 * - "What's the blast radius of refactoring module Z?"
 * 
 * This is a killer feature that enables safe refactoring at scale.
 */

import { GraphModel } from '../graph/index.js';
import { GraphNode, GraphEdge } from '../types/models.js';
import { logger } from '../utils/index.js';

export interface ImpactAnalysis {
  /** The symbol being changed */
  target: GraphNode;
  
  /** Direct dependents (immediate callers/importers) */
  directImpact: GraphNode[];
  
  /** Transitive dependents (all downstream consumers) */
  transitiveImpact: GraphNode[];
  
  /** Tests that need to run */
  affectedTests: GraphNode[];
  
  /** Files that need review */
  affectedFiles: Set<string>;
  
  /** Blast radius score (0-1, higher = more impact) */
  blastRadius: number;
  
  /** Impact explanation */
  explanation: string;
}

export interface ImpactOptions {
  /** Maximum depth for transitive impact (default: 5) */
  maxDepth?: number;
  
  /** Include indirect impacts (default: true) */
  includeIndirect?: boolean;
  
  /** Edge types to follow (default: CALLS, IMPORTS, DEPENDS_ON) */
  edgeTypes?: string[];
}

export class ImpactTracer {
  constructor(private graph: GraphModel) {}

  /**
   * Analyze the impact of changing a symbol.
   */
  analyzeImpact(
    targetId: string,
    options: ImpactOptions = {}
  ): ImpactAnalysis | null {
    const target = this.graph.getNode(targetId);
    if (!target) {
      logger.warn(`Target node not found: ${targetId}`);
      return null;
    }

    logger.info(`Analyzing impact of changing: ${target.name}`);

    const maxDepth = options.maxDepth ?? 5;
    const includeIndirect = options.includeIndirect ?? true;
    const edgeTypes = options.edgeTypes ?? ['CALLS', 'IMPORTS', 'DEPENDS_ON', 'USES'];

    // Step 1: Find direct dependents
    const directImpact = this.findDirectDependents(target, edgeTypes);
    logger.debug(`Direct impact: ${directImpact.length} nodes`);

    // Step 2: Find transitive dependents (BFS)
    const transitiveImpact = includeIndirect
      ? this.findTransitiveDependents(target, edgeTypes, maxDepth)
      : directImpact;
    logger.debug(`Transitive impact: ${transitiveImpact.length} nodes`);

    // Step 3: Find affected tests
    const affectedTests = this.findAffectedTests(target, transitiveImpact);
    logger.debug(`Affected tests: ${affectedTests.length}`);

    // Step 4: Collect affected files
    const affectedFiles = this.collectAffectedFiles([target, ...transitiveImpact]);

    // Step 5: Calculate blast radius
    const blastRadius = this.calculateBlastRadius(
      target,
      directImpact.length,
      transitiveImpact.length,
      affectedTests.length
    );

    // Step 6: Generate explanation
    const explanation = this.explainImpact(
      target,
      directImpact.length,
      transitiveImpact.length,
      affectedTests.length,
      blastRadius
    );

    return {
      target,
      directImpact,
      transitiveImpact,
      affectedTests,
      affectedFiles,
      blastRadius,
      explanation,
    };
  }

  /**
   * Find direct dependents (immediate callers/importers).
   */
  private findDirectDependents(
    target: GraphNode,
    edgeTypes: string[]
  ): GraphNode[] {
    const dependents = new Set<GraphNode>();

    const incoming = this.graph.getIncomingEdges(target.id);
    for (const edge of incoming) {
      if (edgeTypes.includes(edge.type)) {
        const dependent = this.graph.getNode(edge.from);
        if (dependent) {
          dependents.add(dependent);
        }
      }
    }

    return Array.from(dependents);
  }

  /**
   * Find transitive dependents using BFS.
   */
  private findTransitiveDependents(
    target: GraphNode,
    edgeTypes: string[],
    maxDepth: number
  ): GraphNode[] {
    const dependents = new Set<GraphNode>();
    const visited = new Set<string>([target.id]);
    const queue: Array<{ node: GraphNode; depth: number }> = [{ node: target, depth: 0 }];

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;

      if (depth >= maxDepth) continue;

      const incoming = this.graph.getIncomingEdges(node.id);
      for (const edge of incoming) {
        if (!edgeTypes.includes(edge.type)) continue;

        const dependent = this.graph.getNode(edge.from);
        if (!dependent || visited.has(dependent.id)) continue;

        visited.add(dependent.id);
        dependents.add(dependent);
        queue.push({ node: dependent, depth: depth + 1 });
      }
    }

    return Array.from(dependents);
  }

  /**
   * Find tests affected by the change.
   */
  private findAffectedTests(
    target: GraphNode,
    transitiveImpact: GraphNode[]
  ): GraphNode[] {
    const tests = new Set<GraphNode>();

    // Tests directly testing the target
    const directTests = this.graph.getIncomingEdges(target.id)
      .filter(e => e.type === 'TESTS')
      .map(e => this.graph.getNode(e.from))
      .filter((n): n is GraphNode => n !== null);

    directTests.forEach(t => tests.add(t));

    // Tests testing any impacted node
    for (const impacted of transitiveImpact) {
      const impactedTests = this.graph.getIncomingEdges(impacted.id)
        .filter(e => e.type === 'TESTS')
        .map(e => this.graph.getNode(e.from))
        .filter((n): n is GraphNode => n !== null);

      impactedTests.forEach(t => tests.add(t));
    }

    // Test files containing impacted symbols
    const testFiles = this.graph.getNodes().filter(n =>
      n.type === 'file' &&
      (n.metadata?.isTestFile || /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(n.location?.file || ''))
    );

    for (const testFile of testFiles) {
      const fileSymbols = this.graph.getOutgoingEdges(testFile.id)
        .filter(e => e.type === 'DEFINES')
        .map(e => this.graph.getNode(e.to))
        .filter((n): n is GraphNode => n !== null);

      // If test file defines symbols that import/call impacted nodes
      for (const symbol of fileSymbols) {
        const symbolDeps = this.graph.getOutgoingEdges(symbol.id)
          .filter(e => e.type === 'CALLS' || e.type === 'IMPORTS')
          .map(e => e.to);

        const impactedIds = new Set([target.id, ...transitiveImpact.map(n => n.id)]);
        if (symbolDeps.some(id => impactedIds.has(id))) {
          tests.add(symbol);
        }
      }
    }

    return Array.from(tests);
  }

  /**
   * Collect all affected files.
   */
  private collectAffectedFiles(nodes: GraphNode[]): Set<string> {
    const files = new Set<string>();

    for (const node of nodes) {
      if (node.location?.file) {
        files.add(node.location.file);
      }
    }

    return files;
  }

  /**
   * Calculate blast radius score (0-1).
   */
  private calculateBlastRadius(
    target: GraphNode,
    directCount: number,
    transitiveCount: number,
    testCount: number
  ): number {
    const totalNodes = this.graph.getNodes().length;

    // Factors:
    // 1. Percentage of codebase affected
    const percentageAffected = transitiveCount / Math.max(1, totalNodes);

    // 2. Direct impact weight (more direct dependents = higher risk)
    const directWeight = Math.min(1, directCount / 20);

    // 3. Test coverage weight (more tests = lower risk)
    const testWeight = testCount > 0 ? Math.max(0, 1 - testCount / 10) : 1;

    // 4. Target importance (changing important nodes = higher risk)
    const importanceWeight = target.importance || 0.5;

    // Weighted average
    const blastRadius =
      percentageAffected * 0.3 +
      directWeight * 0.3 +
      testWeight * 0.2 +
      importanceWeight * 0.2;

    return Math.min(1, blastRadius);
  }

  /**
   * Generate human-readable explanation.
   */
  private explainImpact(
    target: GraphNode,
    directCount: number,
    transitiveCount: number,
    testCount: number,
    blastRadius: number
  ): string {
    const parts: string[] = [];

    // Risk level
    let riskLevel: string;
    if (blastRadius < 0.3) {
      riskLevel = 'LOW';
    } else if (blastRadius < 0.6) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'HIGH';
    }

    parts.push(`Risk level: ${riskLevel} (blast radius: ${(blastRadius * 100).toFixed(1)}%)`);

    // Direct impact
    if (directCount === 0) {
      parts.push('No direct dependents (safe to change)');
    } else if (directCount === 1) {
      parts.push('1 direct dependent');
    } else {
      parts.push(`${directCount} direct dependents`);
    }

    // Transitive impact
    if (transitiveCount > directCount) {
      parts.push(`${transitiveCount} total affected nodes (including transitive)`);
    }

    // Test coverage
    if (testCount === 0) {
      parts.push('⚠️  No tests found (high risk)');
    } else if (testCount < 3) {
      parts.push(`${testCount} test(s) found (consider adding more)`);
    } else {
      parts.push(`${testCount} tests found (good coverage)`);
    }

    // Importance
    if (target.importance && target.importance > 0.7) {
      parts.push('⚠️  High-importance node (critical to architecture)');
    }

    return parts.join('. ') + '.';
  }

  /**
   * Find the shortest path from source to target (for understanding dependencies).
   */
  findDependencyPath(
    sourceId: string,
    targetId: string
  ): GraphNode[] | null {
    const source = this.graph.getNode(sourceId);
    const target = this.graph.getNode(targetId);

    if (!source || !target) return null;

    // BFS to find shortest path
    const queue: Array<{ node: GraphNode; path: GraphNode[] }> = [
      { node: source, path: [source] },
    ];
    const visited = new Set<string>([sourceId]);

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node.id === targetId) {
        return path;
      }

      const outgoing = this.graph.getOutgoingEdges(node.id)
        .filter(e => e.type === 'CALLS' || e.type === 'IMPORTS' || e.type === 'DEPENDS_ON');

      for (const edge of outgoing) {
        if (visited.has(edge.to)) continue;

        const next = this.graph.getNode(edge.to);
        if (!next) continue;

        visited.add(edge.to);
        queue.push({
          node: next,
          path: [...path, next],
        });
      }
    }

    return null; // No path found
  }

  /**
   * Estimate refactoring effort (in story points).
   */
  estimateRefactoringEffort(analysis: ImpactAnalysis): {
    storyPoints: number;
    explanation: string;
  } {
    let points = 1; // Base effort

    // Add points for direct impact
    points += Math.min(5, analysis.directImpact.length * 0.5);

    // Add points for transitive impact
    points += Math.min(8, analysis.transitiveImpact.length * 0.1);

    // Add points for test updates
    points += Math.min(3, analysis.affectedTests.length * 0.3);

    // Add points for file count
    points += Math.min(5, analysis.affectedFiles.size * 0.2);

    // Multiply by blast radius
    points *= 1 + analysis.blastRadius;

    const rounded = Math.ceil(points);

    const explanation = [
      `Base: 1 point`,
      `Direct impact: +${Math.min(5, analysis.directImpact.length * 0.5).toFixed(1)}`,
      `Transitive impact: +${Math.min(8, analysis.transitiveImpact.length * 0.1).toFixed(1)}`,
      `Test updates: +${Math.min(3, analysis.affectedTests.length * 0.3).toFixed(1)}`,
      `Files affected: +${Math.min(5, analysis.affectedFiles.size * 0.2).toFixed(1)}`,
      `Blast radius multiplier: ×${(1 + analysis.blastRadius).toFixed(2)}`,
    ].join(', ');

    return {
      storyPoints: rounded,
      explanation: `${rounded} story points (${explanation})`,
    };
  }
}
