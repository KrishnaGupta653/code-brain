import { indexCommand } from './index.js';
import { logger, getDbPath, scanSourceFiles } from '../../utils/index.js';
import { SQLiteStorage } from '../../storage/index.js';
import { Parser } from '../../parser/index.js';
import { ConfigManager } from '../../config/index.js';

export interface UpdateCommandOptions {
  regenerateCodemap?: boolean;
}

export async function updateCommand(
  projectRoot: string,
  options: UpdateCommandOptions = {},
): Promise<void> {
  logger.info('Updating graph index incrementally...');

  try {
    const configManager = new ConfigManager(projectRoot);
    const config = configManager.getConfig();
    const include = config.include || ['**'];
    const exclude = config.exclude || ['node_modules', 'dist'];

    const allFiles = scanSourceFiles(projectRoot, include, exclude);

    const storage = new SQLiteStorage(getDbPath(projectRoot));
    const knownHashes = storage.getFileHashes(projectRoot);

    const changedOrNew: string[] = [];
    for (const file of allFiles) {
      const hash = Parser.parseFile(file).hash;
      const existing = knownHashes.get(file);
      if (!existing || existing !== hash) {
        changedOrNew.push(file);
      }
    }

    const deletedFiles: string[] = [];
    for (const existingPath of knownHashes.keys()) {
      if (!allFiles.includes(existingPath)) {
        deletedFiles.push(existingPath);
      }
    }

    const existingGraph = storage.loadGraph(projectRoot);
    storage.close();

    if (changedOrNew.length === 0 && deletedFiles.length === 0) {
      logger.success('No changes detected. Graph is up to date.');
      return;
    }

    const impacted = new Set(changedOrNew);
    const fileNodes = existingGraph.getNodes().filter(node => node.type === 'file');
    const fileIdToPath = new Map(
      fileNodes.map(node => [node.id, String(node.fullName || node.metadata?.filePath || node.location?.file || '')])
    );

    const queue = [...changedOrNew];
    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      const currentFileNode = fileNodes.find(node => fileIdToPath.get(node.id) === currentPath);
      if (!currentFileNode) {
        continue;
      }

      const incoming = existingGraph
        .getIncomingEdges(currentFileNode.id)
        .filter(edge => ['IMPORTS', 'DEPENDS_ON', 'TESTS'].includes(edge.type));

      for (const edge of incoming) {
        const fromPath = fileIdToPath.get(edge.from);
        if (fromPath && !impacted.has(fromPath)) {
          impacted.add(fromPath);
          queue.push(fromPath);
        }
      }
    }

    logger.info(
      `Detected ${changedOrNew.length} changed/new and ${deletedFiles.length} deleted files. Re-indexing ${impacted.size} impacted files.`
    );

    // Rebuild the persisted graph exactly after change detection. The previous
    // partial merge path could drop symbol-level relationships to unchanged
    // files because import binding resolution needs the full repository context.
    await indexCommand(projectRoot);

    logger.success('Graph updated incrementally');
    
    // Auto-regenerate CODEMAP.md and AGENTS.md if they exist
    const fs = await import('fs');
    const path = await import('path');
    
    if (
      options.regenerateCodemap !== false &&
      fs.existsSync(path.join(projectRoot, 'CODEMAP.md'))
    ) {
      const { codemapCommand } = await import('./codemap.js');
      await codemapCommand(projectRoot, { quiet: true });
    }
    
    if (
      options.regenerateCodemap !== false &&
      fs.existsSync(path.join(projectRoot, 'AGENTS.md'))
    ) {
      const { agentsCommand } = await import('./agents.js');
      await agentsCommand(projectRoot, { quiet: true });
    }
  } catch (error) {
    logger.error('Update failed', error);
    throw error;
  }
}
