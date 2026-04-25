import { stringify as toYAML } from "yaml";
import {
  AIExportBundle,
  AnalyticsResult,
  ExportBundle,
  GraphEdge,
  GraphNode,
  ProjectMetadata,
  QueryResult,
  RankingScore,
  SummaryRecord,
} from "../types/models.js";
import { GraphModel } from "../graph/index.js";

export interface ExportOptions {
  format: "json" | "yaml" | "ai";
  focus?: string;
  maxTokens?: number;
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
  ): AIExportBundle {
    let optimizedResult = queryResult;

    if (maxTokens) {
      optimizedResult = this.pruneByTokenBudget(
        queryResult,
        maxTokens,
        analyticsResult,
      );
    }

    return {
      ...this.createBundle(optimizedResult, "ai", focus),
      ranking: analyticsResult
        ? this.buildRankingFromAnalytics(analyticsResult)
        : undefined,
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
    return nodes.sort((a, b) => {
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
    const nodes = [...queryResult.nodes].sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    );
    const edges = [...queryResult.edges].sort(
      (a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id),
    );

    return {
      project: this.projectMetadata,
      nodes: nodes.map((node) => this.serializeNode(node)),
      edges: edges.map((edge) => this.serializeEdge(edge)),
      summaries: this.buildSummaries(nodes),
      query: {
        focus: focus || "project",
        truncated: queryResult.truncated,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
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

  private serializeNode(node: GraphNode): GraphNode {
    return {
      ...node,
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
