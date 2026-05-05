/**
 * Core data model types for code-brain.
 * All types include provenance tracking.
 */

export interface SourceSpan {
  file: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  text?: string;
}

export interface ProvenanceRecord {
  nodeId: string;
  type: "parser" | "inference" | "config";
  source: SourceSpan[];
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export type NodeType =
  | "project"
  | "file"
  | "module"
  | "class"
  | "function"
  | "method"
  | "variable"
  | "constant"
  | "type"
  | "interface"
  | "enum"
  | "route"
  | "config"
  | "test"
  | "doc"
  | "example"
  | "api-schema"
  | "api-endpoint"
  | "api-operation"
  | "api-type";

export type EdgeType =
  | "IMPORTS"
  | "EXPORTS"
  | "CALLS"
  | "CALLS_UNRESOLVED"
  | "CALLS_CROSS_LANGUAGE"
  | "OWNS"
  | "DEFINES"
  | "USES"
  | "DEPENDS_ON"
  | "DOCUMENTS"
  | "EXAMPLE_OF"
  | "TESTS"
  | "IMPLEMENTS"
  | "EXTENDS"
  | "DECORATES"
  | "REFERENCES"
  | "ENTRY_POINT"
  | "DEFINES_API"
  | "RESOLVES";

/**
 * Graph node representing a code entity.
 * 
 * Optional git provenance fields in metadata:
 * - gitAuthor: string — email of last committer
 * - gitLastModified: string — ISO 8601 timestamp of last commit touching this file
 * - gitCommit: string — short SHA of last commit
 * - gitCreatedAt: string — ISO 8601 timestamp of first commit adding this file
 */
export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  fullName?: string;
  canonicalName?: string;
  importance?: number;
  location?: SourceSpan;
  summary?: string;
  metadata?: Record<string, unknown>;
  provenance: ProvenanceRecord;

  // Semantic naming fields for world-class exports
  semanticPath?: string; // e.g., "api.handlers.authHandler"
  namespace?: string; // e.g., "api.handlers"
  hierarchyLabel?: string; // e.g., "API > Handlers > authHandler"
  semanticRole?: string; // e.g., "request_handler", "utility", "service"
  moduleContext?: string; // e.g., "authentication_module"
  
  // Analytics fields
  communityId?: number; // Cluster/community assignment from analytics
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  sourceLocation?: SourceSpan[];
  resolved: boolean;
  metadata?: Record<string, unknown>;
  provenance: ProvenanceRecord;

  // Relationship explanation fields for premium exports
  explanation?: string; // e.g., "handler calls validate to check request payload"
  relationshipReason?: string; // e.g., "data_validation", "dependency_injection", "async_orchestration"
  callCount?: number; // For CALLS edges
  callPattern?: string; // e.g., "direct_call", "async_await", "error_handler"
  parameterFlow?: {
    // What data flows through the relationship
    from: string[];
    to: string[];
    type: string;
  };
}

export interface ProjectMetadata {
  name: string;
  root: string;
  language: string;
  version?: string;
  description?: string;
  entryPoints?: string[];
  createdAt: number;
  updatedAt: number;
  fileCount: number;
  symbolCount: number;
  edgeCount: number;
}

export interface IndexState {
  projectName: string;
  lastIndexedAt: number;
  lastModifiedFiles: string[];
  totalFileCount: number;
  totalSymbolCount: number;
  totalEdgeCount: number;
  status: "idle" | "indexing" | "error";
  error?: string;
}

export interface SummaryRecord {
  id: string;
  label: string;
  type: "project" | "module" | "file" | "symbol";
  summary: string;
  provenance: SourceSpan[];
}

export interface ExportBundle {
  version?: string;
  fingerprint?: string;
  project: ProjectMetadata;
  nodes: GraphNode[];
  edges: GraphEdge[];
  summaries: SummaryRecord[];
  query: {
    focus: string | "project";
    truncated: boolean;
    truncationReason?: string;
    nodeCount: number;
    edgeCount: number;
  };
  evidence?: SourceSpan[];
  exportedAt: number;
  exportFormat: "json" | "yaml" | "ai";
}

export interface AIExportBundle extends ExportBundle {
  summary?: {
    entryPoints: string[];
    coreModules: string[];
    keySymbols: Array<{
      id: string;
      canonicalName: string;
      role?: string;
      importance: number;
    }>;
    cycles: string[][];
    unresolvedCount: number;
  };
  callChains?: string[][];
  ranking?: RankingScore[];
  focus?: string;
  modules?: any[]; // Module summaries for hierarchical export
  pathMap?: Record<string, string>; // File path compression map
  knowledge?: KnowledgeIndex;
  layoutHints?: GraphLayoutHints;
}

export interface KnowledgeIndex {
  schemaVersion: string;
  algorithms: Array<{
    name: string;
    purpose: string;
    implementation: string;
  }>;
  graphHealth: {
    nodeCount: number;
    edgeCount: number;
    resolvedEdgeCount: number;
    unresolvedEdgeCount: number;
    isolatedNodeCount: number;
    cycleCount: number;
  };
  languageSummary: Record<string, number>;
  architecture: {
    modules: Array<{
      id: string;
      path: string;
      label: string;
      role: string;
      fileCount: number;
      symbolCount: number;
      importance: number;
      topSymbols: Array<{ id: string; name: string; type: string; importance: number }>;
    }>;
    entryPoints: string[];
    hotspots: Array<{
      id: string;
      name: string;
      type: string;
      score: number;
      incoming: number;
      outgoing: number;
      reason: string;
    }>;
    dependencyCycles: string[][];
    unresolved: Array<{
      from: string;
      to: string;
      type: string;
      name?: string;
    }>;
  };
  recommendations: string[];
}

