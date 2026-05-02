import fs from 'fs';
import path from 'path';
import { ConfigManager } from '../../config/index.js';
import { GraphBuilder } from '../../graph/index.js';
import { GraphModel } from '../../graph/index.js';
import { SQLiteStorage } from '../../storage/index.js';
import { logger, getDbPath, scanSourceFiles } from '../../utils/index.js';
import { Parser } from '../../parser/index.js';
import { GraphEdge, GraphNode, SourceSpan } from '../../types/models.js';
import { PythonBridge } from '../../python/bridge.js';

export interface IndexCommandOptions {
  filesToIndex?: string[];
  gitBlame?: boolean;
  includeDocs?: boolean;
  includeAPI?: boolean;
}

export async function indexCommand(
  projectRoot: string,
  options: IndexCommandOptions = {}
): Promise<void> {
  logger.info(`Indexing repository: ${projectRoot}`);

  let storage: SQLiteStorage | null = null;

  try {
    const configManager = new ConfigManager(projectRoot);
    const config = configManager.getConfig();

    // load parser plugins declared in project or in ./parsers
    try {
      // lazy import to avoid startup cost when not needed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { loadParsersForProject } = await import('../../parser/loader.js');
      await loadParsersForProject(projectRoot);
    } catch (err) {
      logger.warn('Failed to load parser plugins', (err as Error)?.message || err);
    }

    const include = config.include || ['**'];
    const exclude = config.exclude || ['node_modules', 'dist'];
    const allFiles = scanSourceFiles(projectRoot, include, exclude);
    const filesToIndex = options.filesToIndex && options.filesToIndex.length > 0
      ? options.filesToIndex
      : allFiles;

    const builder = new GraphBuilder();
    const partialGraph = await builder.buildFromRepository(projectRoot, include, exclude, filesToIndex);

    // Optionally enrich with git metadata
    if (options.gitBlame) {
      logger.info('Enriching with git metadata...');
      await builder.enrichWithGitMetadata();
    }

    // Optionally add documentation
    if (options.includeDocs !== false) {
      await builder.addDocumentation();
    }

    // Optionally add API schemas
    if (options.includeAPI !== false) {
      await builder.addAPISchemas();
    }

    const dbPath = getDbPath(projectRoot);
    storage = new SQLiteStorage(dbPath);

    const now = Date.now();
    let project = storage.getProject(projectRoot);
    if (!project) {
      project = {
        name: path.basename(projectRoot),
        root: projectRoot,
        language: config.languages && config.languages.length > 0 ? config.languages[0] : 'typescript',
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

      // Consistency sweep: remove edges pointing to deleted nodes
      existingGraph.removeEdgesByPredicate((edge: GraphEdge) => {
        return !existingGraph.getNode(edge.from) || !existingGraph.getNode(edge.to);
      });

      graphToPersist = existingGraph;
    } else {
      graphToPersist = partialGraph;
    }

    // Compute communities and assign community IDs to nodes
    if (config.enableAnalytics !== false) {
      logger.info('Computing graph communities...');
      try {
      const analyticsResult = await PythonBridge.runAnalytics(
        {
          nodes: graphToPersist.getNodes(),
          edges: graphToPersist.getEdges(),
        },
        undefined,
        storage,
        projectRoot
      );

      // Assign community IDs to nodes
      if (analyticsResult.communities && analyticsResult.communities.length > 0) {
        analyticsResult.communities.forEach((community, communityIndex) => {
          community.forEach(nodeId => {
            const node = graphToPersist.getNode(nodeId);
            if (node) {
              node.communityId = communityIndex;
              // Assign importance score from analytics
              node.importanceScore = analyticsResult.importance.get(nodeId) || 0;
            }
          });
        });
        logger.success(`Assigned ${analyticsResult.communities.length} communities to nodes`);
      }
      } catch (error) {
        logger.warn('Community detection failed, continuing without clusters', error);
      } finally {
        await PythonBridge.shutdown().catch(() => undefined);
      }
    } else {
      logger.info('Analytics disabled; using deterministic graph only');
    }

    storage.replaceGraph(projectRoot, graphToPersist);

    const builderHashes = builder.getFileHashes();
    const fileHashRecords = filesToIndex.map(filePath => {
      const info = builderHashes.get(filePath) || { hash: '', language: 'unknown', size: 0 };
      return {
        path: filePath,
        ...info
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

    logger.success(`Indexing complete. ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);
  } catch (error) {
    logger.error('Indexing failed', error);
    throw error;
  } finally {
    storage?.close();
  }
}
