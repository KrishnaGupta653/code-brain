import path from "path";
import { ConfigManager } from "../../config/index.js";
import { QueryEngine } from "../../retrieval/query.js";
import { ExportEngine } from "../../retrieval/export.js";
import { PythonBridge } from "../../python/index.js";
import { GitIntegration } from "../../git/integration.js";
import { logger, getDbPath } from "../../utils/index.js";
import { AnalyticsResult, ProjectMetadata } from "../../types/models.js";
import { SQLiteStorage } from "../../storage/index.js";

export async function exportCommand(
  projectRoot: string,
  format: "json" | "yaml" | "ai" = "json",
  focus?: string,
  maxTokens?: number,
  top?: number,
  model?: string,
  mode?: "full" | "signatures" | "modules",
  bundle?: string,
  since?: string,
): Promise<string> {
  logger.info(`Exporting code-brain graph (format: ${format}${model ? `, model: ${model}` : ''}${mode ? `, mode: ${mode}` : ''}${bundle ? `, bundle: ${bundle}` : ''}${since ? `, since: ${since}` : ''})`);

  let storage: SQLiteStorage | null = null;

  try {
    // Load config
    const configManager = new ConfigManager(projectRoot);
    const config = configManager.getConfig();

    storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const stats = graph.getStats();
    const storedProject = storage.getProject(projectRoot);
    const project: ProjectMetadata = storedProject || {
      name: path.basename(projectRoot),
      root: projectRoot,
      language: "typescript",
      fileCount: stats.nodesByType["file"] || 0,
      symbolCount: Math.max(
        0,
        stats.nodeCount -
          (stats.nodesByType["file"] || 0) -
          (stats.nodesByType["project"] || 0),
      ),
      edgeCount: stats.edgeCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const queryEngine = new QueryEngine(graph, storage, projectRoot);
    let queryResult;

    // Handle bundle queries
    if (bundle) {
      try {
        queryResult = queryEngine.queryBundle(bundle, 2);
        if (queryResult.nodes.length === 0) {
          logger.warn(`No nodes found for bundle: ${bundle}`);
        }
      } catch (error) {
        logger.error(`Invalid bundle: ${bundle}`, error);
        throw error;
      }
    } else if (focus) {
      const focusNode = queryEngine.resolveFocus(focus);
      if (!focusNode) {
        logger.warn(`No nodes found matching focus: ${focus}`);
        queryResult = { nodes: [], edges: [], truncated: false };
      } else {
        queryResult = queryEngine.findRelated(focusNode.id, 2);
      }
    } else {
      queryResult = queryEngine.getProjectOverview(
        config.maxTokensExport
          ? Math.max(80, Math.floor(config.maxTokensExport / 60))
          : 160,
      );
    }

    // Apply diff filter if --since is specified
    if (since) {
      const git = new GitIntegration(projectRoot);
      const isGit = await git.isGitRepo();
      
      if (!isGit) {
        logger.warn('--since requires a git repository, ignoring flag');
      } else {
        const sinceValue =
          since === "last"
            ? (() => {
                const lastExportAt = storage?.getExportState(projectRoot).lastExportAt;
                return lastExportAt
                  ? new Date(lastExportAt).toISOString()
                  : null;
              })()
            : since;

        if (since === "last" && !sinceValue) {
          logger.warn("No previous export state found, returning full export");
        }

        if (sinceValue) {
          const changedFiles = await git.getChangedFiles(sinceValue);
          logger.info(`Found ${changedFiles.length} changed files since ${since}`);

          if (changedFiles.length > 0) {
            const exporter = new ExportEngine(graph, project, projectRoot);
            queryResult = exporter.filterByChangedFiles(queryResult, changedFiles, 1);
            logger.info(`Filtered to ${queryResult.nodes.length} nodes, ${queryResult.edges.length} edges`);
          } else {
            logger.warn('No changed files found, returning empty export');
            queryResult = { nodes: [], edges: [], truncated: false };
          }
        } else if (since !== "last") {
          logger.warn('No changed files found, returning empty export');
          queryResult = { nodes: [], edges: [], truncated: false };
        }
      }
    }

    // Run analytics if enabled (with caching)
    let analyticsResult: AnalyticsResult | undefined;
    if (
      config.enableAnalytics &&
      queryResult.nodes.length > 0 &&
      queryResult.edges.length > 0
    ) {
      try {
        const graphData = {
          nodes: queryResult.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            name: n.name,
          })),
          edges: queryResult.edges.map((e) => ({
            from: e.from,
            to: e.to,
            type: e.type,
          })),
        };

        analyticsResult = await PythonBridge.runAnalytics(
          graphData,
          config.pythonPath,
          storage,
          projectRoot,
        );

        if (analyticsResult.centrality.size > 0) {
          const importanceMap = analyticsResult.importance;
          const rankingScores = Array.from(
            analyticsResult.centrality.entries(),
          ).map(([nodeId, score]) => ({
            nodeId,
            score,
            algorithm: "betweenness_centrality",
            components: {
              importance: importanceMap.get(nodeId) || 0,
            },
          }));
          storage.saveRankingScores(projectRoot, rankingScores);
        }
      } catch (error) {
        logger.debug("Analytics failed, continuing without analytics", error);
      }
    }

    // Export with optional token limit and model
    const tokenBudget = maxTokens || config.maxTokensExport;
    const exporter = new ExportEngine(graph, project, projectRoot);

    const startedAt = Date.now();
    let output = "";
    
    // Handle signature mode
    if (mode === 'signatures') {
      output = exporter.exportSignatures(queryResult, focus);
      logger.success("Export complete");
      return output;
    }

    if (mode === "modules") {
      output = exporter.exportModules(queryResult, focus);
      logger.success("Export complete");
      return output;
    }
    
    if (format === "ai") {
      const aiBundle = exporter.exportForAI(
        queryResult,
        focus,
        analyticsResult,
        tokenBudget,
        top,
        model,
      );

      let estimatedTokens = 0;
      let outputPayload = { ...aiBundle };

      for (let pass = 0; pass < 2; pass++) {
        const telemetry = {
          estimatedTokens,
          budgetTokens: tokenBudget || null,
          utilizationPct: tokenBudget
            ? Math.round((estimatedTokens / tokenBudget) * 100)
            : null,
          compressionRatio: queryResult.nodes.length > 0
            ? Number((aiBundle.nodes.length / queryResult.nodes.length).toFixed(3))
            : 1,
          droppedNodes: Math.max(0, queryResult.nodes.length - aiBundle.nodes.length),
          droppedEdges: Math.max(0, queryResult.edges.length - aiBundle.edges.length),
          exportMode: (mode || 'full') as 'full' | 'signatures' | 'modules' | 'delta',
          bundleName: bundle || undefined,
          generatedInMs: Date.now() - startedAt,
          quality: aiBundle.quality!,
        };

        outputPayload = { ...aiBundle, telemetry };
        output = JSON.stringify(outputPayload, null, 2);
        estimatedTokens = await exporter.countTokensAccurate(output);
      }

      storage.saveExportState(projectRoot, aiBundle.fingerprint || "");
    } else if (format === "json") {
      output = exporter.exportAsJSON(queryResult, focus);
    } else if (format === "yaml") {
      output = exporter.exportAsYAML(queryResult, focus);
    }

    logger.success("Export complete");
    return output;
  } catch (error) {
    logger.error("Export failed", error);
    throw error;
  } finally {
    storage?.close();
  }
}
