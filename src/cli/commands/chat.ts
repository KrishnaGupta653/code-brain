/**
 * Chat Command
 * 
 * Natural language chat interface for querying the codebase
 * Uses hybrid search + Claude API for grounded, graph-based answers
 */

import { ConfigManager } from '../../config/index.js';
import { SQLiteStorage } from '../../storage/index.js';
import { HybridSearchEngine } from '../../retrieval/hybrid-search.js';
import { QueryEngine } from '../../retrieval/query.js';
import { createEmbeddingProvider, resolveApiKey } from '../../embeddings/index.js';
import { EmbeddingConfig } from '../../embeddings/provider.js';
import { logger, getDbPath } from '../../utils/index.js';
import { loadEnv, getApiKey, getChatProvider, getChatModel } from '../../utils/env.js';
import { GraphNode, GraphEdge } from '../../types/models.js';

export interface ChatCommandOptions {
  json?: boolean;
  maxContextTokens?: number;
  provider?: 'anthropic' | 'openai' | 'ollama';
  model?: string;
}

export async function chatCommand(
  projectRoot: string,
  question: string,
  options: ChatCommandOptions = {}
): Promise<void> {
  try {
    // Load environment variables from .env file
    loadEnv(projectRoot);

    // 1. Load config + storage
    const config = new ConfigManager(projectRoot).getConfig();
    const dbPath = getDbPath(projectRoot);
    const storage = new SQLiteStorage(dbPath);
    const graph = storage.loadGraph(projectRoot);
    const project = storage.getProject(projectRoot);

    if (!project) {
      throw new Error('Project not indexed. Run "code-brain index" first.');
    }

    // 2. Build hybrid search if embeddings are available
    let embeddingProvider = null;
    if (config.embeddings?.enabled && config.embeddings.provider !== 'none') {
      const apiKey = resolveApiKey(config.embeddings.apiKey);
      const providerType = config.embeddings.provider || 'openai';
      const embeddingConfig: EmbeddingConfig = {
        enabled: config.embeddings.enabled,
        provider: providerType as 'openai' | 'anthropic' | 'local' | 'none',
        model: config.embeddings.model || 'text-embedding-3-small',
        dimensions: config.embeddings.dimensions || 1536,
        batchSize: config.embeddings.batchSize || 100,
        apiKey,
      };
      embeddingProvider = createEmbeddingProvider(embeddingConfig);
    }

    const hybridEngine = new HybridSearchEngine(
      storage,
      projectRoot,
      embeddingProvider ?? undefined
    );
    const queryEngine = new QueryEngine(graph, storage, projectRoot);

    // 3. Retrieve top-20 relevant nodes
    logger.info('Searching codebase...');
    const searchResults = await hybridEngine.search(question, {
      limit: 20,
      includeNodes: true,
    });

    if (searchResults.length === 0) {
      logger.warn('No relevant code found for your question');
      return;
    }

    // 4. Expand to 2-hop subgraph around the top-10 nodes
    const topNodes = searchResults.slice(0, 10);
    const allNodes = new Set<string>();
    const allEdges = new Map<string, GraphEdge>();

    for (const result of topNodes) {
      const subgraph = queryEngine.findRelated(result.nodeId, 2, 50);
      subgraph.nodes.forEach((n) => allNodes.add(n.id));
      subgraph.edges.forEach((e) => allEdges.set(e.id, e));
    }

    // 5. Format the subgraph as context
    const contextNodes = Array.from(allNodes)
      .map((id) => graph.getNode(id))
      .filter((n): n is GraphNode => Boolean(n))
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 40); // cap at 40 nodes

    const context = formatGraphContext(contextNodes, Array.from(allEdges.values()));

    // 6. Call AI API based on provider
    const provider = options.provider || getChatProvider();
    const model = options.model || getChatModel(provider);

    logger.info(`Using ${provider} (${model})...\n`);

    if (provider === 'anthropic') {
      await callAnthropicAPI(context, question, model);
    } else if (provider === 'openai') {
      await callOpenAIAPI(context, question, model);
    } else if (provider === 'ollama') {
      await callOllamaAPI(context, question, model);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    storage.close();
  } catch (error) {
    logger.error('Chat failed', error);
    throw error;
  }
}

async function callAnthropicAPI(context: string, question: string, model: string): Promise<void> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Export it to use Anthropic chat.'
    );
  }

  const systemPrompt = `You are a codebase expert. You are given a subgraph of a code knowledge graph. Answer the user's question using ONLY the information in the subgraph. If something is not in the subgraph, say so — do not invent code behavior. Be specific: reference exact file paths, function names, and line numbers when available.`;

  const userMessage = `SUBGRAPH CONTEXT:\n${context}\n\nQUESTION: ${question}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  // Stream the response
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'content_block_delta' && data.delta?.text) {
          process.stdout.write(data.delta.text);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  process.stdout.write('\n\n');
}

async function callOpenAIAPI(context: string, question: string, model: string): Promise<void> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY not set. Export it to use OpenAI chat.'
    );
  }

  const systemPrompt = `You are a codebase expert. You are given a subgraph of a code knowledge graph. Answer the user's question using ONLY the information in the subgraph. If something is not in the subgraph, say so — do not invent code behavior. Be specific: reference exact file paths, function names, and line numbers when available.`;

  const userMessage = `SUBGRAPH CONTEXT:\n${context}\n\nQUESTION: ${question}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  // Stream the response
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.choices?.[0]?.delta?.content) {
          process.stdout.write(data.choices[0].delta.content);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  process.stdout.write('\n\n');
}

async function callOllamaAPI(context: string, question: string, model: string): Promise<void> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  const systemPrompt = `You are a codebase expert. You are given a subgraph of a code knowledge graph. Answer the user's question using ONLY the information in the subgraph. If something is not in the subgraph, say so — do not invent code behavior. Be specific: reference exact file paths, function names, and line numbers when available.`;

  const userMessage = `SUBGRAPH CONTEXT:\n${context}\n\nQUESTION: ${question}`;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${errorText}`);
  }

  // Stream the response
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.message?.content) {
          process.stdout.write(data.message.content);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  process.stdout.write('\n\n');
}

function formatGraphContext(nodes: GraphNode[], edges: GraphEdge[]): string {
  const nodeLines = nodes
    .map((n) => {
      let line = `[${n.type}] ${n.fullName || n.name}`;
      if (n.location) {
        line += ` (${n.location.file}:${n.location.startLine})`;
      }
      if (n.summary) {
        line += ` — ${n.summary}`;
      }
      return line;
    })
    .join('\n');

  const edgeLines = edges
    .slice(0, 60)
    .map((e) => `${e.from} --[${e.type}]--> ${e.to}`)
    .join('\n');

  return `NODES:\n${nodeLines}\n\nEDGES:\n${edgeLines}`;
}
