/**
 * Hybrid Search Engine
 * 
 * Combines BM25 (keyword) search with vector (semantic) search
 * using Reciprocal Rank Fusion (RRF) or linear combination
 */

import { SQLiteStorage } from '../storage/sqlite.js';
import { VectorSearchEngine, VectorSearchResult } from './vector-search.js';
import { EmbeddingProvider } from '../embeddings/provider.js';
import { GraphNode } from '../types/models.js';
import { logger } from '../utils/logger.js';

export interface HybridSearchResult {
  nodeId: string;
  node?: GraphNode;
  score: number;
  rank: number;
  bm25Score?: number;
  vectorScore?: number;
  bm25Rank?: number;
  vectorRank?: number;
}

export interface HybridSearchConfig {
  bm25Weight?: number;      // Weight for BM25 score (0-1)
  vectorWeight?: number;    // Weight for vector score (0-1)
  fusionMethod?: 'rrf' | 'linear';  // Fusion algorithm
  rrfK?: number;            // RRF constant (default: 60)
}

export interface HybridSearchOptions {
  limit?: number;
  includeNodes?: boolean;   // Include full node objects in results
  bm25Only?: boolean;       // Use only BM25 (fallback)
  vectorOnly?: boolean;     // Use only vector search
}

export class HybridSearchEngine {
  private storage: SQLiteStorage;
  private vectorSearch: VectorSearchEngine | null;
  private projectRoot: string;
  private config: Required<HybridSearchConfig>;

  constructor(
    storage: SQLiteStorage,
    projectRoot: string,
    provider?: EmbeddingProvider,
    config?: HybridSearchConfig
  ) {
    this.storage = storage;
    this.projectRoot = projectRoot;
    
    // Create vector search engine if provider available
    this.vectorSearch = provider
      ? new VectorSearchEngine(storage, provider, projectRoot)
      : null;

    // Default configuration
    this.config = {
      bm25Weight: config?.bm25Weight ?? 0.5,
      vectorWeight: config?.vectorWeight ?? 0.5,
      fusionMethod: config?.fusionMethod ?? 'rrf',
      rrfK: config?.rrfK ?? 60,
    };

    // Normalize weights
    const totalWeight = this.config.bm25Weight + this.config.vectorWeight;
    if (totalWeight > 0) {
      this.config.bm25Weight /= totalWeight;
      this.config.vectorWeight /= totalWeight;
    }
  }

