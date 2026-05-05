/**
 * Smart Context Assembler — Intelligently selects the most relevant code for a task.
 * 
 * This is the "killer feature" that makes code-brain superior to competitors.
 * Instead of dumping the entire codebase or using naive keyword search,
 * it uses graph structure + importance + task analysis to build optimal context.
 * 
 * Key innovations:
 * 1. Task-aware selection (different strategies for "fix bug" vs "add feature")
 * 2. Dependency-aware expansion (includes necessary imports/callers)
 * 3. Token-budget optimization (maximizes relevance within budget)
 * 4. Importance-weighted ranking (PageRank + betweenness centrality)
 */

import { GraphModel } from '../graph/index.js';
import { GraphNode, GraphEdge, QueryResult } from '../types/models.js';
import { logger } from '../utils/index.js';

export interface ContextRequest {
  /** Natural language task description */
  task: string;
  
  /** Optional focus symbols/files (e.g., ["src/api/handler.ts", "UserService"]) */
  focus?: string[];
  
  /** Maximum tokens for assembled context */
  maxTokens: number;
  
  /** Task type hint (auto-detected if not provided) */
  taskType?: 'bug_fix' | 'feature_add' | 'refactor' | 'understand' | 'test';
}

export interface AssembledContext {
  /** Selected nodes in priority order */
  nodes: GraphNode[];
  
  /** Edges connecting selected nodes */
  edges: GraphEdge[];
  
  /** Explanation of selection strategy */
  strategy: string;
  
  /** Token count estimate */
  estimatedTokens: number;
  
  /** Relevance scores for each node */
  scores: Map<string, number>;
}

interface TaskAnalysis {
  type: 'bug_fix' | 'feature_add' | 'refactor' | 'understand' | 'test';
  keywords: string[];
  requiresCallers: boolean;
  requiresCallees: boolean;
  requiresTests: boolean;
  expansionDepth: number;
}

export class ContextAssembler {
  constructor(private graph: GraphModel) {}

  /**
   * Assemble optimal context for a task.
   */
  async assemble(request: ContextRequest): Promise<AssembledContext> {
    logger.info(`Assembling context for task: ${request.task.slice(0, 60)}...`);

    // Step 1: Analyze task to determine strategy
    const analysis = this.analyzeTask(request);
    logger.debug(`Task type: ${analysis.type}, expansion depth: ${analysis.expansionDepth}`);

    // Step 2: Find seed nodes (focus + keyword matches)
    const seeds = this.findSeedNodes(request, analysis);
    logger.debug(`Found ${seeds.length} seed nodes`);

    if (seeds.length === 0) {
      return {
        nodes: [],
        edges: [],
        strategy: 'No matching nodes found',
        estimatedTokens: 0,
        scores: new Map(),
      };
    }

    // Step 3: Expand from seeds based on task type
    const expanded = this.expandFromSeeds(seeds, analysis);
    logger.debug(`Expanded to ${expanded.nodes.length} nodes`);

    // Step 4: Score nodes by relevance
    const scores = this.scoreNodes(expanded.nodes, seeds, analysis);

    // Step 5: Select top nodes within token budget
    const selected = this.selectWithinBudget(
      expanded.nodes,
      expanded.edges,
      scores,
      request.maxTokens
    );

    return {
      ...selected,
      strategy: this.explainStrategy(analysis, seeds.length, selected.nodes.length),
      scores,
    };
  }

  /**
   * Analyze task description to determine optimal strategy.
   */
  private analyzeTask(request: ContextRequest): TaskAnalysis {
    const task = request.task.toLowerCase();
    const taskType = request.taskType || this.detectTaskType(task);

    const keywords = this.extractKeywords(task);

    // Task-specific strategies
    switch (taskType) {
      case 'bug_fix':
        return {
          type: 'bug_fix',
          keywords,
          requiresCallers: true,   // Need to see who calls the buggy code
          requiresCallees: true,   // Need to see what the buggy code calls
          requiresTests: true,     // Need to see existing tests
          expansionDepth: 2,       // Moderate expansion
        };

      case 'feature_add':
        return {
          type: 'feature_add',
          keywords,
          requiresCallers: false,  // New feature, no existing callers
          requiresCallees: true,   // Need to see what we can reuse
          requiresTests: false,    // Will write new tests
          expansionDepth: 3,       // Broader expansion to find patterns
        };

      case 'refactor':
        return {
          type: 'refactor',
          keywords,
          requiresCallers: true,   // Need to see all usage sites
          requiresCallees: true,   // Need to see implementation
          requiresTests: true,     // Need to preserve test coverage
          expansionDepth: 1,       // Narrow expansion (focus on direct deps)
        };

      case 'understand':
        return {
          type: 'understand',
          keywords,
          requiresCallers: true,   // See how it's used
          requiresCallees: true,   // See what it does
          requiresTests: true,     // Tests are documentation
          expansionDepth: 2,       // Moderate expansion
        };

      case 'test':
        return {
          type: 'test',
          keywords,
          requiresCallers: false,  // Tests don't have callers
          requiresCallees: true,   // Need to see what to test
          requiresTests: true,     // Need to see existing test patterns
          expansionDepth: 1,       // Narrow expansion
        };
    }
  }

