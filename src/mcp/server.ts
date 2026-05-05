import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SQLiteStorage } from '../storage/sqlite.js';
import { ExportEngine } from '../retrieval/export.js';
import { QueryEngine } from '../retrieval/query.js';
import { ImpactTracer } from '../retrieval/impact-tracer.js';
import { PatternQueryEngine } from '../retrieval/pattern-query.js';
import { InvariantDetector } from '../graph/invariants.js';
import { ContextAssembler } from '../retrieval/context-assembler.js';
import { QueryResult } from '../types/models.js';
import { logger } from '../utils/index.js';
import path from 'path';

// Zod schemas for tool inputs
const GetGraphExportSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
  focus: z.string().optional(),
  max_tokens: z.number().int().positive().optional().default(100000),
  model: z.string().optional().default('gpt-4'),
});

const GetGraphExportCBv2Schema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
  focus: z.string().optional(),
  max_tokens: z.number().int().positive().optional().default(100000),
});

const SearchSymbolsSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
  query: z.string().min(1, 'Query is required'),
  limit: z.number().int().positive().optional().default(20),
});

const FindCallersSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
  symbol: z.string().min(1, 'Symbol name is required'),
});

const FindCalleesSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
  symbol: z.string().min(1, 'Symbol name is required'),
});

const DetectCyclesSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
});

const FindDeadExportsSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
});

const AnalyzeImpactSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
  symbol: z.string().min(1, 'Symbol name is required'),
});

const SemanticSearchSchema = z.object({
  project_path: z.string().min(1, 'Project path is required'),
  query: z.string().min(1, 'Query is required'),
  limit: z.number().int().positive().optional().default(20),
  hybrid: z.boolean().optional().default(true),
});

type GetGraphExportInput = z.infer<typeof GetGraphExportSchema>;
type GetGraphExportCBv2Input = z.infer<typeof GetGraphExportCBv2Schema>;
type SearchSymbolsInput = z.infer<typeof SearchSymbolsSchema>;
type FindCallersInput = z.infer<typeof FindCallersSchema>;
type FindCalleesInput = z.infer<typeof FindCalleesSchema>;
type DetectCyclesInput = z.infer<typeof DetectCyclesSchema>;
type FindDeadExportsInput = z.infer<typeof FindDeadExportsSchema>;
type AnalyzeImpactInput = z.infer<typeof AnalyzeImpactSchema>;
type SemanticSearchInput = z.infer<typeof SemanticSearchSchema>;

export class CodeBrainMCPServer {
  private server: Server;
  private storageCache: Map<string, SQLiteStorage> = new Map();
  private graphCache: Map<string, { graph: any; loadedAt: number }> = new Map();
  private readonly GRAPH_CACHE_TTL = 30_000; // 30 seconds
  private projectRoot: string = '';

