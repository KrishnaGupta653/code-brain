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
  languages: [
    'typescript',
    'javascript',
    'java',
    'python',
    'go',
    'rust',
    'c',
    'cpp',
    'ruby',
    'php',
    'shell',
    'other',
  ],
  enableAnalytics: true,
  maxTokensExport: 8000
};

export class ConfigLoader {
  static load(source: ConfigSource): CodeBrainConfig {
    return {
      ...DEFAULT_CONFIG,
      ...source
    };
  }

  static validate(config: CodeBrainConfig): boolean {
    if (!config.projectRoot) {
      throw new Error('projectRoot is required');
    }
    if (!Array.isArray(config.include)) {
      throw new Error('include must be an array');
    }
    if (!Array.isArray(config.exclude)) {
      throw new Error('exclude must be an array');
    }
    if (!Array.isArray(config.languages)) {
      throw new Error('languages must be an array');
    }
    return true;
  }
}
