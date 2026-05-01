/**
 * Summary Generator
 * Generates LLM-powered summaries for modules and stores them in the database.
 */

import { GraphModel } from '../graph/model.js';
import { SQLiteStorage } from '../storage/index.js';
import { AnthropicClient, SummaryRequest, SummaryResponse } from './anthropic.js';
import { logger } from '../utils/index.js';
import { GraphNode } from '../types/models.js';

export interface SummaryGeneratorConfig {
  client: AnthropicClient;
  storage: SQLiteStorage;
  projectRoot: string;
  batchSize?: number;
  concurrency?: number;
}

export class SummaryGenerator {
  private client: AnthropicClient;
  private storage: SQLiteStorage;
  private projectRoot: string;
  private batchSize: number;
  private concurrency: number;

  constructor(config: SummaryGeneratorConfig) {
    this.client = config.client;
    this.storage = config.storage;
    this.projectRoot = config.projectRoot;
    this.batchSize = config.batchSize || 50;
    this.concurrency = config.concurrency || 3;
  }

  /**
   * Generate summaries for all modules in the graph.
   */
  async generateAllSummaries(graph: GraphModel): Promise<number> {
    const nodes = graph.getNodes();
    
    // Filter nodes that need summaries (files, modules, classes)
    const targetNodes = nodes.filter(node => 
      ['file', 'module', 'class'].includes(node.type) &&
      !node.summary // Only generate if no summary exists
    );

    if (targetNodes.length === 0) {
      logger.info('No nodes need summaries');
      return 0;
    }

    logger.info(`Generating summaries for ${targetNodes.length} nodes`);

    let generated = 0;
    
    // Process in batches
    for (let i = 0; i < targetNodes.length; i += this.batchSize) {
      const batch = targetNodes.slice(i, i + this.batchSize);
      const requests = batch.map(node => this.buildSummaryRequest(node, graph));
      
      try {
        const summaries = await this.client.generateBatchSummaries(requests, this.concurrency);
        
        // Store summaries in database
        for (const [moduleName, summary] of summaries) {
          const node = batch.find(n => n.name === moduleName || n.fullName === moduleName);
          if (node) {
            this.storage.saveSummary(this.projectRoot, node.id, summary.summary, {
              purpose: summary.purpose,
              keyPoints: summary.keyPoints,
              usage: summary.usage,
              tokens: summary.tokens,
              generatedAt: Date.now(),
            });
            generated++;
          }
        }
        
        logger.info(`Generated ${summaries.size} summaries (batch ${Math.floor(i / this.batchSize) + 1})`);
      } catch (error) {
        logger.error(`Failed to generate batch summaries:`, error);
      }
    }

    return generated;
  }

  /**
   * Generate summary for a specific node.
   */
  async generateSummary(node: GraphNode, graph: GraphModel): Promise<SummaryResponse | null> {
    const request = this.buildSummaryRequest(node, graph);
    
    try {
      const summary = await this.client.generateSummary(request);
      
      // Store in database
      this.storage.saveSummary(this.projectRoot, node.id, summary.summary, {
        purpose: summary.purpose,
        keyPoints: summary.keyPoints,
        usage: summary.usage,
        tokens: summary.tokens,
        generatedAt: Date.now(),
      });
      
      return summary;
    } catch (error) {
      logger.error(`Failed to generate summary for ${node.name}:`, error);
      return null;
    }
  }

  /**
   * Regenerate summaries for nodes that have changed.
   */
  async regenerateStale(graph: GraphModel, maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const nodes = graph.getNodes();
    const now = Date.now();
    
    // Find nodes with stale summaries
    const staleNodes = nodes.filter(node => {
      if (!['file', 'module', 'class'].includes(node.type)) {
        return false;
      }
      
      const summaryMeta = this.storage.getSummary(this.projectRoot, node.id);
      if (!summaryMeta) {
        return true; // No summary exists
      }
      
      const generatedAt = (summaryMeta as any).generatedAt || 0;
      return now - generatedAt > maxAge;
    });

    if (staleNodes.length === 0) {
      logger.info('No stale summaries found');
      return 0;
    }

    logger.info(`Regenerating ${staleNodes.length} stale summaries`);

    let regenerated = 0;
    
    for (let i = 0; i < staleNodes.length; i += this.batchSize) {
      const batch = staleNodes.slice(i, i + this.batchSize);
      const requests = batch.map(node => this.buildSummaryRequest(node, graph));
      
      try {
        const summaries = await this.client.generateBatchSummaries(requests, this.concurrency);
        
        for (const [moduleName, summary] of summaries) {
          const node = batch.find(n => n.name === moduleName || n.fullName === moduleName);
          if (node) {
            this.storage.saveSummary(this.projectRoot, node.id, summary.summary, {
              purpose: summary.purpose,
              keyPoints: summary.keyPoints,
              usage: summary.usage,
              tokens: summary.tokens,
              generatedAt: Date.now(),
            });
            regenerated++;
          }
        }
      } catch (error) {
        logger.error(`Failed to regenerate batch summaries:`, error);
      }
    }

    return regenerated;
  }

  /**
   * Build summary request from graph node.
   */
  private buildSummaryRequest(node: GraphNode, graph: GraphModel): SummaryRequest {
    const request: SummaryRequest = {
      moduleName: node.fullName || node.name,
      moduleType: node.type as any,
    };

    // Add code snippet if available
    if (node.location?.text) {
      request.code = node.location.text;
    }

    // Add child symbols
    const children = graph.getOutgoingEdges(node.id)
      .filter(edge => edge.type === 'DEFINES' || edge.type === 'OWNS')
      .map(edge => graph.getNode(edge.to))
      .filter((n): n is GraphNode => n !== null);

    if (children.length > 0) {
      request.symbols = children.map(child => ({
        name: child.name,
        type: child.type,
        signature: child.metadata?.signature as string | undefined,
      }));
    }

    // Add dependencies
    const imports = graph.getOutgoingEdges(node.id)
      .filter(edge => edge.type === 'IMPORTS')
      .map(edge => graph.getNode(edge.to))
      .filter((n): n is GraphNode => n !== null)
      .map(n => n.name);

    if (imports.length > 0) {
      request.dependencies = imports;
    }

    // Add exports
    const exports = graph.getOutgoingEdges(node.id)
      .filter(edge => edge.type === 'EXPORTS')
      .map(edge => graph.getNode(edge.to))
      .filter((n): n is GraphNode => n !== null)
      .map(n => n.name);

    if (exports.length > 0) {
      request.exports = exports;
    }

    return request;
  }
}
