import { GraphModel } from '../graph/index.js';
import { GraphEdge, GraphNode, NodeType, QueryResult } from '../types/models.js';

export class QueryEngine {
  constructor(private graph: GraphModel) {}

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

    return this.graph
      .getNodes()
      .filter(node => {
        const haystacks = [node.name, node.fullName || '', String(node.metadata?.filePath || '')];
        return haystacks.some(value => value.toLowerCase().includes(normalized));
      })
      .sort((a, b) => a.name.localeCompare(b.name))
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
}
