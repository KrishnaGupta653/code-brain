/**
 * Summarize command - Generate LLM-powered summaries for modules.
 */

import { Command } from 'commander';
import { getDbPath, logger } from '../../utils/index.js';
import { SQLiteStorage } from '../../storage/index.js';
import { getAnthropicClient, isAnthropicConfigured } from '../../llm/index.js';
import { SummaryGenerator } from '../../llm/summary-generator.js';

export function summarizeCommand(program: Command): void {
  program
    .command('summarize')
    .description('Generate LLM-powered summaries for modules')
    .option('--regenerate', 'Regenerate all summaries (even if they exist)')
    .option('--stale <days>', 'Regenerate summaries older than N days', '7')
    .option('--batch-size <size>', 'Number of summaries to generate per batch', '50')
    .option('--concurrency <n>', 'Number of concurrent API requests', '3')
    .action(async (options) => {
      const projectRoot = process.cwd();

      // Check if Anthropic API is configured
      if (!isAnthropicConfigured()) {
        logger.error('Anthropic API key not configured');
        logger.info('Set ANTHROPIC_API_KEY environment variable to use this feature');
        logger.info('Example: export ANTHROPIC_API_KEY=sk-ant-...');
        process.exit(1);
      }

      const client = getAnthropicClient();
      if (!client) {
        logger.error('Failed to initialize Anthropic client');
        process.exit(1);
      }

      const storage = new SQLiteStorage(getDbPath(projectRoot));
      const graph = storage.loadGraph(projectRoot);

      const generator = new SummaryGenerator({
        client,
        storage,
        projectRoot,
        batchSize: parseInt(options.batchSize, 10),
        concurrency: parseInt(options.concurrency, 10),
      });

      try {
        let generated = 0;

        if (options.regenerate) {
          logger.info('Regenerating all summaries...');
          generated = await generator.generateAllSummaries(graph);
        } else {
          const staleDays = parseInt(options.stale, 10);
          const maxAge = staleDays * 24 * 60 * 60 * 1000;
          logger.info(`Regenerating summaries older than ${staleDays} days...`);
          generated = await generator.regenerateStale(graph, maxAge);
        }

        logger.success(`Generated ${generated} summaries`);

        // Show statistics
        const allSummaries = storage.getAllSummaries(projectRoot);
        const totalTokens = Array.from(allSummaries.values()).reduce(
          (sum, summary: any) => sum + (summary.tokens || 0),
          0
        );

        logger.info(`Total summaries: ${allSummaries.size}`);
        logger.info(`Total tokens used: ${totalTokens}`);

      } catch (error) {
        logger.error('Failed to generate summaries:', error);
        process.exit(1);
      } finally {
        storage.close();
      }
    });
}
