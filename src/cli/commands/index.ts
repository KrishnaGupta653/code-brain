import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../config/index.js';
import { GraphBuilder } from '../../graph/index.js';
import { GraphModel } from '../../graph/index.js';
import { SQLiteStorage } from '../../storage/index.js';
import { logger, getDbPath, scanSourceFiles } from '../../utils/index.js';
import { Parser } from '../../parser/index.js';
import { GraphEdge, GraphNode, SourceSpan } from '../../types/models.js';

export interface IndexCommandOptions {
  filesToIndex?: string[];
}

export async function indexCommand(
  projectRoot: string,
  options: IndexCommandOptions = {}
): Promise<void> {
  logger.info(`Indexing repository: ${projectRoot}`);

  try {
    const configManager = new ConfigManager(projectRoot);
    const config = configManager.getConfig();

    const include = config.include || ['**'];
    const exclude = config.exclude || ['node_modules', 'dist'];
    const allFiles = scanSourceFiles(projectRoot, include, exclude);
    const filesToIndex = options.filesToIndex && options.filesToIndex.length > 0
      ? options.filesToIndex
      : allFiles;

    const builder = new GraphBuilder();
    const partialGraph = builder.buildFromRepository(projectRoot, include, exclude, filesToIndex);

    const dbPath = getDbPath(projectRoot);
    const storage = new SQLiteStorage(dbPath);

    const now = Date.now();
    let project = storage.getProject(projectRoot);
    if (!project) {
      project = {
        name: path.basename(projectRoot),
        root: projectRoot,
        language: 'typescript',
        fileCount: 0,
        symbolCount: 0,
        edgeCount: 0,
        createdAt: now,
        updatedAt: now
      };
    }

    project.updatedAt = now;
    storage.saveProject(project);

    let graphToPersist: GraphModel;
    if (options.filesToIndex && options.filesToIndex.length > 0) {
      const existingGraph = storage.loadGraph(projectRoot);
      const impacted = new Set(options.filesToIndex);

      existingGraph.removeNodesByPredicate((node: GraphNode) =>
        Boolean(node.location?.file && impacted.has(node.location.file))
      );
      existingGraph.removeEdgesByPredicate((edge: GraphEdge) =>
        Boolean(edge.sourceLocation?.some((span: SourceSpan) => impacted.has(span.file)))
      );

      for (const node of partialGraph.getNodes()) {
        existingGraph.addNode(node);
      }
      for (const edge of partialGraph.getEdges()) {
        existingGraph.addEdge(edge);
      }

      graphToPersist = existingGraph;
    } else {
      graphToPersist = partialGraph;
    }

    storage.replaceGraph(projectRoot, graphToPersist);

    const fileHashRecords = filesToIndex.map(filePath => {
      const parsed = Parser.parseFile(filePath);
      const language = filePath.endsWith('.ts') || filePath.endsWith('.tsx')
        ? 'typescript'
        : 'javascript';
      const size = fs.statSync(filePath).size;
      return {
        path: filePath,
        hash: parsed.hash,
        language,
        size
      };
    });

    storage.saveFileHashes(projectRoot, fileHashRecords);
    storage.removeMissingFileHashes(projectRoot, allFiles);

    const stats = graphToPersist.getStats();
    const entryPoints = graphToPersist
      .getEdgesByType('ENTRY_POINT')
      .map(edge => graphToPersist.getNode(edge.to)?.fullName || graphToPersist.getNode(edge.to)?.name)
      .filter((value): value is string => Boolean(value))
      .sort();

    project.fileCount = stats.nodesByType['file'] || 0;
    project.symbolCount =
      stats.nodeCount -
      (stats.nodesByType['file'] || 0) -
      (stats.nodesByType['project'] || 0);
    project.edgeCount = stats.edgeCount;
    project.entryPoints = entryPoints;
    storage.saveProject(project);

    storage.updateIndexState(projectRoot, {
      lastIndexedAt: Date.now(),
      totalFileCount: project.fileCount,
      totalSymbolCount: project.symbolCount,
      totalEdgeCount: project.edgeCount,
      status: 'idle'
    });

    storage.close();

    logger.success(`Indexing complete. ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);
  } catch (error) {
    logger.error('Indexing failed', error);
    throw error;
  }
}
