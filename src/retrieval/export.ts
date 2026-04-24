import { stringify as toYAML } from 'yaml';
import {
  AIExportBundle,
  AnalyticsResult,
  ExportBundle,
  GraphEdge,
  GraphNode,
  ProjectMetadata,
  QueryResult,
  RankingScore,
  SummaryRecord
} from '../types/models.js';
import { GraphModel } from '../graph/index.js';

export interface ExportOptions {
  format: 'json' | 'yaml' | 'ai';
  focus?: string;
}

export class ExportEngine {
  constructor(
    private graph: GraphModel,
    private projectMetadata: ProjectMetadata
  ) {}

  exportForAI(
    queryResult: QueryResult,
    focus?: string,
    analyticsResult?: AnalyticsResult
  ): AIExportBundle {
    return {
      ...this.createBundle(queryResult, 'ai', focus),
      ranking: analyticsResult ? this.buildRankingFromAnalytics(analyticsResult) : undefined,
      focus,
      rules: this.getAIRules()
    };
  }

  exportAsJSON(queryResult: QueryResult, focus?: string): string {
    return JSON.stringify(this.createBundle(queryResult, 'json', focus), null, 2);
  }

  exportAsYAML(queryResult: QueryResult, focus?: string): string {
    return toYAML(this.createBundle(queryResult, 'yaml', focus));
  }

  private createBundle(
    queryResult: QueryResult,
    format: 'json' | 'yaml' | 'ai',
    focus?: string
  ): ExportBundle {
    const nodes = [...queryResult.nodes].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const edges = [...queryResult.edges].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));

    return {
      project: this.projectMetadata,
      nodes: nodes.map(node => this.serializeNode(node)),
      edges: edges.map(edge => this.serializeEdge(edge)),
      summaries: this.buildSummaries(nodes),
      query: {
        focus: focus || 'project',
        truncated: queryResult.truncated,
        nodeCount: nodes.length,
        edgeCount: edges.length
      },
      exportedAt: Date.now(),
      exportFormat: format,
      rules: format === 'ai' ? this.getAIRules() : undefined
    };
  }

  private buildSummaries(nodes: GraphNode[]): SummaryRecord[] {
    const summaries: SummaryRecord[] = [];
    const projectNode = this.graph.getNodes().find(node => node.type === 'project');
    if (projectNode) {
      summaries.push({
        id: projectNode.id,
        label: projectNode.name,
        type: 'project',
        summary: `Project graph with ${this.projectMetadata.fileCount} files and ${this.projectMetadata.edgeCount} relationships.`,
        provenance: projectNode.provenance.source
      });
    }

    const fileNodes = nodes.filter(node => node.type === 'file').slice(0, 20);
    for (const node of fileNodes) {
      const defined = this.graph.getOutgoingEdges(node.id).filter(edge => edge.type === 'DEFINES').length;
      const dependsOn = this.graph.getOutgoingEdges(node.id).filter(edge => edge.type === 'IMPORTS' || edge.type === 'DEPENDS_ON').length;
      summaries.push({
        id: node.id,
        label: node.name,
        type: 'file',
        summary: `${node.name} defines ${defined} symbols and depends on ${dependsOn} modules/files.`,
        provenance: node.provenance.source
      });
    }

    const symbols = nodes
      .filter(node => ['class', 'function', 'method', 'route', 'config'].includes(node.type))
      .slice(0, 25);
    for (const node of symbols) {
      const outgoing = this.graph.getOutgoingEdges(node.id).length;
      const incoming = this.graph.getIncomingEdges(node.id).length;
      summaries.push({
        id: node.id,
        label: node.fullName || node.name,
        type: 'symbol',
        summary: `${node.type} ${node.name} has ${outgoing} outgoing and ${incoming} incoming relationships.`,
        provenance: node.provenance.source
      });
    }

    return summaries;
  }

  private buildRankingFromAnalytics(analyticsResult: AnalyticsResult): RankingScore[] {
    const ranking: RankingScore[] = [];
    for (const [nodeId, score] of analyticsResult.centrality.entries()) {
      ranking.push({
        nodeId,
        score: Number(score),
        algorithm: 'betweenness_centrality',
        components: {
          pagerank: Number(analyticsResult.importance.get(nodeId) || 0)
        }
      });
    }

    return ranking.sort((a, b) => b.score - a.score).slice(0, 50);
  }

  private serializeNode(node: GraphNode): GraphNode {
    return {
      ...node,
      location: node.location ? this.stripSourceText(node.location) : undefined,
      summary: node.summary || 'unknown',
      metadata: {
        ...(node.metadata || {}),
        inferred: node.metadata?.inferred ?? false
      },
      provenance: {
        ...node.provenance,
        source: node.provenance.source.map(span => this.stripSourceText(span))
      }
    };
  }

  private serializeEdge(edge: GraphEdge): GraphEdge {
    return {
      ...edge,
      sourceLocation: (edge.sourceLocation || []).map(span => this.stripSourceText(span)),
      metadata: {
        ...(edge.metadata || {}),
        inferred: edge.metadata?.inferred ?? false
      },
      provenance: {
        ...edge.provenance,
        source: edge.provenance.source.map(span => this.stripSourceText(span))
      }
    };
  }

  private stripSourceText<T extends { text?: string }>(span: T): T {
    const cleaned = { ...span };
    delete cleaned.text;
    return cleaned;
  }

  private getAIRules(): string[] {
    return [
      'Use only nodes, edges, summaries, and provenance listed in this bundle.',
      'Do not infer behavior that is not explicitly represented here.',
      'Treat missing relationships as unknown.',
      'Treat unresolved relationships as unresolved.',
      'Do not fabricate APIs, flows, or modules.',
      'Use source spans as the ground truth for every fact.',
      'If evidence is absent, answer with unknown or not found.',
      'Do not widen scope beyond the declared query focus.'
    ];
  }
}
