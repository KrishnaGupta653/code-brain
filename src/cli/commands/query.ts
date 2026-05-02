import { QueryEngine } from '../../retrieval/query.js';
import { SQLiteStorage } from '../../storage/index.js';
import { HybridSearchEngine } from '../../retrieval/hybrid-search.js';
import { createEmbeddingProvider, resolveApiKey } from '../../embeddings/index.js';
import { EmbeddingConfig } from '../../embeddings/provider.js';
import { ConfigManager } from '../../config/index.js';
import { logger, getDbPath } from '../../utils/index.js';

export interface QueryCommandOptions {
  type?: 'callers' | 'callees' | 'cycles' | 'dead-exports' | 'orphans' | 'impact' | 'path' | 'search';
  symbol?: string;
  from?: string;
  to?: string;
  text?: string;
  limit?: number;
  hybrid?: boolean;
}

export async function queryCommand(
  projectRoot: string,
  options: QueryCommandOptions = {}
): Promise<void> {
  try {
    const storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const queryEngine = new QueryEngine(graph, storage, projectRoot);

    const type = options.type || 'search';
    const limit = options.limit || 50;

    switch (type) {
      case 'search': {
        if (!options.text) {
          logger.error('--text is required for search query');
          return;
        }

        // Check if hybrid search is requested and available
        if (options.hybrid) {
          const configManager = new ConfigManager(projectRoot);
          const config = configManager.getConfig();
          
          if (config.embeddings?.enabled && config.embeddings.provider !== 'none') {
            const apiKey = resolveApiKey(config.embeddings.apiKey);
            const providerType = config.embeddings.provider || 'openai';
            const embeddingConfig: EmbeddingConfig = {
              enabled: config.embeddings.enabled,
              provider: providerType as 'openai' | 'anthropic' | 'local' | 'none',
              model: config.embeddings.model || 'text-embedding-3-small',
              dimensions: config.embeddings.dimensions || 1536,
              batchSize: config.embeddings.batchSize || 100,
              apiKey,
            };
            const provider = createEmbeddingProvider(embeddingConfig);

            if (provider) {
              logger.info('Using hybrid search (BM25 + vector similarity)...');
              const hybridEngine = new HybridSearchEngine(storage, projectRoot, provider);
              const results = await hybridEngine.search(options.text, { 
                limit, 
                includeNodes: true 
              });

              logger.info(`Found ${results.length} results for "${options.text}":`);
              results.forEach((result, index) => {
                const node = result.node;
                console.log(`\n${index + 1}. ${node?.name || result.nodeId} (${node?.type || 'unknown'}) [score: ${result.score.toFixed(3)}]`);
                if (result.bm25Score !== undefined) {
                  console.log(`   BM25: ${result.bm25Score.toFixed(3)} (rank ${result.bm25Rank})`);
                }
                if (result.vectorScore !== undefined) {
                  console.log(`   Vector: ${result.vectorScore.toFixed(3)} (rank ${result.vectorRank})`);
                }
                if (node?.fullName) console.log(`   Full name: ${node.fullName}`);
                if (node?.location?.file) console.log(`   File: ${node.location.file}:${node.location.startLine}`);
                if (node?.summary) {
                  console.log(`   Summary: ${node.summary.slice(0, 100)}${node.summary.length > 100 ? '...' : ''}`);
                }
              });
              break;
            } else {
              logger.warn('Hybrid search requested but provider not available, falling back to BM25');
            }
          } else {
            logger.warn('Hybrid search requested but embeddings not configured, falling back to BM25');
          }
        }

        // Fall back to BM25-only search
        const results = storage.searchNodesDetailed(projectRoot, options.text, limit);
        logger.info(`Found ${results.length} results for "${options.text}":`);
        results.forEach((result, index) => {
          console.log(`\n${index + 1}. ${result.name} (${result.type}) [score: ${result.score.toFixed(3)}]`);
          if (result.fullName) console.log(`   Full name: ${result.fullName}`);
          if (result.filePath) console.log(`   File: ${result.filePath}`);
          if (result.summary) console.log(`   Summary: ${result.summary.slice(0, 100)}${result.summary.length > 100 ? '...' : ''}`);
        });
        break;
      }
      case 'callers': {
        if (!options.symbol) {
          logger.error('--symbol is required for callers query');
          return;
        }
        const callers = queryEngine.findCallers(options.symbol);
        logger.info(`Found ${callers.length} callers of ${options.symbol}:`);
        callers.slice(0, limit).forEach(node => {
          console.log(`  - ${node.name} (${node.type}) in ${node.location?.file}`);
        });
        break;
      }

      case 'callees': {
        if (!options.symbol) {
          logger.error('--symbol is required for callees query');
          return;
        }
        const callees = queryEngine.findCallees(options.symbol);
        logger.info(`Found ${callees.length} callees from ${options.symbol}:`);
        callees.slice(0, limit).forEach(node => {
          console.log(`  - ${node.name} (${node.type}) in ${node.location?.file}`);
        });
        break;
      }

      case 'cycles': {
        const cycles = queryEngine.findCycles(limit);
        logger.info(`Found ${cycles.length} cycles:`);
        cycles.forEach((cycle, index) => {
          console.log(`\nCycle ${index + 1} (${cycle.length} nodes):`);
          cycle.forEach(node => {
            console.log(`  → ${node.name} (${node.type})`);
          });
        });
        break;
      }

      case 'dead-exports': {
        const deadExports = queryEngine.findDeadExports();
        logger.info(`Found ${deadExports.length} dead exports:`);
        deadExports.slice(0, limit).forEach(node => {
          console.log(`  - ${node.name} in ${node.location?.file}`);
        });
        break;
      }

      case 'orphans': {
        const orphans = queryEngine.findOrphans();
        logger.info(`Found ${orphans.length} orphaned files:`);
        orphans.slice(0, limit).forEach(node => {
          console.log(`  - ${node.location?.file}`);
        });
        break;
      }

      case 'impact': {
        if (!options.symbol) {
          logger.error('--symbol is required for impact query');
          return;
        }
        const impact = queryEngine.findImpact(options.symbol);
        logger.info(`Impact analysis for ${options.symbol}:`);
        console.log(`\nImpacted files: ${impact.impactedFiles.length}`);
        impact.impactedFiles.slice(0, 10).forEach(node => {
          console.log(`  - ${node.location?.file} (importance: ${node.importanceScore?.toFixed(3)})`);
        });
        console.log(`\nCritical dependencies: ${impact.criticalDependencies.length}`);
        impact.criticalDependencies.slice(0, 10).forEach(node => {
          console.log(`  - ${node.name} (${node.type})`);
        });
        console.log(`\nCovering tests: ${impact.coveringTests.length}`);
        impact.coveringTests.slice(0, 10).forEach(node => {
          console.log(`  - ${node.name}`);
        });
        break;
      }

      case 'path': {
        if (!options.from || !options.to) {
          logger.error('--from and --to are required for path query');
          return;
        }
        const pathIds = graph.findPath(options.from, options.to);
        if (!pathIds || pathIds.length === 0) {
          logger.info(`No path found from ${options.from} to ${options.to}`);
        } else {
          logger.info(`Path from ${options.from} to ${options.to} (${pathIds.length} nodes):`);
          pathIds.forEach(id => {
            const node = graph.getNode(id);
            if (node) {
              console.log(`  → ${node.name} (${node.type})`);
            }
          });
        }
        break;
      }

      default:
        logger.error(`Unknown query type: ${type}`);
        logger.info('Available types: search, callers, callees, cycles, dead-exports, orphans, impact, path');
    }

    storage.close();
  } catch (error) {
    logger.error('Query failed', error);
    throw error;
  }
}
