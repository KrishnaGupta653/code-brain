/**
 * Anthropic/Voyage AI Embedding Provider
 * 
 * Uses Voyage AI (Anthropic's embedding partner) for code embeddings
 * Model: voyage-code-2 (1536 dimensions, optimized for code)
 */

import { EmbeddingProvider } from '../provider.js';
import { logger } from '../../utils/logger.js';

export interface AnthropicEmbeddingConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class AnthropicEmbeddingProvider implements EmbeddingProvider {
  name = 'anthropic';
  dimensions = 1536;
  model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AnthropicEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'voyage-code-2';
    this.baseUrl = config.baseUrl || 'https://api.voyageai.com/v1';
    
    // Adjust dimensions based on model
    if (this.model === 'voyage-code-2') {
      this.dimensions = 1536;
    } else if (this.model === 'voyage-2') {
      this.dimensions = 1024;
    }
  }

  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          input_type: 'document', // 'document' for indexing, 'query' for search
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Voyage API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data.map((d) => new Float32Array(d.embedding));
    } catch (error) {
      logger.error('Failed to generate embeddings with Voyage AI', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test with a minimal request
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: ['test'],
          input_type: 'document',
        }),
      });

      return response.status !== 401 && response.status !== 403;
    } catch (error) {
      logger.debug('Voyage AI availability check failed', error);
      return false;
    }
  }

  getMaxBatchSize(): number {
    return 128; // Voyage AI supports up to 128 texts per request
  }
}