  /**
   * Detect task type from natural language description.
   */
  private detectTaskType(task: string): TaskAnalysis['type'] {
    // Bug fix indicators
    if (/\b(fix|bug|error|crash|fail|broken|issue)\b/.test(task)) {
      return 'bug_fix';
    }

    // Feature add indicators
    if (/\b(add|create|implement|new|feature|support)\b/.test(task)) {
      return 'feature_add';
    }

    // Refactor indicators
    if (/\b(refactor|clean|improve|optimize|simplify|reorganize)\b/.test(task)) {
      return 'refactor';
    }

    // Test indicators
    if (/\b(test|spec|coverage|unit|integration)\b/.test(task)) {
      return 'test';
    }

    // Default to understand
    return 'understand';
  }

  /**
   * Extract keywords from task description.
   */
  private extractKeywords(task: string): string[] {
    // Remove common words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
      'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    ]);

    return task
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10); // Top 10 keywords
  }

  /**
   * Find seed nodes from focus + keyword matches.
   */
  private findSeedNodes(request: ContextRequest, analysis: TaskAnalysis): GraphNode[] {
    const seeds = new Set<GraphNode>();

    // Add focus nodes
    if (request.focus && request.focus.length > 0) {
      for (const focus of request.focus) {
        const nodes = this.graph.getNodes().filter(node => {
          const name = node.name.toLowerCase();
          const fullName = (node.fullName || '').toLowerCase();
          const file = (node.location?.file || '').toLowerCase();
          const focusLower = focus.toLowerCase();

          return name.includes(focusLower) ||
                 fullName.includes(focusLower) ||
                 file.includes(focusLower);
        });
        nodes.forEach(n => seeds.add(n));
      }
    }

    // Add keyword matches
    for (const keyword of analysis.keywords) {
      const nodes = this.graph.getNodes().filter(node => {
        const name = node.name.toLowerCase();
        const fullName = (node.fullName || '').toLowerCase();
        const summary = (node.summary || '').toLowerCase();

        return name.includes(keyword) ||
               fullName.includes(keyword) ||
               summary.includes(keyword);
      });
      nodes.slice(0, 5).forEach(n => seeds.add(n)); // Top 5 per keyword
    }

    return Array.from(seeds);
  }

  /**
   * Expand from seed nodes based on task analysis.
   */
  private expandFromSeeds(
    seeds: GraphNode[],
    analysis: TaskAnalysis
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const selectedNodes = new Set<GraphNode>(seeds);
    const selectedEdges = new Set<GraphEdge>();
    const nodeIds = new Set(seeds.map(n => n.id));

    // BFS expansion
    const queue: Array<{ node: GraphNode; depth: number }> = seeds.map(n => ({ node: n, depth: 0 }));
    const visited = new Set<string>(seeds.map(n => n.id));

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;

      if (depth >= analysis.expansionDepth) continue;

      // Expand to callers (incoming CALLS edges)
      if (analysis.requiresCallers) {
        const callers = this.graph.getIncomingEdges(node.id)
          .filter(e => e.type === 'CALLS' && e.resolved);

        for (const edge of callers) {
          const caller = this.graph.getNode(edge.from);
          if (caller && !visited.has(caller.id)) {
            visited.add(caller.id);
            selectedNodes.add(caller);
            nodeIds.add(caller.id);
            selectedEdges.add(edge);
            queue.push({ node: caller, depth: depth + 1 });
          }
        }
      }

      // Expand to callees (outgoing CALLS edges)
      if (analysis.requiresCallees) {
        const callees = this.graph.getOutgoingEdges(node.id)
          .filter(e => e.type === 'CALLS' && e.resolved);

        for (const edge of callees) {
          const callee = this.graph.getNode(edge.to);
          if (callee && !visited.has(callee.id)) {
            visited.add(callee.id);
            selectedNodes.add(callee);
            nodeIds.add(callee.id);
            selectedEdges.add(edge);
            queue.push({ node: callee, depth: depth + 1 });
          }
        }
      }

      // Expand to tests (TESTS edges)
      if (analysis.requiresTests) {
        const tests = this.graph.getIncomingEdges(node.id)
          .filter(e => e.type === 'TESTS');

        for (const edge of tests) {
          const test = this.graph.getNode(edge.from);
          if (test && !visited.has(test.id)) {
            visited.add(test.id);
            selectedNodes.add(test);
            nodeIds.add(test.id);
            selectedEdges.add(edge);
          }
        }
      }

      // Always include file node (for context)
      if (node.location?.file) {
        const fileNodes = this.graph.getNodes().filter(n =>
          n.type === 'file' && n.location?.file === node.location?.file
        );
        for (const fileNode of fileNodes) {
          if (!visited.has(fileNode.id)) {
            visited.add(fileNode.id);
            selectedNodes.add(fileNode);
            nodeIds.add(fileNode.id);
          }
        }
      }
    }

    // Add edges between selected nodes
    for (const node of selectedNodes) {
      const outgoing = this.graph.getOutgoingEdges(node.id);
      for (const edge of outgoing) {
        if (nodeIds.has(edge.to)) {
          selectedEdges.add(edge);
        }
      }
    }

    return {
      nodes: Array.from(selectedNodes),
      edges: Array.from(selectedEdges),
    };
  }

  /**
   * Score nodes by relevance to task.
   */
  private scoreNodes(
    nodes: GraphNode[],
    seeds: GraphNode[],
    analysis: TaskAnalysis
  ): Map<string, number> {
    const scores = new Map<string, number>();
    const seedIds = new Set(seeds.map(n => n.id));

    for (const node of nodes) {
      let score = 0;

      // Seed nodes get highest score
      if (seedIds.has(node.id)) {
        score += 1.0;
      }

      // Importance score (from PageRank)
      score += (node.importance || 0) * 0.5;

      // Type-based scoring
      const typeScores: Record<string, number> = {
        function: 0.8,
        method: 0.8,
        class: 0.7,
        interface: 0.6,
        type: 0.5,
        route: 0.9,
        test: analysis.requiresTests ? 0.7 : 0.3,
        file: 0.4,
      };
      score += (typeScores[node.type] || 0.3) * 0.3;

      // Metadata-based scoring
      if (node.metadata?.isEntryPoint) score += 0.2;
      if (node.metadata?.isBridge) score += 0.15;
      if (node.metadata?.isDead) score -= 0.3; // Penalize dead code

      scores.set(node.id, Math.max(0, score));
    }

    return scores;
  }

  /**
   * Select nodes within token budget, prioritizing by score.
   */
  private selectWithinBudget(
    nodes: GraphNode[],
    edges: GraphEdge[],
    scores: Map<string, number>,
    maxTokens: number
  ): { nodes: GraphNode[]; edges: GraphEdge[]; estimatedTokens: number } {
    // Sort nodes by score (descending)
    const sorted = [...nodes].sort((a, b) => {
      const scoreA = scores.get(a.id) || 0;
      const scoreB = scores.get(b.id) || 0;
      return scoreB - scoreA;
    });

    // Greedy selection within budget
    const selected: GraphNode[] = [];
    const selectedIds = new Set<string>();
    let totalTokens = 0;

    for (const node of sorted) {
      const nodeTokens = this.estimateNodeTokens(node);
      if (totalTokens + nodeTokens <= maxTokens * 0.8) { // Reserve 20% for edges/metadata
        selected.push(node);
        selectedIds.add(node.id);
        totalTokens += nodeTokens;
      }
    }

    // Filter edges to only selected nodes
    const selectedEdges = edges.filter(e =>
      selectedIds.has(e.from) && selectedIds.has(e.to)
    );

    const edgeTokens = selectedEdges.length * 50; // Rough estimate
    totalTokens += edgeTokens;

    return {
      nodes: selected,
      edges: selectedEdges,
      estimatedTokens: totalTokens,
    };
  }

  /**
   * Estimate tokens for a node.
   */
  private estimateNodeTokens(node: GraphNode): number {
    let tokens = 0;
    tokens += Math.ceil(node.name.length / 3);
    tokens += Math.ceil((node.fullName || '').length / 3);
    tokens += Math.ceil((node.summary || '').length / 4);
    tokens += Math.ceil(JSON.stringify(node.metadata || {}).length / 2);
    return tokens;
  }

  /**
   * Explain the selection strategy.
   */
  private explainStrategy(
    analysis: TaskAnalysis,
    seedCount: number,
    selectedCount: number
  ): string {
    const parts: string[] = [];

    parts.push(`Task type: ${analysis.type}`);
    parts.push(`Started with ${seedCount} seed nodes`);
    parts.push(`Expanded to ${selectedCount} nodes (depth ${analysis.expansionDepth})`);

    if (analysis.requiresCallers) parts.push('Included callers');
    if (analysis.requiresCallees) parts.push('Included callees');
    if (analysis.requiresTests) parts.push('Included tests');

    return parts.join('. ') + '.';
  }
}
