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
  | "doc";

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
  | "TESTS"
  | "DOCUMENTS"
  | "IMPLEMENTS"
  | "EXTENDS"
  | "DECORATES"
  | "REFERENCES"
  | "ENTRY_POINT";

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
  importanceScore?: number; // Computed importance score (0-1)
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
  rules?: string[];
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
  rules: string[];
  modules?: any[]; // Module summaries for hierarchical export
  pathMap?: Record<string, string>; // File path compression map
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
