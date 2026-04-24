import fs from 'fs';
import path from 'path';
import { CodeBrainConfig } from '../types/models.js';
import { ConfigLoader, DEFAULT_CONFIG } from './types.js';

export class ConfigManager {
  private config: CodeBrainConfig;

  constructor(projectRoot: string) {
    this.config = {
      ...DEFAULT_CONFIG,
      projectRoot
    };
    this.loadFromFile(projectRoot);
  }

  private loadFromFile(projectRoot: string): void {
    const configPath = path.join(projectRoot, '.codebrainrc.json');
    if (fs.existsSync(configPath)) {
      try {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const fileConfig = JSON.parse(fileContent);
        this.config = ConfigLoader.load({
          projectRoot,
          ...fileConfig
        });
        ConfigLoader.validate(this.config);
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}:`, error);
      }
    }
  }

  getConfig(): CodeBrainConfig {
    return this.config;
  }

  saveConfig(): void {
    const configPath = path.join(this.config.projectRoot, '.codebrainrc.json');
    const { projectRoot, ...configToSave } = this.config;
    void projectRoot;
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf-8');
  }

  updateConfig(updates: Partial<CodeBrainConfig>): void {
    this.config = {
      ...this.config,
      ...updates
    };
    ConfigLoader.validate(this.config);
  }
}

export { ConfigLoader, DEFAULT_CONFIG };
