import path from 'path';
import { ConfigManager } from '../../config/index.js';
import { QueryEngine } from '../../retrieval/query.js';
import { ExportEngine } from '../../retrieval/export.js';
import { PythonBridge } from '../../python/index.js';
import { logger, getDbPath } from '../../utils/index.js';
import { AnalyticsResult, ProjectMetadata } from '../../types/models.js';
import { SQLiteStorage } from '../../storage/index.js';

export async function exportCommand(
  projectRoot: string,
  format: 'json' | 'yaml' | 'ai' = 'json',
  focus?: string
): Promise<string> {
  logger.info(`Exporting code-brain graph (format: ${format})`);

  let storage: SQLiteStorage | null = null;

  try {
    // Load config
    const configManager = new ConfigManager(projectRoot);
    const config = configManager.getConfig();

    storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const stats = graph.getStats();
    const storedProject = storage.getProject(projectRoot);
    const project: ProjectMetadata =
      storedProject || {
        name: path.basename(projectRoot),
        root: projectRoot,
        language: 'typescript',
        fileCount: stats.nodesByType['file'] || 0,
        symbolCount: Math.max(
          0,
          stats.nodeCount - (stats.nodesByType['file'] || 0) - (stats.nodesByType['project'] || 0)
        ),
        edgeCount: stats.edgeCount,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

    const queryEngine = new QueryEngine(graph);
    let queryResult;

    if (focus) {
      const focusNode = queryEngine.resolveFocus(focus);
      if (!focusNode) {
        logger.warn(`No nodes found matching focus: ${focus}`);
        queryResult = { nodes: [], edges: [], truncated: false };
      } else {
        queryResult = queryEngine.findRelated(focusNode.id, 2);
      }
    } else {
      queryResult = queryEngine.getProjectOverview(config.maxTokensExport ? Math.max(80, Math.floor(config.maxTokensExport / 60)) : 160);
    }

    // Run analytics if enabled
    let analyticsResult: AnalyticsResult | undefined;
    if (config.enableAnalytics && queryResult.nodes.length > 0 && queryResult.edges.length > 0) {
      try {
        const graphData = {
          nodes: queryResult.nodes.map(n => ({
            id: n.id,
            type: n.type,
            name: n.name
          })),
          edges: queryResult.edges.map(e => ({
            from: e.from,
            to: e.to,
            type: e.type
          }))
        };

        analyticsResult = await PythonBridge.runAnalytics(graphData);

        if (analyticsResult.centrality.size > 0) {
          const importanceMap = analyticsResult.importance;
          const rankingScores = Array.from(analyticsResult.centrality.entries()).map(
            ([nodeId, score]) => ({
              nodeId,
              score,
              algorithm: 'betweenness_centrality',
              components: {
                importance: importanceMap.get(nodeId) || 0
              }
            })
          );
          storage.saveRankingScores(projectRoot, rankingScores);
        }
      } catch (error) {
        logger.debug('Analytics failed, continuing without analytics', error);
      }
    }

    // Export
    const exporter = new ExportEngine(graph, project);

    let output = '';
    if (format === 'ai') {
      const bundle = exporter.exportForAI(queryResult, focus, analyticsResult);
      output = JSON.stringify(bundle, null, 2);
    } else if (format === 'json') {
      output = exporter.exportAsJSON(queryResult, focus);
    } else if (format === 'yaml') {
      output = exporter.exportAsYAML(queryResult, focus);
    }

    logger.success('Export complete');
    return output;
  } catch (error) {
    logger.error('Export failed', error);
    throw error;
  } finally {
    storage?.close();
  }
}
