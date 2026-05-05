import { z } from 'zod';
import { CodeBrainConfig } from '../types/models.js';

export interface ConfigSource {
  projectRoot?: string;
  include?: string[];
  exclude?: string[];
  languages?: string[];
  pythonPath?: string;
  dbPath?: string;
  enableAnalytics?: boolean;
  maxTokensExport?: number;
  embeddings?: EmbeddingsConfig;
}

export interface EmbeddingsConfig {
  enabled?: boolean;
  provider?: 'openai' | 'anthropic' | 'local' | 'none';
  model?: string;
  dimensions?: number;
  batchSize?: number;
  apiKey?: string;
  hybridSearch?: HybridSearchConfig;
}

export interface HybridSearchConfig {
  enabled?: boolean;
  bm25Weight?: number;
  vectorWeight?: number;
  fusionMethod?: 'rrf' | 'linear';
}

// Zod schema for validation
export const HybridSearchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  bm25Weight: z.number().min(0).max(1).default(0.5),
  vectorWeight: z.number().min(0).max(1).default(0.5),
  fusionMethod: z.enum(['rrf', 'linear']).default('rrf'),
});

export const EmbeddingsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['openai', 'anthropic', 'local', 'none']).default('none'),
  model: z.string().default('text-embedding-3-small'),
  dimensions: z.number().int().positive().default(1536),
  batchSize: z.number().int().positive().default(100),
  apiKey: z.string().optional(),
  hybridSearch: HybridSearchConfigSchema.optional(),
});

export const ConfigSchema = z.object({
  projectRoot: z.string(),
  include: z.array(z.string()).min(1),
  exclude: z.array(z.string()),
  languages: z.array(z.string()).min(1),
  pythonPath: z.string().optional(),
  dbPath: z.string().optional(),
  enableAnalytics: z.boolean(),
  maxTokensExport: z.number().positive(),
  parserPlugins: z.array(z.string()),
  embeddings: EmbeddingsConfigSchema.optional(),
});

export const DEFAULT_CONFIG: CodeBrainConfig = {
  projectRoot: process.cwd(),
  include: ['**'],
  exclude: [
    'node_modules',
    'dist',
    'build',
    '.git',
    '.codebrain',
    '.codebrain.*',
    '.codebrain.backup.*',
    '.vscode',
    '.idea',
    'coverage',
    '__pycache__',
    '**/__pycache__/**',
    '*.pyc',
    '.pytest_cache',
    '.mypy_cache',
    '*.egg-info',
    '**/*.egg-info/**',
    'venv',
    '.venv',
    'env',
    '.env'
  ],
  languages: ['typescript', 'javascript', 'java', 'python', 'go', 'rust', 'csharp', 'c', 'cpp', 'ruby', 'php', 'kotlin', 'scala', 'elixir', 'haskell'],
  enableAnalytics: false,
  maxTokensExport: 8000,
  parserPlugins: []
};

export class ConfigLoader {
  static load(source: ConfigSource): CodeBrainConfig {
    const config = {
      ...DEFAULT_CONFIG,
      ...source
    };
    
    // Validate with Zod
    try {
      ConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`Config validation failed: ${issues}`);
      }
      throw error;
    }
    
    return config;
  }

  static validate(config: CodeBrainConfig): boolean {
    try {
      ConfigSchema.parse(config);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`Config validation failed: ${issues}`);
      }
      throw error;
    }
  }
}
