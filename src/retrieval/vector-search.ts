/**
 * Vector Search Engine
 * 
 * Performs similarity search using vector embeddings.
 * Supports two modes:
 * 1. sqlite-vec extension (O(log n) with HNSW index) - FAST
 * 2. Fallback O(n) scan (when sqlite-vec not available) - SLOW
 */

import { SQLiteStorage } from '../storage/sqlite.js';
import { EmbeddingProvider, cosineSimilarity } from '../embeddings/provider.js';
import { logger } from '../utils/logger.js';

export interface VectorSearchResult {
  nodeId: string;
  score: number;  // Cosine similarity (0-1)
  rank: number;
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;  // Minimum similarity score
  nodeTypes?: string[];  // Filter by node types
}

/**
 * Check if sqlite-vec extension is available
 */
function checkSqliteVecAvailable(storage: SQLiteStorage): boolean {
  try {
    // Try to load the vec0 module
    const db = (storage as any).db;
    if (!db) return false;
    
    // Check if vec0 virtual table module is available
    const result = db.prepare("SELECT 1 FROM pragma_module_list WHERE name = 'vec0'").get();
    return result !== undefined;
  } catch {
    return false;
  }
}

export class VectorSearchEngine {
  private storage: SQLiteStorage;
  private provider: EmbeddingProvider;
  private projectRoot: string;
  private useSqliteVec: boolean;
  private vecTableInitialized: boolean = false;

  constructor(
    storage: SQLiteStorage,
    provider: EmbeddingProvider,
    projectRoot: string
  ) {
    this.storage = storage;
    this.provider = provider;
    this.projectRoot = projectRoot;
    this.useSqliteVec = checkSqliteVecAvailable(storage);
    
    if (this.useSqliteVec) {
      logger.info('sqlite-vec extension detected - using HNSW index for O(log n) search');
      this.initializeVecTable();
    } else {
      logger.warn('sqlite-vec extension not available - falling back to O(n) scan. Install sqlite-vec for better performance.');
    }
  }

  /**
   * Initialize vec0 virtual table for HNSW indexing
   */
  private initializeVecTable(): void {
    try {
      const db = (this.storage as any).db;
      if (!db) return;

      // Check if vec_embeddings table exists (created by migration v14)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_embeddings'").all();
      this.vecTableInitialized = tables.length > 0;
      
      if (this.vecTableInitialized) {
        logger.debug('vec_embeddings table found - using for fast vector search');
      } else {
        logger.debug('vec_embeddings table not found - will use full scan');
        this.useSqliteVec = false;
      }
    } catch (error) {
      logger.warn(`Failed to check vec_embeddings table: ${error}`);
      this.useSqliteVec = false;
    }
  }

  /**
   * Sync embeddings to vec0 table (called after embedding generation)
   */
  syncToVecTable(): void {
    // No longer needed - embeddings are synced automatically in saveEmbedding
    logger.debug('syncToVecTable called - embeddings are synced automatically');
  }

  /**
   * Search using sqlite-vec HNSW index (O(log n))
   */
  private async searchWithSqliteVec(
    queryEmbedding: Float32Array,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const limit = options.limit || 20;
    const threshold = options.threshold || 0.0;

    try {
      const db = (this.storage as any).db;
      if (!db) throw new Error('Database not available');

      // Convert query embedding to buffer for vec_f32
      const buffer = Buffer.from(queryEmbedding.buffer);

      // Use vec_embeddings table with KNN search
      const sql = `
        SELECT 
          node_id,
          distance
        FROM vec_embeddings
        WHERE embedding MATCH vec_f32(?)
          AND k = ?
        ORDER BY distance
      `;

      const rows = db.prepare(sql).all(buffer, limit * 2);

      const results: VectorSearchResult[] = rows
        .map((row: any, index: number) => ({
          nodeId: row.node_id,
          score: Math.max(0, 1.0 - row.distance), // Convert distance to similarity
          rank: index + 1,
        }))
        .filter((r: VectorSearchResult) => r.score >= threshold)
        .slice(0, limit);

      logger.debug(`sqlite-vec KNN search found ${results.length} results`);
      return results;
    } catch (error) {
      logger.warn(`sqlite-vec search failed: ${error}, falling back to O(n) scan`);
      return this.searchWithFullScan(queryEmbedding, options);
    }
  }

