import fs from 'fs';
import path from 'path';
import { SQLiteStorage } from '../../storage/index.js';
import { logger, getDbPath, getCodeBrainDir } from '../../utils/index.js';
import { ProjectMetadata } from '../../types/models.js';
import { DEFAULT_CONFIG } from '../../config/index.js';

export async function initCommand(projectRoot: string): Promise<void> {
  logger.info(`Initializing code-brain for: ${projectRoot}`);

  const codebrainDir = getCodeBrainDir(projectRoot);
  fs.mkdirSync(codebrainDir, { recursive: true });

  const configPath = path.join(projectRoot, '.codebrainrc.json');
  const defaultConfig = {
    ...DEFAULT_CONFIG,
    projectRoot: undefined
  };

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }

  const dbPath = getDbPath(projectRoot);
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
  logger.info(`Config file: ${configPath}`);
  logger.info(`Run 'code-brain index' to start indexing`);
}
