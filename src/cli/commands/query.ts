import { QueryEngine } from '../../retrieval/query.js';
import { SQLiteStorage } from '../../storage/index.js';
import { logger, getDbPath } from '../../utils/index.js';

export interface QueryCommandOptions {
  type?: 'callers' | 'callees' | 'cycles' | 'dead-exports' | 'orphans' | 'impact' | 'path';
  symbol?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function queryCommand(
  projectRoot: string,
  options: QueryCommandOptions = {}
): Promise<void> {
  try {
    const storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const queryEngine = new QueryEngine(graph, storage, projectRoot);

    const type = options.type || 'callers';
    const limit = options.limit || 50;

    switch (type) {
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
        logger.info('Available types: callers, callees, cycles, dead-exports, orphans, impact, path');
    }

    storage.close();
  } catch (error) {
    logger.error('Query failed', error);
    throw error;
  }
}
