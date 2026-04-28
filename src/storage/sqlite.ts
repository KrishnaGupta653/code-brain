import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  EdgeType,
  NodeType,
  ProjectMetadata,
  IndexState,
  ProvenanceRecord,
  RankingScore,
  SourceSpan,
} from "../types/models.js";
import { SCHEMA, SCHEMA_VERSION_TABLE, SCHEMA_V2_MIGRATIONS, CURRENT_SCHEMA_VERSION } from "./schema.js";
import { logger, StorageError, stableId } from "../utils/index.js";
import { createGraphNode, createGraphEdge } from "../graph/index.js";
import { GraphModel } from "../graph/index.js";

interface StoredFileHash {
  path: string;
  hash: string;
}

export class SQLiteStorage {
  private db: Database.Database;

  constructor(private dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.initialize();
  }

  private initialize(): void {
    try {
      this.db.exec(SCHEMA);
      this.db.exec(SCHEMA_VERSION_TABLE);
      this.runMigrations();
      logger.debug("Database initialized");
    } catch (error) {
      throw new StorageError("Failed to initialize database", error);
    }
  }

  private runMigrations(): void {
    try {
      const row = this.db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null };
      const currentVersion = row?.v ?? 1;

      if (currentVersion < CURRENT_SCHEMA_VERSION) {
        if (currentVersion < 2) {
          // Run V2 migrations with try/catch per statement (column may already exist)
          for (const migration of SCHEMA_V2_MIGRATIONS) {
            try {
              this.db.exec(migration);
            } catch (err) {
              // ALTER TABLE ADD COLUMN throws if column already exists — that's OK
              const msg = err instanceof Error ? err.message : String(err);
              if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
                logger.warn(`Migration skipped (likely already applied): ${msg}`);
              }
            }
          }
          this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(2, Date.now());
          logger.info('Schema migrated to version 2');
        }
      }
    } catch (error) {
      throw new StorageError('Failed to run schema migrations', error);
    }
  }

  getProjectId(projectRoot: string): string {
    // Normalize to absolute path to ensure consistent projectId
    const absolutePath = path.resolve(projectRoot);
    return stableId("project", absolutePath);
  }

  saveProject(metadata: ProjectMetadata): string {
    try {
      // Normalize to absolute path for consistency
      const absoluteRoot = path.resolve(metadata.root);
      const projectId = this.getProjectId(absoluteRoot);
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO projects
        (id, name, root, language, version, description, entry_points, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(root) DO UPDATE SET
          name = excluded.name,
          language = excluded.language,
          version = excluded.version,
          description = excluded.description,
          entry_points = excluded.entry_points,
          updated_at = excluded.updated_at
      `);

      stmt.run(
        projectId,
        metadata.name,
        absoluteRoot,
        metadata.language,
        metadata.version || "",
        metadata.description || "",
        metadata.entryPoints ? JSON.stringify(metadata.entryPoints) : "[]",
        metadata.createdAt || now,
        metadata.updatedAt || now,
      );

      return projectId;
    } catch (error) {
      throw new StorageError("Failed to save project", error);
    }
  }

  getProject(projectRoot: string): ProjectMetadata | null {
    try {
      // Normalize to absolute path for consistency
      const absoluteRoot = path.resolve(projectRoot);
      const row = this.db
        .prepare("SELECT * FROM projects WHERE root = ?")
        .get(absoluteRoot) as
        | {
            name: string;
            root: string;
            language: string;
            version: string;
            description: string;
            entry_points: string;
            created_at: number;
            updated_at: number;
            id: string;
          }
        | undefined;

      if (!row) return null;

      return {
        name: row.name,
        root: row.root,
        language: row.language,
        version: row.version || undefined,
        description: row.description || undefined,
        entryPoints: row.entry_points ? JSON.parse(row.entry_points) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        fileCount: this.getFileCount(row.id),
        symbolCount: this.getSymbolCount(row.id),
        edgeCount: this.getEdgeCount(row.id),
      };
    } catch (error) {
      throw new StorageError("Failed to retrieve project", error);
    }
  }

  getFileHashes(projectRoot: string): Map<string, string> {
    const projectId = this.getProjectId(projectRoot);
    const rows = this.db
      .prepare("SELECT path, hash FROM files WHERE project_id = ?")
      .all(projectId) as StoredFileHash[];

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.path, row.hash);
    }
    return map;
  }

  saveFileHashes(
    projectRoot: string,
    files: Array<{
      path: string;
      hash: string;
      language: string;
      size: number;
    }>,
  ): void {
    const projectId = this.getProjectId(projectRoot);
    const now = Date.now();
    const upsert = this.db.prepare(`
      INSERT INTO files (project_id, path, language, hash, size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, path) DO UPDATE SET
        language = excluded.language,
        hash = excluded.hash,
        size = excluded.size,
        updated_at = excluded.updated_at
    `);

    const tx = this.db.transaction(() => {
      for (const file of files) {
        upsert.run(
          projectId,
          file.path,
          file.language,
          file.hash,
          file.size,
          now,
          now,
        );
      }
    });

    tx();
  }

  removeMissingFileHashes(projectRoot: string, currentPaths: string[]): void {
    const projectId = this.getProjectId(projectRoot);
    const current = new Set(currentPaths);
    const rows = this.db
      .prepare("SELECT path FROM files WHERE project_id = ?")
      .all(projectId) as Array<{ path: string }>;

    const del = this.db.prepare(
      "DELETE FROM files WHERE project_id = ? AND path = ?",
    );
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        if (!current.has(row.path)) {
          del.run(projectId, row.path);
        }
      }
    });

    tx();
  }

  replaceGraph(projectRoot: string, graph: GraphModel): void {
    const project = this.getProject(projectRoot);
    if (!project) {
      throw new StorageError(
        "Project not initialized. Run code-brain init first.",
      );
    }

    const projectId = this.getProjectId(projectRoot);
    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    const now = Date.now();

    const tx = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM provenance WHERE project_id = ?")
        .run(projectId);
      this.db.prepare("DELETE FROM edges WHERE project_id = ?").run(projectId);
      this.db.prepare("DELETE FROM nodes WHERE project_id = ?").run(projectId);

      const insertNode = this.db.prepare(`
        INSERT INTO nodes
        (id, project_id, file_path, name, full_name, type, start_line, end_line, start_col, end_col, summary, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertEdge = this.db.prepare(`
        INSERT INTO edges
        (id, project_id, from_id, to_id, type, resolved, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertProv = this.db.prepare(`
        INSERT INTO provenance
        (id, project_id, node_id, type, source_file, source_start_col, source_start_line, source_end_col, source_end_line, source_text, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const node of nodes) {
        insertNode.run(
          node.id,
          projectId,
          node.location?.file || null,
          node.name,
          node.fullName || node.name,
          node.type,
          node.location?.startLine ?? 0,
          node.location?.endLine ?? 0,
          node.location?.startCol ?? 0,
          node.location?.endCol ?? 0,
          node.summary || "",
          JSON.stringify(node.metadata || {}),
          node.provenance.createdAt || now,
          node.provenance.updatedAt || now,
        );

        this.insertProvenanceSpans(
          insertProv,
          projectId,
          node.id,
          node.provenance,
        );
      }

      for (const edge of edges) {
        insertEdge.run(
          edge.id,
          projectId,
          edge.from,
          edge.to,
          edge.type,
          edge.resolved ? 1 : 0,
          JSON.stringify(edge.metadata || {}),
          edge.provenance.createdAt || now,
          edge.provenance.updatedAt || now,
        );

        this.insertProvenanceSpans(
          insertProv,
          projectId,
          edge.id,
          edge.provenance,
        );
      }
    });

    tx();
  }

  loadGraph(projectRoot: string): GraphModel {
    const projectId = this.getProjectId(projectRoot);
    const graph = new GraphModel();

    const nodes = this.db
      .prepare("SELECT * FROM nodes WHERE project_id = ?")
      .all(projectId) as Array<{
      id: string;
      type: string;
      name: string;
      full_name: string;
      file_path: string;
      start_line: number;
      end_line: number;
      start_col: number;
      end_col: number;
      summary: string;
      metadata: string;
      x_pos: number | null;
      y_pos: number | null;
      community_id: number | null;
      created_at: number;
      updated_at: number;
    }>;

    for (const row of nodes) {
      const source: SourceSpan = {
        file: row.file_path || "",
        startLine: row.start_line,
        endLine: row.end_line,
        startCol: row.start_col,
        endCol: row.end_col,
      };

      const node = createGraphNode(
        row.id,
        row.type as NodeType,
        row.name,
        source,
        row.full_name,
        row.summary || undefined,
        row.metadata ? JSON.parse(row.metadata) : {},
      );

      node.provenance = this.getProvenanceFor(
        row.id,
        projectId,
        row.created_at,
        row.updated_at,
      );
      
      // Restore layout and community data from analytics
      if (row.x_pos !== null && row.y_pos !== null) {
        node.x = row.x_pos;
        node.y = row.y_pos;
      }
      if (row.community_id !== null) {
        node.communityId = row.community_id;
      }
      
      graph.addNode(node);
    }

    const edges = this.db
      .prepare("SELECT * FROM edges WHERE project_id = ?")
      .all(projectId) as Array<{
      id: string;
      type: string;
      from_id: string;
      to_id: string;
      resolved: number;
      metadata: string;
      created_at: number;
      updated_at: number;
    }>;

    for (const row of edges) {
      const sourceSpans = this.getSourceSpans(row.id, projectId);
      const edge = createGraphEdge(
        row.id,
        row.type as EdgeType,
        row.from_id,
        row.to_id,
        Boolean(row.resolved),
        sourceSpans,
        row.metadata ? JSON.parse(row.metadata) : {},
      );

      edge.provenance = this.getProvenanceFor(
        row.id,
        projectId,
        row.created_at,
        row.updated_at,
      );
      graph.addEdge(edge);
    }

    return graph;
  }

  saveRankingScores(projectRoot: string, scores: RankingScore[]): void {
    const projectId = this.getProjectId(projectRoot);
    const now = Date.now();
    const del = this.db.prepare(
      "DELETE FROM ranking_scores WHERE project_id = ?",
    );
    const ins = this.db.prepare(`
      INSERT INTO ranking_scores (id, project_id, node_id, score, algorithm, components, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      del.run(projectId);
      for (const score of scores) {
        ins.run(
          stableId("rank", projectId, score.nodeId, score.algorithm),
          projectId,
          score.nodeId,
          score.score,
          score.algorithm,
          JSON.stringify(score.components || {}),
          now,
        );
      }
    });

    tx();
  }

  getRankingScores(projectRoot: string): RankingScore[] {
    const projectId = this.getProjectId(projectRoot);
    const rows = this.db
      .prepare(
        `SELECT node_id, score, algorithm, components
         FROM ranking_scores
         WHERE project_id = ?
         ORDER BY score DESC, node_id ASC`,
      )
      .all(projectId) as Array<{
      node_id: string;
      score: number;
      algorithm: string;
      components: string;
    }>;

    return rows.map((row) => ({
      nodeId: row.node_id,
      score: row.score,
      algorithm: row.algorithm,
      components: row.components ? JSON.parse(row.components) : {},
    }));
  }

  updateIndexState(projectRoot: string, state: Partial<IndexState>): void {
    const projectId = this.getProjectId(projectRoot);
    this.db
      .prepare(
        `
        INSERT INTO index_state
        (project_id, last_indexed_at, file_count, symbol_count, edge_count, status, error)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          last_indexed_at = excluded.last_indexed_at,
          file_count = excluded.file_count,
          symbol_count = excluded.symbol_count,
          edge_count = excluded.edge_count,
          status = excluded.status,
          error = excluded.error
      `,
      )
      .run(
        projectId,
        state.lastIndexedAt || Date.now(),
        state.totalFileCount || 0,
        state.totalSymbolCount || 0,
        state.totalEdgeCount || 0,
        state.status || "idle",
        state.error || "",
      );
  }

  getIndexState(projectRoot: string): IndexState | null {
    const projectId = this.getProjectId(projectRoot);
    const row = this.db
      .prepare("SELECT * FROM index_state WHERE project_id = ?")
      .get(projectId) as
      | {
          last_indexed_at: number;
          file_count: number;
          symbol_count: number;
          edge_count: number;
          status: "idle" | "indexing" | "error";
          error: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      projectName: path.basename(projectRoot),
      lastIndexedAt: row.last_indexed_at,
      lastModifiedFiles: [],
      totalFileCount: row.file_count,
      totalSymbolCount: row.symbol_count,
      totalEdgeCount: row.edge_count,
      status: row.status,
      error: row.error || undefined,
    };
  }

  close(): void {
    this.db.close();
    logger.debug("Database closed");
  }

  private insertProvenanceSpans(
    insertProv: Database.Statement,
    projectId: string,
    nodeId: string,
    provenance: ProvenanceRecord,
  ): void {
    const sourceSpans =
      provenance.source.length > 0
        ? provenance.source
        : [
            {
              file: "",
              startLine: 0,
              endLine: 0,
              startCol: 0,
              endCol: 0,
            },
          ];

    let index = 0;
    for (const source of sourceSpans) {
      insertProv.run(
        stableId(
          "prov",
          projectId,
          nodeId,
          source.file || "",
          source.startLine,
          source.startCol,
          index++,
        ),
        projectId,
        nodeId,
        provenance.type,
        source.file || "",
        source.startCol || 0,
        source.startLine || 0,
        source.endCol || 0,
        source.endLine || 0,
        source.text || "",
        provenance.confidence,
        provenance.createdAt,
        provenance.updatedAt,
      );
    }
  }

  private getSourceSpans(nodeId: string, projectId: string): SourceSpan[] {
    const rows = this.db
      .prepare(
        `SELECT source_file, source_start_col, source_start_line, source_end_col, source_end_line, source_text
         FROM provenance WHERE project_id = ? AND node_id = ?`,
      )
      .all(projectId, nodeId) as Array<{
      source_file: string;
      source_start_col: number;
      source_start_line: number;
      source_end_col: number;
      source_end_line: number;
      source_text: string;
    }>;

    return rows.map((row) => ({
      file: row.source_file,
      startLine: row.source_start_line,
      endLine: row.source_end_line,
      startCol: row.source_start_col,
      endCol: row.source_end_col,
      text: row.source_text || undefined,
    }));
  }

  private getProvenanceFor(
    nodeId: string,
    projectId: string,
    fallbackCreatedAt: number,
    fallbackUpdatedAt: number,
  ): ProvenanceRecord {
    const rows = this.db
      .prepare(
        `SELECT type, confidence, created_at, updated_at
         FROM provenance WHERE project_id = ? AND node_id = ? LIMIT 1`,
      )
      .all(projectId, nodeId) as Array<{
      type: "parser" | "inference" | "config";
      confidence: number;
      created_at: number;
      updated_at: number;
    }>;

    const row = rows[0];
    return {
      nodeId,
      type: row?.type || "parser",
      source: this.getSourceSpans(nodeId, projectId),
      confidence: row?.confidence ?? 1,
      createdAt: row?.created_at ?? fallbackCreatedAt,
      updatedAt: row?.updated_at ?? fallbackUpdatedAt,
    };
  }

  private getFileCount(projectId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM files WHERE project_id = ?")
      .get(projectId) as { count: number };
    return row?.count || 0;
  }

  private getNodeCount(projectId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM nodes WHERE project_id = ?")
      .get(projectId) as { count: number };
    return row?.count || 0;
  }

  private getSymbolCount(projectId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM nodes WHERE project_id = ? AND type NOT IN ('file', 'project')",
      )
      .get(projectId) as { count: number };
    return row?.count || 0;
  }

  private getEdgeCount(projectId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM edges WHERE project_id = ?")
      .get(projectId) as { count: number };
    return row?.count || 0;
  }

  saveLayout(projectRoot: string, layout: Record<string, { x: number; y: number }>): void {
    try {
      const entries = Object.entries(layout);
      if (entries.length === 0) return;

      const update = this.db.prepare('UPDATE nodes SET x_pos = ?, y_pos = ? WHERE id = ?');
      const runAll = this.db.transaction((entries: Array<[string, { x: number; y: number }]>) => {
        for (const [nodeId, pos] of entries) {
          update.run(pos.x, pos.y, nodeId);
        }
      });
      runAll(entries);
      logger.debug(`Saved layout for ${entries.length} nodes`);
    } catch (error) {
      throw new StorageError('Failed to save layout', error);
    }
  }

  saveCommunityMembership(projectRoot: string, membership: Record<string, number>): void {
    try {
      const entries = Object.entries(membership);
      if (entries.length === 0) return;

      const update = this.db.prepare('UPDATE nodes SET community_id = ? WHERE id = ?');
      const runAll = this.db.transaction((entries: Array<[string, number]>) => {
        for (const [nodeId, communityId] of entries) {
          update.run(communityId, nodeId);
        }
      });
      runAll(entries);
      logger.debug(`Saved community membership for ${entries.length} nodes`);
    } catch (error) {
      throw new StorageError('Failed to save community membership', error);
    }
  }

  getFilesModifiedSince(projectRoot: string, timestamp: number): string[] {
    try {
      const projectId = this.getProjectId(projectRoot);
      const rows = this.db.prepare(
        'SELECT path FROM files WHERE project_id = ? AND updated_at > ?'
      ).all(projectId, timestamp) as { path: string }[];
      return rows.map(r => r.path);
    } catch (error) {
      throw new StorageError('Failed to get modified files', error);
    }
  }
}
