import { stringify as toYAML } from "yaml";
import crypto from "crypto";
import path from "path";
import {
  AIExportBundle,
  AnalyticsResult,
  ExportBundle,
  GraphEdge,
  GraphNode,
  GraphLayoutHints,
  KnowledgeIndex,
  ProjectMetadata,
  QueryResult,
  RankingScore,
  SourceSpan,
  SummaryRecord,
} from "../types/models.js";
import { GraphModel } from "../graph/index.js";
import { logger } from "../utils/index.js";
import { applySemanticCompression } from "./semantic-compression.js";

export interface ExportOptions {
  format: "json" | "yaml" | "ai";
  focus?: string;
  maxTokens?: number;
  top?: number;
  model?: string;
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
  constructor(
    private graph: GraphModel,
    private projectMetadata: ProjectMetadata,
    private projectRoot?: string,
  ) {}

  /**
   * Estimate tokens for text based on content type.
   */
  private static estimateTextTokens(
    text: string,
    kind: 'identifier' | 'json' | 'prose' | 'code'
  ): number {
    const len = text.length;
    switch (kind) {
      case 'identifier': return Math.ceil(len / 3);   // camelCase/PascalCase: ~3 chars/token
      case 'json':       return Math.ceil(len / 2);   // JSON structure overhead: ~2 chars/token
      case 'prose':      return Math.ceil(len / 4);   // English text: ~4 chars/token
      case 'code':       return Math.ceil(len / 3.5); // Mixed code: ~3.5 chars/token
    }
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

    // Apply semantic compression for better compression ratio
    logger.info('Applying semantic compression...');
    const compressed = applySemanticCompression(
      queryResult.nodes,
      queryResult.edges,
      {
        deduplication: true,
        metadataStripping: true,
        referenceCompression: true,
        similarityThreshold: 0.75, // Higher threshold = more aggressive
      }
    );

    // Update query result with compressed data
    const compressedResult: QueryResult = {
      ...queryResult,
      nodes: compressed.nodes,
      edges: compressed.edges,
    };

    logger.info(
      `Compression: ${queryResult.nodes.length} → ${compressed.nodes.length} nodes ` +
      `(${compressed.stats.compressionRatio.toFixed(2)}×)`
    );

    const importance = this.computeImportance(compressedResult);
    let optimizedResult = this.prepareAIQueryResult(
      compressedResult,
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

    const bundle: AIExportBundle = {
      ...hierarchicalBundle,
      summary: this.buildAISummary(optimizedResult, importance),
      callChains: this.extractCallChains(optimizedResult, 5, 20),
      ranking: analyticsResult
        ? this.buildRankingFromAnalytics(analyticsResult)
        : this.buildRankingFromImportance(importance),
      knowledge: this.buildKnowledgeIndex(optimizedResult, importance, moduleSummaries),
      layoutHints: this.buildLayoutHints(optimizedResult),
      focus,
      rules: this.getAIRules(),
    };

    return effectiveMaxTokens
      ? this.fitAIExportToBudget(bundle, effectiveMaxTokens)
      : bundle;
  }

  private fitAIExportToBudget(bundle: AIExportBundle, maxTokens: number): AIExportBundle {
    const estimateTokens = (value: unknown): number =>
      Math.ceil(JSON.stringify(value).length / 4);

    if (estimateTokens(bundle) <= maxTokens) {
      return bundle;
    }

    const compact: AIExportBundle = {
      ...bundle,
      nodes: [...bundle.nodes],
      edges: [...bundle.edges],
      summaries: bundle.summaries ? [...bundle.summaries] : [],
      evidence: bundle.evidence ? [...bundle.evidence] : undefined,
      ranking: bundle.ranking ? [...bundle.ranking] : undefined,
      callChains: bundle.callChains ? [...bundle.callChains] : undefined,
      modules: bundle.modules ? [...bundle.modules] : undefined,
      summary: bundle.summary
        ? {
            ...bundle.summary,
            entryPoints: [...bundle.summary.entryPoints],
            coreModules: [...bundle.summary.coreModules],
            keySymbols: [...bundle.summary.keySymbols],
            cycles: [...bundle.summary.cycles],
          }
        : undefined,
      knowledge: bundle.knowledge
        ? {
            ...bundle.knowledge,
            algorithms: [...bundle.knowledge.algorithms],
            architecture: {
              modules: [...bundle.knowledge.architecture.modules],
              entryPoints: [...bundle.knowledge.architecture.entryPoints],
              hotspots: [...bundle.knowledge.architecture.hotspots],
              dependencyCycles: [...bundle.knowledge.architecture.dependencyCycles],
              unresolved: [...bundle.knowledge.architecture.unresolved],
            },
            recommendations: [...bundle.knowledge.recommendations],
          }
        : undefined,
    };

    compact.ranking = compact.ranking?.slice(0, 25);
    compact.evidence = compact.evidence?.slice(0, 40);
    compact.summaries = compact.summaries.slice(0, 24);
    compact.callChains = compact.callChains?.slice(0, 10);
    compact.modules = compact.modules?.slice(0, 12);

    if (compact.summary) {
      compact.summary.entryPoints = compact.summary.entryPoints.slice(0, 12);
      compact.summary.coreModules = compact.summary.coreModules.slice(0, 10);
      compact.summary.keySymbols = compact.summary.keySymbols.slice(0, 12);
      compact.summary.cycles = compact.summary.cycles.slice(0, 8);
    }

    if (compact.knowledge) {
      compact.knowledge.architecture.modules = compact.knowledge.architecture.modules.slice(0, 12);
      compact.knowledge.architecture.hotspots = compact.knowledge.architecture.hotspots.slice(0, 15);
      compact.knowledge.architecture.dependencyCycles = compact.knowledge.architecture.dependencyCycles.slice(0, 8);
      compact.knowledge.architecture.unresolved = compact.knowledge.architecture.unresolved.slice(0, 20);
      compact.knowledge.architecture.entryPoints = compact.knowledge.architecture.entryPoints.slice(0, 12);
    }

    if (estimateTokens(compact) <= maxTokens) {
      return compact;
    }

    const orderedNodes = [...compact.nodes].sort((a: any, b: any) => {
      const aImportance = typeof a.importance === "number" ? a.importance : 0;
      const bImportance = typeof b.importance === "number" ? b.importance : 0;
      return bImportance - aImportance;
    });
    const targetNodeCount = Math.max(12, Math.floor(orderedNodes.length * 0.75));
    const selectedIds = new Set(orderedNodes.slice(0, targetNodeCount).map((node) => node.id));
    compact.nodes = compact.nodes.filter((node) => selectedIds.has(node.id));
    compact.edges = compact.edges.filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to));
    compact.query = {
      ...compact.query,
      truncated: true,
      truncationReason: "Result was compacted to fit the token budget.",
      nodeCount: compact.nodes.length,
      edgeCount: compact.edges.length,
    };
    compact.ranking = compact.ranking?.filter((rank) => selectedIds.has(rank.nodeId)).slice(0, 20);
    compact.summaries = compact.summaries.filter((summary) => selectedIds.has(summary.id)).slice(0, 16);
    compact.evidence = compact.evidence?.slice(0, 24);

