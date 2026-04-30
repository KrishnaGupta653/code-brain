import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SQLiteStorage } from '../storage/sqlite.js';
import { ExportEngine } from '../retrieval/export.js';
import { QueryEngine } from '../retrieval/query.js';
import { QueryResult } from '../types/models.js';
import { logger } from '../utils/index.js';
import path from 'path';

export class CodeBrainMCPServer {
  private server: Server;
  private storage: SQLiteStorage | null = null;
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

  private async initStorage(projectPath: string): Promise<void> {
    if (this.storage && this.projectRoot === projectPath) {
      return;
    }

    this.projectRoot = projectPath;
    const dbPath = path.join(projectPath, '.codebrain', 'graph.db');
    this.storage = new SQLiteStorage(dbPath);
  }

  private async handleGetGraphExport(args: any) {
    const { project_path, focus, max_tokens, model } = args;
    await this.initStorage(project_path);

    const graph = this.storage!.loadGraph(project_path);
    const project = this.storage!.getProject(project_path);
    
    if (!project) {
      throw new Error('Project not found. Run "code-brain index" first.');
    }

    const exporter = new ExportEngine(graph, project, project_path);
    const queryEngine = new QueryEngine(graph, this.storage!, project_path);
    
    // Get all nodes or focus on specific path
    let queryResult: QueryResult;
    if (focus) {
      const focusNodes = queryEngine.findByName(focus);
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
      focus || undefined,
      undefined,
      max_tokens || 100000,
      undefined,
      model || 'gpt-4',
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

  private async handleSearchSymbols(args: any) {
    const { project_path, query, limit } = args;
    await this.initStorage(project_path);

    const nodes = this.storage!.searchNodes(query, limit || 20);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(nodes, null, 2),
        },
      ],
    };
  }

  private async handleFindCallers(args: any) {
    const { project_path, symbol } = args;
    await this.initStorage(project_path);

    const graph = this.storage!.loadGraph(project_path);
    const queryEngine = new QueryEngine(graph, this.storage!, project_path);
    const callers = queryEngine.findCallers(symbol);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(callers, null, 2),
        },
      ],
    };
  }

  private async handleFindCallees(args: any) {
    const { project_path, symbol } = args;
    await this.initStorage(project_path);

    const graph = this.storage!.loadGraph(project_path);
    const queryEngine = new QueryEngine(graph, this.storage!, project_path);
    const callees = queryEngine.findCallees(symbol);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(callees, null, 2),
        },
      ],
    };
  }

  private async handleDetectCycles(args: any) {
    const { project_path } = args;
    await this.initStorage(project_path);

    const graph = this.storage!.loadGraph(project_path);
    const queryEngine = new QueryEngine(graph, this.storage!, project_path);
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

  private async handleFindDeadExports(args: any) {
    const { project_path } = args;
    await this.initStorage(project_path);

    const graph = this.storage!.loadGraph(project_path);
    const queryEngine = new QueryEngine(graph, this.storage!, project_path);
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

  private async handleAnalyzeImpact(args: any) {
    const { project_path, symbol } = args;
    await this.initStorage(project_path);

    const graph = this.storage!.loadGraph(project_path);
    const queryEngine = new QueryEngine(graph, this.storage!, project_path);
    
    // Find the symbol and analyze its impact
    const symbolNodes = queryEngine.findByName(symbol);
    if (symbolNodes.length === 0) {
      throw new Error(`Symbol not found: ${symbol}`);
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
