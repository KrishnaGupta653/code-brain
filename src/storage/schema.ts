/**
 * SQLite database schema for code-brain.
 * Defines all tables and relationships.
 */

export const SCHEMA = `
PRAGMA foreign_keys = ON;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL,
  version TEXT,
  description TEXT,
  entry_points TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexed source files and their content hashes
CREATE TABLE IF NOT EXISTS files (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  language TEXT NOT NULL,
  hash TEXT NOT NULL,
  size INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, path)
);

-- Persisted graph nodes
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_path TEXT,
  name TEXT NOT NULL,
  full_name TEXT,
  type TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_col INTEGER,
  end_col INTEGER,
  summary TEXT,
  is_exported BOOLEAN DEFAULT FALSE,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Persisted graph edges
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Provenance spans for nodes/edges
CREATE TABLE IF NOT EXISTS provenance (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  type TEXT NOT NULL,
  source_file TEXT,
  source_start_col INTEGER,
  source_start_line INTEGER,
  source_end_col INTEGER,
  source_end_line INTEGER,
  source_text TEXT,
  confidence REAL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Index state table
CREATE TABLE IF NOT EXISTS index_state (
  project_id TEXT PRIMARY KEY,
  last_indexed_at INTEGER,
  file_count INTEGER DEFAULT 0,
  symbol_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'idle',
  error TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Ranking scores table
CREATE TABLE IF NOT EXISTS ranking_scores (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  score REAL NOT NULL,
  algorithm TEXT NOT NULL,
  components TEXT,
  computed_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- LLM-generated summaries table
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  purpose TEXT,
  key_points TEXT,
  usage TEXT,
  tokens INTEGER,
  generated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(project_id, node_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_nodes_project_id ON nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_nodes_project_type ON nodes(project_id, type);
CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_project_id ON edges(project_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_id ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to_id ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(project_id, type);
CREATE INDEX IF NOT EXISTS idx_provenance_project_id ON provenance(project_id);
CREATE INDEX IF NOT EXISTS idx_provenance_node_id ON provenance(node_id);
CREATE INDEX IF NOT EXISTS idx_prov_node ON provenance(project_id, node_id);
CREATE INDEX IF NOT EXISTS idx_ranking_scores_node_id ON ranking_scores(node_id);
CREATE INDEX IF NOT EXISTS idx_ranking_project ON ranking_scores(project_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_node_id ON summaries(node_id);
CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project_id);

-- FTS5 virtual table for semantic search
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  node_id UNINDEXED,
  name,
  full_name,
  summary,
  file_path,
  tokenize='porter unicode61'
);
`;

export const CURRENT_SCHEMA_VERSION = 11;