export interface GraphLayoutHints {
  recommendedAlgorithm: string;
  algorithms: string[];
  nodeCount: number;
  edgeCount: number;
  partitionBy: string;
  rankBy: string;
  edgeWeightBy: string;
}

export interface RankingScore {
  nodeId: string;
  score: number;
  algorithm: string;
  components?: Record<string, number>;
}

export interface QueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  expandedTo?: number;
  truncated: boolean;
}

export interface AnalyticsResult {
  centrality: Map<string, number>;
  communities: string[][];
  keyPaths: string[][];
  importance: Map<string, number>;
}

export interface CodeBrainConfig {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  languages?: string[];
  pythonPath?: string;
  dbPath?: string;
  enableAnalytics?: boolean;
  maxTokensExport?: number;
  parserPlugins?: string[];
  embeddings?: {
    enabled?: boolean;
    provider?: 'openai' | 'anthropic' | 'local' | 'none';
    model?: string;
    dimensions?: number;
    batchSize?: number;
    apiKey?: string;
    hybridSearch?: {
      enabled?: boolean;
      bm25Weight?: number;
      vectorWeight?: number;
      fusionMethod?: 'rrf' | 'linear';
    };
  };
}

export interface ParsedImportBinding {
  importedName: string;
  localName: string;
  kind: "named" | "default" | "namespace";
}

export interface ParsedImport {
  module: string;
  location: SourceSpan;
  bindings: ParsedImportBinding[];
  isTypeOnly?: boolean;
}

export interface ParsedExport {
  name: string;
  exportedName: string;
  location: SourceSpan;
  kind: "named" | "default" | "reexport";
  sourceModule?: string;
}

export interface ParsedCall {
  name: string;
  fullName: string;
  location: SourceSpan;
}

export interface ParsedParam {
  name: string;
  type: string;  // 'unknown' if not annotated
  optional: boolean;
}

export interface ParsedSymbol {
  name: string;
  type: NodeType;
  location: SourceSpan;
  calls?: ParsedCall[];
  extendsName?: string;
  implements?: string[];
  decorators?: string[];
  owner?: string;
  relatedTo?: string;
  isExported: boolean;
  summary?: string;
  metadata?: Record<string, unknown>;
  params?: ParsedParam[];     // for function/method
  returnType?: string;        // for function/method; 'unknown' if not annotated
  bodyText?: string;          // Full source text of the function/method body, if captured by parser
}

export interface ParsedFile {
  path: string;
  language: string;
  hash: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  entryPoints: string[];
  isTestFile: boolean;
  isConfigFile: boolean;
}

// ============================================================================
// CBv2 Export Format — Compact tuple-based format (10× token efficiency)
// ============================================================================

/**
 * Type code maps for compact encoding
 */
export const CBv2NodeTypeCode: Record<NodeType, number> = {
  project: 0,
  file: 1,
  module: 2,
  class: 3,
  function: 4,
  method: 5,
  variable: 6,
  constant: 7,
  type: 8,
  interface: 9,
  enum: 10,
  route: 11,
  config: 12,
  test: 13,
  doc: 14,
  example: 15,
  "api-schema": 16,
  "api-endpoint": 17,
  "api-operation": 18,
  "api-type": 19,
};

export const CBv2EdgeTypeCode: Record<EdgeType, number> = {
  IMPORTS: 0,
  EXPORTS: 1,
  CALLS: 2,
  CALLS_UNRESOLVED: 3,
  CALLS_CROSS_LANGUAGE: 4,
  OWNS: 5,
  DEFINES: 6,
  USES: 7,
  DEPENDS_ON: 8,
  DOCUMENTS: 9,
  EXAMPLE_OF: 10,
  TESTS: 11,
  IMPLEMENTS: 12,
  EXTENDS: 13,
  DECORATES: 14,
  REFERENCES: 15,
  ENTRY_POINT: 16,
  DEFINES_API: 17,
  RESOLVES: 18,
};

/**
 * Compact node tuple format:
 * [id, typeCode, name, filePath, startLine, endLine, importance, flags, summary?]
 * 
 * flags bitfield:
 * - bit 0: isExported
 * - bit 1: isEntryPoint
 * - bit 2: isDead
 * - bit 3: isBridge
 * - bit 4: inCycle
 */
export type CBv2NodeTuple = [
  string,  // id
  number,  // typeCode (from CBv2NodeTypeCode)
  string,  // name
  string,  // filePath
  number,  // startLine
  number,  // endLine
  number,  // importance (0-1, rounded to 3 decimals)
  number,  // flags bitfield
  string?, // summary (optional)
];

/**
 * Compact edge tuple format:
 * [fromId, toId, typeCode, resolved]
 */
export type CBv2EdgeTuple = [
  string,  // fromId
  string,  // toId
  number,  // typeCode (from CBv2EdgeTypeCode)
  number,  // resolved (0 or 1)
];

/**
 * CBv2 export bundle — compact tuple-based format
 */
export interface CBv2Bundle {
  v: 2;  // version
  p: {   // project metadata
    n: string;  // name
    r: string;  // root
    l: string;  // language
    fc: number; // fileCount
    sc: number; // symbolCount
    ec: number; // edgeCount
  };
  n: CBv2NodeTuple[];  // nodes
  e: CBv2EdgeTuple[];  // edges
  m?: {  // metadata (optional)
    ep?: string[];     // entryPoints
    cycles?: string[][]; // dependency cycles
    ur?: number;       // unresolvedCount
  };
  t: number;  // exportedAt timestamp
}
