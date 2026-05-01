import Database from 'better-sqlite3';
import { logger } from '../utils/index.js';

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema — baseline',
    up: (_db) => {
      // No-op: schema already applied by initialize()
    },
  },
  {
    version: 2,
    description: 'Add performance indexes',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_nodes_project_type ON nodes(project_id, type);
        CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(project_id, type);
        CREATE INDEX IF NOT EXISTS idx_prov_node ON provenance(project_id, node_id);
        CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
        CREATE INDEX IF NOT EXISTS idx_ranking_project ON ranking_scores(project_id, score DESC);
      `);
    },
  },
  {
    version: 3,
    description: 'Add export_cache table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS export_cache (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          format TEXT NOT NULL,
          focus TEXT,
          fingerprint TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_export_cache_project ON export_cache(project_id, format);
      `);
    },
  },
  {
    version: 4,
    description: 'Add git_ref column to index_state',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE index_state ADD COLUMN git_ref TEXT DEFAULT ''`);
        db.exec(`ALTER TABLE index_state ADD COLUMN git_dirty INTEGER DEFAULT 0`);
      } catch {
        // Column may already exist in newer installs — safe to ignore
      }
    },
  },
  {
    version: 5,
    description: 'Add semantic fields to nodes table',
    up: (db) => {
      try {
        db.exec(`
          ALTER TABLE nodes ADD COLUMN semantic_path TEXT;
          ALTER TABLE nodes ADD COLUMN namespace TEXT;
          ALTER TABLE nodes ADD COLUMN hierarchy_label TEXT;
          ALTER TABLE nodes ADD COLUMN semantic_role TEXT;
          ALTER TABLE nodes ADD COLUMN community_id INTEGER;
          ALTER TABLE nodes ADD COLUMN importance_score REAL DEFAULT 0;
        `);
      } catch {
        // Columns may already exist — safe to ignore
      }
    },
  },
  {
    version: 6,
    description: 'Create clusters table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS clusters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          label TEXT NOT NULL,
          member_count INTEGER NOT NULL,
          top_symbols TEXT,
          importance REAL DEFAULT 0,
          centroid_x REAL,
          centroid_y REAL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_clusters_project_id ON clusters(project_id);
      `);
    },
  },
  {
    version: 7,
    description: 'Create FTS5 search table',
    up: (db) => {
      // Drop existing FTS table if it exists (in case of migration issues)
      try {
        db.exec(`DROP TABLE IF EXISTS nodes_fts;`);
      } catch {
        // Ignore errors
      }
      
      db.exec(`
        -- Create FTS5 table without content reference (standalone)
        CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
          node_id UNINDEXED,
          name,
          full_name,
          semantic_path,
          summary
        );
        
        -- Populate FTS table with existing data
        INSERT INTO nodes_fts(node_id, name, full_name, semantic_path, summary)
        SELECT id, name, full_name, COALESCE(semantic_path, ''), COALESCE(summary, '') FROM nodes;
        
        -- Create triggers to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
          INSERT INTO nodes_fts(node_id, name, full_name, semantic_path, summary)
          VALUES (new.id, new.name, new.full_name, COALESCE(new.semantic_path, ''), COALESCE(new.summary, ''));
        END;
        
        CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
          DELETE FROM nodes_fts WHERE node_id = old.id;
        END;
        
        CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
          DELETE FROM nodes_fts WHERE node_id = old.id;
          INSERT INTO nodes_fts(node_id, name, full_name, semantic_path, summary)
          VALUES (new.id, new.name, new.full_name, COALESCE(new.semantic_path, ''), COALESCE(new.summary, ''));
        END;
      `);
    },
  },
  {
    version: 8,
    description: 'Create analytics cache table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS analytics_cache (
          project_id TEXT NOT NULL,
          algorithm TEXT NOT NULL,
          result_json TEXT NOT NULL,
          graph_fingerprint TEXT NOT NULL,
          computed_at INTEGER NOT NULL,
          PRIMARY KEY (project_id, algorithm),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_cache_fingerprint 
          ON analytics_cache(project_id, graph_fingerprint);
      `);
    },
  },
  {
    version: 9,
    description: 'Add git metadata to files table',
    up: (db) => {
      try {
        db.exec(`
          ALTER TABLE files ADD COLUMN commit_count INTEGER DEFAULT 0;
          ALTER TABLE files ADD COLUMN last_commit_at INTEGER;
          ALTER TABLE files ADD COLUMN last_author TEXT;
        `);
      } catch {
        // Columns may already exist — safe to ignore
      }
    },
  },
  {
    version: 10,
    description: 'Add export state columns to projects table',
    up: (db) => {
      try {
        db.exec(`
          ALTER TABLE projects ADD COLUMN last_export_fingerprint TEXT;
          ALTER TABLE projects ADD COLUMN last_export_at INTEGER;
        `);
      } catch {
        // Columns may already exist — safe to ignore
      }
    },
  },
  {
    version: 11,
    description: 'Create parse_errors table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS parse_errors (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id),
          file_path TEXT NOT NULL,
          error_msg TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_parse_errors_project_id
          ON parse_errors(project_id);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  // Check if schema_version table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").all() as Array<{ name: string }>;
  
  if (tables.length === 0) {
    // Table doesn't exist, create it with correct structure
    db.exec(`
      CREATE TABLE schema_version (
        version INTEGER NOT NULL,
        applied_at INTEGER NOT NULL,
        description TEXT NOT NULL
      )
    `);
  } else {
    // Table exists, check if it has the description column
    const columns = db.prepare('PRAGMA table_info(schema_version)').all() as Array<{ name: string }>;
    const hasDescriptionColumn = columns.some(col => col.name === 'description');
    
    if (!hasDescriptionColumn) {
      // Old table exists without description column - migrate it
      logger.debug('Migrating old schema_version table...');
      db.exec(`
        CREATE TABLE schema_version_new (
          version INTEGER NOT NULL,
          applied_at INTEGER NOT NULL,
          description TEXT NOT NULL
        );
        INSERT INTO schema_version_new (version, applied_at, description)
        SELECT version, applied_at, 'Legacy migration' FROM schema_version;
        DROP TABLE schema_version;
        ALTER TABLE schema_version_new RENAME TO schema_version;
      `);
    }
  }

  const currentRow = db
    .prepare('SELECT MAX(version) as v FROM schema_version')
    .get() as { v: number | null };
  const currentVersion = currentRow?.v ?? 0;

  const pending = MIGRATIONS.filter(m => m.version > currentVersion);

  if (pending.length === 0) {
    return;
  }

  logger.debug(`Running ${pending.length} database migration(s)...`);

  for (const migration of pending) {
    const tx = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)')
        .run(migration.version, Date.now(), migration.description);
    });
    tx();
    logger.debug(`Migration v${migration.version} applied: ${migration.description}`);
  }
}
