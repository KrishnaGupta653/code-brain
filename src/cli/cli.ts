import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { indexCommand } from './commands/index.js';
import { updateCommand } from './commands/update.js';
import { graphCommand } from './commands/graph.js';
import { exportCommand } from './commands/export.js';
import { logger } from '../utils/index.js';

export function setupCLI(): Command {
  const program = new Command();

  program
    .name('code-brain')
    .description('Deterministic codebase intelligence system')
    .version('1.0.0');

  program
    .command('init')
    .description('Initialize code-brain for a repository')
    .option('-p, --path <path>', 'Project root path', process.cwd())
    .action(async options => {
      try {
        await initCommand(options.path);
      } catch (error) {
        logger.error('Command failed', error);
        process.exit(1);
      }
    });

  program
    .command('index')
    .description('Index the repository and build the knowledge graph')
    .option('-p, --path <path>', 'Project root path', process.cwd())
    .action(async options => {
      try {
        await indexCommand(options.path);
      } catch (error) {
        logger.error('Command failed', error);
        process.exit(1);
      }
    });

  program
    .command('update')
    .description('Update the graph index with repository changes')
    .option('-p, --path <path>', 'Project root path', process.cwd())
    .action(async options => {
      try {
        await updateCommand(options.path);
      } catch (error) {
        logger.error('Command failed', error);
        process.exit(1);
      }
    });

  program
    .command('graph')
    .description('Start the interactive graph visualization server')
    .option('-p, --path <path>', 'Project root path', process.cwd())
    .option('--port <port>', 'Server port', '3000')
    .action(async options => {
      try {
        await graphCommand(options.path, parseInt(options.port));
      } catch (error) {
        logger.error('Command failed', error);
        process.exit(1);
      }
    });

  program
    .command('export')
    .description('Export the code graph in various formats')
    .option('-p, --path <path>', 'Project root path', process.cwd())
    .option('--format <format>', 'Export format: json, yaml, ai', 'json')
    .option('--focus <module>', 'Focus on specific module or symbol')
    .action(async options => {
      try {
        const output = await exportCommand(
          options.path,
          options.format,
          options.focus
        );
        console.log(output);
      } catch (error) {
        logger.error('Command failed', error);
        process.exit(1);
      }
    });

  program
    .command('help')
    .description('Show help')
    .action(() => {
      program.outputHelp();
    });

  return program;
}
