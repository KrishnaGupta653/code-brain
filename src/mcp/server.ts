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
          description: 'Export the code graph in AI-optimized format with hierarchical structure',
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
          description: 'Detect circular dependencies in the codebase',
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
          description: 'Find unused exports in the codebase',
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
          description: 'Analyze the impact of changing a specific symbol',
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

  // Invalidate cache when graph is updated
  private invalidateCache(projectPath: string): void {
    this.storageCache.delete(projectPath);
  }

  private async handleGetGraphExport(args: unknown) {
    const input = GetGraphExportSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = storage.loadGraph(input.project_path);
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

    const graph = storage.loadGraph(input.project_path);
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

    const graph = storage.loadGraph(input.project_path);
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

    const graph = storage.loadGraph(input.project_path);
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

    const graph = storage.loadGraph(input.project_path);
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

    const graph = storage.loadGraph(input.project_path);
    const queryEngine = new QueryEngine(graph, storage, input.project_path);
    
    // Find the symbol and analyze its impact
    const symbolNodes = queryEngine.findByName(input.symbol);
    if (symbolNodes.length === 0) {
      throw new Error(`Symbol not found: ${input.symbol}`);
    }

    const impact = queryEngine.findRelated(symbolNodes[0].id, 3, 100);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(impact, null, 2),
        },
      ],
    };
  }

  private async handleSemanticSearch(args: unknown) {
    const input = SemanticSearchSchema.parse(args);
    const storage = await this.initStorage(input.project_path);

    const graph = storage.loadGraph(input.project_path);
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
