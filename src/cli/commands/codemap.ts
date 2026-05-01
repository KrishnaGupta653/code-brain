/**
 * code-brain codemap command
 * 
 * Generates CODEMAP.md - a persistent, human+AI readable wiki of the codebase.
 */

import { SQLiteStorage } from '../../storage/index.js';
import { CodemapGenerator } from '../../codemap/generator.js';
import { getDbPath, logger } from '../../utils/index.js';

interface CodemapCommandOptions {
  quiet?: boolean;
}

export async function codemapCommand(
  projectRoot: string,
  options: CodemapCommandOptions = {}
): Promise<void> {
  let storage: SQLiteStorage | null = null;
  try {
    storage = new SQLiteStorage(getDbPath(projectRoot));

    if (!options.quiet) {
      logger.info('Generating CODEMAP.md...');
    }

    const generator = new CodemapGenerator(storage, projectRoot);
    const markdown = await generator.generate(options);
    await generator.save(markdown);

    if (!options.quiet) {
      logger.success(`CODEMAP.md generated at ${projectRoot}/CODEMAP.md`);
      logger.info('Commit this file to git so AI agents can read it instantly.');
    }
  } catch (error) {
    logger.error('Failed to generate CODEMAP.md', error);
    throw error;
  } finally {
    storage?.close();
  }
}
