export interface SourceSpan {
  file: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
}

export interface RankingScore {
  nodeId: string;
  score: number;
  algorithm: string;
  components?: Record<string, number>;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  fullName?: string;
  summary?: string;
  file?: string;
  location?: SourceSpan;
  metadata?: Record<string, unknown>;
  degree: number;
  incomingCount: number;
  outgoingCount: number;
  rank?: RankingScore;
  vscodeUri?: string;
  x?: number | null;
  y?: number | null;
  communityId?: number | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  resolved: boolean;
  metadata?: Record<string, unknown>;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  };
  analytics?: {
    health: {
      nodeCount: number;
      edgeCount: number;
      unresolvedEdges: number;
      isolatedNodes: number;
    };
    hubs: Array<{
      id: string;
      name: string;
      type: string;
      degree: number;
    }>;
    communities: Array<{
      label: string;
      nodeIds: string[];
      size: number;
    }>;
  };
}

export interface NodeDetails extends GraphNode {
  relationSummary?: {
    outgoing: Record<string, number>;
    incoming: Record<string, number>;
  };
  sourcePreview?: SourceSpan & {
    vscodeUri?: string;
  };
  provenance?: {
    type: string;
    confidence: number;
    source: SourceSpan[];
  };
  outgoing: Array<GraphEdge & { target?: GraphNode }>;
  incoming: Array<GraphEdge & { source?: GraphNode }>;
}

export interface SourceLine {
  line: number;
  text: string;
  highlighted: boolean;
}

export interface SourcePayload {
  file: string;
  relativeFile: string;
  startLine: number;
  endLine: number;
  requestedStartLine: number;
  requestedEndLine: number;
  vscodeUri?: string;
  lines: SourceLine[];
}
