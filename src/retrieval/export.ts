import { stringify as toYAML } from "yaml";
import crypto from "crypto";
import {
  AIExportBundle,
  AnalyticsResult,
  ExportBundle,
  GraphEdge,
  GraphNode,
  ProjectMetadata,
  QueryResult,
  RankingScore,
  SourceSpan,
  SummaryRecord,
} from "../types/models.js";
import { GraphModel } from "../graph/index.js";

export interface ExportOptions {
  format: "json" | "yaml" | "ai";
  focus?: string;
  maxTokens?: number;
  top?: number;
}

export class ExportEngine {
  private static readonly TOKENS_PER_CHAR = 0.25; // Rough estimate

  constructor(
    private graph: GraphModel,
    private projectMetadata: ProjectMetadata,
  ) {}

  exportForAI(
    queryResult: QueryResult,
    focus?: string,
    analyticsResult?: AnalyticsResult,
    maxTokens?: number,
    top?: number,
  ): AIExportBundle {
    const importance = this.computeImportance(queryResult);
    let optimizedResult = this.prepareAIQueryResult(
      queryResult,
      importance,
      top,
    );

    if (maxTokens) {
      optimizedResult = this.pruneByTokenBudget(
        optimizedResult,
        maxTokens,
        analyticsResult,
      );
    }

    return {
      ...this.createBundle(optimizedResult, "ai", focus),
      summary: this.buildAISummary(optimizedResult, importance),
      callChains: this.extractCallChains(optimizedResult, 5, 20),
      ranking: analyticsResult
        ? this.buildRankingFromAnalytics(analyticsResult)
        : this.buildRankingFromImportance(importance),
      focus,
      rules: this.getAIRules(),
    };
  }

  exportAsJSON(queryResult: QueryResult, focus?: string): string {
    return JSON.stringify(
      this.createBundle(queryResult, "json", focus),
      null,
      2,
    );
  }

  exportAsYAML(queryResult: QueryResult, focus?: string): string {
    return toYAML(this.createBundle(queryResult, "yaml", focus));
  }

  private pruneByTokenBudget(
    queryResult: QueryResult,
    maxTokens: number,
    analyticsResult?: AnalyticsResult,
  ): QueryResult {
    // Reserve 20% for metadata and structure
    const contentBudget = Math.floor(maxTokens * 0.8);
    const nodeContentBudget = Math.floor(contentBudget * 0.7);
    const edgeContentBudget = Math.floor(contentBudget * 0.3);

    // Rank nodes by importance if analytics available
    const rankedNodes = this.rankNodesForExport(
      queryResult.nodes,
      analyticsResult,
    );

    // Prune nodes by token budget
    let nodeTokenCount = 0;
    const selectedNodeIds = new Set<string>();

    for (const node of rankedNodes) {
      const nodeTokens = this.estimateNodeTokens(node);
      if (nodeTokenCount + nodeTokens <= nodeContentBudget) {
        nodeTokenCount += nodeTokens;
        selectedNodeIds.add(node.id);
      }
    }

    // Filter edges to only selected nodes
    const selectedEdges = queryResult.edges.filter(
      (edge) => selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to),
    );

    // Prune edges by token budget if needed
    let edgeTokenCount = 0;
    const finalEdges: GraphEdge[] = [];

    for (const edge of selectedEdges) {
      const edgeTokens = this.estimateEdgeTokens(edge);
      if (edgeTokenCount + edgeTokens <= edgeContentBudget) {
        edgeTokenCount += edgeTokens;
        finalEdges.push(edge);
      }
    }

    const selectedNodes = Array.from(selectedNodeIds)
      .map((id) => queryResult.nodes.find((n) => n.id === id))
      .filter((n): n is GraphNode => Boolean(n));

