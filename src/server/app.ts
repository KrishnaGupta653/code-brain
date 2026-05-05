import express from "express";
import fs from "fs";
import { Server } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { QueryEngine } from "../retrieval/query.js";
import { ImpactTracer } from "../retrieval/impact-tracer.js";
import { PatternQueryEngine } from "../retrieval/pattern-query.js";
import { InvariantDetector } from "../graph/invariants.js";
import { ContextAssembler } from "../retrieval/context-assembler.js";
import { logger, getDbPath } from "../utils/index.js";
import { SQLiteStorage } from "../storage/index.js";
import { GraphEdge, GraphNode, RankingScore, SourceSpan } from "../types/models.js";

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
        scriptSrc: ["'self'", "'unsafe-inline'"],  // needed for graph UI
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
      }
    },
    crossOriginEmbedderPolicy: false,  // Allow embedding for development
  }));
  
  app.use(express.json());
  
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

  logger.info(`Server starting for projectRoot: ${projectRoot}`);
  logger.info(`Resolved to: ${path.resolve(projectRoot)}`);

  const storage = new SQLiteStorage(getDbPath(projectRoot));
  const graph = storage.loadGraph(projectRoot);
  const queryEngine = new QueryEngine(graph, storage, projectRoot);
  const stats = graph.getStats();
  const analytics = computeAnalytics(graph);
  let rankingScores = storage.getRankingScores(projectRoot);
  if (rankingScores.length === 0) {
    rankingScores = Object.entries(analytics.importance).map(([nodeId, score]) => ({
      nodeId,
      score: Number(score),
      algorithm: "degree_importance",
      components: {
        centrality: Number(analytics.centrality[nodeId] || 0),
      },
    }));
    storage.saveRankingScores(projectRoot, rankingScores);
  }
  const rankingByNode = new Map(rankingScores.map((score) => [score.nodeId, score]));

  logger.info(`Graph loaded with stats: ${JSON.stringify(stats)}`);

  storage.close();

  logger.success("Graph loaded for visualization");

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
        stats: { ...stats, level: 0, clustered: true },
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
        stats: { ...stats, level: 2, communityId },
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
        stats: { ...stats, level: 1 },
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
        stats: { ...stats, level: 2, focus: focusNodeId },
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
      stats,
      ranking: rankingScores.slice(0, 50),
      analytics: {
        health: analytics.health,
        hubs: analytics.hubs,
        communities: analytics.communities,
      },
      warning: nodes.length > 5000 ? 'Large graph: Consider using ?level=0 for cluster view' : undefined,
    });
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
        : path.resolve(projectRoot, node.location.file);
      
      if (!isInsideRoot(projectRoot, resolvedFile)) {
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
    res.json(stats);
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
      : path.resolve(projectRoot, file);
    if (!isInsideRoot(projectRoot, resolvedFile)) {
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
      relativeFile: path.relative(projectRoot, resolvedFile),
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
      
      resolve({ server, wss, broadcast });
    });

    server.on("error", (error) => {
      logger.error("Failed to start graph server", error);
      reject(error);
    });
  });
}
