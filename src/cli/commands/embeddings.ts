/**
 * Embeddings CLI Command
 * 
 * Generate and manage vector embeddings for semantic search
 */

import { ConfigManager } from '../../config/index.js';
import { SQLiteStorage } from '../../storage/index.js';
import { logger, getDbPath } from '../../utils/index.js';
import {
  createEmbeddingProvider,
  resolveApiKey,
  getDefaultEmbeddingConfig,
  EmbeddingGenerator,
  EmbeddingConfig,
} from '../../embeddings/index.js';

export interface EmbeddingsCommandOptions {
  force?: boolean;
  model?: string;
  provider?: string;
  stats?: boolean;
  clear?: boolean;
}

export async function embeddingsCommand(
  projectRoot: string,
  options: EmbeddingsCommandOptions = {}
): Promise<void> {
  const configManager = new ConfigManager(projectRoot);
  const config = configManager.getConfig();

  // Get embeddings configuration
  let embeddingsConfig = config.embeddings || getDefaultEmbeddingConfig();

  // Ensure required fields are set
  if (embeddingsConfig.enabled === undefined) {
    embeddingsConfig.enabled = false;
  }
  if (!embeddingsConfig.provider) {
    embeddingsConfig.provider = 'none';
  }
  if (!embeddingsConfig.model) {
    embeddingsConfig.model = 'text-embedding-3-small';
  }
  if (!embeddingsConfig.dimensions) {
    embeddingsConfig.dimensions = 1536;
  }
  if (!embeddingsConfig.batchSize) {
    embeddingsConfig.batchSize = 100;
  }

  // Override with CLI options
  if (options.model) {
    embeddingsConfig.model = options.model;
  }
  if (options.provider) {
    embeddingsConfig.provider = options.provider as any;
  }

  // Resolve API key from environment
  if (embeddingsConfig.apiKey) {
    embeddingsConfig.apiKey = resolveApiKey(embeddingsConfig.apiKey);
  }

  // Handle stats command
  if (options.stats) {
    await showStats(projectRoot);
    return;
  }

  // Handle clear command
  if (options.clear) {
    await clearEmbeddings(projectRoot);
    return;
  }

  // Check if embeddings are enabled
  if (!embeddingsConfig.enabled) {
    logger.error('Embeddings are disabled in configuration');
    logger.info('Enable embeddings in .codebrainrc.json:');
    logger.info(JSON.stringify({
      embeddings: {
        enabled: true,
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: '${OPENAI_API_KEY}'
      }
    }, null, 2));
    return;
  }

  // Create provider
  const provider = createEmbeddingProvider(embeddingsConfig as EmbeddingConfig);
  if (!provider) {
    logger.error('Failed to create embedding provider');
    logger.info('Check your configuration and API key');
    return;
  }

  // Check if provider is available
  const available = await provider.isAvailable();
  if (!available) {
    logger.error(`Embedding provider '${embeddingsConfig.provider}' is not available`);
    logger.info('Check your API key and network connection');
    return;
  }

  logger.info(`Using ${provider.name} provider with model ${provider.model}`);

  // Open storage
  const dbPath = getDbPath(projectRoot);
  const storage = new SQLiteStorage(dbPath);

  try {
    // Create generator
    const generator = new EmbeddingGenerator({
      provider,
      storage,
      projectRoot,
      batchSize: embeddingsConfig.batchSize,
    });

    // Show initial stats
    const initialStats = generator.getStats();
    logger.info(`Total nodes: ${initialStats.totalNodes}`);
    logger.info(`Nodes with embeddings: ${initialStats.nodesWithEmbeddings}`);
    logger.info(`Nodes without embeddings: ${initialStats.nodesWithoutEmbeddings}`);

    if (initialStats.nodesWithoutEmbeddings === 0 && !options.force) {
      logger.success('All nodes already have embeddings');
      logger.info('Use --force to regenerate all embeddings');
      return;
    }

    // Generate embeddings with progress tracking
    const ora = (await import('ora')).default;
    const spinner = ora({
      text: 'Generating embeddings...',
      spinner: 'dots',
    }).start();

    const startTime = Date.now();

    const progress = await generator.generateMissingEmbeddings((p) => {
      const percentage = Math.round((p.completed / p.total) * 100);
      const elapsed = Date.now() - startTime;
      const avgTimePerNode = elapsed / Math.max(p.completed, 1);
      const remaining = (p.total - p.completed) * avgTimePerNode;
      const remainingSeconds = Math.round(remaining / 1000);

      spinner.text = `Generating embeddings: ${p.completed}/${p.total} (${percentage}%) - ${remainingSeconds}s remaining`;
    });

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    spinner.succeed(
      `Generated ${progress.completed} embeddings in ${totalTime}s (${progress.failed} failed)`
    );

    // Show final stats
    const finalStats = generator.getStats();
    logger.info(`Total embeddings: ${finalStats.nodesWithEmbeddings}`);
    logger.info(`Storage size: ${formatBytes(finalStats.totalSize)}`);

    if (finalStats.models.length > 0) {
      logger.info('Models:');
      finalStats.models.forEach((m) => {
        logger.info(`  - ${m.model}: ${m.count} embeddings`);
      });
    }
  } finally {
    storage.close();
  }
}

async function showStats(projectRoot: string): Promise<void> {
  const dbPath = getDbPath(projectRoot);
  const storage = new SQLiteStorage(dbPath);

  try {
    const stats = storage.getEmbeddingStats(projectRoot);

    logger.info('Embedding Statistics:');
    logger.info(`  Total nodes: ${stats.totalNodes}`);
    logger.info(`  Nodes with embeddings: ${stats.nodesWithEmbeddings}`);
    logger.info(`  Nodes without embeddings: ${stats.nodesWithoutEmbeddings}`);
    logger.info(`  Coverage: ${Math.round((stats.nodesWithEmbeddings / stats.totalNodes) * 100)}%`);
    logger.info(`  Storage size: ${formatBytes(stats.totalSize)}`);

    if (stats.models.length > 0) {
      logger.info('  Models:');
      stats.models.forEach((m) => {
        logger.info(`    - ${m.model}: ${m.count} embeddings`);
      });
    }
  } finally {
    storage.close();
  }
}

async function clearEmbeddings(projectRoot: string): Promise<void> {
  const dbPath = getDbPath(projectRoot);
  const storage = new SQLiteStorage(dbPath);

  try {
    const stats = storage.getEmbeddingStats(projectRoot);
    
    if (stats.nodesWithEmbeddings === 0) {
      logger.info('No embeddings to clear');
      return;
    }

    logger.warn(`This will delete ${stats.nodesWithEmbeddings} embeddings (${formatBytes(stats.totalSize)})`);
    
    storage.deleteAllEmbeddings(projectRoot);
    logger.success('All embeddings cleared');
  } finally {
    storage.close();
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
