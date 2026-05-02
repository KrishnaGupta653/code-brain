/**
 * OpenAI Embedding Provider
 * 
 * Generates embeddings using OpenAI's embedding API
 */

import { EmbeddingProvider } from '../provider.js';
import { logger } from '../../utils/logger.js';

interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions: number;
  model: string;
  
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private maxBatchSize = 2048; // OpenAI limit
  private maxRetries = 3;
  private retryDelay = 1000; // ms

  constructor(config: { apiKey: string; model: string; dimensions: number }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    if (texts.length > this.maxBatchSize) {
      // Split into smaller batches
      const batches: string[][] = [];
      for (let i = 0; i < texts.length; i += this.maxBatchSize) {
        batches.push(texts.slice(i, i + this.maxBatchSize));
      }

      const results: Float32Array[] = [];
      for (const batch of batches) {
        const batchResults = await this.generateEmbeddingsBatch(batch);
        results.push(...batchResults);
      }
      return results;
    }

    return this.generateEmbeddingsBatch(texts);
  }

  private async generateEmbeddingsBatch(texts: string[]): Promise<Float32Array[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            input: texts,
            model: this.model,
            encoding_format: 'float',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json() as OpenAIErrorResponse;
          throw new Error(`OpenAI API error: ${errorData.error.message}`);
        }

        const data = await response.json() as OpenAIEmbeddingResponse;

        // Sort by index to ensure correct order
        const sorted = data.data.sort((a, b) => a.index - b.index);

        // Convert to Float32Array
        const embeddings = sorted.map(item => new Float32Array(item.embedding));

        logger.debug(`Generated ${embeddings.length} embeddings using ${data.usage.total_tokens} tokens`);

        return embeddings;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
          logger.warn(`Embedding generation failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Failed to generate embeddings after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      logger.debug('OpenAI API key not configured');
      return false;
    }

    try {
      // Test with a simple embedding
      await this.generateEmbeddings(['test']);
      return true;
    } catch (error) {
      logger.debug(`OpenAI provider not available: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  getMaxBatchSize(): number {
    return this.maxBatchSize;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
