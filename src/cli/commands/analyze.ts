import { QueryEngine } from '../../retrieval/query.js';
import { SQLiteStorage } from '../../storage/index.js';
import { GitIntegration } from '../../git/index.js';
import { logger, getDbPath } from '../../utils/index.js';

export interface AnalyzeCommandOptions {
  includeGit?: boolean;
  outputFormat?: 'text' | 'json';
}

export async function analyzeCommand(
  projectRoot: string,
  options: AnalyzeCommandOptions = {}
): Promise<void> {
  try {
    const storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const queryEngine = new QueryEngine(graph, storage, projectRoot);
    const stats = graph.getStats();

    const report: any = {
      overview: {
        nodes: stats.nodeCount,
        edges: stats.edgeCount,
        files: stats.nodesByType['file'] || 0,
        classes: stats.nodesByType['class'] || 0,
        functions: stats.nodesByType['function'] || 0,
        methods: stats.nodesByType['method'] || 0,
      },
      quality: {
        cycles: 0,
        deadExports: 0,
        orphanedFiles: 0,
        unresolvedCalls: 0,
      },
      hotspots: [] as any[],
      gitStats: null as any,
    };

    // Analyze cycles
    const cycles = queryEngine.findCycles(50);
    report.quality.cycles = cycles.length;

    // Analyze dead exports
    const deadExports = queryEngine.findDeadExports();
    report.quality.deadExports = deadExports.length;

    // Analyze orphaned files
    const orphans = queryEngine.findOrphans();
    report.quality.orphanedFiles = orphans.length;

    // Count unresolved calls
    const edges = graph.getEdges();
    report.quality.unresolvedCalls = edges.filter(e => e.type === 'CALLS' && !e.resolved).length;

    // Find hotspots (high-degree nodes)
    const nodes = graph.getNodes();
    const nodesByDegree = nodes
      .map(node => ({
        node,
        degree: graph.getIncomingEdges(node.id).length + graph.getOutgoingEdges(node.id).length,
      }))
      .filter(item => item.degree > 5)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 20);

    report.hotspots = nodesByDegree.map(item => ({
      name: item.node.name,
      type: item.node.type,
      file: item.node.location?.file,
      degree: item.degree,
      incoming: graph.getIncomingEdges(item.node.id).length,
      outgoing: graph.getOutgoingEdges(item.node.id).length,
    }));

    // Git analysis (if enabled)
    if (options.includeGit) {
      const git = new GitIntegration(projectRoot);
      const isRepo = await git.isGitRepo();
      
      if (isRepo) {
        const filePaths = nodes
          .filter(n => n.type === 'file')
          .map(n => n.location?.file)
          .filter((f): f is string => Boolean(f));

        const fileStats = await git.getFileStats(filePaths, '6 months ago');
        const hotspotFiles = Array.from(fileStats.values())
          .filter(s => s.isHotspot)
          .sort((a, b) => b.changeCount - a.changeCount)
          .slice(0, 20);

        report.gitStats = {
          branch: await git.getCurrentBranch(),
          remoteUrl: await git.getRemoteUrl(),
          analyzedFiles: fileStats.size,
          hotspotFiles: hotspotFiles.map(f => ({
            path: f.path,
            changes: f.changeCount,
            authors: f.authors.length,
            lastModified: f.lastModified,
          })),
        };
      }
    }

    // Output report
    if (options.outputFormat === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      logger.info('=== Code-Brain Analysis Report ===\n');
      
      console.log('Overview:');
      console.log(`  Nodes: ${report.overview.nodes}`);
      console.log(`  Edges: ${report.overview.edges}`);
      console.log(`  Files: ${report.overview.files}`);
      console.log(`  Classes: ${report.overview.classes}`);
      console.log(`  Functions: ${report.overview.functions}`);
      console.log(`  Methods: ${report.overview.methods}\n`);

      console.log('Code Quality:');
      console.log(`  Cycles: ${report.quality.cycles}`);
      console.log(`  Dead Exports: ${report.quality.deadExports}`);
      console.log(`  Orphaned Files: ${report.quality.orphanedFiles}`);
      console.log(`  Unresolved Calls: ${report.quality.unresolvedCalls}\n`);

      console.log(`Top Hotspots (${report.hotspots.length}):`);
      report.hotspots.slice(0, 10).forEach((h: any, i: number) => {
        console.log(`  ${i + 1}. ${h.name} (${h.type}) - degree: ${h.degree} (in: ${h.incoming}, out: ${h.outgoing})`);
        console.log(`     ${h.file}`);
      });

      if (report.gitStats) {
        console.log(`\nGit Statistics:`);
        console.log(`  Branch: ${report.gitStats.branch}`);
        console.log(`  Remote: ${report.gitStats.remoteUrl || 'none'}`);
        console.log(`  Analyzed Files: ${report.gitStats.analyzedFiles}`);
        console.log(`\n  Top Git Hotspots (${report.gitStats.hotspotFiles.length}):`);
        report.gitStats.hotspotFiles.slice(0, 10).forEach((f: any, i: number) => {
          console.log(`    ${i + 1}. ${f.path}`);
          console.log(`       Changes: ${f.changes}, Authors: ${f.authors}, Last: ${f.lastModified.toLocaleDateString()}`);
        });
      }
    }

    storage.close();
  } catch (error) {
    logger.error('Analysis failed', error);
    throw error;
  }
}
