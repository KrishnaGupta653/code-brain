import { stringify as toYAML } from "yaml";
import crypto from "crypto";
import {
  AIExportBundle,
  AnalyticsResult,
  ExportBundle,
  ExportQuality,
  GraphEdge,
  GraphNode,
  ProjectMetadata,
  QueryResult,
  RankingScore,
  SourceSpan,
  SummaryRecord,
} from "../types/models.js";
import { GraphModel } from "../graph/index.js";

export interface ExportOptions {
  format: "json" | "yaml" | "ai";
  focus?: string;
  maxTokens?: number;
  top?: number;
  model?: string;
  mode?: "full" | "signatures" | "modules";
  since?: string; // Git diff: date, commit, or branch
  bundle?: string; // Pre-built bundle name
}

interface ModuleSummary {
  path: string;
  label: string;
  fileCount: number;
  symbolCount: number;
  classCount: number;
  functionCount: number;
  routeCount: number;
  topSymbols: Array<{ id: string; name: string; type: string; importance: number }>;
  imports: string[];
  importedBy: string[];
  importance: number;
}

interface ModelConfig {
  tokens: number;
  safeUse: number;
}

const MODEL_CONTEXT_WINDOWS: Record<string, ModelConfig> = {
  'gpt-4': { tokens: 8192, safeUse: 0.7 },
  'gpt-4-turbo': { tokens: 128000, safeUse: 0.8 },
  'gpt-4-32k': { tokens: 32768, safeUse: 0.75 },
  'claude-3-opus': { tokens: 200000, safeUse: 0.8 },
  'claude-3-sonnet': { tokens: 200000, safeUse: 0.8 },
  'claude-3-haiku': { tokens: 200000, safeUse: 0.75 },
  'claude-3.5-sonnet': { tokens: 200000, safeUse: 0.8 },
  'gemini-1.5-pro': { tokens: 1000000, safeUse: 0.85 },
  'gemini-1.5-flash': { tokens: 1000000, safeUse: 0.85 },
  'llama-3-70b': { tokens: 8192, safeUse: 0.7 },
  'llama-3.1-405b': { tokens: 128000, safeUse: 0.8 },
};

export class ExportEngine {
  private static readonly TOKENS_PER_CHAR = 0.25; // More accurate for JSON/code
  private static readonly TOKEN_SAFETY_MARGIN = 0.85; // Use only 85% of declared budget

  constructor(
    private graph: GraphModel,
    private projectMetadata: ProjectMetadata,
    private projectRoot?: string,
  ) {}

