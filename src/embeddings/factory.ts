/**
 * Embedding Provider Factory
 * 
 * Creates the appropriate embedding provider based on configuration
 */

import { EmbeddingProvider, EmbeddingConfig } from './provider.js';
import { OpenAIEmbeddingProvider } from './providers/openai.js';
import { logger } from '../utils/logger.js';

/**
 * Create an embedding provider based on configuration
 */
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider | null {
  if (!config.enabled || config.provider === 'none') {
    logger.debug('Embeddings disabled');
    return null;
  }

  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) {
        logger.warn('OpenAI provider selected but no API key provided');
        return null;
      }
      return new OpenAIEmbeddingProvider({
        apiKey: config.apiKey,
        model: config.model,
        dimensions: config.dimensions,
      });

    case 'anthropic':
      logger.warn('Anthropic provider not yet implemented');
      return null;

    case 'local':
      logger.warn('Local embedding provider not yet implemented');
      return null;

    default:
      logger.warn(`Unknown embedding provider: ${config.provider}`);
      return null;
  }
}

/**
 * Get default embedding configuration
 */
export function getDefaultEmbeddingConfig(): EmbeddingConfig {
  return {
    enabled: false,
    provider: 'none',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    batchSize: 100,
  };
}

/**
 * Resolve API key from environment variable if needed
 */
export function resolveApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) {
    return undefined;
  }

  // Check if it's an environment variable reference
  const envVarMatch = apiKey.match(/^\$\{(.+)\}$/);
  if (envVarMatch) {
    const envVarName = envVarMatch[1];
    const resolved = process.env[envVarName];
    if (!resolved) {
      logger.warn(`Environment variable ${envVarName} not set`);
    }
    return resolved;
  }

  return apiKey;
}
