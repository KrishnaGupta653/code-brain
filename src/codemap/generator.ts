/**
 * CODEMAP.md Generator
 * 
 * Generates a persistent, human+AI readable wiki of the codebase structure.
 * This is the Karpathy LLM-wiki pattern: a compounding artifact that gets
 * richer with every update, committed to git, instantly readable by any AI.
 */

import fs from 'fs';
import path from 'path';
import { SQLiteStorage } from '../storage/index.js';
import { GraphModel } from '../graph/index.js';
import { GitIntegration } from '../git/integration.js';

interface CodemapOptions {
  quiet?: boolean;
}

export class CodemapGenerator {
  constructor(
    private storage: SQLiteStorage,
    private projectRoot: string
  ) {}

  async generate(options: CodemapOptions = {}): Promise<string> {
    const graph = this.storage.loadGraph(this.projectRoot);
    const projectMeta = this.storage.getProject(this.projectRoot);
    
    if (!projectMeta) {
      throw new Error('Project not indexed. Run code-brain index first.');
    }

    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    
    // Compute statistics
    const stats = this.computeStatistics(nodes, edges);
    
    // Detect entry points
    const entryPoints = this.detectEntryPoints(nodes, edges);
    
    // Build module map
    const moduleMap = this.buildModuleMap(nodes);
    
    // Detect known issues
    const issues = this.detectKnownIssues(nodes, edges);
    
    // Get hotspots from git
    const hotspots = await this.getHotspots();
    
    // Read existing CODEMAP.md to preserve user content
    const existingContent = this.readExistingCodemap();
    const userSections = this.extractUserSections(existingContent);
    
    // Generate the markdown
    const markdown = this.buildMarkdown({
      projectMeta,
      stats,
      entryPoints,
      moduleMap,
      issues,
      hotspots,
      userSections,
    });
    
    return markdown;
  }

