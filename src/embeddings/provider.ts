/**
 * Embedding Provider Interface
 * 
 * Defines the contract for embedding providers (OpenAI, Anthropic, local models, etc.)
 */

export interface EmbeddingProvider {
  /** Provider name (e.g., 'openai', 'anthropic', 'local') */
  name: string;
  
  /** Embedding vector dimensions */
  dimensions: number;
  
  /** Model identifier */
  model: string;
  
  /**
   * Generate embeddings for a batch of texts
   * @param texts Array of text strings to embed
   * @returns Array of embedding vectors (Float32Array)
   */
  generateEmbeddings(texts: string[]): Promise<Float32Array[]>;
  
  /**
   * Check if provider is available and properly configured
   * @returns true if provider can be used
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get the maximum batch size supported by this provider
   */
  getMaxBatchSize(): number;
}

export interface EmbeddingConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'local' | 'none';
  model: string;
  dimensions: number;
  batchSize: number;
  apiKey?: string;
}

/**
 * Embedding record stored in database
 */
export interface EmbeddingRecord {
  nodeId: string;
  embedding: Float32Array;
  embeddingModel: string;
  embeddingVersion: number;
  dimensions: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Result from vector similarity search
 */
export interface VectorSearchResult {
  nodeId: string;
  score: number;  // Cosine similarity score (0-1)
  rank: number;
}

/**
 * Serialize Float32Array to Buffer for SQLite storage
 */
export function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Deserialize Buffer to Float32Array from SQLite
 */
export function deserializeEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

/**
 * Compute cosine similarity between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Similarity score (0-1, where 1 is identical)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }
  
  return dotProduct / denominator;
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  
  if (norm === 0) {
    return vector;
  }
  
  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = vector[i] / norm;
  }
  
  return normalized;
}
