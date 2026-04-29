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
}

// Zod schema for validation
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
    '.vscode',
    '.idea',
    'coverage'
  ],
  languages: ['typescript', 'javascript', 'java'],
  enableAnalytics: true,
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