  private computeStatistics(nodes: any[], edges: any[]) {
    const byType = new Map<string, number>();
    for (const node of nodes) {
      byType.set(node.type, (byType.get(node.type) || 0) + 1);
    }
    
    const resolvedEdges = edges.filter(e => e.resolved).length;
    const unresolvedEdges = edges.length - resolvedEdges;
    const resolutionRate = edges.length > 0 
      ? Math.round((resolvedEdges / edges.length) * 100) 
      : 100;
    
    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      byType,
      resolvedEdges,
      unresolvedEdges,
      resolutionRate,
    };
  }

  private detectEntryPoints(nodes: any[], edges: any[]) {
    const entryPointEdges = edges.filter(e => e.type === 'ENTRY_POINT');
    const entryPointIds = new Set(entryPointEdges.map(e => e.to));
    
    const entryPoints = nodes
      .filter(n => entryPointIds.has(n.id) || 
                   n.name === 'main' || 
                   n.name === 'index' ||
                   n.type === 'route')
      .slice(0, 10)
      .map(n => ({
        symbol: n.name,
        file: n.location?.file || 'unknown',
        line: n.location?.startLine || 0,
        role: n.semanticRole || n.type,
      }));
    
    return entryPoints;
  }

  private buildModuleMap(nodes: any[]) {
    // Group nodes by directory
    const byDir = new Map<string, any[]>();
    
    for (const node of nodes) {
      if (!node.location?.file) continue;
      const dir = path.dirname(node.location.file);
      const arr = byDir.get(dir) || [];
      arr.push(node);
      byDir.set(dir, arr);
    }
    
    // Build module summaries
    const modules: Array<{
      path: string;
      nodeCount: number;
      description: string;
    }> = [];
    
    for (const [dir, dirNodes] of byDir.entries()) {
      if (dirNodes.length < 3) continue; // Skip small directories
      
      const types = new Set(dirNodes.map(n => n.type));
      const description = this.inferModuleDescription(dir, dirNodes);
      
      modules.push({
        path: dir,
        nodeCount: dirNodes.length,
        description,
      });
    }
    
    return modules.sort((a, b) => b.nodeCount - a.nodeCount).slice(0, 15);
  }

  private inferModuleDescription(dir: string, nodes: any[]): string {
    const basename = path.basename(dir);
    const types = new Set(nodes.map(n => n.type));
    
    // Pattern matching for common module types
    if (basename.includes('test')) return 'Test suite';
    if (basename.includes('cli')) return 'Command-line interface';
    if (basename.includes('server') || basename.includes('api')) return 'Server/API layer';
    if (basename.includes('storage') || basename.includes('db')) return 'Data persistence';
    if (basename.includes('parser')) return 'Source code parsing';
    if (basename.includes('graph')) return 'Graph construction and analysis';
    if (basename.includes('util')) return 'Utility functions';
    if (basename.includes('config')) return 'Configuration management';
    
    // Infer from node types
    if (types.has('route')) return 'API routes';
    if (types.has('test')) return 'Tests';
    if (types.has('config')) return 'Configuration';
    
    return `${nodes.length} symbols`;
  }

  private detectKnownIssues(nodes: any[], edges: any[]) {
    const issues: Array<{ issue: string; severity: string; location: string }> = [];
    
    // Unresolved calls
    const unresolvedCalls = edges.filter(e => e.type === 'CALLS_UNRESOLVED').length;
    const totalCalls = edges.filter(e => e.type === 'CALLS' || e.type === 'CALLS_UNRESOLVED').length;
    if (unresolvedCalls > 0 && totalCalls > 0) {
      const pct = Math.round((unresolvedCalls / totalCalls) * 100);
      if (pct > 15) {
        issues.push({
          issue: `${pct}% of CALLS edges unresolved (callbacks/dynamic dispatch)`,
          severity: 'Medium',
          location: 'graph/builder.ts',
        });
      }
    }
    
    // Inferred nodes
    const inferredNodes = nodes.filter(n => n.metadata?.inferred === true);
    if (inferredNodes.length > 0) {
      const pct = Math.round((inferredNodes.length / nodes.length) * 100);
      if (pct > 5) {
        issues.push({
          issue: `${inferredNodes.length} symbols heuristically detected (not parser-proven)`,
          severity: 'Low',
          location: 'parser/fallback.ts',
        });
      }
    }
    
    return issues;
  }

  private async getHotspots(): Promise<Array<{ file: string; changes: number; authors: number }>> {
    try {
      const git = new GitIntegration(this.projectRoot);
      const hotspots = await git.getHotspots(30); // Last 30 days
      return hotspots.slice(0, 5);
    } catch {
      return [];
    }
  }

  private readExistingCodemap(): string {
    const codemapPath = path.join(this.projectRoot, 'CODEMAP.md');
    if (fs.existsSync(codemapPath)) {
      return fs.readFileSync(codemapPath, 'utf-8');
    }
    return '';
  }

  private extractUserSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    const regex = /<!-- USER-CONTENT-START:(\w+) -->([\s\S]*?)<!-- USER-CONTENT-END:\1 -->/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      sections.set(match[1], match[2].trim());
    }
    
    return sections;
  }

  private buildMarkdown(data: any): string {
    const { projectMeta, stats, entryPoints, moduleMap, issues, hotspots, userSections } = data;
    
    const lines: string[] = [];
    const now = new Date().toISOString();
    const fingerprint = this.computeFingerprint(stats);
    
    lines.push(`# CODEMAP`);
    lines.push(``);
    lines.push(`<!-- Generated by code-brain v1.0.0 | Fingerprint: ${fingerprint} | ${now} -->`);
    lines.push(`<!-- Regenerate: code-brain codemap | Do not edit between GENERATED markers -->`);
    lines.push(``);
    
    // Overview
    lines.push(`## Overview`);
    lines.push(``);
    lines.push(`- **Project**: ${projectMeta.name}`);
    lines.push(`- **Language**: ${projectMeta.language}`);
    
    const fileCount = stats.byType.get('file') || 0;
    const testCount = stats.byType.get('test') || 0;
    const configCount = stats.byType.get('config') || 0;
    lines.push(`- **Files**: ${fileCount} source · ${testCount} test · ${configCount} config`);
    
    const symbolCount = stats.totalNodes - fileCount - testCount - configCount;
    const functionCount = (stats.byType.get('function') || 0) + (stats.byType.get('method') || 0);
    const classCount = stats.byType.get('class') || 0;
    const routeCount = stats.byType.get('route') || 0;
    lines.push(`- **Symbols**: ${symbolCount} total (${functionCount} functions · ${classCount} classes · ${routeCount} routes)`);
    
    lines.push(`- **Relationships**: ${stats.totalEdges} edges (${stats.resolutionRate}% resolved · ${100 - stats.resolutionRate}% unresolved)`);
    
    if (entryPoints.length > 0) {
      const entryList = entryPoints.map((e: any) => `\`${e.file}\``).join(' · ');
      lines.push(`- **Entry points**: ${entryList}`);
    }
    
    lines.push(`- **Last indexed**: ${new Date(projectMeta.updatedAt).toISOString().slice(0, 10)}`);
    lines.push(``);
    
    // Architecture (user can customize this)
    lines.push(`## Architecture`);
    lines.push(``);
    if (userSections.has('architecture')) {
      lines.push(userSections.get('architecture')!);
    } else {
      lines.push(`<!-- USER-CONTENT-START:architecture -->`);
      lines.push(`(Add your architecture description here - it will be preserved across regenerations)`);
      lines.push(`<!-- USER-CONTENT-END:architecture -->`);
    }
    lines.push(``);
    
    // Entry Points
    if (entryPoints.length > 0) {
      lines.push(`## Entry Points`);
      lines.push(``);
      lines.push(`| Symbol | File | Line | Role |`);
      lines.push(`|--------|------|------|------|`);
      for (const ep of entryPoints) {
        lines.push(`| \`${ep.symbol}\` | \`${ep.file}\` | ${ep.line} | ${ep.role} |`);
      }
      lines.push(``);
    }
    
    // Module Map
    if (moduleMap.length > 0) {
      lines.push(`## Module Map`);
      lines.push(``);
      for (const mod of moduleMap) {
        lines.push(`### \`${mod.path}/\` — ${mod.description}`);
        lines.push(``);
        lines.push(`${mod.nodeCount} symbols`);
        lines.push(``);
      }
    }
    
    // Known Issues
    if (issues.length > 0) {
      lines.push(`## Known Issues`);
      lines.push(``);
      lines.push(`| Issue | Severity | Location |`);
      lines.push(`|-------|----------|----------|`);
      for (const issue of issues) {
        lines.push(`| ${issue.issue} | ${issue.severity} | ${issue.location} |`);
      }
      lines.push(``);
    }
    
    // Hotspots
    if (hotspots.length > 0) {
      lines.push(`## Hotspots (Most Changed, Highest Risk)`);
      lines.push(``);
      lines.push(`| File | Changes (30d) | Authors |`);
      lines.push(`|------|---------------|---------|`);
      for (const hs of hotspots) {
        lines.push(`| \`${hs.file}\` | ${hs.changes} | ${hs.authors} |`);
      }
      lines.push(``);
    }
    
    // How to Navigate
    lines.push(`## How to Navigate This Codebase (for AI agents)`);
    lines.push(``);
    lines.push(`1. Read \`src/types/models.ts\` first — ALL data types live here`);
    lines.push(`2. Read \`src/storage/schema.ts\` — the full DB schema`);
    lines.push(`3. Trace the index flow: \`cli/index.ts\` → \`graph/builder.ts\` → \`parser/typescript.ts\``);
    lines.push(`4. Trace the export flow: \`cli/export.ts\` → \`retrieval/query.ts\` → \`retrieval/export.ts\``);
    lines.push(`5. Every node ID is deterministic: \`stableId(type, path)\` from \`utils/hash.ts\``);
    lines.push(`6. All errors extend \`CodeBrainError\` from \`utils/errors.ts\``);
    lines.push(`7. All logging via \`logger\` from \`utils/logger.ts\` — never \`console.log\``);
    lines.push(``);
    
    return lines.join('\n');
  }

  private computeFingerprint(stats: any): string {
    const data = `${stats.totalNodes}-${stats.totalEdges}-${stats.resolutionRate}`;
    return Buffer.from(data).toString('base64').slice(0, 8);
  }

  async save(markdown: string): Promise<void> {
    const codemapPath = path.join(this.projectRoot, 'CODEMAP.md');
    fs.writeFileSync(codemapPath, markdown, 'utf-8');
  }
}
