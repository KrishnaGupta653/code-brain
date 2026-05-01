/**
 * code-brain agents command
 * 
 * Generates AGENTS.md - model-agnostic agent instructions file.
 */

import { SQLiteStorage } from '../../storage/index.js';
import { AgentsGenerator } from '../../codemap/agents-generator.js';
import { getDbPath, logger } from '../../utils/index.js';

interface AgentsCommandOptions {
  quiet?: boolean;
  validate?: boolean;
}

export async function agentsCommand(
  projectRoot: string,
  options: AgentsCommandOptions = {}
): Promise<void> {
  let storage: SQLiteStorage | null = null;
  try {
    storage = new SQLiteStorage(getDbPath(projectRoot));

    if (!options.quiet) {
      logger.info('Generating AGENTS.md...');
    }

    const generator = new AgentsGenerator(storage, projectRoot);
    const markdown = await generator.generate(options);
    if (options.validate) {
      process.stdout.write(`${markdown}\n`);
    } else {
      await generator.save(markdown);
    }

    if (!options.quiet) {
      logger.success(
        options.validate
          ? "AGENTS.md validation output generated"
          : `AGENTS.md generated at ${projectRoot}/AGENTS.md`,
      );
      logger.info('Commit this file to git. All AI agent frameworks will read it.');
    }
  } catch (error) {
    logger.error('Failed to generate AGENTS.md', error);
    throw error;
  } finally {
    storage?.close();
  }
}
