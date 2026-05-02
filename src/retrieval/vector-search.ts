/**
 * Vector Search Engine
 * 
 * Performs similarity search using vector embeddings
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

export class VectorSearchEngine {
  private storage: SQLiteStorage;
  private provider: EmbeddingProvider;
  private projectRoot: string;

  constructor(
    storage: SQLiteStorage,
    provider: EmbeddingProvider,
    projectRoot: string
  ) {
    this.storage = storage;
    this.provider = provider;
    this.projectRoot = projectRoot;
  }

  /**
   * Search for nodes similar to a query text
   */
  async search(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const limit = options.limit || 20;
    const threshold = options.threshold || 0.0;

    // Generate embedding for query
    const queryEmbeddings = await this.provider.generateEmbeddings([query]);
    if (queryEmbeddings.length === 0) {
      logger.warn('Failed to generate query embedding');
      return [];
    }

    const queryEmbedding = queryEmbeddings[0];

    // Get embeddings with optional pre-filtering by node type
    // This reduces the search space significantly (5-10× speedup)
    const allEmbeddings = options.nodeTypes && options.nodeTypes.length > 0
      ? this.storage.getEmbeddingsByNodeTypes(this.projectRoot, options.nodeTypes)
      : this.storage.getAllEmbeddings(this.projectRoot);

    if (allEmbeddings.length === 0) {
      logger.warn('No embeddings found in database');
      return [];
    }

    logger.debug(`Searching ${allEmbeddings.length} embeddings (filtered: ${options.nodeTypes ? 'yes' : 'no'})`);

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

    logger.debug(`Vector search found ${results.length} results (threshold: ${threshold})`);

    return results;
  }

  /**
   * Find similar nodes to a given node
   */
  async findSimilar(
    nodeId: string,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const limit = options.limit || 20;
    const threshold = options.threshold || 0.0;

    // Get embedding for the node
    const nodeEmbedding = this.storage.getEmbedding(nodeId);
    if (!nodeEmbedding) {
      logger.warn(`No embedding found for node ${nodeId}`);
      return [];
    }

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
        const score = cosineSimilarity(nodeEmbedding.embedding, item.embedding);
        
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
  } {
    const stats = this.storage.getEmbeddingStats(this.projectRoot);
    
    return {
      totalEmbeddings: stats.nodesWithEmbeddings,
      dimensions: this.provider.dimensions,
      model: this.provider.model,
    };
  }
}