    return {
      nodes: selectedNodes,
      edges: finalEdges,
      truncated:
        selectedNodes.length < queryResult.nodes.length ||
        finalEdges.length < queryResult.edges.length,
    };
  }

  private rankNodesForExport(
    nodes: GraphNode[],
    analyticsResult?: AnalyticsResult,
  ): GraphNode[] {
    return [...nodes].sort((a, b) => {
      // Priority 1: Focus-related nodes first
      const aIsFocus =
        a.type === "file" || a.type === "class" || a.type === "function";
      const bIsFocus =
        b.type === "file" || b.type === "class" || b.type === "function";
      if (aIsFocus !== bIsFocus) return aIsFocus ? -1 : 1;

      // Priority 2: By centrality if available
      if (analyticsResult) {
        const aScore = analyticsResult.centrality.get(a.id) ?? 0;
        const bScore = analyticsResult.centrality.get(b.id) ?? 0;
        if (aScore !== bScore) return bScore - aScore;
      }

      // Priority 3: By type importance
      const typeOrder = {
        file: 1,
        class: 2,
        function: 3,
        method: 4,
        route: 5,
        interface: 6,
        type: 7,
        constant: 8,
        variable: 9,
        config: 10,
      };
      const aTypeOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 100;
      const bTypeOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 100;
      if (aTypeOrder !== bTypeOrder) return aTypeOrder - bTypeOrder;

      // Fallback: alphabetical
      return a.name.localeCompare(b.name);
    });
  }

  private estimateNodeTokens(node: GraphNode): number {
    let tokens = 0;

    tokens += node.name.length * ExportEngine.TOKENS_PER_CHAR;
    tokens += (node.fullName || "").length * ExportEngine.TOKENS_PER_CHAR;
    tokens += (node.summary || "").length * ExportEngine.TOKENS_PER_CHAR;
    tokens +=
      JSON.stringify(node.metadata || {}).length * ExportEngine.TOKENS_PER_CHAR;
    tokens += node.provenance.source.reduce((sum, span) => {
      return (
        sum +
        (span.file?.length ?? 0) +
        (span.text?.length ?? 0) * ExportEngine.TOKENS_PER_CHAR
      );
    }, 0);

    return Math.ceil(tokens);
  }

  private estimateEdgeTokens(edge: GraphEdge): number {
    let tokens = 0;

    tokens += 50; // Edge type and structure
    tokens +=
      JSON.stringify(edge.metadata || {}).length * ExportEngine.TOKENS_PER_CHAR;
    tokens += (edge.sourceLocation || []).reduce((sum, span) => {
      return (
        sum +
        (span.file?.length ?? 0) +
        (span.text?.length ?? 0) * ExportEngine.TOKENS_PER_CHAR
      );
    }, 0);

    return Math.ceil(tokens);
  }

  private createBundle(
    queryResult: QueryResult,
    format: "json" | "yaml" | "ai",
    focus?: string,
  ): ExportBundle {
    const importance = this.computeImportance(queryResult);
    const nodes = [...queryResult.nodes].sort((a, b) => {
      if (format === "ai") {
        const scoreDelta =
          (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
      }
      return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    });
    const edges = [...queryResult.edges].sort((a, b) => {
      if (format === "ai" && a.resolved !== b.resolved) {
        return a.resolved ? -1 : 1;
      }
      return a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
    });

    return {
      version: format === "ai" ? "codebrain-ai/v2" : "codebrain-export/v1",
      fingerprint: this.computeFingerprint(nodes, edges),
      project: this.projectMetadata,
      nodes: nodes.map((node) => this.serializeNode(node, importance)),
      edges: edges.map((edge) => this.serializeEdge(edge)),
      summaries: this.buildSummaries(nodes),
      query: {
        focus: focus || "project",
        truncated: queryResult.truncated,
        truncationReason: queryResult.truncated
          ? "Result was limited by query breadth or token budget."
          : undefined,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
      evidence: this.buildEvidence(nodes, edges),
      exportedAt: Date.now(),
      exportFormat: format,
      rules: format === "ai" ? this.getAIRules() : undefined,
    };
  }

  private buildSummaries(nodes: GraphNode[]): SummaryRecord[] {
    const summaries: SummaryRecord[] = [];
    const projectNode = this.graph
      .getNodes()
      .find((node) => node.type === "project");
    if (projectNode) {
      summaries.push({
        id: projectNode.id,
        label: projectNode.name,
        type: "project",
        summary: `Project graph with ${this.projectMetadata.fileCount} files and ${this.projectMetadata.edgeCount} relationships.`,
        provenance: projectNode.provenance.source,
      });
    }

    const fileNodes = nodes.filter((node) => node.type === "file").slice(0, 20);
    for (const node of fileNodes) {
      const defined = this.graph
        .getOutgoingEdges(node.id)
        .filter((edge) => edge.type === "DEFINES").length;
      const dependsOn = this.graph
        .getOutgoingEdges(node.id)
        .filter(
          (edge) => edge.type === "IMPORTS" || edge.type === "DEPENDS_ON",
        ).length;
      summaries.push({
        id: node.id,
        label: node.name,
        type: "file",
        summary: `${node.name} defines ${defined} symbols and depends on ${dependsOn} modules/files.`,
        provenance: node.provenance.source,
      });
    }

    const symbols = nodes
      .filter((node) =>
        ["class", "function", "method", "route", "config"].includes(node.type),
      )
      .slice(0, 25);
    for (const node of symbols) {
      const outgoing = this.graph.getOutgoingEdges(node.id).length;
      const incoming = this.graph.getIncomingEdges(node.id).length;
      summaries.push({
        id: node.id,
        label: node.fullName || node.name,
        type: "symbol",
        summary: `${node.type} ${node.name} has ${outgoing} outgoing and ${incoming} incoming relationships.`,
        provenance: node.provenance.source,
      });
    }

    return summaries;
  }

  private buildRankingFromAnalytics(
    analyticsResult: AnalyticsResult,
  ): RankingScore[] {
    const ranking: RankingScore[] = [];
    for (const [nodeId, score] of analyticsResult.centrality.entries()) {
      ranking.push({
        nodeId,
        score: Number(score),
        algorithm: "betweenness_centrality",
        components: {
          pagerank: Number(analyticsResult.importance.get(nodeId) || 0),
        },
      });
    }

    return ranking.sort((a, b) => b.score - a.score).slice(0, 50);
  }

  private buildRankingFromImportance(
    importance: Map<string, number>,
  ): RankingScore[] {
    return Array.from(importance.entries())
      .map(([nodeId, score]) => ({
        nodeId,
        score,
        algorithm: "degree_importance",
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  private buildEvidence(nodes: GraphNode[], edges: GraphEdge[]): SourceSpan[] {
    const seen = new Set<string>();
    const evidence: SourceSpan[] = [];
    const addSpan = (span: SourceSpan): void => {
      const cleaned = this.stripSourceText(span);
      const key = [
        cleaned.file,
        cleaned.startLine,
        cleaned.startCol,
        cleaned.endLine,
        cleaned.endCol,
      ].join(":");
      if (!seen.has(key)) {
        seen.add(key);
        evidence.push(cleaned);
      }
    };

    for (const node of nodes) {
      for (const span of node.provenance.source) {
        addSpan(span);
      }
    }

    for (const edge of edges) {
      for (const span of edge.provenance.source) {
        addSpan(span);
      }
    }

    return evidence
      .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine)
      .slice(0, 100);
  }

  private serializeNode(
    node: GraphNode,
    importance: Map<string, number> = new Map(),
  ): GraphNode {
    return {
      ...node,
      canonicalName: this.getCanonicalName(node),
      importance: Number((importance.get(node.id) ?? 0).toFixed(4)),
      location: node.location ? this.stripSourceText(node.location) : undefined,
      summary: node.summary || "unknown",
      metadata: {
        ...(node.metadata || {}),
        inferred: node.metadata?.inferred ?? false,
      },
      provenance: {
        ...node.provenance,
        source: node.provenance.source.map((span) =>
          this.stripSourceText(span),
        ),
      },
    };
  }

  private prepareAIQueryResult(
    queryResult: QueryResult,
    importance: Map<string, number>,
    top?: number,
  ): QueryResult {
    const nodes = queryResult.nodes
      .filter((node) => !this.isAINoiseNode(node))
      .sort(
        (a, b) => (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0),
      );
    const selectedNodes = typeof top === "number" ? nodes.slice(0, top) : nodes;
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const edges = queryResult.edges.filter(
      (edge) =>
        (selectedIds.has(edge.from) && selectedIds.has(edge.to)) ||
        (edge.type === "ENTRY_POINT" && selectedIds.has(edge.to)),
    );

    return {
      ...queryResult,
      nodes: selectedNodes,
      edges,
      truncated:
        queryResult.truncated ||
        selectedNodes.length < queryResult.nodes.length,
    };
  }

  private isAINoiseNode(node: GraphNode): boolean {
    return (
      node.name.startsWith("env:") ||
      node.name.startsWith("config:dotenv") ||
      String(node.fullName || "").startsWith("env:") ||
      String(node.fullName || "").startsWith("config:dotenv")
    );
  }

  private computeImportance(queryResult: QueryResult): Map<string, number> {
    const scores = new Map<string, number>();
    const nodes = queryResult.nodes;
    const nodeIds = new Set(nodes.map((node) => node.id));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    const entryPoints = new Set(
      queryResult.edges
        .filter((edge) => edge.type === "ENTRY_POINT")
        .map((edge) => edge.to),
    );

    for (const edge of queryResult.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
      outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }

    const denominator = Math.max(1, nodes.length * 0.1);
    for (const node of nodes) {
      const typeBoost = [
        "project",
        "file",
        "class",
        "function",
        "method",
        "route",
      ].includes(node.type)
        ? 0.15
        : 0;
      const entryBoost = entryPoints.has(node.id) ? 0.35 : 0;
      const score =
        ((incoming.get(node.id) ?? 0) * 1.5 + (outgoing.get(node.id) ?? 0)) /
          denominator +
        typeBoost +
        entryBoost;
      scores.set(node.id, Math.min(1, Number(score.toFixed(4))));
    }

    return scores;
  }

  private buildAISummary(
    queryResult: QueryResult,
    importance: Map<string, number>,
  ): AIExportBundle["summary"] {
    const nodeById = new Map(queryResult.nodes.map((node) => [node.id, node]));
    const entryPoints = queryResult.edges
      .filter((edge) => edge.type === "ENTRY_POINT")
      .map((edge) => nodeById.get(edge.to))
      .filter((node): node is GraphNode => Boolean(node))
      .map((node) => this.getCanonicalName(node))
      .sort();
    const coreModules = queryResult.nodes
      .filter((node) => node.type === "file" || node.type === "module")
      .sort((a, b) => (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0))
      .slice(0, 12)
      .map((node) => this.getCanonicalName(node));
    const keySymbols = queryResult.nodes
      .filter((node) => !["project", "file", "module"].includes(node.type))
      .sort((a, b) => (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0))
      .slice(0, 20)
      .map((node) => ({
        id: node.id,
        canonicalName: this.getCanonicalName(node),
        role: node.semanticRole,
        importance: Number((importance.get(node.id) ?? 0).toFixed(4)),
      }));
    const unresolvedCount = queryResult.edges.filter(
      (edge) => edge.type === "CALLS_UNRESOLVED" || !edge.resolved,
    ).length;

    return {
      entryPoints,
      coreModules,
      keySymbols,
      cycles: this.detectCycles(queryResult, 25),
      unresolvedCount,
    };
  }

  private extractCallChains(
    queryResult: QueryResult,
    maxDepth: number,
    limit: number,
  ): string[][] {
    const nodeById = new Map(queryResult.nodes.map((node) => [node.id, node]));
    const outgoingCalls = new Map<string, string[]>();
    for (const edge of queryResult.edges) {
      if (edge.type !== "CALLS" || !edge.resolved) continue;
      const targets = outgoingCalls.get(edge.from) || [];
      targets.push(edge.to);
      outgoingCalls.set(edge.from, targets);
    }

    const entryIds = queryResult.edges
      .filter((edge) => edge.type === "ENTRY_POINT")
      .map((edge) => edge.to)
      .filter((id) => nodeById.has(id));
    const seeds =
      entryIds.length > 0
        ? entryIds
        : queryResult.nodes
            .filter((node) =>
              ["function", "method", "route"].includes(node.type),
            )
            .slice(0, 10)
            .map((node) => node.id);
    const chains: string[][] = [];

    const visit = (nodeId: string, path: string[]): void => {
      if (chains.length >= limit) return;
      const nextPath = [...path, nodeId];
      const targets = outgoingCalls.get(nodeId) || [];
      if (targets.length === 0 || nextPath.length >= maxDepth) {
        if (nextPath.length > 1) {
          chains.push(
            nextPath
              .map((id) => nodeById.get(id))
              .filter((node): node is GraphNode => Boolean(node))
              .map((node) => this.getCanonicalName(node)),
          );
        }
        return;
      }
      for (const target of targets.slice(0, 6)) {
        if (!nextPath.includes(target)) {
          visit(target, nextPath);
        }
      }
    };

    for (const seed of seeds) {
      visit(seed, []);
      if (chains.length >= limit) break;
    }

    return chains;
  }

  private detectCycles(queryResult: QueryResult, limit: number): string[][] {
    const nodeById = new Map(queryResult.nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, string[]>();
    const cycleEdgeTypes = new Set([
      "IMPORTS",
      "DEPENDS_ON",
      "EXTENDS",
      "IMPLEMENTS",
    ]);
    for (const edge of queryResult.edges) {
      if (!cycleEdgeTypes.has(edge.type) || !edge.resolved) continue;
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
      const targets = adjacency.get(edge.from) || [];
      targets.push(edge.to);
      adjacency.set(edge.from, targets);
    }

    const cycles: string[][] = [];
    const seenCycles = new Set<string>();
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];

    const visit = (nodeId: string): void => {
      if (cycles.length >= limit) return;
      if (visiting.has(nodeId)) {
        const start = stack.indexOf(nodeId);
        if (start >= 0) {
          const cycleIds = [...stack.slice(start), nodeId];
          const names = cycleIds
            .map((id) => nodeById.get(id))
            .filter((node): node is GraphNode => Boolean(node))
            .map((node) => this.getCanonicalName(node));
          const key = [...new Set(names)].sort().join("|");
          if (!seenCycles.has(key)) {
            seenCycles.add(key);
            cycles.push(names);
          }
        }
        return;
      }
      if (visited.has(nodeId)) return;

      visiting.add(nodeId);
      stack.push(nodeId);
      for (const target of adjacency.get(nodeId) || []) {
        visit(target);
      }
      stack.pop();
      visiting.delete(nodeId);
      visited.add(nodeId);
    };

    for (const node of queryResult.nodes) {
      visit(node.id);
      if (cycles.length >= limit) break;
    }

    return cycles;
  }

  private getCanonicalName(node: GraphNode): string {
    return node.semanticPath || node.fullName || node.name;
  }

  private computeFingerprint(nodes: GraphNode[], edges: GraphEdge[]): string {
    const payload = JSON.stringify({
      nodes: nodes.map((node) => [
        node.id,
        node.type,
        this.getCanonicalName(node),
        node.location?.file,
        node.location?.startLine,
        node.location?.endLine,
      ]),
      edges: edges.map((edge) => [
        edge.id,
        edge.type,
        edge.from,
        edge.to,
        edge.resolved,
      ]),
    });
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  private serializeEdge(edge: GraphEdge): GraphEdge {
    return {
      ...edge,
      sourceLocation: (edge.sourceLocation || []).map((span) =>
        this.stripSourceText(span),
      ),
      metadata: {
        ...(edge.metadata || {}),
        inferred: edge.metadata?.inferred ?? false,
      },
      provenance: {
        ...edge.provenance,
        source: edge.provenance.source.map((span) =>
          this.stripSourceText(span),
        ),
      },
    };
  }

  private stripSourceText<T extends { text?: string }>(span: T): T {
    const cleaned = { ...span };
    delete cleaned.text;
    return cleaned;
  }

  private getAIRules(): string[] {
    return [
      "Use only nodes, edges, summaries, and provenance listed in this bundle.",
      "Do not infer behavior that is not explicitly represented here.",
      "Treat missing relationships as unknown.",
      "Treat unresolved relationships as unresolved.",
      "Do not fabricate APIs, flows, or modules.",
      "Use source spans as the ground truth for every fact.",
      "If evidence is absent, answer with unknown or not found.",
      "Do not widen scope beyond the declared query focus.",
    ];
  }
}