  constructor() {
    this.server = new Server(
      {
        name: 'code-brain',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'get_graph_export',
          description: 'Export the code graph in AI-optimized format with hierarchical structure, PageRank importance scoring, dead code detection, and cycle analysis. Includes module summaries, knowledge index, and layout hints.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
              focus: {
                type: 'string',
                description: 'Optional focus path to limit export scope',
              },
              max_tokens: {
                type: 'number',
                description: 'Maximum tokens for the export (default: 100000)',
              },
              model: {
                type: 'string',
                description: 'AI model name for token budget (e.g., gpt-4, claude-opus)',
              },
            },
            required: ['project_path'],
          },
        },
        {
          name: 'get_graph_export_cbv2',
          description: 'Export the code graph in CBv2 compact tuple format (10× token efficiency). Uses integer type codes, tuple arrays, and bitfield flags instead of verbose JSON objects.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
              focus: {
                type: 'string',
                description: 'Optional focus path to limit export scope',
              },
              max_tokens: {
                type: 'number',
                description: 'Maximum tokens for the export (default: 100000)',
              },
            },
            required: ['project_path'],
          },
        },
        {
          name: 'search_symbols',
          description: 'Search for symbols (functions, classes, etc.) in the codebase',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
              query: {
                type: 'string',
                description: 'Search query string',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 20)',
              },
            },
            required: ['project_path', 'query'],
          },
        },
        {
          name: 'find_callers',
          description: 'Find all callers of a specific symbol',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
              symbol: {
                type: 'string',
                description: 'Symbol name to find callers for',
              },
            },
            required: ['project_path', 'symbol'],
          },
        },
        {
          name: 'find_callees',
          description: 'Find all callees (functions called by) a specific symbol',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
              symbol: {
                type: 'string',
                description: 'Symbol name to find callees for',
              },
            },
            required: ['project_path', 'symbol'],
          },
        },
        {
          name: 'detect_cycles',
          description: 'Detect circular dependencies in the codebase using Tarjan\'s strongly connected components algorithm. Returns dependency cycles that should be refactored.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
            },
            required: ['project_path'],
          },
        },
        {
          name: 'find_dead_exports',
          description: 'Find unused exports in the codebase (exported symbols that are never imported). Helps identify dead code that can be safely removed.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
            },
            required: ['project_path'],
          },
        },
        {
          name: 'analyze_impact',
          description: 'Analyze the impact of changing a specific symbol. Returns direct dependents, transitive impact, affected tests, blast radius score (0-1), and refactoring effort estimate. Critical for safe refactoring.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
              symbol: {
                type: 'string',
                description: 'Symbol name to analyze impact for',
              },
            },
            required: ['project_path', 'symbol'],
          },
        },
        {
          name: 'semantic_search',
          description: 'Search codebase using natural language with hybrid BM25 + vector similarity (requires embeddings)',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: {
                type: 'string',
                description: 'Path to the project root directory',
              },
              query: {
                type: 'string',
                description: 'Natural language or keyword search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 20,
              },
              hybrid: {
                type: 'boolean',
                description: 'Use hybrid search (BM25 + vector). Falls back to BM25 if embeddings unavailable.',
                default: true,
              },
            },
            required: ['project_path', 'query'],
          },
        },
        {
          name: 'query_pattern',
          description: 'Structural graph pattern query. Find nodes by type, edge relationships, importance, namespace, or name pattern. Example: find all route nodes that have no incoming TESTS edge (untested routes). No competitor offers this — it queries graph topology, not just text.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Path to the project root' },
              node_types: { type: 'array', items: { type: 'string' }, description: 'Filter by node types e.g. ["function","class","route"]' },
              has_edge_type: { type: 'string', description: 'Only nodes WITH this edge type (e.g. "TESTS")' },
              has_edge_direction: { type: 'string', enum: ['incoming', 'outgoing'], description: 'Direction for has_edge_type filter' },
              not_edge_type: { type: 'string', description: 'Only nodes WITHOUT this edge type' },
              not_edge_direction: { type: 'string', enum: ['incoming', 'outgoing'], description: 'Direction for not_edge_type filter' },
              min_importance: { type: 'number', description: 'Minimum importance score (0-1)' },
              name_pattern: { type: 'string', description: 'Regex pattern for node name' },
              namespace: { type: 'string', description: 'Namespace/directory glob pattern' },
              is_dead: { type: 'boolean', description: 'Filter dead code nodes' },
              is_bridge: { type: 'boolean', description: 'Filter architectural bridge nodes' },
              limit: { type: 'number', description: 'Max results (default 20)' },
            },
            required: ['project_path'],
          },
        },
        {
          name: 'check_invariants',
          description: 'Detect architectural invariants and violations. Finds patterns like "all routes call auth", "no direct DB access from API layer", "all exports have tests". Returns both confirmed invariants and violations. Critical for architecture review.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Path to the project root' },
            },
            required: ['project_path'],
          },
        },
        {
          name: 'assemble_context',
          description: 'Intelligently assembles the most relevant code context for a given task. Uses graph structure + importance + task analysis to select symbols within a token budget. Far superior to naive keyword search — includes definition, callers, callees, tests, and docs for each relevant symbol.',
          inputSchema: {
            type: 'object',
            properties: {
              project_path: { type: 'string', description: 'Path to the project root' },
              task: { type: 'string', description: 'Natural language description of what you are doing' },
              focus: { type: 'array', items: { type: 'string' }, description: 'Optional symbol names or file paths to focus on' },
              max_tokens: { type: 'number', description: 'Token budget for assembled context (default: 8000)' },
              task_type: { type: 'string', enum: ['bug_fix', 'feature_add', 'refactor', 'understand', 'test'], description: 'Optional task type hint' },
            },
            required: ['project_path', 'task'],
          },
        },
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_graph_export':
            return await this.handleGetGraphExport(args);
          case 'get_graph_export_cbv2':
            return await this.handleGetGraphExportCBv2(args);
          case 'search_symbols':
            return await this.handleSearchSymbols(args);
          case 'find_callers':
            return await this.handleFindCallers(args);
          case 'find_callees':
            return await this.handleFindCallees(args);
          case 'detect_cycles':
            return await this.handleDetectCycles(args);
          case 'find_dead_exports':
            return await this.handleFindDeadExports(args);
          case 'analyze_impact':
            return await this.handleAnalyzeImpact(args);
          case 'semantic_search':
            return await this.handleSemanticSearch(args);
          case 'query_pattern':
            return await this.handleQueryPattern(args);
          case 'check_invariants':
            return await this.handleCheckInvariants(args);
          case 'assemble_context':
            return await this.handleAssembleContext(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private async initStorage(projectPath: string): Promise<SQLiteStorage> {
    // Check cache first
    const cached = this.storageCache.get(projectPath);
    if (cached) {
      return cached;
    }

    // Create new storage instance
    this.projectRoot = projectPath;
    const dbPath = path.join(projectPath, '.codebrain', 'graph.db');
    const storage = new SQLiteStorage(dbPath);
    
    // Cache it
    this.storageCache.set(projectPath, storage);
    
    return storage;
  }

  // Get cached graph or load from storage
  private getCachedGraph(projectPath: string, storage: SQLiteStorage): any {
    const state = storage.getIndexState(projectPath);
    const lastIndexedAt = state?.lastIndexedAt ?? 0;
    const cacheKey = `${projectPath}:${lastIndexedAt}`;
    
    const cached = this.graphCache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < this.GRAPH_CACHE_TTL) {
      logger.debug(`Using cached graph for ${projectPath} (indexed at ${lastIndexedAt})`);
      return cached.graph;
    }

    // Evict all stale entries for this project path
    for (const key of this.graphCache.keys()) {
      if (key.startsWith(projectPath + ':')) {
        this.graphCache.delete(key);
      }
    }

    logger.debug(`Loading graph from storage for ${projectPath}`);
    const graph = storage.loadGraph(projectPath);
    this.graphCache.set(cacheKey, { graph, loadedAt: Date.now() });
    return graph;
  }

  // Invalidate cache when graph is updated
  private invalidateCache(projectPath: string): void {
    this.storageCache.delete(projectPath);
    this.graphCache.delete(projectPath);
    logger.debug(`Invalidated cache for ${projectPath}`);
  }

  private async handleGetGraphExport(args: unknown) {
    const input = GetGraphExportSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const project = storage.getProject(input.project_path);
    
    if (!project) {
      throw new Error('Project not found. Run "code-brain index" first.');
    }

    const exporter = new ExportEngine(graph, project, input.project_path);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    
    // Get all nodes or focus on specific path
    let queryResult: QueryResult;
    if (input.focus) {
      const focusNodes = queryEngine.findByName(input.focus);
      if (focusNodes.length > 0) {
        queryResult = queryEngine.findRelated(focusNodes[0].id, 2, 1000);
      } else {
        queryResult = { nodes: [], edges: [], truncated: false };
      }
    } else {
      // Get all nodes
      queryResult = {
        nodes: graph.getNodes(),
        edges: graph.getEdges(),
        truncated: false,
      };
    }

    const result = exporter.exportForAI(
      queryResult,
      input.focus,
      undefined,
      input.max_tokens,
      undefined,
      input.model,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleGetGraphExportCBv2(args: unknown) {
    const input = GetGraphExportCBv2Schema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const project = storage.getProject(input.project_path);
    
    if (!project) {
      throw new Error('Project not found. Run "code-brain index" first.');
    }

    const exporter = new ExportEngine(graph, project, input.project_path);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    
    // Get all nodes or focus on specific path
    let queryResult: QueryResult;
    if (input.focus) {
      const focusNodes = queryEngine.findByName(input.focus);
      if (focusNodes.length > 0) {
        queryResult = queryEngine.findRelated(focusNodes[0].id, 2, 1000);
      } else {
        queryResult = { nodes: [], edges: [], truncated: false };
      }
    } else {
      // Get all nodes
      queryResult = {
        nodes: graph.getNodes(),
        edges: graph.getEdges(),
        truncated: false,
      };
    }

    const result = exporter.exportCBv2(
      queryResult,
      input.focus,
      input.max_tokens,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  }

  private async handleSearchSymbols(args: unknown) {
    const input = SearchSymbolsSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const nodes = storage.searchNodes(input.project_path, input.query, input.limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(nodes, null, 2),
        },
      ],
    };
  }

  private async handleFindCallers(args: unknown) {
    const input = FindCallersSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    const callers = queryEngine.findCallers(input.symbol);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(callers, null, 2),
        },
      ],
    };
  }

  private async handleFindCallees(args: unknown) {
    const input = FindCalleesSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    const callees = queryEngine.findCallees(input.symbol);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(callees, null, 2),
        },
      ],
    };
  }

  private async handleDetectCycles(args: unknown) {
    const input = DetectCyclesSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    const cycles = queryEngine.findCycles();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(cycles, null, 2),
        },
      ],
    };
  }

  private async handleFindDeadExports(args: unknown) {
    const input = FindDeadExportsSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    const deadExports = queryEngine.findDeadExports();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(deadExports, null, 2),
        },
      ],
    };
  }

  private async handleAnalyzeImpact(args: unknown) {
    const input = AnalyzeImpactSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    
    // Find the symbol and analyze its impact
    const symbolNodes = queryEngine.findByName(input.symbol);
    if (symbolNodes.length === 0) {
      throw new Error(`Symbol not found: ${input.symbol}`);
    }

    const tracer = new ImpactTracer(graph);
    const analysis = tracer.analyzeImpact(symbolNodes[0].id, {
      maxDepth: 5,
      includeIndirect: true,
    });

    if (!analysis) {
      throw new Error(`Failed to analyze impact for symbol: ${input.symbol}`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          target: { 
            id: analysis.target.id, 
            name: analysis.target.name, 
            type: analysis.target.type, 
            file: analysis.target.location?.file 
          },
          blastRadius: analysis.blastRadius,
          explanation: analysis.explanation,
          directImpact: analysis.directImpact.map(n => ({ 
            id: n.id, 
            name: n.name, 
            type: n.type, 
            importance: n.importance 
          })),
          transitiveImpact: analysis.transitiveImpact.map(n => ({ 
            id: n.id, 
            name: n.name, 
            type: n.type, 
            importance: n.importance 
          })),
          affectedTests: analysis.affectedTests.map(n => ({ 
            id: n.id, 
            name: n.name, 
            file: n.location?.file 
          })),
          affectedFiles: Array.from(analysis.affectedFiles),
          totalAffected: analysis.directImpact.length + analysis.transitiveImpact.length,
        }, null, 2),
      }],
    };
  }

  private async handleSemanticSearch(args: unknown) {
    const input = SemanticSearchSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = this.getCachedGraph(input.project_path, storage);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);

    let results;

    if (input.hybrid) {
      // Try hybrid search
      try {
        const { ConfigManager } = await import('../config/index.js');
        const { createEmbeddingProvider, resolveApiKey } = await import('../embeddings/index.js');
        const { HybridSearchEngine } = await import('../retrieval/hybrid-search.js');

        const configManager = new ConfigManager(input.project_path);
        const config = configManager.getConfig();
        const embeddingsConfig = config.embeddings;

        if (embeddingsConfig?.enabled) {
          // Resolve API key
          if (embeddingsConfig.apiKey) {
            embeddingsConfig.apiKey = resolveApiKey(embeddingsConfig.apiKey);
          }

          // Create provider
          const provider = createEmbeddingProvider(embeddingsConfig as any);

          if (provider) {
            // Create hybrid search engine
            const hybridSearch = new HybridSearchEngine(
              storage,
              input.project_path,
              provider,
              embeddingsConfig.hybridSearch
            );

            // Perform semantic search
            results = await queryEngine.semanticSearch(
              input.query,
              input.limit,
              hybridSearch
            );
          } else {
            // Fall back to BM25
            results = queryEngine.findByName(input.query, input.limit);
          }
        } else {
          // Embeddings disabled, use BM25
          results = queryEngine.findByName(input.query, input.limit);
        }
      } catch (error) {
        logger.warn('Hybrid search failed, falling back to BM25', error);
        results = queryEngine.findByName(input.query, input.limit);
      }
    } else {
      // BM25 only
      results = queryEngine.findByName(input.query, input.limit);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  private async handleQueryPattern(args: unknown) {
    const input = z.object({
      project_path: z.string(),
      node_types: z.array(z.string()).optional(),
      has_edge_type: z.string().optional(),
      has_edge_direction: z.enum(['incoming', 'outgoing']).optional(),
      not_edge_type: z.string().optional(),
      not_edge_direction: z.enum(['incoming', 'outgoing']).optional(),
      min_importance: z.number().optional(),
      name_pattern: z.string().optional(),
      namespace: z.string().optional(),
      is_dead: z.boolean().optional(),
      is_bridge: z.boolean().optional(),
      limit: z.number().optional(),
    }).parse(args);

    const storage = await this.initStorage(input.project_path);
    const graph = this.getCachedGraph(input.project_path, storage);
    const engine = new PatternQueryEngine(graph);

    // Build the query from individual params
    const query: any = {
      description: 'MCP pattern query',
      nodeFilter: {
        types: input.node_types as any,
        namePattern: input.name_pattern ? new RegExp(input.name_pattern, 'i') : undefined,
        minImportance: input.min_importance,
      },
      edgePattern: input.has_edge_type ? {
        type: input.has_edge_type as any,
        direction: (input.has_edge_direction ?? 'incoming') as any,
      } : undefined,
      notPattern: input.not_edge_type ? {
        type: input.not_edge_type as any,
        direction: (input.not_edge_direction ?? 'incoming') as any,
      } : undefined,
      metadataFilter: {
        matches: {
          ...(input.is_dead !== undefined ? { isDead: input.is_dead } : {}),
          ...(input.is_bridge !== undefined ? { isBridge: input.is_bridge } : {}),
        },
      },
    };

    const results = engine.query(query);
    const limited = results.slice(0, input.limit ?? 20);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: results.length,
          shown: limited.length,
          results: limited.map(match => ({
            id: match.node.id,
            name: match.node.name,
            type: match.node.type,
            file: match.node.location?.file,
            importance: match.node.importance,
            isDead: match.node.metadata?.isDead,
            isBridge: match.node.metadata?.isBridge,
            summary: match.node.summary,
            reason: match.reason,
          })),
        }, null, 2),
      }],
    };
  }

  private async handleCheckInvariants(args: unknown) {
    const input = z.object({ project_path: z.string() }).parse(args);
    const storage = await this.initStorage(input.project_path);
    const graph = this.getCachedGraph(input.project_path, storage);
    const detector = new InvariantDetector(graph);
    const report = detector.checkInvariants();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalViolations: report.totalViolations,
          healthScore: report.healthScore,
          errors: report.errors.map(v => ({
            ruleId: v.ruleId,
            severity: v.severity,
            nodeId: v.node.id,
            nodeName: v.node.name,
            message: v.message,
          })),
          warnings: report.warnings.map(v => ({
            ruleId: v.ruleId,
            severity: v.severity,
            nodeId: v.node.id,
            nodeName: v.node.name,
            message: v.message,
          })),
          info: report.info.map(v => ({
            ruleId: v.ruleId,
            severity: v.severity,
            nodeId: v.node.id,
            nodeName: v.node.name,
            message: v.message,
          })),
        }, null, 2),
      }],
    };
  }

  private async handleAssembleContext(args: unknown) {
    const input = z.object({
      project_path: z.string(),
      task: z.string(),
      focus: z.array(z.string()).optional(),
      max_tokens: z.number().optional(),
      task_type: z.enum(['bug_fix', 'feature_add', 'refactor', 'understand', 'test']).optional(),
    }).parse(args);

    const storage = await this.initStorage(input.project_path);
    const graph = this.getCachedGraph(input.project_path, storage);
    const assembler = new ContextAssembler(graph);

    const context = await assembler.assemble({
      task: input.task,
      focus: input.focus,
      maxTokens: input.max_tokens ?? 8000,
      taskType: input.task_type,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          strategy: context.strategy,
          estimatedTokens: context.estimatedTokens,
          nodeCount: context.nodes.length,
          nodes: context.nodes.map(n => ({
            id: n.id,
            name: n.name,
            type: n.type,
            file: n.location?.file,
            lines: n.location ? [n.location.startLine, n.location.endLine] : undefined,
            importance: n.importance,
            summary: n.summary,
            relevanceScore: context.scores.get(n.id),
          })),
          edges: context.edges.map(e => ({ from: e.from, to: e.to, type: e.type })),
        }, null, 2),
      }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Code-Brain MCP server running on stdio');
  }
}

// Run server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new CodeBrainMCPServer();
  server.run().catch((error) => {
    logger.error('MCP server error:', error);
    process.exit(1);
  });
}