    if (compact.summary) {
      compact.summary.keySymbols = compact.summary.keySymbols
        .filter((symbol) => selectedIds.has(symbol.id))
        .slice(0, 10);
    }
    if (compact.knowledge) {
      compact.knowledge.architecture.hotspots = compact.knowledge.architecture.hotspots
        .filter((hotspot) => selectedIds.has(hotspot.id))
        .slice(0, 10);
    }
    compact.pathMap = this.compactPathMap(compact.pathMap, compact.nodes as any[]);

    return compact;
  }

  private compactPathMap(
    pathMap: Record<string, string> | undefined,
    nodes: Array<{ file?: unknown }>,
  ): Record<string, string> | undefined {
    if (!pathMap) return undefined;
    const used = new Set(
      nodes
        .map((node) => node.file)
        .filter((file): file is string => typeof file === "string" && /^F\d+$/.test(file)),
    );
    return Object.fromEntries(
      Object.entries(pathMap).filter(([id]) => used.has(id)),
    );
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
      const dir = path.dirname(filePath);
      
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
        return path.dirname(filePath) === dir;
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
            const targetDir = path.dirname(targetPath);
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
            const sourceDir = path.dirname(sourcePath);
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
  ): AIExportBundle {
    // Add snippets to top nodes BEFORE compression (which strips source text)
    const sortedByImportance = [...queryResult.nodes]
      .sort((a, b) => (importance.get(b.id) ?? 0) - (importance.get(a.id) ?? 0))
      .slice(0, 20);
    
    for (const node of sortedByImportance) {
      if (node.location?.text && node.metadata) {
        const snippet = this.extractSignatureSnippet(node.location.text, node.type, node.metadata);
        if (snippet) {
          node.metadata = { ...node.metadata, snippet };
        }
      }
    }

    // Level 1: Project overview
    const unresolvedCalls = queryResult.edges.filter(e => e.type === 'CALLS_UNRESOLVED').length;
    const totalCalls = queryResult.edges.filter(e => e.type === 'CALLS' || e.type === 'CALLS_UNRESOLVED').length;
    
    const projectOverview: ProjectMetadata = {
      ...this.projectMetadata,
      description: this.projectMetadata.description || 
        `Code graph with ${this.projectMetadata.fileCount} files, ${this.projectMetadata.symbolCount} symbols, and ${this.projectMetadata.edgeCount} relationships.`,
    };

    // Level 2: Module summaries (top modules by importance)
    const topModules = Array.from(moduleSummaries.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20);

    // Level 3: Symbol details (use semantic compression)
    const { compressedNodes, compressedEdges, pathMap } = this.applySemanticCompression(
      queryResult.nodes,
      queryResult.edges,
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
      rules: this.getAIRules(),
      summary: {
        entryPoints: [],
        coreModules: topModules.map(m => m.label),
        keySymbols: [],
        cycles: [],
        unresolvedCount: unresolvedCalls,
      },
    };
  }

  /**
   * Apply semantic compression: replace file paths with short IDs.
   */
  private applySemanticCompression(
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): {
    compressedNodes: any[];
    compressedEdges: any[];
    pathMap: Record<string, string>;
  } {
    // Build path map
    const uniquePaths = new Set<string>();
    for (const node of nodes) {
      if (node.location?.file) {
        uniquePaths.add(node.location.file);
      }
      if (node.metadata?.filePath) {
        uniquePaths.add(node.metadata.filePath as string);
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
      reversePathMap.set(path, id);
    }

    // Compress nodes
    const compressedNodes = nodes.map(node => {
      const compressed: any = {
        id: node.id,
        type: node.type,
        name: node.name,
      };

      if (node.fullName) compressed.fullName = node.fullName;
      if (node.semanticPath) compressed.semanticPath = node.semanticPath;
      if (node.semanticRole) compressed.role = node.semanticRole;
      if (node.summary) compressed.summary = node.summary;
      if (node.importanceScore) compressed.importance = node.importanceScore;

      // Compress file path
      if (node.location?.file) {
        compressed.file = reversePathMap.get(node.location.file) || node.location.file;
        compressed.line = node.location.startLine;
      } else if (node.metadata?.filePath) {
        compressed.file = reversePathMap.get(node.metadata.filePath as string) || node.metadata.filePath;
      }

      // Include only essential metadata
      if (node.metadata?.exported) compressed.exported = true;
      if (node.metadata?.testFile) compressed.testFile = true;
      if (node.metadata?.snippet) compressed.snippet = node.metadata.snippet;
      if (node.metadata?.params) compressed.params = node.metadata.params;
      if (node.metadata?.returnType) compressed.returnType = node.metadata.returnType;

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

  /**
   * Extract a compact signature snippet from source text.
   * Enhanced to use structured params and returnType metadata when available.
   */
  private extractSignatureSnippet(sourceText: string, nodeType: string, metadata?: Record<string, unknown>): string | null {
    if (!sourceText || sourceText.length < 5) return null;
    
    const MAX_SNIPPET = 200;
    const lines = sourceText.split('\n');
    
    if (nodeType === 'function' || nodeType === 'method') {
      // Try to build signature from structured metadata first
      if (metadata?.params && Array.isArray(metadata.params)) {
        const params = metadata.params as Array<{ name: string; type: string; optional: boolean }>;
        const returnType = metadata.returnType as string | undefined;
        
        // Extract function name from first line
        const firstLine = lines[0]?.trim() ?? '';
        const nameMatch = firstLine.match(/(?:function|def|func|public|private|protected)?\s*(\w+)\s*[(<]/);
        const name = nameMatch?.[1] ?? 'unknown';
        
        // Build signature from structured data
        const paramStr = params
          .map(p => {
            const optMarker = p.optional ? '?' : '';
            return p.type !== 'unknown' ? `${p.name}${optMarker}: ${p.type}` : p.name;
          })
          .join(', ');
        
        const retStr = returnType && returnType !== 'unknown' ? `: ${returnType}` : '';
        const sig = `${name}(${paramStr})${retStr}`;
        
        return sig.length > MAX_SNIPPET ? sig.slice(0, MAX_SNIPPET) + '…' : sig;
      }
      
      // Fallback to text-based extraction
      const sigLines: string[] = [];
      for (const line of lines) {
        sigLines.push(line.trim());
        if (line.includes('{') || line.includes('=>')) break;
        if (sigLines.length >= 5) break;
      }
      const sig = sigLines.join(' ').replace(/\s+/g, ' ').replace(/\{$/, '').trim();
      return sig.length > MAX_SNIPPET ? sig.slice(0, MAX_SNIPPET) + '…' : sig;
    }
    
    if (nodeType === 'class' || nodeType === 'interface') {
      // First line only: class/interface declaration
      const firstLine = lines[0]?.trim() ?? '';
      return firstLine.length > MAX_SNIPPET ? firstLine.slice(0, MAX_SNIPPET) + '…' : firstLine;
    }
    
    if (nodeType === 'type') {
      const sig = sourceText.replace(/\s+/g, ' ').trim();
      return sig.length > MAX_SNIPPET ? sig.slice(0, MAX_SNIPPET) + '…' : sig;
    }
    
    return null;
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

  private pruneByTokenBudget(
    queryResult: QueryResult,
    maxTokens: number,
    analyticsResult?: AnalyticsResult,
    moduleSummaries?: Map<string, ModuleSummary>,
  ): QueryResult {
    // Reserve 20% for metadata and structure, apply safety margin
    const SAFETY = 0.85;
    const contentBudget = Math.floor(maxTokens * SAFETY * 0.8);
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

    tokens += ExportEngine.estimateTextTokens(node.name, 'identifier');
    tokens += ExportEngine.estimateTextTokens(node.fullName || '', 'identifier');
    tokens += ExportEngine.estimateTextTokens(node.summary || '', 'prose');
    tokens += ExportEngine.estimateTextTokens(JSON.stringify(node.metadata || {}), 'json');
    tokens += node.provenance.source.reduce((sum, span) => {
      return (
        sum +
        ExportEngine.estimateTextTokens(span.file || '', 'identifier') +
        ExportEngine.estimateTextTokens(span.text || '', 'code')
      );
    }, 0);

    return Math.ceil(tokens);
  }

  private estimateEdgeTokens(edge: GraphEdge): number {
    let tokens = 0;

    tokens += 50; // Edge type and structure
    tokens += ExportEngine.estimateTextTokens(JSON.stringify(edge.metadata || {}), 'json');
    tokens += (edge.sourceLocation || []).reduce((sum, span) => {
      return (
        sum +
        ExportEngine.estimateTextTokens(span.file || '', 'identifier') +
        ExportEngine.estimateTextTokens(span.text || '', 'code')
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

  private buildKnowledgeIndex(
    queryResult: QueryResult,
    importance: Map<string, number>,
    moduleSummaries: Map<string, ModuleSummary>,
  ): KnowledgeIndex {
    const nodeById = new Map(queryResult.nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    const languageSummary: Record<string, number> = {};

    for (const node of queryResult.nodes) {
      const language = String(node.metadata?.language || node.metadata?.parserLanguage || node.metadata?.fileLanguage || "unknown");
      if (node.type === "file") {
        languageSummary[language] = (languageSummary[language] || 0) + 1;
      }
      incoming.set(node.id, 0);
      outgoing.set(node.id, 0);
    }

    for (const edge of queryResult.edges) {
      outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
      incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    }

    const cycles = this.detectCycles(queryResult, 50);
    const unresolved = queryResult.edges
      .filter((edge) => !edge.resolved || edge.type === "CALLS_UNRESOLVED")
      .slice(0, 100)
      .map((edge) => ({
        from: this.getCanonicalName(nodeById.get(edge.from) || { id: edge.from, name: edge.from } as GraphNode),
        to: this.getCanonicalName(nodeById.get(edge.to) || { id: edge.to, name: edge.to } as GraphNode),
        type: edge.type,
        name: String(edge.metadata?.unresolvedName || edge.metadata?.symbol || "") || undefined,
      }));

    const hotspots = queryResult.nodes
      .filter((node) => !["project", "module"].includes(node.type))
      .map((node) => {
        const inc = incoming.get(node.id) || 0;
        const out = outgoing.get(node.id) || 0;
        const score = Number(((importance.get(node.id) || 0) + Math.log1p(inc + out) / 10).toFixed(4));
        return {
          id: node.id,
          name: this.getCanonicalName(node),
          type: node.type,
          score,
          incoming: inc,
          outgoing: out,
          reason: inc > out * 2 ? "many dependents" : out > inc * 2 ? "orchestrates many dependencies" : "central graph position",
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    const entryPoints = queryResult.edges
      .filter((edge) => edge.type === "ENTRY_POINT")
      .map((edge) => nodeById.get(edge.to))
      .filter((node): node is GraphNode => Boolean(node))
      .map((node) => this.getCanonicalName(node))
      .sort();

    const modules = Array.from(moduleSummaries.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 50)
      .map((module, index) => ({
        id: `M${index + 1}`,
        path: module.path,
        label: module.label,
        role: this.inferModuleRole(module),
        fileCount: module.fileCount,
        symbolCount: module.symbolCount,
        importance: Number(module.importance.toFixed(4)),
        topSymbols: module.topSymbols,
      }));

    const isolatedNodeCount = queryResult.nodes.filter((node) => {
      return (incoming.get(node.id) || 0) + (outgoing.get(node.id) || 0) === 0;
    }).length;
    const unresolvedEdgeCount = queryResult.edges.filter((edge) => !edge.resolved).length;

    return {
      schemaVersion: "codebrain-knowledge/v1",
      algorithms: [
        {
          name: "Tree-sitter AST extraction",
          purpose: "Language-aware symbol and import extraction",
          implementation: "Per-language parsers plus generic tree-sitter parser for extended languages",
        },
        {
          name: "Degree/PageRank-style importance",
          purpose: "Prioritize central symbols and files for agents",
          implementation: "Incoming/outgoing edge weighted importance with entry-point boosts",
        },
        {
          name: "Tarjan strongly connected components",
          purpose: "Detect dependency cycles without false path sampling",
          implementation: "SCC over resolved import/dependency/inheritance edges",
        },
        {
          name: "Community/module grouping",
          purpose: "Summarize architecture by directory and graph neighborhood",
          implementation: "Directory modules plus server-side graph communities",
        },
      ],
      graphHealth: {
        nodeCount: queryResult.nodes.length,
        edgeCount: queryResult.edges.length,
        resolvedEdgeCount: queryResult.edges.length - unresolvedEdgeCount,
        unresolvedEdgeCount,
        isolatedNodeCount,
        cycleCount: cycles.length,
      },
      languageSummary,
      architecture: {
        modules,
        entryPoints,
        hotspots,
        dependencyCycles: cycles,
        unresolved,
      },
      recommendations: this.buildRecommendations(queryResult, unresolved.length, cycles.length, isolatedNodeCount),
    };
  }

  private buildLayoutHints(queryResult: QueryResult): GraphLayoutHints {
    const nodeCount = queryResult.nodes.length;
    return {
      recommendedAlgorithm: nodeCount > 2000 ? "clustered-lod-forceatlas2" : "community-seeded-forceatlas2",
      algorithms: [
        "community-seeded circular initialization",
        "ForceAtlas2 force-directed refinement",
        "rank-scaled node sizing",
        "edge-type weighted styling",
        "Tarjan SCC highlighting",
      ],
      nodeCount,
      edgeCount: queryResult.edges.length,
      partitionBy: "communityId/moduleContext/directory",
      rankBy: "importance + degree + entry-point boost",
      edgeWeightBy: "relationship type and resolved confidence",
    };
  }

  private inferModuleRole(module: ModuleSummary): string {
    const text = `${module.path}/${module.label}`.toLowerCase();
    if (text.includes("parser")) return "language_parsing";
    if (text.includes("graph")) return "graph_modeling";
    if (text.includes("retrieval") || text.includes("export")) return "knowledge_export";
    if (text.includes("server") || text.includes("api")) return "serving_api";
    if (text.includes("storage") || text.includes("db")) return "persistence";
    if (text.includes("ui")) return "visualization";
    if (text.includes("test")) return "testing";
    if (module.importedBy.length > module.imports.length * 2) return "core_shared_module";
    if (module.imports.length > module.importedBy.length * 2) return "orchestration_module";
    return "application_module";
  }

  private buildRecommendations(
    queryResult: QueryResult,
    unresolvedCount: number,
    cycleCount: number,
    isolatedNodeCount: number,
  ): string[] {
    const recommendations: string[] = [];
    if (unresolvedCount > 0) {
      recommendations.push(`Resolve or classify ${unresolvedCount} unresolved relationships to improve agent confidence.`);
    }
    if (cycleCount > 0) {
      recommendations.push(`Review ${cycleCount} dependency cycle(s); cycles make architecture harder to reason about and refactor.`);
    }
    if (isolatedNodeCount > Math.max(10, queryResult.nodes.length * 0.15)) {
      recommendations.push("Investigate isolated nodes; they may be generated files, dead code, or missing parser relationships.");
    }
    if (queryResult.truncated) {
      recommendations.push("Export is truncated; use a larger token budget or focused export before making broad architectural claims.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Graph health is strong for this export scope; prioritize high-score hotspots for review.");
    }
    return recommendations;
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
    // Guard against stack overflow on large graphs
    if (queryResult.nodes.length > 5000) {
      logger.debug('Cycle detection skipped: graph too large');
      return [];
    }

    const nodeById = new Map(queryResult.nodes.map((n) => [n.id, n]));
    const cycleEdgeTypes = new Set(['IMPORTS', 'DEPENDS_ON', 'EXTENDS', 'IMPLEMENTS']);
    
    // Build adjacency — only cycle-relevant edge types, only resolved
    const adj = new Map<string, Set<string>>();
    for (const node of queryResult.nodes) adj.set(node.id, new Set());
    for (const edge of queryResult.edges) {
      if (!cycleEdgeTypes.has(edge.type) || !edge.resolved) continue;
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
      adj.get(edge.from)?.add(edge.to);
    }
    
    // Tarjan SCC
    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    
    const strongconnect = (v: string): void => {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);
      
      for (const w of adj.get(v) ?? []) {
        if (!indices.has(w)) {
          strongconnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }
      
      if (lowlink.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        if (scc.length > 1) sccs.push(scc); // Only multi-node SCCs are actual cycles
      }
    };
    
    for (const node of queryResult.nodes) {
      if (!indices.has(node.id)) strongconnect(node.id);
      if (sccs.length >= limit) break;
    }
    
    // Convert to name arrays, deduplicate by sorted canonical names
    const seenKeys = new Set<string>();
    const cycles: string[][] = [];
    for (const scc of sccs.slice(0, limit)) {
      const names = scc
        .map(id => nodeById.get(id))
        .filter((n): n is GraphNode => Boolean(n))
        .map(n => this.getCanonicalName(n));
      const key = [...names].sort().join('|');
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        cycles.push(names);
      }
    }
    return cycles;
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

  private getAIRules(): string[] {
    return [
      // Source authority
      "FACT SOURCE: Every fact in this bundle is derived from deterministic AST parsing, not inference. Treat it as ground truth.",
      "SNIPPET AUTHORITY: When a node has a 'snippet' field, use it as the ground-truth signature. Do not infer types or parameters beyond what the snippet shows.",
      "SUMMARY AUTHORITY: When a node has a 'summary' field, use it as the canonical description of that symbol.",
      
      // Handling unknowns
      "UNRESOLVED EDGES: When an edge has resolved=false, describe the relationship as 'possibly calls' or 'may depend on', not 'calls' or 'depends on'.",
      "MISSING RELATIONSHIPS: If a relationship is not listed in this bundle, it is unknown — not absent. Do not assert that two symbols are unrelated.",
      "UNKNOWN FIELDS: If a field is missing or null, output 'unknown'. Never invent a value.",
      
      // Scope discipline
      "SCOPE: Do not widen analysis beyond the nodes and edges in this bundle. Do not import knowledge from training data about how this codebase works.",
      "NO FABRICATION: Do not fabricate API shapes, function signatures, module names, or import paths. Use only what is listed.",
      "PATH MAP: File paths are compressed to F1, F2, etc. The 'pathMap' field at the top of this bundle maps short IDs back to full paths. Always resolve before citing a file.",
      
      // Confidence signals
      "IMPORTANCE SCORE: The 'importance' field (0-1) indicates how central this node is to the codebase. Prioritize high-importance nodes in your analysis.",
      "TRUNCATION: If query.truncated=true, this bundle is a subset. Relationships to nodes outside this subset are not represented.",
      "INFERRED ROLES: The 'role' field on nodes is a heuristic label, not a parser fact. Treat it as a low-confidence hint.",
    ];
  }
}
