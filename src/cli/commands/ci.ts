/**
 * CI/CD-specific commands with JSON output for GitHub Actions integration
 */

import { QueryEngine } from '../../retrieval/query.js';
import { ImpactTracer } from '../../retrieval/impact-tracer.js';
import { InvariantDetector } from '../../graph/invariants.js';
import { SQLiteStorage } from '../../storage/index.js';
import { getDbPath } from '../../utils/index.js';

export interface CICommandOptions {
  files?: string;  // Comma-separated list of files
  json?: boolean;  // Output JSON (default: true for CI commands)
}

/**
 * Analyze impact of changed files (for CI/CD)
 */
export async function impactCommand(
  projectRoot: string,
  options: CICommandOptions = {}
): Promise<void> {
  try {
    const storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const tracer = new ImpactTracer(graph);

    const files = options.files ? options.files.split(',').map(f => f.trim()).filter(Boolean) : [];
    
    if (files.length === 0) {
      if (options.json !== false) {
        console.log(JSON.stringify({ error: 'No files specified', blastRadius: 0, affected: 0, tests: 0 }));
      } else {
        console.error('No files specified');
      }
      return;
    }

    // Find all symbols in changed files
    const changedSymbols = graph.getNodes().filter(node => 
      files.some(file => node.location?.file?.endsWith(file))
    );

    if (changedSymbols.length === 0) {
      if (options.json !== false) {
        console.log(JSON.stringify({ 
          files: files.length,
          symbols: 0,
          blastRadius: 0, 
          affected: 0, 
          tests: 0,
          message: 'No symbols found in changed files'
        }));
      } else {
        console.log('No symbols found in changed files');
      }
      return;
    }

    // Analyze impact of each changed symbol
    let maxBlastRadius = 0;
    let totalAffected = new Set<string>();
    let totalTests = new Set<string>();

    for (const symbol of changedSymbols) {
      const analysis = tracer.analyzeImpact(symbol.id);
      if (analysis) {
        maxBlastRadius = Math.max(maxBlastRadius, analysis.blastRadius);
        analysis.transitiveImpact.forEach(n => totalAffected.add(n.id));
        analysis.affectedTests.forEach(t => totalTests.add(t.id));
      }
    }

    const result = {
      files: files.length,
      symbols: changedSymbols.length,
      blastRadius: maxBlastRadius,
      affected: totalAffected.size,
      tests: totalTests.size,
      changedSymbols: changedSymbols.slice(0, 10).map(s => ({
        name: s.name,
        type: s.type,
        file: s.location?.file,
        importance: s.importance
      }))
    };

    if (options.json !== false) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Impact Analysis:`);
      console.log(`  Files changed: ${result.files}`);
      console.log(`  Symbols changed: ${result.symbols}`);
      console.log(`  Blast radius: ${(result.blastRadius * 100).toFixed(1)}%`);
      console.log(`  Affected symbols: ${result.affected}`);
      console.log(`  Affected tests: ${result.tests}`);
    }
  } catch (error) {
    if (options.json !== false) {
      console.log(JSON.stringify({ error: String(error), blastRadius: 0, affected: 0, tests: 0 }));
    } else {
      console.error('Error analyzing impact:', error);
    }
    process.exit(1);
  }
}

/**
 * Check architecture invariants (for CI/CD)
 */
export async function invariantsCommand(
  projectRoot: string,
  options: CICommandOptions = {}
): Promise<void> {
  try {
    const storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const detector = new InvariantDetector(graph);

    const report = detector.checkInvariants();

    const result = {
      healthScore: report.healthScore,
      totalViolations: report.totalViolations,
      errors: report.errors.map(e => ({
        invariant: e.ruleId,
        message: e.message,
        nodeName: e.node.name,
        nodeType: e.node.type
      })),
      warnings: report.warnings.map(w => ({
        invariant: w.ruleId,
        message: w.message,
        nodeName: w.node.name,
        nodeType: w.node.type
      })),
      info: report.info.map(i => ({
        invariant: i.ruleId,
        message: i.message,
        nodeName: i.node.name,
        nodeType: i.node.type
      }))
    };

    if (options.json !== false) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Architecture Invariants:`);
      console.log(`  Health score: ${result.healthScore}%`);
      console.log(`  Total violations: ${result.totalViolations}`);
      console.log(`  Errors: ${result.errors.length}`);
      console.log(`  Warnings: ${result.warnings.length}`);
      
      if (result.errors.length > 0) {
        console.log(`\nErrors:`);
        result.errors.forEach(e => {
          console.log(`  - ${e.invariant}: ${e.message} (${e.nodeName})`);
        });
      }
    }

    // Exit with error code if there are violations
    if (result.errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    if (options.json !== false) {
      console.log(JSON.stringify({ error: String(error), healthScore: 0, errors: [], warnings: [] }));
    } else {
      console.error('Error checking invariants:', error);
    }
    process.exit(1);
  }
}

/**
 * Find dead code in changed files (for CI/CD)
 */
export async function deadCodeCommand(
  projectRoot: string,
  options: CICommandOptions = {}
): Promise<void> {
  try {
    const storage = new SQLiteStorage(getDbPath(projectRoot));
    const graph = storage.loadGraph(projectRoot);
    const queryEngine = new QueryEngine(graph, storage, projectRoot);

    const files = options.files ? options.files.split(',').map(f => f.trim()).filter(Boolean) : [];
    
    const deadExports = queryEngine.findDeadExports();
    
    // Filter to changed files if specified
    const filteredDead = files.length > 0
      ? deadExports.filter(node => files.some(file => node.location?.file?.endsWith(file)))
      : deadExports;

    const result = {
      count: filteredDead.length,
      total: deadExports.length,
      nodes: filteredDead.slice(0, 20).map(n => ({
        name: n.name,
        type: n.type,
        file: n.location?.file,
        line: n.location?.startLine,
        importance: n.importance
      }))
    };

    if (options.json !== false) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Dead Code:`);
      console.log(`  Found in changed files: ${result.count}`);
      console.log(`  Total in project: ${result.total}`);
      
      if (result.count > 0) {
        console.log(`\nDead symbols in changed files:`);
        result.nodes.forEach(n => {
          console.log(`  - ${n.name} (${n.type}) in ${n.file}:${n.line}`);
        });
      }
    }
  } catch (error) {
    if (options.json !== false) {
      console.log(JSON.stringify({ error: String(error), count: 0, nodes: [] }));
    } else {
      console.error('Error finding dead code:', error);
    }
    process.exit(1);
  }
}