  /**
   * Hybrid search combining BM25 and vector similarity
   */
  async search(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<HybridSearchResult[]> {
    const limit = options.limit || 20;

    // BM25 search
    const bm25Results = this.bm25Search(query, limit * 2);

    // Vector search (if available and not disabled)
    let vectorResults: VectorSearchResult[] = [];
    if (this.vectorSearch && !options.bm25Only) {
      try {
        vectorResults = await this.vectorSearch.search(query, { limit: limit * 2 });
      } catch (error) {
        logger.warn('Vector search failed, falling back to BM25 only', error);
      }
    }

    // If vector-only mode
    if (options.vectorOnly && vectorResults.length > 0) {
      return this.formatVectorResults(vectorResults, limit, options.includeNodes);
    }

    // If no vector results or vector search unavailable, use BM25 only
    if (vectorResults.length === 0) {
      return this.formatBM25Results(bm25Results, limit, options.includeNodes);
    }

    // Fuse results
    const fusedResults = this.fuseResults(bm25Results, vectorResults);

    // Sort by fused score
    fusedResults.sort((a, b) => b.score - a.score);

    // Take top-k
    const topK = fusedResults.slice(0, limit);

    // Add ranks
    topK.forEach((result, index) => {
      result.rank = index + 1;
    });

    // Include full nodes if requested
    if (options.includeNodes) {
      const graph = this.storage.loadGraph(this.projectRoot);
      topK.forEach(result => {
        result.node = graph.getNode(result.nodeId) || undefined;
      });
    }

    logger.debug(
      `Hybrid search: ${bm25Results.length} BM25 + ${vectorResults.length} vector = ${topK.length} results`
    );

    return topK;
  }

  /**
   * BM25 full-text search using FTS5
   */
  private bm25Search(
    query: string,
    limit: number
  ): Array<{ nodeId: string; score: number; rank: number }> {
    try {
      const results = this.storage.searchNodesDetailed(
        this.projectRoot,
        query,
        limit
      );

      return results.map((result, index) => ({
        nodeId: result.nodeId,
        score: result.score,
        rank: index + 1,
      }));
    } catch (error) {
      logger.warn('BM25 search failed', error);
      return [];
    }
  }

  /**
   * Fuse BM25 and vector search results
   */
  private fuseResults(
    bm25Results: Array<{ nodeId: string; score: number; rank: number }>,
    vectorResults: VectorSearchResult[]
  ): HybridSearchResult[] {
    if (this.config.fusionMethod === 'rrf') {
      return this.reciprocalRankFusion(bm25Results, vectorResults);
    } else {
      return this.linearCombination(bm25Results, vectorResults);
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   * 
   * RRF formula: score = sum(1 / (k + rank_i))
   * where k is a constant (typically 60) and rank_i is the rank in list i
   */
  private reciprocalRankFusion(
    bm25Results: Array<{ nodeId: string; score: number; rank: number }>,
    vectorResults: VectorSearchResult[]
  ): HybridSearchResult[] {
    const k = this.config.rrfK;
    const scores = new Map<string, HybridSearchResult>();

    // Process BM25 results
    for (const result of bm25Results) {
      const rrfScore = 1 / (k + result.rank);
      scores.set(result.nodeId, {
        nodeId: result.nodeId,
        score: rrfScore * this.config.bm25Weight,
        rank: 0, // Will be set later
        bm25Score: result.score,
        bm25Rank: result.rank,
      });
    }

    // Process vector results
    for (const result of vectorResults) {
      const rrfScore = 1 / (k + result.rank);
      const existing = scores.get(result.nodeId);
      
      if (existing) {
        // Node appears in both results
        existing.score += rrfScore * this.config.vectorWeight;
        existing.vectorScore = result.score;
        existing.vectorRank = result.rank;
      } else {
        // Node only in vector results
        scores.set(result.nodeId, {
          nodeId: result.nodeId,
          score: rrfScore * this.config.vectorWeight,
          rank: 0,
          vectorScore: result.score,
          vectorRank: result.rank,
        });
      }
    }

    return Array.from(scores.values());
  }

  /**
   * Linear combination of normalized scores
   */
  private linearCombination(
    bm25Results: Array<{ nodeId: string; score: number; rank: number }>,
    vectorResults: VectorSearchResult[]
  ): HybridSearchResult[] {
    const scores = new Map<string, HybridSearchResult>();

    // Normalize BM25 scores (min-max normalization)
    const bm25Scores = bm25Results.map(r => r.score);
    const bm25Min = Math.min(...bm25Scores);
    const bm25Max = Math.max(...bm25Scores);
    const bm25Range = bm25Max - bm25Min || 1;

    // Process BM25 results
    for (const result of bm25Results) {
      const normalizedScore = (result.score - bm25Min) / bm25Range;
      scores.set(result.nodeId, {
        nodeId: result.nodeId,
        score: normalizedScore * this.config.bm25Weight,
        rank: 0,
        bm25Score: result.score,
        bm25Rank: result.rank,
      });
    }

    // Vector scores are already normalized (cosine similarity 0-1)
    for (const result of vectorResults) {
      const existing = scores.get(result.nodeId);
      
      if (existing) {
        // Node appears in both results
        existing.score += result.score * this.config.vectorWeight;
        existing.vectorScore = result.score;
        existing.vectorRank = result.rank;
      } else {
        // Node only in vector results
        scores.set(result.nodeId, {
          nodeId: result.nodeId,
          score: result.score * this.config.vectorWeight,
          rank: 0,
          vectorScore: result.score,
          vectorRank: result.rank,
        });
      }
    }

    return Array.from(scores.values());
  }

  /**
   * Format BM25-only results
   */
  private formatBM25Results(
    bm25Results: Array<{ nodeId: string; score: number; rank: number }>,
    limit: number,
    includeNodes?: boolean
  ): HybridSearchResult[] {
    const results: HybridSearchResult[] = bm25Results.slice(0, limit).map(result => ({
      nodeId: result.nodeId,
      score: result.score,
      rank: result.rank,
      bm25Score: result.score,
      bm25Rank: result.rank,
    }));

    if (includeNodes) {
      const graph = this.storage.loadGraph(this.projectRoot);
      results.forEach(result => {
        result.node = graph.getNode(result.nodeId) || undefined;
      });
    }

    return results;
  }

  /**
   * Format vector-only results
   */
  private formatVectorResults(
    vectorResults: VectorSearchResult[],
    limit: number,
    includeNodes?: boolean
  ): HybridSearchResult[] {
    const results: HybridSearchResult[] = vectorResults.slice(0, limit).map(result => ({
      nodeId: result.nodeId,
      score: result.score,
      rank: result.rank,
      vectorScore: result.score,
      vectorRank: result.rank,
    }));

    if (includeNodes) {
      const graph = this.storage.loadGraph(this.projectRoot);
      results.forEach(result => {
        result.node = graph.getNode(result.nodeId) || undefined;
      });
    }

    return results;
  }

  /**
   * Check if hybrid search is available
   */
  isHybridAvailable(): boolean {
    return this.vectorSearch !== null;
  }

  /**
   * Get search engine statistics
   */
  getStats(): {
    hybridAvailable: boolean;
    bm25Available: boolean;
    vectorAvailable: boolean;
    config: HybridSearchConfig;
  } {
    return {
      hybridAvailable: this.isHybridAvailable(),
      bm25Available: true,
      vectorAvailable: this.vectorSearch !== null,
      config: this.config,
    };
  }
}
