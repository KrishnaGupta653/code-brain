import {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  SourceSpan,
  ProvenanceRecord
} from '../types/models.js';
import { globalProvenanceTracker } from '../provenance/index.js';

export class GraphModel {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private outgoingEdgeIds: Map<string, Set<string>> = new Map();
  private incomingEdgeIds: Map<string, Set<string>> = new Map();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    const existing = this.edges.get(edge.id);
    if (existing) {
      this.removeEdgeFromIndexes(existing);
    }

    this.edges.set(edge.id, edge);
    this.addEdgeToIndexes(edge);
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    const relatedEdgeIds = new Set<string>([
      ...(this.outgoingEdgeIds.get(id) || []),
      ...(this.incomingEdgeIds.get(id) || [])
    ]);

    for (const edgeId of relatedEdgeIds) {
      this.removeEdge(edgeId);
    }

    this.outgoingEdgeIds.delete(id);
    this.incomingEdgeIds.delete(id);
  }

  removeEdge(id: string): void {
    const edge = this.edges.get(id);
    if (!edge) {
      return;
    }

    this.edges.delete(id);
    this.removeEdgeFromIndexes(edge);
  }

  removeEdgesByPredicate(predicate: (edge: GraphEdge) => boolean): void {
    for (const edge of Array.from(this.edges.values())) {
      if (predicate(edge)) {
        this.removeEdge(edge.id);
      }
    }
  }

  removeNodesByPredicate(predicate: (node: GraphNode) => boolean): void {
    for (const node of Array.from(this.nodes.values())) {
      if (predicate(node)) {
        this.removeNode(node.id);
      }
    }
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return Array.from(this.outgoingEdgeIds.get(nodeId) || [])
      .map(id => this.edges.get(id))
      .filter((edge): edge is GraphEdge => Boolean(edge));
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    return Array.from(this.incomingEdgeIds.get(nodeId) || [])
      .map(id => this.edges.get(id))
      .filter((edge): edge is GraphEdge => Boolean(edge));
  }

  getNodesByType(type: NodeType): GraphNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  getEdgesByType(type: EdgeType): GraphEdge[] {
    return Array.from(this.edges.values()).filter(e => e.type === type);
  }

  findPath(fromId: string, toId: string): string[] | null {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: fromId, path: [fromId] }
    ];

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === toId) {
        return path;
      }

      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);

      const outgoing = this.getOutgoingEdges(nodeId);
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          queue.push({ nodeId: edge.to, path: [...path, edge.to] });
        }
      }
    }

    return null;
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoingEdgeIds.clear();
    this.incomingEdgeIds.clear();
  }

  getStats(): {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  } {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};

    for (const node of this.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    for (const edge of this.edges.values()) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodesByType,
      edgesByType
    };
  }

  private addEdgeToIndexes(edge: GraphEdge): void {
    if (!this.outgoingEdgeIds.has(edge.from)) {
      this.outgoingEdgeIds.set(edge.from, new Set());
    }
    if (!this.incomingEdgeIds.has(edge.to)) {
      this.incomingEdgeIds.set(edge.to, new Set());
    }

    this.outgoingEdgeIds.get(edge.from)!.add(edge.id);
    this.incomingEdgeIds.get(edge.to)!.add(edge.id);
  }

  private removeEdgeFromIndexes(edge: GraphEdge): void {
    const outgoing = this.outgoingEdgeIds.get(edge.from);
    outgoing?.delete(edge.id);
    if (outgoing?.size === 0) {
      this.outgoingEdgeIds.delete(edge.from);
    }

    const incoming = this.incomingEdgeIds.get(edge.to);
    incoming?.delete(edge.id);
    if (incoming?.size === 0) {
      this.incomingEdgeIds.delete(edge.to);
    }
  }
}

export function createGraphNode(
  id: string,
  type: NodeType,
  name: string,
  location: SourceSpan,
  fullName?: string,
  summary?: string,
  metadata?: Record<string, unknown>
): GraphNode {
  const provenance: ProvenanceRecord = {
    nodeId: id,
    type: 'parser',
    source: [location],
    confidence: 1.0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  globalProvenanceTracker.trackParsing(id, type, [location]);

  return {
    id,
    type,
    name,
    fullName: fullName || name,
    location,
    summary,
    metadata,
    provenance
  };
}

export function createGraphEdge(
  id: string,
  type: EdgeType,
  from: string,
  to: string,
  resolved: boolean = true,
  sourceLocation?: SourceSpan[],
  metadata?: Record<string, unknown>
): GraphEdge {
  const provenance: ProvenanceRecord = {
    nodeId: id,
    type: resolved ? 'parser' : 'inference',
    source: sourceLocation || [],
    confidence: resolved ? 1.0 : 0.7,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  return {
    id,
    type,
    from,
    to,
    sourceLocation,
    resolved,
    metadata,
    provenance
  };
}
