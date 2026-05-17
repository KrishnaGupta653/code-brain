import express from "express";
import fs from "fs";
import { Server } from "http";
import https from "https";
import path from "path";
import AdmZip from "adm-zip";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { QueryEngine } from "../retrieval/query.js";
import { ImpactTracer } from "../retrieval/impact-tracer.js";
import { PatternQueryEngine } from "../retrieval/pattern-query.js";
import { InvariantDetector } from "../graph/invariants.js";
import { ContextAssembler } from "../retrieval/context-assembler.js";
import { logger, getDbPath, stableId, normalizeProjectRoot } from "../utils/index.js";
import { SQLiteStorage } from "../storage/index.js";
import { GraphEdge, GraphNode, RankingScore, SourceSpan } from "../types/models.js";
import { GraphBuilder } from "../graph/index.js";
import { initCommand } from "../cli/commands/init.js";
import { indexCommand } from "../cli/commands/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Sanitize user input to prevent XSS
 */
function sanitizeInput(input: string, maxLength: number = 500): string {
  return input
    .slice(0, maxLength)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

/**
 * Detect programming language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'bash',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.sql': 'sql',
  };
  return languageMap[ext] || 'plaintext';
}

function stripSourceText<T extends { text?: string }>(span: T): T {
  const cleaned = { ...span };
  delete cleaned.text;
  return cleaned;
}

function isInsideRoot(projectRoot: string, filePath: string): boolean {
  const root = path.resolve(projectRoot);
  const target = path.resolve(filePath);
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toVsCodeUri(location?: SourceSpan): string | undefined {
  if (!location?.file) {
    return undefined;
  }

  const normalized = location.file.replace(/\\/g, "/");
  return `vscode://file/${normalized}:${location.startLine}:${location.startCol}`;
}

function sanitizeNode(node: GraphNode, rank?: RankingScore): GraphNode & {
  degree: number;
  incomingCount: number;
  outgoingCount: number;
  rank?: RankingScore;
  vscodeUri?: string;
} {
  const location = node.location ? stripSourceText(node.location) : undefined;
  return {
    ...node,
    location,
    provenance: {
      ...node.provenance,
      source: node.provenance.source.map((source) => stripSourceText(source)),
    },
    degree: 0,
    incomingCount: 0,
    outgoingCount: 0,
    rank,
    vscodeUri: toVsCodeUri(location),
  };
}

function sanitizeEdge(edge: GraphEdge): GraphEdge {
  return {
    ...edge,
    sourceLocation: (edge.sourceLocation || []).map((source) =>
      stripSourceText(source),
    ),
    provenance: {
      ...edge.provenance,
      source: edge.provenance.source.map((source) => stripSourceText(source)),
    },
  };
}

function groupEdgesByType(edges: GraphEdge[]): Record<string, number> {
  return edges.reduce<Record<string, number>>((acc, edge) => {
    acc[edge.type] = (acc[edge.type] || 0) + 1;
    return acc;
  }, {});
}

function computeAnalytics(graph: ReturnType<SQLiteStorage["loadGraph"]>) {
  const nodes = graph.getNodes();
  const edges = graph.getEdges();
  const degree = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();

  for (const node of nodes) {
    const out = graph.getOutgoingEdges(node.id).length;
    const inc = graph.getIncomingEdges(node.id).length;
    outgoing.set(node.id, out);
    incoming.set(node.id, inc);
    degree.set(node.id, out + inc);
  }

  const maxDegree = Math.max(1, ...Array.from(degree.values()));
  const pageRank = computePageRank(nodes, edges);
  const maxPageRank = Math.max(1e-9, ...Array.from(pageRank.values()));
  const centrality = Object.fromEntries(
    nodes.map((node) => [node.id, Number(((degree.get(node.id) || 0) / maxDegree).toFixed(6))]),
  );
  const importance = Object.fromEntries(
    nodes.map((node) => {
      const normalizedPageRank = (pageRank.get(node.id) || 0) / maxPageRank;
      const score =
        normalizedPageRank * 0.55 +
        ((incoming.get(node.id) || 0) / maxDegree) * 0.25 +
        ((outgoing.get(node.id) || 0) / maxDegree) * 0.12 +
        (node.type === "project" ? 0.08 : 0);
      return [node.id, Number(Math.min(1, score).toFixed(6))];
    }),
  );

  const hubs = nodes
    .map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      fullName: node.fullName,
      degree: degree.get(node.id) || 0,
      incoming: incoming.get(node.id) || 0,
      outgoing: outgoing.get(node.id) || 0,
    }))
    .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))
    .slice(0, 25);

  const communities = new Map<string, string[]>();
  for (const node of nodes) {
    const file = String(node.metadata?.filePath || node.location?.file || "project");
    const key = file === "project" ? "project" : path.dirname(file);
    const label = path.relative(process.cwd(), key) || key;
    if (!communities.has(label)) {
      communities.set(label, []);
    }
    communities.get(label)!.push(node.id);
  }

  return {
    status: "ok",
    derivedFrom: "deterministic-graph",
    algorithms: {
      centrality: "degree_centrality",
      importance: "pagerank_blended_with_degree",
      cycles: "bounded_dfs_cycle_scan",
      communities: "directory_partition",
      layout: "community_seeded_forceatlas2",
    },
    centrality,
    importance,
    hubs,
    communities: Array.from(communities.entries())
      .map(([label, nodeIds]) => ({ label, nodeIds, size: nodeIds.length }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 30),
    cycles: findCycles(graph, 20),
    health: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      unresolvedEdges: edges.filter((edge) => !edge.resolved).length,
      isolatedNodes: nodes.filter((node) => (degree.get(node.id) || 0) === 0).length,
    },
  };
}

function computePageRank(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of edges) {
    if (!edge.resolved || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    if (!["IMPORTS", "DEPENDS_ON", "CALLS", "DEFINES", "EXTENDS", "IMPLEMENTS", "ENTRY_POINT"].includes(edge.type)) continue;
    outgoing.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
  }

  const count = Math.max(1, nodes.length);
  const damping = 0.85;
  let ranks = new Map(nodes.map((node) => [node.id, 1 / count]));

  for (let iteration = 0; iteration < 40; iteration++) {
    const next = new Map<string, number>();
    const danglingMass = nodes.reduce((sum, node) => {
      return sum + ((outgoing.get(node.id)?.length || 0) === 0 ? ranks.get(node.id) || 0 : 0);
    }, 0);

    for (const node of nodes) {
      let score = (1 - damping) / count;
      score += damping * danglingMass / count;
      for (const source of incoming.get(node.id) || []) {
        const outDegree = outgoing.get(source)?.length || 1;
        score += damping * (ranks.get(source) || 0) / outDegree;
      }
      next.set(node.id, score);
    }

    ranks = next;
  }

  return ranks;
}

function findCycles(
  graph: ReturnType<SQLiteStorage["loadGraph"]>,
  limit: number,
): string[][] {
  const cycles: string[][] = [];
  const stack: string[] = [];
  const inStack = new Set<string>();

  const visit = (nodeId: string, depth: number): void => {
    if (cycles.length >= limit || depth > 12) {
      return;
    }

    if (inStack.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      if (start >= 0) {
        cycles.push([...stack.slice(start), nodeId]);
      }
      return;
    }

    stack.push(nodeId);
    inStack.add(nodeId);
    for (const edge of graph.getOutgoingEdges(nodeId)) {
      if (["IMPORTS", "DEPENDS_ON", "CALLS", "EXTENDS", "IMPLEMENTS"].includes(edge.type)) {
        visit(edge.to, depth + 1);
      }
    }
    stack.pop();
    inStack.delete(nodeId);
  };

  for (const node of graph.getNodes()) {
    visit(node.id, 0);
    if (cycles.length >= limit) {
      break;
    }
  }

  return cycles;
}

type SecuritySeverity = "high" | "medium" | "low";

interface SecurityIssue {
  id: string;
  title: string;
  severity: SecuritySeverity;
  path: string;
  line: number;
  snippet: string;
  description: string;
  suggestion: string;
}

const SECURITY_PATTERNS: Array<{
  title: string;
  severity: SecuritySeverity;
  pattern: RegExp;
  description: string;
  suggestion: string;
}> = [
  {
    title: "Possible hardcoded secret",
    severity: "high",
    pattern: /\b(?:api[_-]?key|secret|token|password|private[_-]?key)\b\s*[:=]\s*["'][^"'\n]{12,}["']/i,
    description: "A credential-like value appears to be assigned directly in source.",
    suggestion: "Move secrets to environment variables or a secret manager and rotate exposed values.",
  },
  {
    title: "Dynamic code execution",
    severity: "high",
    pattern: /\b(?:eval|Function)\s*\(/,
    description: "Dynamic execution can run attacker-controlled input.",
    suggestion: "Replace dynamic execution with a parser, lookup table, or explicit command dispatch.",
  },
  {
    title: "Raw HTML assignment",
    severity: "medium",
    pattern: /\.innerHTML\s*=|dangerouslySetInnerHTML/,
    description: "Raw HTML insertion can introduce cross-site scripting when content is not trusted.",
    suggestion: "Use text content, React escaping, or a vetted sanitizer for trusted HTML fragments.",
  },
  {
    title: "Likely SQL string concatenation",
    severity: "medium",
    pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}(?:\+|\$\{)/i,
    description: "SQL assembled through string interpolation can bypass parameterization.",
    suggestion: "Use prepared statements or query builder parameters for all external values.",
  },
  {
    title: "Debugger statement",
    severity: "low",
    pattern: /\bdebugger\b/,
    description: "Debugger statements can pause production execution and leak inspection context.",
    suggestion: "Remove debugger statements before shipping.",
  },
];

function scanSecurityIssues(
  projectRoot: string,
  graph: ReturnType<SQLiteStorage["loadGraph"]>,
): SecurityIssue[] {
  const sourceFiles = new Set<string>();
  graph.getNodes().forEach((node) => {
    const file = node.location?.file;
    if (file && isInsideRoot(projectRoot, file)) {
      sourceFiles.add(file);
    }
  });

  const issues: SecurityIssue[] = [];
  for (const file of sourceFiles) {
    if (!fs.existsSync(file)) continue;
    const ext = path.extname(file).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".gif", ".ico", ".db", ".wasm"].includes(ext)) continue;

    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    text.split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      SECURITY_PATTERNS.forEach((check) => {
        if (!check.pattern.test(trimmed)) return;
        issues.push({
          id: stableId("security", file, String(index + 1), check.title, trimmed),
          title: check.title,
          severity: check.severity,
          path: file,
          line: index + 1,
          snippet: trimmed.slice(0, 220),
          description: check.description,
          suggestion: check.suggestion,
        });
      });
    });
  }

  const severityRank: Record<SecuritySeverity, number> = { high: 3, medium: 2, low: 1 };
  return issues.sort((a, b) =>
    severityRank[b.severity] - severityRank[a.severity] ||
    a.path.localeCompare(b.path) ||
    a.line - b.line,
  );
}

export async function createGraphServer(
  projectRoot: string,
  port: number = 3000,
): Promise<{ server: Server; wss: WebSocketServer; broadcast: (message: unknown) => void }> {
  const app = express();
  
  // Security: Helmet middleware for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],  // needed for graph UI fallback
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        connectSrc: ["'self'", "https://api.github.com", "ws://localhost:*", "wss://localhost:*"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
      }
    },
    crossOriginEmbedderPolicy: false,  // Allow embedding for development
  }));
  
  app.use(express.json({ limit: "75mb" }));
  
  // Security: Rate limiting for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 300,              // 300 requests per minute (generous for local use)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
  app.use('/api', apiLimiter);
  
  // API Key Authentication (optional)
  const apiKey = process.env.CODE_BRAIN_API_KEY;
  if (apiKey) {
    logger.info('API key authentication enabled');
    app.use('/api', (req, res, next) => {
      const provided = (req.headers['x-api-key'] as string | undefined) || (req.query['key'] as string | undefined);
      if (provided !== apiKey) {
        res.status(401).json({ error: 'Unauthorized: invalid API key' });
        return;
      }
      next();
    });
  }
  
  const uiDist = path.resolve(__dirname, "../../ui/dist");
  const uiPublic = path.resolve(__dirname, "../../ui/public");
  const staticDir = fs.existsSync(uiDist) ? uiDist : uiPublic;
  logger.info(`Serving static files from: ${staticDir}`);
  logger.info(`UI dist exists: ${fs.existsSync(uiDist)}`);
  app.use(express.static(staticDir));

  const resolvedProjectRoot = normalizeProjectRoot(projectRoot);
  let activeProjectRoot = resolvedProjectRoot;
  logger.info(`Server starting for projectRoot: ${projectRoot}`);
  logger.info(`Resolved to: ${resolvedProjectRoot}`);

  const storage = new SQLiteStorage(getDbPath(resolvedProjectRoot));
  
  // Use lazy loading for large projects (> 5000 nodes)
  // This prevents OOM errors and speeds up server startup
  const projectId = storage.getProjectId(resolvedProjectRoot);
  const nodeCountResult = storage['db'].prepare('SELECT COUNT(*) as count FROM nodes WHERE project_id = ?').get(projectId) as { count: number } | undefined;
  const nodeCount = nodeCountResult?.count ?? 0;
  const useLazyLoading = nodeCount > 5000;
  
  let graph: ReturnType<typeof storage.loadGraph>;
  if (useLazyLoading) {
    logger.info(`Large project detected (${nodeCount} nodes), using lazy loading (level 0)`);
    graph = storage.loadGraphLevel(resolvedProjectRoot, 0);
  } else {
    logger.info(`Loading full graph (${nodeCount} nodes)`);
    graph = storage.loadGraph(resolvedProjectRoot);
  }
  
  let queryEngine = new QueryEngine(graph, storage, activeProjectRoot);
  let graphStats = graph.getStats();
  let analytics = computeAnalytics(graph);
  let rankingScores = storage.getRankingScores(resolvedProjectRoot);
  if (rankingScores.length === 0) {
    rankingScores = Object.entries(analytics.importance).map(([nodeId, score]) => ({
      nodeId,
      score: Number(score),
      algorithm: "degree_importance",
      components: {
        centrality: Number(analytics.centrality[nodeId] || 0),
      },
    }));
    storage.saveRankingScores(resolvedProjectRoot, rankingScores);
  }
  let rankingByNode = new Map(rankingScores.map((score) => [score.nodeId, score]));

  const deriveRankingScores = () => Object.entries(analytics.importance).map(([nodeId, score]) => ({
    nodeId,
    score: Number(score),
    algorithm: "degree_importance",
    components: {
      centrality: Number(analytics.centrality[nodeId] || 0),
    },
  }));

  const activateGraph = (
    nextGraph: ReturnType<typeof storage.loadGraph>,
    nextRoot: string,
    nextRankingScores?: RankingScore[],
  ) => {
    graph = nextGraph;
    activeProjectRoot = nextRoot;
    graphStats = graph.getStats();
    analytics = computeAnalytics(graph);
    rankingScores = nextRankingScores && nextRankingScores.length > 0
      ? nextRankingScores
      : deriveRankingScores();
    rankingByNode = new Map(rankingScores.map((score) => [score.nodeId, score]));
    queryEngine = new QueryEngine(graph, storage, activeProjectRoot);
  };

  logger.info(`Graph loaded with stats: ${JSON.stringify(graphStats)}`);
  if (useLazyLoading) {
    logger.info(`Lazy loading enabled - use /api/expand/namespace to load more nodes`);
  }

  logger.success("Graph loaded for visualization");

  // Add namespace expansion endpoint for lazy loading
  app.get('/api/expand/namespace', (req, res) => {
    const ns = sanitizeInput(String(req.query.ns || ''), 200);
    if (!ns) {
      res.status(400).json({ error: 'ns parameter required' });
      return;
    }
    
    try {
      const nodes = storage.loadNodesByNamespace(resolvedProjectRoot, ns);
      res.json({
        namespace: ns,
        count: nodes.length,
        nodes: nodes.map(node => ({
          id: node.id,
          name: node.name,
          type: node.type,
          fullName: node.fullName,
          namespace: node.namespace,
          importance: node.importance,
          location: node.location ? stripSourceText(node.location) : undefined,
        }))
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Add level-based graph endpoint
  app.get("/api/graph", (req, res) => {
    const level = Number.parseInt(String(req.query.level || "0"), 10);
    const communityId = req.query.community ? Number.parseInt(String(req.query.community), 10) : undefined;
    const focusNodeId = String(req.query.focus || "");

    // Level 0: Cluster view (30-100 nodes representing communities)
    if (level === 0 && !communityId) {
      const communities = analytics.communities || [];
      const clusterNodes = communities.slice(0, 30).map((community, index) => {
        const memberNodes = community.nodeIds
          .map(id => graph.getNode(id))
          .filter((n): n is GraphNode => Boolean(n));
        
        const topMember = memberNodes
          .sort((a, b) => (rankingByNode.get(b.id)?.score || 0) - (rankingByNode.get(a.id)?.score || 0))[0];
        
        const avgImportance = memberNodes.reduce((sum, n) => sum + (rankingByNode.get(n.id)?.score || 0), 0) / memberNodes.length;

        return {
          id: `cluster_${index}`,
          name: community.label || `Cluster ${index + 1}`,
          type: 'module',
          fullName: community.label,
          summary: `${community.size} nodes`,
          file: topMember?.location?.file || 'unknown',
          metadata: {
            isCluster: true,
            communityId: index,
            memberCount: community.size,
            topSymbols: memberNodes.slice(0, 5).map(n => n.name),
          },
          location: topMember?.location ? stripSourceText(topMember.location) : undefined,
          vscodeUri: topMember ? toVsCodeUri(topMember.location) : undefined,
          rank: { nodeId: `cluster_${index}`, score: avgImportance, algorithm: 'cluster_importance' },
          degree: community.size,
          incomingCount: 0,
          outgoingCount: 0,
        };
      });

      // Create edges between clusters based on inter-cluster connections
      const clusterEdges: any[] = [];
      const nodeToCluster = new Map<string, number>();
      communities.forEach((community, index) => {
        community.nodeIds.forEach(nodeId => nodeToCluster.set(nodeId, index));
      });

      const interClusterEdges = new Map<string, number>();
      for (const edge of graph.getEdges()) {
        const fromCluster = nodeToCluster.get(edge.from);
        const toCluster = nodeToCluster.get(edge.to);
        if (fromCluster !== undefined && toCluster !== undefined && fromCluster !== toCluster) {
          const key = `${fromCluster}-${toCluster}`;
          interClusterEdges.set(key, (interClusterEdges.get(key) || 0) + 1);
        }
      }

      for (const [key, count] of interClusterEdges) {
        const [from, to] = key.split('-').map(Number);
        if (count > 5) { // Only show significant connections
          clusterEdges.push({
            id: `cluster_edge_${key}`,
            from: `cluster_${from}`,
            to: `cluster_${to}`,
            type: 'DEPENDS_ON',
            resolved: true,
            metadata: { edgeCount: count },
          });
        }
      }

      res.json({
        nodes: clusterNodes,
        edges: clusterEdges,
        stats: { ...graphStats, level: 0, clustered: true },
        ranking: rankingScores.slice(0, 50),
        analytics: {
          health: analytics.health,
          hubs: analytics.hubs,
          communities: analytics.communities,
        },
      });
      return;
    }

    // Community expansion: Return all nodes in a specific community
    if (communityId !== undefined) {
      const community = analytics.communities[communityId];
      if (!community) {
        res.status(404).json({ error: 'Community not found' });
        return;
      }

      const communityNodeIds = new Set(community.nodeIds);
      const nodes = Array.from(communityNodeIds)
        .map(id => graph.getNode(id))
        .filter((node): node is GraphNode => Boolean(node))
        .slice(0, 300) // Limit to 300 nodes
        .map(node => ({
          id: node.id,
          name: node.name,
          type: node.type,
          fullName: node.fullName,
          summary: node.summary || "unknown",
          file: node.location?.file || "unknown",
          metadata: node.metadata || {},
          location: node.location ? stripSourceText(node.location) : undefined,
          vscodeUri: toVsCodeUri(node.location),
          rank: rankingByNode.get(node.id),
          degree: graph.getIncomingEdges(node.id).length + graph.getOutgoingEdges(node.id).length,
          incomingCount: graph.getIncomingEdges(node.id).length,
          outgoingCount: graph.getOutgoingEdges(node.id).length,
        }));

      const nodeIds = new Set(nodes.map(n => n.id));
      const edges = graph.getEdges()
        .filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to))
        .map(edge => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          type: edge.type,
          resolved: edge.resolved,
        }));

      res.json({
        nodes,
        edges,
        stats: { ...graphStats, level: 2, communityId },
        ranking: rankingScores.slice(0, 50),
      });
      return;
    }

    // Level 1: File-level nodes only (no methods/functions)
    if (level === 1) {
      const fileNodes = graph.getNodes()
        .filter(node => ['project', 'file', 'module', 'class'].includes(node.type))
        .slice(0, 500)
        .map(node => ({
          id: node.id,
          name: node.name,
          type: node.type,
          fullName: node.fullName,
          summary: node.summary || "unknown",
          file: node.location?.file || "unknown",
          metadata: node.metadata || {},
          location: node.location ? stripSourceText(node.location) : undefined,
          vscodeUri: toVsCodeUri(node.location),
          rank: rankingByNode.get(node.id),
          degree: graph.getIncomingEdges(node.id).length + graph.getOutgoingEdges(node.id).length,
          incomingCount: graph.getIncomingEdges(node.id).length,
          outgoingCount: graph.getOutgoingEdges(node.id).length,
        }));

      const nodeIds = new Set(fileNodes.map(n => n.id));
      const edges = graph.getEdges()
        .filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to))
        .map(edge => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          type: edge.type,
          resolved: edge.resolved,
        }));

      res.json({
        nodes: fileNodes,
        edges,
        stats: { ...graphStats, level: 1 },
        ranking: rankingScores.slice(0, 50),
        analytics: {
          health: analytics.health,
          hubs: analytics.hubs,
          communities: analytics.communities,
        },
      });
      return;
    }

    // Level 2 with focus: Full neighborhood around a node
    if (level === 2 && focusNodeId) {
      const focusNode = graph.getNode(focusNodeId);
      if (!focusNode) {
        res.status(404).json({ error: 'Focus node not found' });
        return;
      }

      const relatedIds = new Set<string>([focusNodeId]);
      const queue = [focusNodeId];
      const visited = new Set<string>();
      const maxDepth = 2;
      const maxNodes = 300;
      let head = 0;

      while (head < queue.length && relatedIds.size < maxNodes) {
        const currentId = queue[head++];
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const outgoing = graph.getOutgoingEdges(currentId);
        const incoming = graph.getIncomingEdges(currentId);

        for (const edge of [...outgoing, ...incoming]) {
          const nextId = edge.from === currentId ? edge.to : edge.from;
          if (!visited.has(nextId) && relatedIds.size < maxNodes) {
            relatedIds.add(nextId);
            if (visited.size < maxDepth * 10) {
              queue.push(nextId);
            }
          }
        }
      }

      const nodes = Array.from(relatedIds)
        .map(id => graph.getNode(id))
        .filter((node): node is GraphNode => Boolean(node))
        .map(node => ({
          id: node.id,
          name: node.name,
          type: node.type,
          fullName: node.fullName,
          summary: node.summary || "unknown",
          file: node.location?.file || "unknown",
          metadata: node.metadata || {},
          location: node.location ? stripSourceText(node.location) : undefined,
          vscodeUri: toVsCodeUri(node.location),
          rank: rankingByNode.get(node.id),
          degree: graph.getIncomingEdges(node.id).length + graph.getOutgoingEdges(node.id).length,
          incomingCount: graph.getIncomingEdges(node.id).length,
          outgoingCount: graph.getOutgoingEdges(node.id).length,
        }));

      const nodeIds = new Set(nodes.map(n => n.id));
      const edges = graph.getEdges()
        .filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to))
        .map(edge => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          type: edge.type,
          resolved: edge.resolved,
        }));

      res.json({
        nodes,
        edges,
        stats: { ...graphStats, level: 2, focus: focusNodeId },
        ranking: rankingScores.slice(0, 50),
      });
      return;
    }

    // Default: Return full graph (legacy behavior, but warn if too large)
    const nodes = graph.getNodes().map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      fullName: node.fullName,
      summary: node.summary || "unknown",
      file: node.location?.file || "unknown",
      metadata: node.metadata || {},
      location: node.location ? stripSourceText(node.location) : undefined,
      vscodeUri: toVsCodeUri(node.location),
      rank: rankingByNode.get(node.id),
      degree: graph.getIncomingEdges(node.id).length + graph.getOutgoingEdges(node.id).length,
      incomingCount: graph.getIncomingEdges(node.id).length,
      outgoingCount: graph.getOutgoingEdges(node.id).length,
    }));

    const edges = graph.getEdges().map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      resolved: edge.resolved,
    }));

    res.json({
      nodes,
      edges,
      stats: graphStats,
      ranking: rankingScores.slice(0, 50),
      analytics: {
        health: analytics.health,
        hubs: analytics.hubs,
        communities: analytics.communities,
      },
      warning: nodes.length > 5000 ? 'Large graph: Consider using ?level=0 for cluster view' : undefined,
    });
  });

  // GitHub repo analysis endpoint. The UI fetches GitHub content in-browser,
  // then this endpoint materializes it into a temporary repository and builds
  // the same parser-backed graph used for local projects.
  app.post("/api/analyze", async (req, res) => {
    try {
      const { files, repo, branch } = req.body;
      const isZipFetch = repo && (!files || files.length === 0);

      if (!isZipFetch && (!files || !Array.isArray(files))) {
        res.status(400).json({ error: 'Invalid files array' });
        return;
      }

      if (!isZipFetch && files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      const safeRepoName = String(repo || "github-repo")
        .replace(/[^a-zA-Z0-9_.-]+/g, "-")
        .slice(0, 120);
      let remoteRoot = path.join(
        resolvedProjectRoot,
        ".codebrain",
        "remote-repos",
        `${safeRepoName}-${Date.now()}`,
      );

      fs.mkdirSync(remoteRoot, { recursive: true });

      let writtenFiles: string[] = [];

      if (isZipFetch) {
        // Download the zip archive to bypass GitHub rate limits
        let targetBranch = branch || "main";
        let zipUrl = `https://github.com/${repo}/archive/refs/heads/${targetBranch}.zip`;
        const zipPath = path.join(remoteRoot, "repo.zip");
        
        const downloadZip = (url: string): Promise<void> => {
          return new Promise<void>((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'code-brain' } }, (response) => {
              if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                  https.get(redirectUrl, { headers: { 'User-Agent': 'code-brain' } }, (redirectResponse) => {
                    if (redirectResponse.statusCode !== 200) {
                       reject(new Error(`Failed to download zip from redirect: ${redirectResponse.statusCode}`));
                       return;
                    }
                    const fileStream = fs.createWriteStream(zipPath);
                    redirectResponse.pipe(fileStream);
                    fileStream.on('finish', () => { fileStream.close(); resolve(); });
                  }).on('error', reject);
                  return;
                }
              }
              if (response.statusCode === 404) {
                 reject(new Error("404"));
                 return;
              }
              if (response.statusCode !== 200) {
                reject(new Error(`Failed to download repository zip: ${response.statusCode}`));
                return;
              }
              const fileStream = fs.createWriteStream(zipPath);
              response.pipe(fileStream);
              fileStream.on('finish', () => { fileStream.close(); resolve(); });
            }).on('error', reject);
          });
        };

        try {
           await downloadZip(zipUrl);
        } catch (e: any) {
           if (e.message === "404" && !branch) {
              // Fallback to master if branch wasn't explicitly specified
              targetBranch = "master";
              zipUrl = `https://github.com/${repo}/archive/refs/heads/${targetBranch}.zip`;
              try {
                  await downloadZip(zipUrl);
              } catch (e2: any) {
                  throw new Error(`Repository not found or branch does not exist (tried main and master).`);
              }
           } else {
              throw new Error(`Failed to download repository: ${e.message}`);
           }
        }

        const zip = new AdmZip(zipPath);
        zip.extractAllTo(remoteRoot, true);
        
        // Delete zip to save space
        fs.unlinkSync(zipPath);
        
        // Find the extracted folder (GitHub zips typically extract to an inner root folder)
        const entries = fs.readdirSync(remoteRoot);
        const extractedFolder = entries.find(e => fs.statSync(path.join(remoteRoot, e)).isDirectory());
        
        if (extractedFolder) {
            remoteRoot = path.join(remoteRoot, extractedFolder);
            const scanDir = (dir: string) => {
                const results: string[] = [];
                const list = fs.readdirSync(dir);
                for (const file of list) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (stat && stat.isDirectory()) {
                        results.push(...scanDir(filePath));
                    } else {
                        results.push(filePath);
                    }
                }
                return results;
            };
            writtenFiles = scanDir(remoteRoot);
        }
      } else {
        for (const file of files as Array<{ path?: string; name?: string; content?: string }>) {
          const relativePath = String(file.path || file.name || "").replace(/\\/g, "/");
          if (!relativePath || relativePath.includes("\0")) continue;

          const targetPath = path.resolve(remoteRoot, relativePath);
          const relativeToRoot = path.relative(remoteRoot, targetPath);
          if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
            continue;
          }

          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(targetPath, String(file.content || ""), "utf8");
          writtenFiles.push(targetPath);
        }
      }

      if (writtenFiles.length === 0) {
        res.status(400).json({ error: "No valid files could be materialized" });
        return;
      }

      const builder = new GraphBuilder();
      const remoteGraph = await builder.buildFromRepository(
        remoteRoot,
        ["**"],
        ["node_modules", "dist", "build", "coverage", ".git", ".codebrain"],
        writtenFiles,
        false,
      );

      activateGraph(remoteGraph as ReturnType<typeof storage.loadGraph>, remoteRoot);

      const payloadNodes = graph.getNodes().map((node) => {
        const sanitized = sanitizeNode(node, rankingByNode.get(node.id));
        sanitized.degree = graph.getIncomingEdges(node.id).length + graph.getOutgoingEdges(node.id).length;
        sanitized.incomingCount = graph.getIncomingEdges(node.id).length;
        sanitized.outgoingCount = graph.getOutgoingEdges(node.id).length;
        return sanitized;
      });

      res.json({
        nodes: payloadNodes,
        edges: graph.getEdges().map(sanitizeEdge),
        stats: graphStats,
        ranking: rankingScores.slice(0, 50),
        analytics: {
          health: analytics.health,
          hubs: analytics.hubs,
          communities: analytics.communities,
        },
        source: "github",
        repo,
      });
    } catch (error) {
      logger.error('Analysis error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Analysis failed'
      });
    }
  });

  app.get("/api/churn", async (req, res) => {
    try {
      // Lazy load GitIntegration
      const { GitIntegration } = await import('../git/index.js');
      const git = new GitIntegration(resolvedProjectRoot);
      const isRepo = await git.isGitRepo();
      if (!isRepo) {
        res.json({ files: {} });
        return;
      }
      
      const filePaths = graph.getNodes()
        .filter(n => n.type === 'file' || n.type === 'project' || n.type === 'module')
        .map(n => n.location?.file)
        .filter((f): f is string => Boolean(f));
        
      const fileStats = await git.getFileStats(filePaths, '1 year ago');
      const statsObj: Record<string, { changes: number; authors: number; hotspot: boolean }> = {};
      
      for (const [path, stats] of fileStats) {
        statsObj[path] = {
          changes: stats.changeCount,
          authors: stats.authors.length,
          hotspot: stats.isHotspot
        };
      }
      
      res.json({ files: statsObj });
    } catch (error) {
      logger.error('Churn analysis error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Churn analysis failed'
      });
    }
  });

  app.post("/api/repo/init", async (req, res) => {
    try {
      const reindex = req.body?.reindex !== false;
      await initCommand(resolvedProjectRoot);
      if (reindex) {
        await indexCommand(resolvedProjectRoot, {
          includeDocs: true,
          includeAPI: true,
        });
      }

      const refreshedGraph = storage.loadGraph(resolvedProjectRoot);
      const refreshedRanking = storage.getRankingScores(resolvedProjectRoot);
      activateGraph(refreshedGraph, resolvedProjectRoot, refreshedRanking);

      res.json({
        ok: true,
        root: resolvedProjectRoot,
        reindexed: reindex,
        stats: graphStats,
      });
    } catch (error) {
      logger.error("Repository initialization failed:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Repository initialization failed",
      });
    }
  });

  app.get("/api/node/:id", (req, res) => {
    const node = graph.getNode(req.params.id);
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    const outgoing = graph.getOutgoingEdges(node.id);
    const incoming = graph.getIncomingEdges(node.id);

    const sanitizedNode = sanitizeNode(node, rankingByNode.get(node.id));
    sanitizedNode.incomingCount = incoming.length;
    sanitizedNode.outgoingCount = outgoing.length;
    sanitizedNode.degree = incoming.length + outgoing.length;

    res.json({
      ...sanitizedNode,
      relationSummary: {
        outgoing: groupEdgesByType(outgoing),
        incoming: groupEdgesByType(incoming),
      },
      sourcePreview: node.location
        ? {
            file: node.location.file,
            startLine: node.location.startLine,
            endLine: node.location.endLine,
            startCol: node.location.startCol,
            endCol: node.location.endCol,
            vscodeUri: toVsCodeUri(node.location),
          }
        : undefined,
      outgoing: outgoing.map((edge) => ({
        ...sanitizeEdge(edge),
        target: graph.getNode(edge.to)
          ? sanitizeNode(graph.getNode(edge.to)!, rankingByNode.get(edge.to))
          : undefined,
      })),
      incoming: incoming.map((edge) => ({
        ...sanitizeEdge(edge),
        source: graph.getNode(edge.from)
          ? sanitizeNode(graph.getNode(edge.from)!, rankingByNode.get(edge.from))
          : undefined,
      })),
    });
  });

  // New endpoint to fetch source code for a node
  app.get("/api/node/:id/code", (req, res) => {
    const node = graph.getNode(req.params.id);
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    // If node has location with text, return it
    if (node.location?.text) {
      res.json({
        code: node.location.text,
        file: node.location.file,
        startLine: node.location.startLine,
        endLine: node.location.endLine,
        language: detectLanguage(node.location.file),
      });
      return;
    }

    // Otherwise, try to read from file system
    if (node.location?.file) {
      const resolvedFile = path.isAbsolute(node.location.file)
        ? path.resolve(node.location.file)
        : path.resolve(activeProjectRoot, node.location.file);

      if (!isInsideRoot(activeProjectRoot, resolvedFile)) {
        res.status(403).json({ error: "Source file must be inside project root" });
        return;
      }

      if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
        res.status(404).json({ error: "Source file not found" });
        return;
      }

      try {
        const lines = fs.readFileSync(resolvedFile, "utf-8").split(/\r?\n/);
        const startLine = Math.max(0, (node.location.startLine || 1) - 1);
        const endLine = Math.min(lines.length, node.location.endLine || startLine + 1);
        const code = lines.slice(startLine, endLine).join('\n');

        res.json({
          code,
          file: node.location.file,
          startLine: node.location.startLine,
          endLine: node.location.endLine,
          language: detectLanguage(node.location.file),
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to read source file" });
      }
      return;
    }

    res.status(404).json({ error: "No source code available for this node" });
  });

  app.get("/api/search", (req, res) => {
    const pattern = sanitizeInput(String(req.query.q || "").trim(), 500);
    if (!pattern) {
      res.status(400).json({ error: "Query parameter q is required" });
      return;
    }

    const results = queryEngine.findByName(pattern, 50);
    res.json(results);
  });

  app.get("/api/related/:id", (req, res) => {
    const depth = Number.parseInt(String(req.query.depth || "2"), 10);
    res.json(
      queryEngine.findRelated(req.params.id, Number.isNaN(depth) ? 2 : depth),
    );
  });

  app.get("/api/path", (req, res) => {
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!from || !to) {
      res
        .status(400)
        .json({ error: "Query parameters from and to are required" });
      return;
    }

    const pathIds = graph.findPath(from, to) || [];
    res.json({
      path: pathIds
        .map((id) => graph.getNode(id))
        .filter((node): node is GraphNode => Boolean(node))
        .map((node) => sanitizeNode(node, rankingByNode.get(node.id))),
      edges: pathIds.slice(0, -1).flatMap((id, index) =>
        graph
          .getOutgoingEdges(id)
          .filter((edge) => edge.to === pathIds[index + 1])
          .map((edge) => sanitizeEdge(edge)),
      ),
    });
  });

  app.get("/api/entry-points", (_req, res) => {
    res.json(queryEngine.findEntryPoints());
  });

  app.get("/api/stats", (_req, res) => {
    res.json(graphStats);
  });

  app.get("/api/analytics", (_req, res) => {
    res.json(analytics);
  });

  app.get("/api/source", (req, res) => {
    const file = String(req.query.file || "");
    const requestedStart = Number.parseInt(String(req.query.startLine || "1"), 10);
    const requestedEnd = Number.parseInt(String(req.query.endLine || requestedStart), 10);
    const context = Math.min(
      20,
      Math.max(0, Number.parseInt(String(req.query.context || "6"), 10) || 0),
    );

    if (!file) {
      res.status(400).json({ error: "Query parameter file is required" });
      return;
    }

    const resolvedFile = path.isAbsolute(file)
      ? path.resolve(file)
      : path.resolve(activeProjectRoot, file);
    if (!isInsideRoot(activeProjectRoot, resolvedFile)) {
      res.status(403).json({ error: "Source file must be inside project root" });
      return;
    }

    if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
      res.status(404).json({ error: "Source file not found" });
      return;
    }

    const lines = fs.readFileSync(resolvedFile, "utf-8").split(/\r?\n/);
    const startLine = Math.max(1, requestedStart - context);
    const endLine = Math.min(lines.length, requestedEnd + context);
    const snippet = lines.slice(startLine - 1, endLine).map((text, index) => ({
      line: startLine + index,
      text,
      highlighted:
        startLine + index >= requestedStart &&
        startLine + index <= requestedEnd,
    }));

    res.json({
      file: resolvedFile,
      relativeFile: path.relative(activeProjectRoot, resolvedFile),
      startLine,
      endLine,
      requestedStartLine: requestedStart,
      requestedEndLine: requestedEnd,
      vscodeUri: toVsCodeUri({
        file: resolvedFile,
        startLine: requestedStart,
        endLine: requestedEnd,
        startCol: 1,
        endCol: 1,
      }),
      lines: snippet,
    });
  });

  app.get("/api/analyze/cycles", (_req, res) => {
    const cycles = queryEngine.findCycles(50);
    res.json({
      count: cycles.length,
      cycles: cycles.map(cycle => ({
        nodes: cycle.map(n => ({
          id: n.id,
          name: n.name,
          type: n.type,
          file: n.location?.file
        })),
        length: cycle.length
      }))
    });
  });

  app.get("/api/analyze/dead-exports", (_req, res) => {
    const deadExports = queryEngine.findDeadExports();
    res.json({
      count: deadExports.length,
      exports: deadExports.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        file: n.location?.file,
        fullName: n.fullName
      }))
    });
  });

  app.get("/api/analyze/orphans", (_req, res) => {
    const orphans = queryEngine.findOrphans();
    res.json({
      count: orphans.length,
      files: orphans.map(n => ({
        id: n.id,
        name: n.name,
        path: n.location?.file
      }))
    });
  });

  app.get("/api/query/callers", (req, res) => {
    const symbol = sanitizeInput(String(req.query.symbol || ""), 200);
    if (!symbol) {
      res.status(400).json({ error: "Query parameter symbol is required" });
      return;
    }
    const callers = queryEngine.findCallers(symbol);
    res.json({
      symbol,
      count: callers.length,
      callers: callers.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        file: n.location?.file
      }))
    });
  });

  app.get("/api/query/callees", (req, res) => {
    const symbol = sanitizeInput(String(req.query.symbol || ""), 200);
    if (!symbol) {
      res.status(400).json({ error: "Query parameter symbol is required" });
      return;
    }
    const callees = queryEngine.findCallees(symbol);
    res.json({
      symbol,
      count: callees.length,
      callees: callees.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        file: n.location?.file
      }))
    });
  });

  app.get("/api/query/impact", (req, res) => {
    const target = sanitizeInput(String(req.query.target || ""), 200);
    if (!target) {
      res.status(400).json({ error: "Query parameter target is required" });
      return;
    }
    const impact = queryEngine.findImpact(target);
    res.json({
      target,
      impactedCount: impact.impactedNodes.length,
      impactedFiles: impact.impactedFiles.map(n => ({
        id: n.id,
        name: n.name,
        path: n.location?.file,
        importance: n.importance
      })),
      criticalDependencies: impact.criticalDependencies.map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        importance: n.importance
      })),
      coveringTests: impact.coveringTests.map(n => ({
        id: n.id,
        name: n.name,
        file: n.location?.file
      }))
    });
  });

  // Pattern query endpoint
  app.get('/api/query/pattern', (req, res) => {
    try {
      const nodeTypes = req.query.types ? String(req.query.types).split(',') : undefined;
      const hasEdgeType = req.query.has_edge ? String(req.query.has_edge) : undefined;
      const hasEdgeDir = (req.query.has_edge_dir as 'incoming' | 'outgoing') || 'incoming';
      const notEdgeType = req.query.not_edge ? String(req.query.not_edge) : undefined;
      const notEdgeDir = (req.query.not_edge_dir as 'incoming' | 'outgoing') || 'incoming';
      const minImportance = req.query.min_importance ? Number(req.query.min_importance) : undefined;
      const namePattern = req.query.name ? String(req.query.name) : undefined;
      const isDead = req.query.is_dead === 'true' ? true : req.query.is_dead === 'false' ? false : undefined;
      const isBridge = req.query.is_bridge === 'true' ? true : req.query.is_bridge === 'false' ? false : undefined;
      const limit = req.query.limit ? Math.min(100, Number(req.query.limit)) : 20;

      const engine = new PatternQueryEngine(graph);
      const results = engine.query({
        description: 'REST pattern query',
        nodeFilter: {
          types: nodeTypes as any,
          namePattern: namePattern ? new RegExp(namePattern, 'i') : undefined,
          minImportance,
        },
        edgePattern: hasEdgeType ? { type: hasEdgeType as any, direction: hasEdgeDir } : undefined,
        notPattern: notEdgeType ? { type: notEdgeType as any, direction: notEdgeDir } : undefined,
        metadataFilter: {
          matches: {
            ...(isDead !== undefined ? { isDead } : {}),
            ...(isBridge !== undefined ? { isBridge } : {}),
          },
        },
      });

      res.json({ total: results.length, results: results.slice(0, limit).map(m => m.node) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Invariants endpoint
  app.get('/api/analyze/invariants', (_req, res) => {
    try {
      const detector = new InvariantDetector(graph);
      const report = detector.checkInvariants();
      res.json({
        totalViolations: report.totalViolations,
        healthScore: report.healthScore,
        errors: report.errors,
        warnings: report.warnings,
        info: report.info,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Dead code endpoint
  app.get('/api/analyze/dead-code', (_req, res) => {
    try {
      const deadNodes = graph.getNodes()
        .filter(n => n.metadata?.isDead === true)
        .map(n => ({ id: n.id, name: n.name, type: n.type, file: n.location?.file, importance: n.importance }))
        .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
      res.json({ total: deadNodes.length, nodes: deadNodes });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Bridge nodes endpoint
  app.get('/api/analyze/bridges', (_req, res) => {
    try {
      const bridgeNodes = graph.getNodes()
        .filter(n => n.metadata?.isBridge === true)
        .map(n => ({ id: n.id, name: n.name, type: n.type, file: n.location?.file, importance: n.importance }))
        .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
      res.json({ total: bridgeNodes.length, nodes: bridgeNodes });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Security signal endpoint: lightweight static checks inspired by CodeFlow's browser scanner.
  app.get('/api/analyze/security', (_req, res) => {
    try {
      const issues = scanSecurityIssues(activeProjectRoot, graph);
      const bySeverity = issues.reduce<Record<string, number>>((acc, issue) => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
        return acc;
      }, {});
      res.json({
        total: issues.length,
        bySeverity,
        issues: issues.slice(0, 100),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Impact trace endpoint (uses ImpactTracer, replacing the basic findImpact)
  app.get('/api/query/impact-full', (req, res) => {
    try {
      const target = sanitizeInput(String(req.query.target || ''), 200);
      const maxDepth = Math.min(10, Number(req.query.depth || 5));
      if (!target) { res.status(400).json({ error: 'target is required' }); return; }

      const nodes = queryEngine.findByName(target);
      if (nodes.length === 0) { res.status(404).json({ error: `Symbol not found: ${target}` }); return; }

      const tracer = new ImpactTracer(graph);
      const analysis = tracer.analyzeImpact(nodes[0].id, { maxDepth });
      if (!analysis) { res.status(500).json({ error: 'Failed to analyze impact' }); return; }

      res.json({
        target: { id: analysis.target.id, name: analysis.target.name },
        blastRadius: analysis.blastRadius,
        explanation: analysis.explanation,
        directImpact: analysis.directImpact,
        transitiveImpact: analysis.transitiveImpact,
        affectedTests: analysis.affectedTests,
        affectedFiles: Array.from(analysis.affectedFiles),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });


  // ── Cyclomatic complexity per file ─────────────────────────────────────────
  app.get('/api/analyze/complexity', (_req, res) => {
    try {
      const fileNodes = graph.getNodes().filter(n => n.type === 'file' || n.type === 'module');
      const results = fileNodes.map(node => {
        const filePath = node.location?.file || '';
        let score = 1;
        let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
        if (filePath && fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const patterns = [
              /\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bwhile\s*\(/g, /\bfor\s*\(/g,
              /\bcase\s+/g, /\bcatch\s*\(/g, /&&/g, /\|\|/g,
              /\bif\s+[^(]/g, /\belif\s+/g, /\bexcept\s*/g,
            ];
            patterns.forEach(p => { const m = content.match(p); if (m) score += m.length; });
          } catch { /* skip unreadable */ }
        }
        if (score > 30) level = 'critical';
        else if (score > 20) level = 'high';
        else if (score > 10) level = 'medium';
        return { id: node.id, name: node.name, file: filePath, score, level };
      });
      results.sort((a, b) => b.score - a.score);
      const dist = { critical: 0, high: 0, medium: 0, low: 0 };
      results.forEach(r => { dist[r.level]++; });
      res.json({ total: results.length, distribution: dist, files: results.slice(0, 100) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Duplicate function name detection ────────────────────────────────────────
  app.get('/api/analyze/duplicates', (_req, res) => {
    try {
      const fnNodes = graph.getNodes().filter(n => n.type === 'function' || n.type === 'method');
      const byName = new Map<string, Array<{ id: string; name: string; file: string }>>();
      const COMMON_NAMES = new Set([
        'render','init','setup','cleanup','destroy','reset','update','refresh',
        'validate','parse','format','get','set','fetch','load','save','create',
        'delete','remove','add','find','filter','map','sort',
        '__init__','__str__','__repr__','toString','valueOf',
        'handleClick','handleChange','handleSubmit','onClick','onChange',
        'componentDidMount','componentWillUnmount','ngOnInit','ngOnDestroy',
      ]);
      fnNodes.forEach(n => {
        const base = n.name.includes('.') ? n.name.split('.').pop()! : n.name;
        if (!base || base.length < 3 || COMMON_NAMES.has(base)) return;
        const file = n.location?.file || '';
        if (!byName.has(base)) byName.set(base, []);
        byName.get(base)!.push({ id: n.id, name: n.fullName || n.name, file });
      });
      const duplicates: Array<{ name: string; count: number; files: string[]; entries: any[] }> = [];
      byName.forEach((entries, name) => {
        const uniqueFiles = [...new Set(entries.map(e => e.file))];
        if (uniqueFiles.length >= 3) {
          duplicates.push({ name, count: uniqueFiles.length, files: uniqueFiles, entries });
        }
      });
      duplicates.sort((a, b) => b.count - a.count);
      res.json({ total: duplicates.length, duplicates: duplicates.slice(0, 50) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Architecture layer violation detection ──────────────────────────────────
  app.get('/api/analyze/layer-violations', (_req, res) => {
    try {
      const LAYER_ORDER: Record<string, number> = {
        ui: 0, components: 0, pages: 0, views: 0, templates: 0,
        services: 2, api: 2, controllers: 2,
        utils: 4, helpers: 4, lib: 4, common: 4,
        data: 3, models: 3, store: 3, schemas: 3,
        config: 5, test: 6, tests: 6,
      };
      function detectLayerLocal(filePath: string): string {
        const l = filePath.toLowerCase();
        if (l.includes('/test') || l.includes('__tests__')) return 'test';
        if (l.includes('/ui/') || l.includes('/views/') || l.includes('/pages/')) return 'ui';
        if (l.includes('/component')) return 'components';
        if (l.includes('/service') || l.includes('/api/') || l.includes('/controller')) return 'services';
        if (l.includes('/util') || l.includes('/helper') || l.includes('/lib/')) return 'utils';
        if (l.includes('/data') || l.includes('/model') || l.includes('/store') || l.includes('/schema')) return 'data';
        if (l.includes('/config') || l.includes('/settings')) return 'config';
        return 'utils';
      }
      const edgesArr = graph.getEdges().filter(e => ['IMPORTS','DEPENDS_ON'].includes(e.type) && e.resolved);
      const violations: Array<{ from: string; fromLayer: string; to: string; toLayer: string; suggestion: string }> = [];
      edgesArr.forEach(edge => {
        const src = graph.getNode(edge.from);
        const tgt = graph.getNode(edge.to);
        if (!src?.location?.file || !tgt?.location?.file) return;
        const srcLayer = detectLayerLocal(src.location.file);
        const tgtLayer = detectLayerLocal(tgt.location.file);
        const srcLevel = LAYER_ORDER[srcLayer];
        const tgtLevel = LAYER_ORDER[tgtLayer];
        if (srcLevel !== undefined && tgtLevel !== undefined && srcLevel > tgtLevel && srcLevel - tgtLevel > 1) {
          violations.push({
            from: src.location.file, fromLayer: srcLayer,
            to: tgt.location.file, toLayer: tgtLayer,
            suggestion: srcLayer + ' should not import from ' + tgtLayer + '. Use dependency injection.',
          });
        }
      });
      res.json({ total: violations.length, violations: violations.slice(0, 100) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Code health score A/B/C/D/F ────────────────────────────────────────────
  app.get('/api/analyze/health-score', (_req, res) => {
    try {
      const nodes = graph.getNodes();
      const edges = graph.getEdges();
      const fnNodes = nodes.filter(n => n.type === 'function' || n.type === 'method');
      const deadNodes = fnNodes.filter(n => n.metadata?.isDead === true);
      const secIssues = scanSecurityIssues(activeProjectRoot, graph);
      const cycles = analytics.cycles || [];
      let score = 100;
      const deadPct = fnNodes.length > 0 ? (deadNodes.length / fnNodes.length) * 100 : 0;
      score -= Math.min(20, deadPct);
      score -= Math.min(20, cycles.length * 5);
      const fileNodesH = nodes.filter(n => n.type === 'file' || n.type === 'module');
      const godFiles = fileNodesH.filter(n => {
        const ch = graph.getOutgoingEdges(n.id).filter(e => e.type === 'DEFINES' || e.type === 'OWNS');
        return ch.length >= 15;
      });
      score -= Math.min(15, godFiles.length * 3);
      const avgCoup = nodes.length > 0 ? edges.length / nodes.length : 0;
      score -= Math.min(15, Math.max(0, avgCoup - 3) * 2);
      const highSec = secIssues.filter(i => i.severity === 'high').length;
      score -= Math.min(20, highSec * 5);
      score = Math.max(0, Math.round(score));
      let grade = 'F';
      if (score >= 90) grade = 'A';
      else if (score >= 80) grade = 'B';
      else if (score >= 70) grade = 'C';
      else if (score >= 60) grade = 'D';
      res.json({
        score, grade,
        breakdown: {
          deadCodePenalty: Math.min(20, deadPct),
          cyclePenalty: Math.min(20, cycles.length * 5),
          godFilePenalty: Math.min(15, godFiles.length * 3),
          couplingPenalty: Math.min(15, Math.max(0, avgCoup - 3) * 2),
          securityPenalty: Math.min(20, highSec * 5),
        },
        stats: {
          totalNodes: nodes.length, totalEdges: edges.length,
          deadFunctions: deadNodes.length, cycles: cycles.length,
          godFiles: godFiles.length, highSecurityIssues: highSec,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Actionable improvement suggestions ──────────────────────────────────────
  app.get('/api/analyze/suggestions', (_req, res) => {
    try {
      const nodes = graph.getNodes();
      const edges = graph.getEdges();
      const fnNodes = nodes.filter(n => n.type === 'function' || n.type === 'method');
      const deadNodes = fnNodes.filter(n => n.metadata?.isDead === true);
      const secIssues = scanSecurityIssues(activeProjectRoot, graph);
      const cycles = analytics.cycles || [];
      const suggestions: Array<{
        priority: 'critical' | 'high' | 'medium' | 'low';
        icon: string; title: string; desc: string; action: string; impact: string;
      }> = [];
      if (deadNodes.length > 10) {
        suggestions.push({ priority: 'high', icon: 'broom', title: 'Remove Dead Code',
          desc: deadNodes.length + ' unused functions detected.',
          action: 'Review the Dead Code panel to find orphaned functions.',
          impact: 'Reduces codebase by ~' + (deadNodes.length * 15) + ' lines' });
      }
      if (cycles.length > 0) {
        suggestions.push({ priority: 'critical', icon: 'refresh', title: 'Break Circular Dependencies',
          desc: cycles.length + ' circular dependency cycles found.',
          action: 'Extract shared code to a new module or use dependency injection.',
          impact: 'Improves testability and modularity' });
      }
      const fileNodesSug = nodes.filter(n => n.type === 'file' || n.type === 'module');
      const godFilesSug = fileNodesSug.filter(n => {
        const ch = graph.getOutgoingEdges(n.id).filter(e => e.type === 'DEFINES' || e.type === 'OWNS');
        return ch.length >= 15;
      });
      if (godFilesSug.length > 0) {
        suggestions.push({ priority: 'high', icon: 'split', title: 'Split Large Files',
          desc: godFilesSug.length + ' files have 15+ functions.',
          action: 'Group related functions and extract to separate modules.',
          impact: 'Improves code navigation and testability' });
      }
      const couplingMap = new Map<string, number>();
      edges.forEach(e => { couplingMap.set(e.to, (couplingMap.get(e.to) || 0) + 1); });
      const highCoupling = [...couplingMap.entries()].filter(([, c]) => c >= 8).length;
      if (highCoupling > 0) {
        suggestions.push({ priority: 'medium', icon: 'link', title: 'Reduce Coupling',
          desc: highCoupling + ' files are imported by 8+ others.',
          action: 'Review if these should be split or importers consolidated.',
          impact: 'Reduces blast radius of changes' });
      }
      const highSec = secIssues.filter(i => i.severity === 'high');
      if (highSec.length > 0) {
        suggestions.push({ priority: 'critical', icon: 'shield', title: 'Fix Security Issues',
          desc: highSec.length + ' high-severity security issues detected.',
          action: 'Address hardcoded secrets and injection risks immediately.',
          impact: 'Prevents potential security breaches' });
      }
      const testNodesSug = nodes.filter(n => {
        const fp = n.location?.file || '';
        return fp.includes('.test.') || fp.includes('.spec.') || fp.includes('__tests__');
      });
      const testRatio = nodes.length > 0 ? (testNodesSug.length / nodes.length) * 100 : 0;
      if (testRatio < 10 && nodes.length > 20) {
        suggestions.push({ priority: 'medium', icon: 'beaker', title: 'Add Test Coverage',
          desc: 'Only ' + testNodesSug.length + ' test files (~' + Math.round(testRatio) + '%).',
          action: 'Focus on testing critical paths and high-complexity files.',
          impact: 'Prevents regressions and improves confidence' });
      }
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
      res.json({ total: suggestions.length, suggestions });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("*", (_req, res, next) => {
    if (!fs.existsSync(path.join(staticDir, "index.html"))) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      // Get the actual port (useful when port 0 is used for auto-assignment)
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      
      logger.success(`Graph server running on http://localhost:${actualPort}`);
      if (port === 0) {
        logger.info(`Auto-assigned port: ${actualPort}`);
      }
      logger.info("Press Ctrl+C to stop");
      
      // Create WebSocket server
      const wss = new WebSocketServer({ server });
      
      wss.on('connection', (ws: WebSocket) => {
        logger.debug('WebSocket client connected');
        
        ws.on('error', (error) => {
          logger.debug('WebSocket error:', error);
        });
        
        ws.on('close', () => {
          logger.debug('WebSocket client disconnected');
        });
        
        // Send initial connection message
        ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
      });
      
      // Broadcast function to send messages to all connected clients
      const broadcast = (message: unknown) => {
        const payload = JSON.stringify(message);
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      };
      
      // Graceful shutdown handlers
      const shutdown = () => {
        logger.info('Shutting down gracefully...');
        storage.close();
        server.close(() => {
          logger.info('Server closed');
          process.exit(0);
        });
      };
      
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
      
      resolve({ server, wss, broadcast });
    });

    server.on("error", (error) => {
      logger.error("Failed to start graph server", error);
      reject(error);
    });
  });
}
