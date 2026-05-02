/**
 * Embedding Generator
 * 
 * Generates and manages embeddings for code nodes
 */

import { EmbeddingProvider } from './provider.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { GraphNode } from '../types/models.js';
import { logger } from '../utils/logger.js';

export interface EmbeddingGeneratorConfig {
  provider: EmbeddingProvider;
  storage: SQLiteStorage;
  projectRoot: string;
  batchSize?: number;
  version?: number;
}

export interface GenerationProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
}

export class EmbeddingGenerator {
  private provider: EmbeddingProvider;
  private storage: SQLiteStorage;
  private projectRoot: string;
  private batchSize: number;
  private version: number;

  constructor(config: EmbeddingGeneratorConfig) {
    this.provider = config.provider;
    this.storage = config.storage;
    this.projectRoot = config.projectRoot;
    this.batchSize = config.batchSize || 100;
    this.version = config.version || 1;
  }

  /**
   * Generate embeddings for all nodes that don't have them
   */
  async generateMissingEmbeddings(
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<GenerationProgress> {
    // Get nodes without embeddings
    const nodeIds = this.storage.getNodesWithoutEmbeddings(
      this.projectRoot,
      this.provider.model,
      this.version
    );

    if (nodeIds.length === 0) {
      logger.info('All nodes already have embeddings');
      return { total: 0, completed: 0, failed: 0, skipped: 0 };
    }

    logger.info(`Generating embeddings for ${nodeIds.length} nodes...`);

    const progress: GenerationProgress = {
      total: nodeIds.length,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    // Process in batches
    for (let i = 0; i < nodeIds.length; i += this.batchSize) {
      const batch = nodeIds.slice(i, i + this.batchSize);
      
      try {
        await this.processBatch(batch);
        progress.completed += batch.length;
      } catch (error) {
        logger.error(`Failed to process batch ${i / this.batchSize + 1}`, error);
        progress.failed += batch.length;
      }

      if (onProgress) {
        onProgress(progress);
      }
    }

    logger.success(
      `Generated ${progress.completed} embeddings, ${progress.failed} failed`
    );

    return progress;
  }

  /**
   * Update embeddings for specific nodes
   */
  async updateEmbeddings(
    nodeIds: string[],
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<GenerationProgress> {
    if (nodeIds.length === 0) {
      return { total: 0, completed: 0, failed: 0, skipped: 0 };
    }

    logger.info(`Updating embeddings for ${nodeIds.length} nodes...`);

    const progress: GenerationProgress = {
      total: nodeIds.length,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    // Process in batches
    for (let i = 0; i < nodeIds.length; i += this.batchSize) {
      const batch = nodeIds.slice(i, i + this.batchSize);
      
      try {
        await this.processBatch(batch);
        progress.completed += batch.length;
      } catch (error) {
        logger.error(`Failed to process batch ${i / this.batchSize + 1}`, error);
        progress.failed += batch.length;
      }

      if (onProgress) {
        onProgress(progress);
      }
    }

    logger.success(
      `Updated ${progress.completed} embeddings, ${progress.failed} failed`
    );

    return progress;
  }

  /**
   * Process a batch of nodes
   */
  private async processBatch(nodeIds: string[]): Promise<void> {
    // Load graph to get nodes
    const graph = this.storage.loadGraph(this.projectRoot);
    
    // Get nodes from graph
    const nodes: GraphNode[] = [];
    for (const nodeId of nodeIds) {
      const node = graph.getNode(nodeId);
      if (node) {
        nodes.push(node);
      }
    }

    if (nodes.length === 0) {
      return;
    }

    // Prepare text representations
    const texts = nodes.map(node => this.prepareNodeText(node));

    // Generate embeddings
    const embeddings = await this.provider.generateEmbeddings(texts);

    // Save to storage
    const records = nodes.map((node, index) => ({
      nodeId: node.id,
      embedding: embeddings[index],
      model: this.provider.model,
      version: this.version,
    }));

    this.storage.saveEmbeddings(records);
  }

  /**
   * Prepare text representation of a node for embedding
   * 
   * Combines multiple fields to create a rich text representation:
   * - Node type and name
   * - Full qualified name
   * - Summary/documentation
   * - File path context
   * - Code snippet (if available)
   */
  private prepareNodeText(node: GraphNode): string {
    const parts: string[] = [];

    // Type and name
    parts.push(`${node.type}: ${node.name}`);

    // Full name for context
    if (node.fullName && node.fullName !== node.name) {
      parts.push(`Full name: ${node.fullName}`);
    }

    // Summary/documentation
    if (node.summary) {
      parts.push(`Description: ${node.summary}`);
    }

    // File path for context
    if (node.location?.file) {
      const relativePath = node.location.file.replace(this.projectRoot, '');
      parts.push(`Location: ${relativePath}`);
    }

    // Metadata
    if (node.metadata) {
      // Add relevant metadata fields
      if (node.metadata.params) {
        parts.push(`Parameters: ${JSON.stringify(node.metadata.params)}`);
      }
      if (node.metadata.returnType) {
        parts.push(`Returns: ${node.metadata.returnType}`);
      }
      if (node.metadata.owner) {
        parts.push(`Owner: ${node.metadata.owner}`);
      }
    }

    // Semantic path for hierarchy context
    if (node.metadata?.semanticPath) {
      parts.push(`Path: ${node.metadata.semanticPath}`);
    }

    return parts.join('\n');
  }

  /**
   * Get generation statistics
   */
  getStats(): {
    totalNodes: number;
    nodesWithEmbeddings: number;
    nodesWithoutEmbeddings: number;
    models: Array<{ model: string; count: number }>;
    totalSize: number;
  } {
    return this.storage.getEmbeddingStats(this.projectRoot);
  }

  /**
   * Clear all embeddings for the project
   */
  clearEmbeddings(): void {
    logger.info('Clearing all embeddings...');
    this.storage.deleteAllEmbeddings(this.projectRoot);
    logger.success('All embeddings cleared');
  }
}
