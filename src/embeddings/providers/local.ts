/**
 * Local Embedding Provider (Ollama)
 * 
 * Uses Ollama REST API for local, zero-cost embeddings
 * Default model: nomic-embed-text (768 dimensions, fast)
 */

import { EmbeddingProvider } from '../provider.js';
import { logger } from '../../utils/logger.js';

export interface LocalEmbeddingConfig {
  model?: string;
  baseUrl?: string;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions: number;
  model: string;
  private baseUrl: string;

  constructor(config: LocalEmbeddingConfig = {}) {
    this.model = config.model || 'nomic-embed-text';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    
    // Set dimensions based on model
    // nomic-embed-text: 768, mxbai-embed-large: 1024, etc.
    if (this.model === 'nomic-embed-text') {
      this.dimensions = 768;
    } else if (this.model === 'mxbai-embed-large') {
      this.dimensions = 1024;
    } else {
      this.dimensions = 768; // default
    }
  }

  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    const results: Float32Array[] = [];

    // Ollama API processes one text at a time
    for (const text of texts) {
      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            prompt: text,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const data = (await response.json()) as { embedding: number[] };
        results.push(new Float32Array(data.embedding));
      } catch (error) {
        logger.error(`Failed to generate embedding for text: ${text.slice(0, 50)}...`, error);
        // Return zero vector on error to maintain batch consistency
        results.push(new Float32Array(this.dimensions));
      }
    }

    return results;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
      });

      if (!response.ok) {
        return false;
      }

      // Check if the model is available
      const modelsResponse = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (!modelsResponse.ok) {
        return false;
      }

      const modelsData = (await modelsResponse.json()) as {
        models: Array<{ name: string }>;
      };

      const modelAvailable = modelsData.models.some(
        (m) => m.name === this.model || m.name.startsWith(this.model + ':')
      );

      if (!modelAvailable) {
        logger.warn(
          `Ollama model '${this.model}' not found. Run: ollama pull ${this.model}`
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.debug('Ollama availability check failed', error);
      return false;
    }
  }

  getMaxBatchSize(): number {
    return 1; // Ollama processes one at a time
  }
}
