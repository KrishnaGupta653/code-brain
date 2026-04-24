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

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    for (const edge of Array.from(this.edges.values())) {
      if (edge.from === id || edge.to === id) {
        this.edges.delete(edge.id);
      }
    }
  }

  removeEdgesByPredicate(predicate: (edge: GraphEdge) => boolean): void {
    for (const edge of Array.from(this.edges.values())) {
      if (predicate(edge)) {
        this.edges.delete(edge.id);
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
    return Array.from(this.edges.values()).filter(e => e.from === nodeId);
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter(e => e.to === nodeId);
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
