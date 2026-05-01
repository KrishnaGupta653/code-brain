/**
 * Diff command - Export only what changed since last index
 */
import { SQLiteStorage } from '../../storage/index.js';
import { QueryEngine } from '../../retrieval/index.js';
import { ExportEngine } from '../../retrieval/export.js';
import { logger } from '../../utils/index.js';
import { stableId } from '../../utils/index.js';
import fs from 'fs';

export interface DiffCommandOptions {
  format?: string;
  since?: string;
  output?: string;
}

export async function diffCommand(
  projectRoot: string,
  options: DiffCommandOptions = {}
): Promise<void> {
  try {
    const { getDbPath } = await import('../../utils/index.js');
    const dbPath = getDbPath(projectRoot);
    const storage = new SQLiteStorage(dbPath);

    const projectId = stableId('project', projectRoot);
    const graph = storage.loadGraph(projectRoot);

    if (graph.getNodes().length === 0) {
      logger.error('No graph data found. Run `code-brain index` first.');
      process.exit(1);
    }

    // Get last index timestamp
    const indexState = storage.getIndexState(projectRoot);
    if (!indexState) {
      logger.error('No index state found. Run `code-brain index` first.');
      process.exit(1);
    }

    const sinceTimestamp = options.since 
      ? parseInt(options.since, 10)
      : indexState.lastIndexedAt - (24 * 60 * 60 * 1000); // Default: 24 hours ago

    logger.info(`Finding changes since ${new Date(sinceTimestamp).toISOString()}`);

    // Find changed nodes (updated after timestamp)
    const changedNodes = graph.getNodes().filter(node => {
      return node.provenance.updatedAt > sinceTimestamp;
    });

    logger.info(`Found ${changedNodes.length} changed nodes`);

    if (changedNodes.length === 0) {
      logger.info('No changes detected');
      storage.close();
      return;
    }

    // Get related edges
    const changedNodeIds = new Set(changedNodes.map(n => n.id));
    const relatedEdges = graph.getEdges().filter(edge => 
      changedNodeIds.has(edge.from) || changedNodeIds.has(edge.to)
    );

    // Create query result
    const queryResult = {
      nodes: changedNodes,
      edges: relatedEdges,
      truncated: false,
    };

    // Export
    const project = storage.getProject(projectRoot);
    
    if (!project) {
      logger.error('Project metadata not found');
      process.exit(1);
    }

    const projectMetadata = {
      name: project.name,
      root: project.root,
      language: project.language,
      version: project.version,
      description: project.description,
      entryPoints: project.entryPoints,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      fileCount: project.fileCount,
      symbolCount: project.symbolCount,
      edgeCount: project.edgeCount,
    };

    const exportEngine = new ExportEngine(graph, projectMetadata);

    let output: string;
    const format = options.format || 'ai';
    
    if (format === 'ai') {
      const bundle = exportEngine.exportForAI(queryResult);
      output = JSON.stringify(bundle, null, 2);
    } else if (format === 'json') {
      output = exportEngine.exportAsJSON(queryResult);
    } else if (format === 'yaml') {
      output = exportEngine.exportAsYAML(queryResult);
    } else {
      logger.error(`Unknown format: ${format}`);
      process.exit(1);
    }

    if (options.output) {
      fs.writeFileSync(options.output, output);
      logger.success(`Diff exported to ${options.output}`);
    } else {
      console.log(output);
    }

    storage.close();
  } catch (error) {
    logger.error('Diff failed:', error);
    throw error;
  }
}