  /**
   * Filter query result to only include changed files and their dependencies.
   * Used for diff-based exports (--since flag).
   */
  filterByChangedFiles(
    queryResult: QueryResult,
    changedFiles: string[],
    includeDepth: number = 1,
  ): QueryResult {
    if (changedFiles.length === 0) {
      return { nodes: [], edges: [], truncated: false };
    }

    // Normalize changed file paths
    const normalizedChangedFiles = new Set(
      changedFiles.map(f => f.replace(/\\/g, '/'))
    );

    // Find file nodes that match changed files
    const changedFileNodes = queryResult.nodes.filter(node => {
      if (node.type !== 'file') return false;
      const filePath = (node.location?.file || node.fullName || '').replace(/\\/g, '/');
      return normalizedChangedFiles.has(filePath) || 
             Array.from(normalizedChangedFiles).some(cf => filePath.endsWith(cf));
    });

    if (changedFileNodes.length === 0) {
      return { nodes: [], edges: [], truncated: false };
    }

    // Collect all nodes in changed files
    const relevantNodeIds = new Set<string>();
    for (const fileNode of changedFileNodes) {
      relevantNodeIds.add(fileNode.id);
      
      // Add all symbols defined in this file
      const definesEdges = queryResult.edges.filter(
        e => e.from === fileNode.id && e.type === 'DEFINES'
      );
      for (const edge of definesEdges) {
        relevantNodeIds.add(edge.to);
      }
    }

    // Expand to include dependencies (imports, calls) up to includeDepth
    if (includeDepth > 0) {
      const queue: Array<{ id: string; depth: number }> = Array.from(relevantNodeIds).map(
        id => ({ id, depth: 0 })
      );
      const visited = new Set<string>(relevantNodeIds);

      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depth >= includeDepth) continue;

        // Follow outgoing edges (what this node depends on)
        const outgoing = queryResult.edges.filter(e => e.from === id);
        for (const edge of outgoing) {
          if (!visited.has(edge.to)) {
            visited.add(edge.to);
            relevantNodeIds.add(edge.to);
            queue.push({ id: edge.to, depth: depth + 1 });
          }
        }

        // Follow incoming edges (what depends on this node)
        const incoming = queryResult.edges.filter(e => e.to === id);
        for (const edge of incoming) {
          if (!visited.has(edge.from)) {
            visited.add(edge.from);
            relevantNodeIds.add(edge.from);
            queue.push({ id: edge.from, depth: depth + 1 });
          }
        }
      }
    }

    // Filter nodes and edges
    const filteredNodes = queryResult.nodes.filter(n => relevantNodeIds.has(n.id));
    const filteredEdges = queryResult.edges.filter(
      e => relevantNodeIds.has(e.from) && relevantNodeIds.has(e.to)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      truncated: false,
    };
  }

  exportForAI(
    queryResult: QueryResult,
    focus?: string,
    analyticsResult?: AnalyticsResult,
    maxTokens?: number,
    top?: number,
    model?: string,
  ): AIExportBundle {
    // Determine token budget from model if specified
    let effectiveMaxTokens = maxTokens;
    if (model && MODEL_CONTEXT_WINDOWS[model]) {
      const modelConfig = MODEL_CONTEXT_WINDOWS[model];
      effectiveMaxTokens = Math.floor(modelConfig.tokens * modelConfig.safeUse);
    }

    const importance = this.computeImportance(queryResult);
    let optimizedResult = this.prepareAIQueryResult(
      queryResult,
      importance,
      top,
    );

    // Generate module summaries for hierarchical export
    const moduleSummaries = this.generateModuleSummaries(optimizedResult, importance);

    if (effectiveMaxTokens) {
      optimizedResult = this.pruneByTokenBudget(
        optimizedResult,
        effectiveMaxTokens,
        analyticsResult,
        moduleSummaries,
      );
    }

    // Build hierarchical structure
    const hierarchicalBundle = this.buildHierarchicalExport(
      optimizedResult,
      moduleSummaries,
      importance,
      focus,
    );

    return {
      ...hierarchicalBundle,
      summary: this.buildAISummary(optimizedResult, importance),
      callChains: this.extractCallChains(optimizedResult, 5, 20),
      ranking: analyticsResult
        ? this.buildRankingFromAnalytics(analyticsResult)
        : this.buildRankingFromImportance(importance),
      focus,
      quality: this.computeExportQuality(optimizedResult),
      rules: this.getAIRules(optimizedResult),
    };
  }

  private computeExportQuality(queryResult: QueryResult): ExportQuality {
    let score = 100;
    const notes: string[] = [];

    const unresolvedPct = queryResult.edges.filter(e => !e.resolved).length /
      Math.max(1, queryResult.edges.length);
    const unresolvedDeduction = Math.min(25, Math.round(unresolvedPct * 100));
    score -= unresolvedDeduction;
    if (unresolvedDeduction > 0)
      notes.push(`-${unresolvedDeduction}: ${Math.round(unresolvedPct*100)}% unresolved calls`);

    if (queryResult.truncated) { score -= 15; notes.push('-15: export was truncated'); }

    const testFiles = queryResult.nodes.filter(n => n.type === 'test').length;
    if (testFiles === 0) { score -= 10; notes.push('-10: no test files present'); }

    const inferredPct = queryResult.nodes.filter(n => n.metadata?.inferred).length /
      Math.max(1, queryResult.nodes.length);
    const inferredDeduction = Math.min(10, Math.round(inferredPct * 50));
    score -= inferredDeduction;
    if (inferredDeduction > 0)
      notes.push(`-${inferredDeduction}: ${Math.round(inferredPct*100)}% inferred symbols`);

    const cycles = this.detectCycles(queryResult, 10);
    const cycleDeduction = Math.min(15, cycles.length * 3);
    score -= cycleDeduction;
    if (cycleDeduction > 0)
      notes.push(`-${cycleDeduction}: ${cycles.length} circular dependency chains`);

    const finalScore = Math.max(0, Math.round(score));
    const grade =
      finalScore >= 90 ? 'A' : finalScore >= 80 ? 'B' :
      finalScore >= 70 ? 'C' : finalScore >= 60 ? 'D' : 'F';

    return {
      score: finalScore, grade, notes,
      unresolvedCallPct: Math.round(unresolvedPct * 100),
      inferredNodePct: Math.round(inferredPct * 100),
      truncated: queryResult.truncated,
      cycleCount: cycles.length,
      testCoveragePresent: testFiles > 0,
    };
  }

  private getAIRules(queryResult?: QueryResult): string[] {
    const base = [
      'Use only nodes, edges, and evidence listed in this bundle.',
      'Do not infer behavior not explicitly represented here.',
      'Treat missing relationships as unknown. Treat unresolved as unresolved.',
      'Do not fabricate APIs, flows, or modules absent from source.',
      'Use source spans as ground truth. If evidence is absent, say "not found".',
    ];

    if (!queryResult) return base;

    const dynamic: string[] = [];

    const unresolvedPct = Math.round(
      queryResult.edges.filter(e => !e.resolved).length /
      Math.max(1, queryResult.edges.length) * 100
    );
    if (unresolvedPct > 15) {
      dynamic.push(
        `CAUTION: ${unresolvedPct}% of call edges are CALLS_UNRESOLVED ` +
        `(callbacks, dynamic dispatch, or cross-module calls not yet resolved). ` +
        `Do not assume call chains in this export are complete.`
      );
    }

    const cycles = this.detectCycles(queryResult, 3);
    if (cycles.length > 0) {
      dynamic.push(
        `CIRCULAR DEPS: ${cycles.length} circular import chains detected: ` +
        cycles.slice(0,2).map(c => c.join(' → ')).join('; ') +
        `. Do not assume clean dependency ordering.`
      );
    }

    const testCount = queryResult.nodes.filter(n => n.type === 'test').length;
    if (testCount === 0) {
      dynamic.push('WARNING: No test files in this export. Assume no automated coverage.');
    }

    const inferredCount = queryResult.nodes.filter(
      n => n.metadata?.inferred === true
    ).length;
    if (inferredCount > 0) {
      dynamic.push(
        `INFERRED: ${inferredCount} symbols were heuristically detected (not parser-proven). ` +
        `Treat them as low-confidence hints, not facts.`
      );
    }

    return [...base, ...dynamic];
  }

  /**
   * Generate module-level summaries by grouping files by directory.
   */
  private generateModuleSummaries(
    queryResult: QueryResult,
    importance: Map<string, number>,
  ): Map<string, ModuleSummary> {
    const summaries = new Map<string, ModuleSummary>();
    const fileNodes = queryResult.nodes.filter(n => n.type === 'file');
    
    // Group files by directory
    const filesByDir = new Map<string, GraphNode[]>();
    for (const file of fileNodes) {
      const filePath = file.location?.file || file.fullName || '';
      const dir = filePath.includes('/') 
        ? filePath.substring(0, filePath.lastIndexOf('/'))
        : '.';
      
      if (!filesByDir.has(dir)) {
        filesByDir.set(dir, []);
      }
      filesByDir.get(dir)!.push(file);
    }

    // Build summary for each directory
    for (const [dir, files] of filesByDir) {
      const fileIds = new Set(files.map(f => f.id));
      
      // Find all symbols in these files
      const symbols = queryResult.nodes.filter(n => {
        const filePath = n.metadata?.filePath as string || n.location?.file || '';
        return filePath.startsWith(dir + '/') || filePath === dir;
      });

      const classCount = symbols.filter(s => s.type === 'class').length;
      const functionCount = symbols.filter(s => s.type === 'function' || s.type === 'method').length;
      const routeCount = symbols.filter(s => s.type === 'route').length;

      // Find top symbols by importance
      const topSymbols = symbols
        .filter(s => !['file', 'module', 'project'].includes(s.type))
        .sort((a, b) => (importance.get(b.id) || 0) - (importance.get(a.id) || 0))
        .slice(0, 5)
        .map(s => ({
          id: s.id,
          name: s.name,
          type: s.type,
          importance: importance.get(s.id) || 0,
        }));

      // Find imports (files this module imports from)
      const imports = new Set<string>();
      for (const file of files) {
        const outgoing = queryResult.edges.filter(e => 
          e.from === file.id && (e.type === 'IMPORTS' || e.type === 'DEPENDS_ON')
        );
        for (const edge of outgoing) {
          const target = queryResult.nodes.find(n => n.id === edge.to);
          if (target && target.type === 'file') {
            const targetPath = target.location?.file || target.fullName || '';
            const targetDir = targetPath.includes('/')
              ? targetPath.substring(0, targetPath.lastIndexOf('/'))
              : '.';
            if (targetDir !== dir) {
              imports.add(targetDir);
            }
          }
        }
      }

      // Find importers (files that import from this module)
      const importedBy = new Set<string>();
      for (const file of files) {
        const incoming = queryResult.edges.filter(e =>
          e.to === file.id && (e.type === 'IMPORTS' || e.type === 'DEPENDS_ON')
        );
        for (const edge of incoming) {
          const source = queryResult.nodes.find(n => n.id === edge.from);
          if (source && source.type === 'file') {
            const sourcePath = source.location?.file || source.fullName || '';
            const sourceDir = sourcePath.includes('/')
              ? sourcePath.substring(0, sourcePath.lastIndexOf('/'))
              : '.';
            if (sourceDir !== dir) {
              importedBy.add(sourceDir);
            }
          }
        }
      }

      // Calculate module importance (average of file importances)
      const moduleImportance = files.reduce((sum, f) => sum + (importance.get(f.id) || 0), 0) / files.length;

      summaries.set(dir, {
        path: dir,
        label: dir.split('/').pop() || dir,
        fileCount: files.length,
        symbolCount: symbols.length,
        classCount,
        functionCount,
        routeCount,
        topSymbols,
        imports: Array.from(imports).sort(),
        importedBy: Array.from(importedBy).sort(),
        importance: moduleImportance,
      });
    }

    return summaries;
  }

  /**
   * Build hierarchical export with 3 levels: project → modules → symbols.
   */
  private buildHierarchicalExport(
    queryResult: QueryResult,
    moduleSummaries: Map<string, ModuleSummary>,
    importance: Map<string, number>,
    focus?: string,
  ): Omit<AIExportBundle, 'rules' | 'summary' | 'callChains' | 'ranking'> {
    // Level 1: Project overview
    const unresolvedCalls = queryResult.edges.filter(e => e.type === 'CALLS_UNRESOLVED').length;
    const totalCalls = queryResult.edges.filter(e => e.type === 'CALLS' || e.type === 'CALLS_UNRESOLVED').length;
    
    const description =
      `Code graph export: ${queryResult.nodes.length} nodes, ` +
      `${queryResult.edges.length} edges` +
      (focus ? ` (focus: ${focus})` : ' (full project)') +
      `. Indexed: ${new Date(this.projectMetadata.updatedAt).toISOString().slice(0,10)}.`;
    
    const projectOverview: ProjectMetadata = {
      ...this.projectMetadata,
      description,
    };

    // Level 2: Module summaries (top modules by importance)
    const topModules = Array.from(moduleSummaries.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20);

    // Level 3: Symbol details (use semantic compression)
    const { compressedNodes, compressedEdges, pathMap } = this.applySemanticCompression(
      queryResult.nodes,
      queryResult.edges,
      importance,
    );

    return {
      version: 'codebrain-ai/v3-hierarchical',
      fingerprint: this.computeFingerprint(queryResult.nodes, queryResult.edges),
      project: projectOverview,
      modules: topModules,
      pathMap,
      nodes: compressedNodes as any,
      edges: compressedEdges as any,
      summaries: this.buildSummaries(queryResult.nodes),
      query: {
        focus: focus || 'project',
        truncated: queryResult.truncated,
        truncationReason: queryResult.truncated
          ? 'Result was limited by query breadth or token budget.'
          : undefined,
        nodeCount: queryResult.nodes.length,
        edgeCount: queryResult.edges.length,
      },
      evidence: this.buildEvidence(queryResult.nodes, queryResult.edges),
      exportedAt: Date.now(),
      exportFormat: 'ai',
    };
  }

  /**
   * Apply semantic compression: replace file paths with short IDs.
   */
  private applySemanticCompression(
    nodes: GraphNode[],
    edges: GraphEdge[],
    importance: Map<string, number>,
  ): {
    compressedNodes: any[];
    compressedEdges: any[];
    pathMap: Record<string, string>;
  } {
    // Normalize path to forward slashes for cross-platform consistency
    const normalizePath = (p: string): string => p.replace(/\\/g, '/');

    // Build path map
    const uniquePaths = new Set<string>();
    for (const node of nodes) {
      if (node.location?.file) {
        uniquePaths.add(normalizePath(node.location.file));
      }
      if (node.metadata?.filePath) {
        uniquePaths.add(normalizePath(node.metadata.filePath as string));
      }
    }

    const pathMap: Record<string, string> = {};
    let pathId = 1;
    for (const path of Array.from(uniquePaths).sort()) {
      pathMap[`F${pathId}`] = path;
      pathId++;
    }

    // Reverse map for compression
    const reversePathMap = new Map<string, string>();
    for (const [id, path] of Object.entries(pathMap)) {
      reversePathMap.set(normalizePath(path), id);
    }

    // Compress nodes
    const compressedNodes = nodes.map(node => {
      const compressed: any = {
        id: node.id,
        type: node.type,
        name: node.name,
        canonicalName: this.getCanonicalName(node),
        importance: Number(
          (importance.get(node.id) ?? node.importanceScore ?? 0).toFixed(4),
        ),
      };

      if (node.fullName) compressed.fullName = node.fullName;
      if (node.semanticPath) compressed.semanticPath = node.semanticPath;
      if (node.semanticRole) compressed.role = node.semanticRole;
      if (node.summary) compressed.summary = node.summary;
      // Compress file path
      if (node.location?.file) {
        compressed.file = reversePathMap.get(normalizePath(node.location.file)) ?? normalizePath(node.location.file);
        compressed.line = node.location.startLine;
      } else if (node.metadata?.filePath) {
        compressed.file = reversePathMap.get(normalizePath(node.metadata.filePath as string)) ?? normalizePath(node.metadata.filePath as string);
      }

      // Include only essential metadata
      if (node.metadata?.exported) compressed.exported = true;
      if (node.metadata?.testFile) compressed.testFile = true;

      return compressed;
    });

    // Compress edges
    const compressedEdges = edges.map(edge => {
      const compressed: any = {
        from: edge.from,
        to: edge.to,
        type: edge.type,
        resolved: edge.resolved,
      };
      
      if (edge.metadata?.resolvedViaImport) {
        compressed.viaImport = true;
      }
      if (edge.metadata?.unresolvedName) {
        compressed.unresolved = edge.metadata.unresolvedName;
      }
      
      return compressed;
    });

    return { compressedNodes, compressedEdges, pathMap };
  }

  exportAsJSON(queryResult: QueryResult, focus?: string): string {
    return JSON.stringify(
      this.createBundle(queryResult, "json", focus),
      null,
      2,
    );
  }

  exportAsYAML(queryResult: QueryResult, focus?: string): string {
    return toYAML(this.createBundle(queryResult, "yaml", focus));
  }

  /**
   * Export signatures only - 10x more token-efficient for code navigation.
   * Returns function/method/class signatures with minimal metadata.
   */
  exportSignatures(queryResult: QueryResult, focus?: string): string {
    const symbols = queryResult.nodes
      .filter(n => ['function','method','class','interface','type','route'].includes(n.type))
      .sort((a,b) => (b.importanceScore??0) - (a.importanceScore??0));

    const lines: string[] = [
      `// code-brain signatures export | ${new Date().toISOString()}`,
      `// Project: ${this.projectMetadata.name} | Focus: ${focus ?? 'all'}`,
      `// ${symbols.length} symbols | read CODEMAP.md for architecture`,
      '',
    ];

    for (const sym of symbols) {
      const loc = sym.location;
      if (loc) {
        const relPath = this.projectRoot 
          ? loc.file.replace(this.projectRoot, '').replace(/^\//, '')
          : loc.file;
        lines.push(`// ${relPath}:${loc.startLine}`);
      }
      
      // Extract signature from location.text or build from metadata
      const sig = this.extractSignature(sym);
      lines.push(sig);
      if (sym.summary) lines.push(`→ ${sym.summary}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export module summaries only - useful for architecture-first navigation.
   */
  exportModules(queryResult: QueryResult, focus?: string): string {
    const importance = this.computeImportance(queryResult);
    const moduleSummaries = Array.from(
      this.generateModuleSummaries(queryResult, importance).values(),
    ).sort((a, b) => b.importance - a.importance);

    const lines: string[] = [
      `# code-brain modules export`,
      `# Generated: ${new Date().toISOString()}`,
      `# Project: ${this.projectMetadata.name} | Focus: ${focus ?? "all"}`,
      `# Modules: ${moduleSummaries.length} | read CODEMAP.md for full architecture`,
      "",
    ];

    for (const moduleSummary of moduleSummaries) {
      lines.push(`## ${moduleSummary.path}`);
      lines.push(
        `files=${moduleSummary.fileCount} symbols=${moduleSummary.symbolCount} ` +
          `classes=${moduleSummary.classCount} functions=${moduleSummary.functionCount} ` +
          `routes=${moduleSummary.routeCount} importance=${moduleSummary.importance.toFixed(4)}`,
      );

      if (moduleSummary.topSymbols.length > 0) {
        lines.push(
          `top: ${moduleSummary.topSymbols
            .map(
              (symbol) =>
                `${symbol.name}(${symbol.type}, ${symbol.importance.toFixed(4)})`,
            )
            .join(", ")}`,
        );
      }

      if (moduleSummary.imports.length > 0) {
        lines.push(`imports: ${moduleSummary.imports.join(", ")}`);
      }

      if (moduleSummary.importedBy.length > 0) {
        lines.push(`importedBy: ${moduleSummary.importedBy.join(", ")}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  async countTokensAccurate(text: string): Promise<number> {
    try {
      const dynamicImport = new Function(
        "specifier",
        "return import(specifier)",
      ) as (specifier: string) => Promise<{
        get_encoding?: (name: string) => {
          encode(text: string): number[];
          free?(): void;
        };
      }>;
      const { get_encoding } = await dynamicImport("tiktoken");
      if (!get_encoding) {
        throw new Error("tiktoken get_encoding() unavailable");
      }
      const encoding = get_encoding("cl100k_base");
      const count = encoding.encode(text).length;
      encoding.free?.();
      return count;
    } catch {
      return Math.ceil(text.length * 0.27);
    }
  }

  private extractSignature(sym: GraphNode): string {
    // If we have source text, extract the signature line
    if (sym.location?.text) {
      const lines = sym.location.text.split('\n');
      const firstLine = lines[0].trim();
      // Remove opening brace if present
      return firstLine.replace(/\s*\{?\s*$/, '');
    }

    // Otherwise build from metadata
    const parts: string[] = [];
    
    if (sym.metadata?.async) parts.push('async');
    if (sym.metadata?.exported) parts.push('export');
    
    if (sym.type === 'class') {
      parts.push('class', sym.name);
      if (sym.metadata?.extends) parts.push('extends', sym.metadata.extends as string);
    } else if (sym.type === 'interface') {
      parts.push('interface', sym.name);
    } else if (sym.type === 'type') {
      parts.push('type', sym.name);
    } else if (sym.type === 'function' || sym.type === 'method') {
      parts.push('function', `${sym.name}(...)`);
    } else if (sym.type === 'route') {
      parts.push(`route ${sym.name}`);
    }

    return parts.join(' ');
  }

  private pruneByTokenBudget(
    queryResult: QueryResult,
    maxTokens: number,
    analyticsResult?: AnalyticsResult,
    moduleSummaries?: Map<string, ModuleSummary>,
  ): QueryResult {
    // Reserve 20% for metadata and structure, apply safety margin
    const contentBudget = Math.floor(maxTokens * ExportEngine.TOKEN_SAFETY_MARGIN * 0.8);
    const nodeContentBudget = Math.floor(contentBudget * 0.7);
    const edgeContentBudget = Math.floor(contentBudget * 0.3);

    // Rank nodes by importance if analytics available
    const rankedNodes = this.rankNodesForExport(
      queryResult.nodes,
      analyticsResult,
    );

    // Prune nodes by token budget
    let nodeTokenCount = 0;
    const selectedNodeIds = new Set<string>();

    for (const node of rankedNodes) {
      const nodeTokens = this.estimateNodeTokens(node);
      if (nodeTokenCount + nodeTokens <= nodeContentBudget) {
        nodeTokenCount += nodeTokens;
        selectedNodeIds.add(node.id);
      }
    }

    // Filter edges to only selected nodes
    const selectedEdges = queryResult.edges.filter(
      (edge) => selectedNodeIds.has(edge.from) && selectedNodeIds.has(edge.to),
    );

    // Prune edges by token budget if needed
    let edgeTokenCount = 0;
    const finalEdges: GraphEdge[] = [];

    for (const edge of selectedEdges) {
      const edgeTokens = this.estimateEdgeTokens(edge);
      if (edgeTokenCount + edgeTokens <= edgeContentBudget) {
        edgeTokenCount += edgeTokens;
        finalEdges.push(edge);
      }
    }

    const selectedNodes = Array.from(selectedNodeIds)
      .map((id) => queryResult.nodes.find((n) => n.id === id))
      .filter((n): n is GraphNode => Boolean(n));

    return {
      nodes: selectedNodes,
      edges: finalEdges,
      truncated:
        selectedNodes.length < queryResult.nodes.length ||
        finalEdges.length < queryResult.edges.length,
    };
  }

  private rankNodesForExport(
    nodes: GraphNode[],
    analyticsResult?: AnalyticsResult,
  ): GraphNode[] {
    return [...nodes].sort((a, b) => {
      // Priority 1: Focus-related nodes first
      const aIsFocus =
        a.type === "file" || a.type === "class" || a.type === "function";
      const bIsFocus =
        b.type === "file" || b.type === "class" || b.type === "function";
      if (aIsFocus !== bIsFocus) return aIsFocus ? -1 : 1;

      // Priority 2: By centrality if available
      if (analyticsResult) {
        const aScore = analyticsResult.centrality.get(a.id) ?? 0;
        const bScore = analyticsResult.centrality.get(b.id) ?? 0;
        if (aScore !== bScore) return bScore - aScore;
      }

      // Priority 3: By type importance
      const typeOrder = {
        file: 1,
        class: 2,
        function: 3,
        method: 4,
        route: 5,
        interface: 6,
        type: 7,
        constant: 8,
        variable: 9,
        config: 10,
      };
      const aTypeOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 100;
      const bTypeOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 100;
      if (aTypeOrder !== bTypeOrder) return aTypeOrder - bTypeOrder;

      // Fallback: alphabetical
      return a.name.localeCompare(b.name);
    });
  }

  private estimateNodeTokens(node: GraphNode): number {
    let tokens = 0;

    tokens += node.name.length * ExportEngine.TOKENS_PER_CHAR;
    tokens += (node.fullName || "").length * ExportEngine.TOKENS_PER_CHAR;
    tokens += (node.summary || "").length * ExportEngine.TOKENS_PER_CHAR;
    tokens +=
      JSON.stringify(node.metadata || {}).length * ExportEngine.TOKENS_PER_CHAR;
    tokens += node.provenance.source.reduce((sum, span) => {
      return (
        sum +
        (span.file?.length ?? 0) +
        (span.text?.length ?? 0) * ExportEngine.TOKENS_PER_CHAR
      );
    }, 0);

    return Math.ceil(tokens);
  }

  private estimateEdgeTokens(edge: GraphEdge): number {
    let tokens = 0;

    tokens += 50; // Edge type and structure
    tokens +=
      JSON.stringify(edge.metadata || {}).length * ExportEngine.TOKENS_PER_CHAR;
    tokens += (edge.sourceLocation || []).reduce((sum, span) => {
      return (
        sum +
        (span.file?.length ?? 0) +
        (span.text?.length ?? 0) * ExportEngine.TOKENS_PER_CHAR
      );
    }, 0);

    return Math.ceil(tokens);
  }

  private createBundle(
    queryResult: QueryResult,
    format: "json" | "yaml" | "ai",
    focus?: string,
  ): ExportBundle {
    const importance = this.computeImportance(queryResult);
    const nodes = [...queryResult.nodes].sort((a, b) => {
      if (format === "ai") {
        const scoreDelta =
          (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
      }
      return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    });
    const edges = [...queryResult.edges].sort((a, b) => {
      if (format === "ai" && a.resolved !== b.resolved) {
        return a.resolved ? -1 : 1;
      }
      return a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
    });

    return {
      version: format === "ai" ? "codebrain-ai/v2" : "codebrain-export/v1",
      fingerprint: this.computeFingerprint(nodes, edges),
      project: this.projectMetadata,
      nodes: nodes.map((node) => this.serializeNode(node, importance)),
      edges: edges.map((edge) => this.serializeEdge(edge)),
      summaries: this.buildSummaries(nodes),
      query: {
        focus: focus || "project",
        truncated: queryResult.truncated,
        truncationReason: queryResult.truncated
          ? "Result was limited by query breadth or token budget."
          : undefined,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
      evidence: this.buildEvidence(nodes, edges),
      exportedAt: Date.now(),
      exportFormat: format,
      rules: format === "ai" ? this.getAIRules() : undefined,
    };
  }

  private buildSummaries(nodes: GraphNode[]): SummaryRecord[] {
    const summaries: SummaryRecord[] = [];
    const projectNode = this.graph
      .getNodes()
      .find((node) => node.type === "project");
    if (projectNode) {
      summaries.push({
        id: projectNode.id,
        label: projectNode.name,
        type: "project",
        summary: `Project graph with ${this.projectMetadata.fileCount} files and ${this.projectMetadata.edgeCount} relationships.`,
        provenance: projectNode.provenance.source,
      });
    }

    const fileNodes = nodes.filter((node) => node.type === "file").slice(0, 20);
    for (const node of fileNodes) {
      const defined = this.graph
        .getOutgoingEdges(node.id)
        .filter((edge) => edge.type === "DEFINES").length;
      const dependsOn = this.graph
        .getOutgoingEdges(node.id)
        .filter(
          (edge) => edge.type === "IMPORTS" || edge.type === "DEPENDS_ON",
        ).length;
      summaries.push({
        id: node.id,
        label: node.name,
        type: "file",
        summary: `${node.name} defines ${defined} symbols and depends on ${dependsOn} modules/files.`,
        provenance: node.provenance.source,
      });
    }

    const symbols = nodes
      .filter((node) =>
        ["class", "function", "method", "route", "config"].includes(node.type),
      )
      .slice(0, 25);
    for (const node of symbols) {
      const outgoing = this.graph.getOutgoingEdges(node.id).length;
      const incoming = this.graph.getIncomingEdges(node.id).length;
      summaries.push({
        id: node.id,
        label: node.fullName || node.name,
        type: "symbol",
        summary: `${node.type} ${node.name} has ${outgoing} outgoing and ${incoming} incoming relationships.`,
        provenance: node.provenance.source,
      });
    }

    return summaries;
  }

  private buildRankingFromAnalytics(
    analyticsResult: AnalyticsResult,
  ): RankingScore[] {
    const ranking: RankingScore[] = [];
    for (const [nodeId, score] of analyticsResult.centrality.entries()) {
      ranking.push({
        nodeId,
        score: Number(score),
        algorithm: "betweenness_centrality",
        components: {
          pagerank: Number(analyticsResult.importance.get(nodeId) || 0),
        },
      });
    }

    return ranking.sort((a, b) => b.score - a.score).slice(0, 50);
  }

  private buildRankingFromImportance(
    importance: Map<string, number>,
  ): RankingScore[] {
    return Array.from(importance.entries())
      .map(([nodeId, score]) => ({
        nodeId,
        score,
        algorithm: "degree_importance",
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }

  private buildEvidence(nodes: GraphNode[], edges: GraphEdge[]): SourceSpan[] {
    const seen = new Set<string>();
    const evidence: SourceSpan[] = [];
    const addSpan = (span: SourceSpan): void => {
      const cleaned = this.stripSourceText(span);
      const key = [
        cleaned.file,
        cleaned.startLine,
        cleaned.startCol,
        cleaned.endLine,
        cleaned.endCol,
      ].join(":");
      if (!seen.has(key)) {
        seen.add(key);
        evidence.push(cleaned);
      }
    };

    for (const node of nodes) {
      for (const span of node.provenance.source) {
        addSpan(span);
      }
    }

    for (const edge of edges) {
      for (const span of edge.provenance.source) {
        addSpan(span);
      }
    }

    return evidence
      .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine)
      .slice(0, 100);
  }

  private serializeNode(
    node: GraphNode,
    importance: Map<string, number> = new Map(),
  ): GraphNode {
    return {
      ...node,
      canonicalName: this.getCanonicalName(node),
      importance: Number((importance.get(node.id) ?? 0).toFixed(4)),
      location: node.location ? this.stripSourceText(node.location) : undefined,
      summary: node.summary || "unknown",
      metadata: {
        ...(node.metadata || {}),
        inferred: node.metadata?.inferred ?? false,
      },
      provenance: {
        ...node.provenance,
        source: node.provenance.source.map((span) =>
          this.stripSourceText(span),
        ),
      },
    };
  }

  private prepareAIQueryResult(
    queryResult: QueryResult,
    importance: Map<string, number>,
    top?: number,
  ): QueryResult {
    const nodes = queryResult.nodes
      .filter((node) => !this.isAINoiseNode(node))
      .sort(
        (a, b) => (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0),
      );
    const selectedNodes = typeof top === "number" ? nodes.slice(0, top) : nodes;
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const edges = queryResult.edges.filter(
      (edge) =>
        (selectedIds.has(edge.from) && selectedIds.has(edge.to)) ||
        (edge.type === "ENTRY_POINT" && selectedIds.has(edge.to)),
    );

    return {
      ...queryResult,
      nodes: selectedNodes,
      edges,
      truncated:
        queryResult.truncated ||
        selectedNodes.length < queryResult.nodes.length,
    };
  }

  private isAINoiseNode(node: GraphNode): boolean {
    return (
      node.name.startsWith("env:") ||
      node.name.startsWith("config:dotenv") ||
      String(node.fullName || "").startsWith("env:") ||
      String(node.fullName || "").startsWith("config:dotenv")
    );
  }

  private computeImportance(queryResult: QueryResult): Map<string, number> {
    const scores = new Map<string, number>();
    const nodes = queryResult.nodes;
    const nodeIds = new Set(nodes.map((node) => node.id));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    const entryPoints = new Set(
      queryResult.edges
        .filter((edge) => edge.type === "ENTRY_POINT")
        .map((edge) => edge.to),
    );

    for (const edge of queryResult.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
      outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }

    const denominator = Math.max(1, nodes.length * 0.1);
    for (const node of nodes) {
      const typeBoost = [
        "project",
        "file",
        "class",
        "function",
        "method",
        "route",
      ].includes(node.type)
        ? 0.15
        : 0;
      const entryBoost = entryPoints.has(node.id) ? 0.35 : 0;
      const score =
        ((incoming.get(node.id) ?? 0) * 1.5 + (outgoing.get(node.id) ?? 0)) /
          denominator +
        typeBoost +
        entryBoost;
      scores.set(node.id, Math.min(1, Number(score.toFixed(4))));
    }

    return scores;
  }

  private buildAISummary(
    queryResult: QueryResult,
    importance: Map<string, number>,
  ): AIExportBundle["summary"] {
    const nodeById = new Map(queryResult.nodes.map((node) => [node.id, node]));
    const entryPoints = queryResult.edges
      .filter((edge) => edge.type === "ENTRY_POINT")
      .map((edge) => nodeById.get(edge.to))
      .filter((node): node is GraphNode => Boolean(node))
      .map((node) => this.getCanonicalName(node))
      .sort();
    const coreModules = queryResult.nodes
      .filter((node) => node.type === "file" || node.type === "module")
      .sort((a, b) => (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0))
      .slice(0, 12)
      .map((node) => this.getCanonicalName(node));
    const keySymbols = queryResult.nodes
      .filter((node) => !["project", "file", "module"].includes(node.type))
      .sort((a, b) => (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0))
      .slice(0, 20)
      .map((node) => ({
        id: node.id,
        canonicalName: this.getCanonicalName(node),
        role: node.semanticRole,
        importance: Number((importance.get(node.id) ?? 0).toFixed(4)),
      }));
    const unresolvedCount = queryResult.edges.filter(
      (edge) => edge.type === "CALLS_UNRESOLVED" || !edge.resolved,
    ).length;

    return {
      entryPoints,
      coreModules,
      keySymbols,
      cycles: this.detectCycles(queryResult, 25),
      unresolvedCount,
    };
  }

  private extractCallChains(
    queryResult: QueryResult,
    maxDepth: number,
    limit: number,
  ): string[][] {
    const nodeById = new Map(queryResult.nodes.map((node) => [node.id, node]));
    const outgoingCalls = new Map<string, string[]>();
    for (const edge of queryResult.edges) {
      if (edge.type !== "CALLS" || !edge.resolved) continue;
      const targets = outgoingCalls.get(edge.from) || [];
      targets.push(edge.to);
      outgoingCalls.set(edge.from, targets);
    }

    const entryIds = queryResult.edges
      .filter((edge) => edge.type === "ENTRY_POINT")
      .map((edge) => edge.to)
      .filter((id) => nodeById.has(id));
    const seeds =
      entryIds.length > 0
        ? entryIds
        : queryResult.nodes
            .filter((node) =>
              ["function", "method", "route"].includes(node.type),
            )
            .slice(0, 10)
            .map((node) => node.id);
    const chains: string[][] = [];

    const visit = (nodeId: string, path: string[]): void => {
      if (chains.length >= limit) return;
      const nextPath = [...path, nodeId];
      const targets = outgoingCalls.get(nodeId) || [];
      if (targets.length === 0 || nextPath.length >= maxDepth) {
        if (nextPath.length > 1) {
          chains.push(
            nextPath
              .map((id) => nodeById.get(id))
              .filter((node): node is GraphNode => Boolean(node))
              .map((node) => this.getCanonicalName(node)),
          );
        }
        return;
      }
      for (const target of targets.slice(0, 6)) {
        if (!nextPath.includes(target)) {
          visit(target, nextPath);
        }
      }
    };

    for (const seed of seeds) {
      visit(seed, []);
      if (chains.length >= limit) break;
    }

    return chains;
  }

  private detectCycles(queryResult: QueryResult, limit: number): string[][] {
    const nodeById = new Map(queryResult.nodes.map(n => [n.id, n]));
    const adjacency = new Map<string, string[]>();
    const cycleEdgeTypes = new Set(['IMPORTS','DEPENDS_ON','EXTENDS','IMPLEMENTS']);
    
    for (const edge of queryResult.edges) {
      if (!cycleEdgeTypes.has(edge.type) || !edge.resolved) continue;
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
      const arr = adjacency.get(edge.from) ?? [];
      arr.push(edge.to);
      adjacency.set(edge.from, arr);
    }
    
    // Tarjan's SCC
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let counter = 0;
    
    const strongConnect = (v: string): void => {
      if (sccs.length >= limit) return;
      index.set(v, counter);
      lowlink.set(v, counter++);
      stack.push(v);
      onStack.add(v);
      
      for (const w of adjacency.get(v) ?? []) {
        if (!index.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
        }
      }
      
      if (lowlink.get(v) === index.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        if (scc.length > 1) {
          sccs.push(
            scc.map(id => this.getCanonicalName(nodeById.get(id)!)).filter(Boolean)
          );
        }
      }
    };
    
    for (const node of queryResult.nodes) {
      if (!index.has(node.id)) strongConnect(node.id);
      if (sccs.length >= limit) break;
    }
    return sccs;
  }

  private getCanonicalName(node: GraphNode): string {
    return node.semanticPath || node.fullName || node.name;
  }

  private computeFingerprint(nodes: GraphNode[], edges: GraphEdge[]): string {
    const payload = JSON.stringify({
      nodes: nodes.map((node) => [
        node.id,
        node.type,
        this.getCanonicalName(node),
        node.location?.file,
        node.location?.startLine,
        node.location?.endLine,
      ]),
      edges: edges.map((edge) => [
        edge.id,
        edge.type,
        edge.from,
        edge.to,
        edge.resolved,
      ]),
    });
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  private serializeEdge(edge: GraphEdge): GraphEdge {
    return {
      ...edge,
      sourceLocation: (edge.sourceLocation || []).map((span) =>
        this.stripSourceText(span),
      ),
      metadata: {
        ...(edge.metadata || {}),
        inferred: edge.metadata?.inferred ?? false,
      },
      provenance: {
        ...edge.provenance,
        source: edge.provenance.source.map((span) =>
          this.stripSourceText(span),
        ),
      },
    };
  }

  private stripSourceText<T extends { text?: string }>(span: T): T {
    const cleaned = { ...span };
    delete cleaned.text;
    return cleaned;
  }

}
