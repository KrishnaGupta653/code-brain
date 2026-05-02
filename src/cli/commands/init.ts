import fs from 'fs';
import path from 'path';
import { SQLiteStorage } from '../../storage/index.js';
import { logger, getDbPath, getCodeBrainDir } from '../../utils/index.js';
import { ProjectMetadata } from '../../types/models.js';
import { DEFAULT_CONFIG } from '../../config/index.js';

export async function initCommand(projectRoot: string, customDbPath?: string): Promise<void> {
  logger.info(`Initializing code-brain for: ${projectRoot}`);

  // Determine the actual db path
  let dbPath: string;
  if (customDbPath) {
    // Use custom path and ensure it's absolute
    dbPath = path.isAbsolute(customDbPath) 
      ? customDbPath 
      : path.resolve(process.cwd(), customDbPath);
    logger.info(`Using custom database location: ${dbPath}`);
  } else {
    dbPath = getDbPath(projectRoot);
  }

  const codebrainDir = path.dirname(dbPath);
  fs.mkdirSync(codebrainDir, { recursive: true });

  // Try to save config in project directory, fall back to db directory if project is not writable
  const configPath = path.join(projectRoot, '.codebrainrc.json');
  const fallbackConfigPath = path.join(codebrainDir, 'config.json');
  
  const defaultConfig = {
    ...DEFAULT_CONFIG,
    projectRoot: undefined,
    ...(customDbPath ? { dbPath } : {})
  };

  let configSaved = false;
  let actualConfigPath = configPath;

  // Try to write to project directory first
  try {
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      configSaved = true;
    } else if (customDbPath) {
      // Update existing config with new dbPath
      const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      existingConfig.dbPath = dbPath;
      fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
      configSaved = true;
    } else {
      configSaved = true; // Config already exists
    }
  } catch (error) {
    logger.warn(`Cannot write config to project directory (${projectRoot}), using fallback location`);
  }

  // If project directory is not writable, save config next to database
  if (!configSaved) {
    try {
      if (!fs.existsSync(fallbackConfigPath)) {
        fs.writeFileSync(fallbackConfigPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      } else if (customDbPath) {
        const existingConfig = JSON.parse(fs.readFileSync(fallbackConfigPath, 'utf-8'));
        existingConfig.dbPath = dbPath;
        fs.writeFileSync(fallbackConfigPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
      }
      actualConfigPath = fallbackConfigPath;
      logger.info(`Config saved to: ${fallbackConfigPath}`);
    } catch (fallbackError) {
      logger.warn(`Could not save config file: ${fallbackError}`);
    }
  }

  const storage = new SQLiteStorage(dbPath);

  const projectName = path.basename(projectRoot);
  const metadata: ProjectMetadata = {
    name: projectName,
    root: projectRoot,
    language: 'typescript',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fileCount: 0,
    symbolCount: 0,
    edgeCount: 0
  };

  storage.saveProject(metadata);
  storage.close();

  logger.success(`code-brain initialized at ${codebrainDir}`);
  logger.info(`Database: ${dbPath}`);
  if (configSaved || fs.existsSync(actualConfigPath)) {
    logger.info(`Config file: ${actualConfigPath}`);
  }
  logger.info(`Run 'code-brain index --path ${projectRoot}' to start indexing`);
}
