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

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  fullName?: string;
  location?: SourceSpan;
  summary?: string;
  metadata?: Record<string, unknown>;
  provenance: ProvenanceRecord;
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
  ranking?: RankingScore[];
  focus?: string;
  rules: string[];
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
