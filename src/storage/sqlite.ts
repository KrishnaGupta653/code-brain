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
  GraphNode,
} from "../types/models.js";
import { SCHEMA } from "./schema.js";
import { logger, StorageError, stableId } from "../utils/index.js";
import { createGraphNode, createGraphEdge } from "../graph/index.js";
import { GraphModel } from "../graph/index.js";
import { runMigrations } from "./migrations.js";

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
    this.db.pragma("foreign_keys = ON");
    this.initialize();
    runMigrations(this.db);
  }

  private initialize(): void {
    try {
      this.db.exec(SCHEMA);
      logger.debug("Database initialized");
    } catch (error) {
      throw new StorageError("Failed to initialize database", error);
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
        (id, project_id, file_path, name, full_name, type, start_line, end_line, start_col, end_col, summary, metadata, 
         semantic_path, namespace, hierarchy_label, semantic_role, community_id, importance_score, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          node.semanticPath || null,
          node.namespace || null,
          node.hierarchyLabel || null,
          node.semanticRole || null,
          node.communityId || null,
          node.importanceScore || 0,
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
      semantic_path: string | null;
      namespace: string | null;
      hierarchy_label: string | null;
      semantic_role: string | null;
      community_id: number | null;
      importance_score: number;
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

      // Restore semantic fields
      node.semanticPath = row.semantic_path || undefined;
      node.namespace = row.namespace || undefined;
      node.hierarchyLabel = row.hierarchy_label || undefined;
      node.semanticRole = row.semantic_role || undefined;
      node.communityId = row.community_id || undefined;
      node.importanceScore = row.importance_score || 0;

      node.provenance = this.getProvenanceFor(
        row.id,
        projectId,
        row.created_at,
        row.updated_at,
      );
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

  /**
   * Search nodes using FTS5 full-text search with BM25 ranking.
   * Falls back to LIKE search if FTS5 is not available.
   */
  searchNodes(projectRoot: string, query: string, limit: number = 50): GraphNode[] {
    const projectId = this.getProjectId(projectRoot);
    
    try {
      // Try FTS5 search first
      const ftsResults = this.db
        .prepare(`
          SELECT n.*, fts.rank
          FROM nodes_fts fts
          JOIN nodes n ON n.id = fts.node_id
          WHERE n.project_id = ? AND nodes_fts MATCH ?
          ORDER BY fts.rank
          LIMIT ?
        `)
        .all(projectId, query, limit) as Array<{
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
        semantic_path: string | null;
        namespace: string | null;
        hierarchy_label: string | null;
        semantic_role: string | null;
        community_id: number | null;
        importance_score: number;
        created_at: number;
        updated_at: number;
        rank: number;
      }>;

      return ftsResults.map((row) => {
        const node = this.rowToGraphNode(row, projectId);
        return node;
      });
    } catch (error) {
      // FTS5 not available, fall back to LIKE search
      logger.debug("FTS5 not available, using LIKE search");
      const likePattern = `%${query}%`;
      const likeResults = this.db
        .prepare(`
          SELECT *
          FROM nodes
          WHERE project_id = ? AND (
            name LIKE ? OR
            full_name LIKE ? OR
            semantic_path LIKE ? OR
            summary LIKE ?
          )
          ORDER BY 
            CASE 
              WHEN name = ? THEN 0
              WHEN name LIKE ? THEN 1
              ELSE 2
            END,
            importance_score DESC,
            name
          LIMIT ?
        `)
        .all(
          projectId,
          likePattern,
          likePattern,
          likePattern,
          likePattern,
          query,
          `${query}%`,
          limit,
        ) as Array<{
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
        semantic_path: string | null;
        namespace: string | null;
        hierarchy_label: string | null;
        semantic_role: string | null;
        community_id: number | null;
        importance_score: number;
        created_at: number;
        updated_at: number;
      }>;

      return likeResults.map((row) => this.rowToGraphNode(row, projectId));
    }
  }

  /**
   * Save analytics results to cache.
   */
  saveAnalyticsCache(
    projectRoot: string,
    algorithm: string,
    results: unknown,
    fingerprint: string
  ): void {
    const projectId = this.getProjectId(projectRoot);
    const now = Date.now();
    
    this.db
      .prepare(`
        INSERT OR REPLACE INTO analytics_cache
        (project_id, algorithm, result_json, graph_fingerprint, computed_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(projectId, algorithm, JSON.stringify(results), fingerprint, now);
  }

  /**
   * Get cached analytics results if fingerprint matches.
   */
  getAnalyticsCache(
    projectRoot: string,
    algorithm: string,
    fingerprint: string
  ): unknown | null {
    const projectId = this.getProjectId(projectRoot);
    
    try {
      const row = this.db
        .prepare(`
          SELECT result_json, graph_fingerprint
          FROM analytics_cache
          WHERE project_id = ? AND algorithm = ?
        `)
        .get(projectId, algorithm) as { result_json: string; graph_fingerprint: string } | undefined;

      if (!row) return null;
      
      // Check if fingerprint matches
      if (row.graph_fingerprint !== fingerprint) return null;
      
      return JSON.parse(row.result_json);
    } catch {
      return null;
    }
  }

  /**
   * Convert a database row to a GraphNode.
   */
  private rowToGraphNode(
    row: {
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
      semantic_path: string | null;
      namespace: string | null;
      hierarchy_label: string | null;
      semantic_role: string | null;
      community_id: number | null;
      importance_score: number;
      created_at: number;
      updated_at: number;
    },
    projectId: string,
  ): GraphNode {
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

    // Restore semantic fields
    node.semanticPath = row.semantic_path || undefined;
    node.namespace = row.namespace || undefined;
    node.hierarchyLabel = row.hierarchy_label || undefined;
    node.semanticRole = row.semantic_role || undefined;
    node.communityId = row.community_id || undefined;
    node.importanceScore = row.importance_score || 0;

    node.provenance = this.getProvenanceFor(
      row.id,
      projectId,
      row.created_at,
      row.updated_at,
    );

    return node;
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
}