  /**
   * Search using full O(n) scan (fallback)
   */
  private async searchWithFullScan(
    queryEmbedding: Float32Array,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const limit = options.limit || 20;
    const threshold = options.threshold || 0.0;

    // Get embeddings with optional pre-filtering by node type
    // This reduces the search space significantly (5-10× speedup)
    const allEmbeddings = options.nodeTypes && options.nodeTypes.length > 0
      ? this.storage.getEmbeddingsByNodeTypes(this.projectRoot, options.nodeTypes)
      : this.storage.getAllEmbeddings(this.projectRoot);

    if (allEmbeddings.length === 0) {
      logger.warn('No embeddings found in database');
      return [];
    }

    logger.debug(`O(n) scan: searching ${allEmbeddings.length} embeddings (filtered: ${options.nodeTypes ? 'yes' : 'no'})`);

    // Compute similarities
    const similarities: Array<{ nodeId: string; score: number }> = [];

    for (const item of allEmbeddings) {
      try {
        const score = cosineSimilarity(queryEmbedding, item.embedding);
        
        if (score >= threshold) {
          similarities.push({
            nodeId: item.nodeId,
            score,
          });
        }
      } catch (error) {
        logger.debug(`Failed to compute similarity for node ${item.nodeId}: ${error}`);
      }
    }

    // Sort by score descending
    similarities.sort((a, b) => b.score - a.score);

    // Take top-k
    const topK = similarities.slice(0, limit);

    // Add ranks
    const results: VectorSearchResult[] = topK.map((item, index) => ({
      nodeId: item.nodeId,
      score: item.score,
      rank: index + 1,
    }));

    logger.debug(`O(n) scan found ${results.length} results (threshold: ${threshold})`);

    return results;
  }

  /**
   * Search for nodes similar to a query text
   */
  async search(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    // Generate embedding for query
    const queryEmbeddings = await this.provider.generateEmbeddings([query]);
    if (queryEmbeddings.length === 0) {
      logger.warn('Failed to generate query embedding');
      return [];
    }

    const queryEmbedding = queryEmbeddings[0];

    // Use sqlite-vec if available, otherwise fall back to O(n) scan
    if (this.useSqliteVec && this.vecTableInitialized) {
      return this.searchWithSqliteVec(queryEmbedding, options);
    } else {
      return this.searchWithFullScan(queryEmbedding, options);
    }
  }

  /**
   * Find similar nodes to a given node
   */
  async findSimilar(
    nodeId: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    // Get embedding for the node
    const nodeEmbedding = this.storage.getEmbedding(nodeId);
    if (!nodeEmbedding) {
      logger.warn(`No embedding found for node ${nodeId}`);
      return [];
    }

    // Use sqlite-vec if available, otherwise fall back to O(n) scan
    if (this.useSqliteVec && this.vecTableInitialized) {
      const results = await this.searchWithSqliteVec(nodeEmbedding.embedding, options);
      // Filter out the query node itself
      return results.filter(r => r.nodeId !== nodeId);
    } else {
      return this.findSimilarWithFullScan(nodeId, nodeEmbedding.embedding, options);
    }
  }

  /**
   * Find similar nodes using O(n) scan (fallback)
   */
  private async findSimilarWithFullScan(
    nodeId: string,
    nodeEmbedding: Float32Array,
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const limit = options.limit || 20;
    const threshold = options.threshold || 0.0;

    // Get all embeddings
    const allEmbeddings = this.storage.getAllEmbeddings(this.projectRoot);

    // Compute similarities
    const similarities: Array<{ nodeId: string; score: number }> = [];

    for (const item of allEmbeddings) {
      // Skip the query node itself
      if (item.nodeId === nodeId) {
        continue;
      }

      try {
        const score = cosineSimilarity(nodeEmbedding, item.embedding);
        
        if (score >= threshold) {
          similarities.push({
            nodeId: item.nodeId,
            score,
          });
        }
      } catch (error) {
        logger.debug(`Failed to compute similarity for node ${item.nodeId}: ${error}`);
      }
    }

    // Sort by score descending
    similarities.sort((a, b) => b.score - a.score);

    // Take top-k
    const topK = similarities.slice(0, limit);

    // Add ranks
    const results: VectorSearchResult[] = topK.map((item, index) => ({
      nodeId: item.nodeId,
      score: item.score,
      rank: index + 1,
    }));

    logger.debug(`Found ${results.length} similar nodes to ${nodeId}`);

    return results;
  }

  /**
   * Batch search for multiple queries
   */
  async batchSearch(
    queries: string[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[][]> {
    const results: VectorSearchResult[][] = [];

    for (const query of queries) {
      const queryResults = await this.search(query, options);
      results.push(queryResults);
    }

    return results;
  }

  /**
   * Get statistics about the vector search index
   */
  getStats(): {
    totalEmbeddings: number;
    dimensions: number;
    model: string;
    usingSqliteVec: boolean;
    searchComplexity: string;
  } {
    const stats = this.storage.getEmbeddingStats(this.projectRoot);
    
    return {
      totalEmbeddings: stats.nodesWithEmbeddings,
      dimensions: this.provider.dimensions,
      model: this.provider.model,
      usingSqliteVec: this.useSqliteVec && this.vecTableInitialized,
      searchComplexity: this.useSqliteVec && this.vecTableInitialized ? 'O(log n) with HNSW' : 'O(n) full scan',
    };
  }
}
