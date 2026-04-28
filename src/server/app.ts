import express from "express";
import fs from "fs";
import { Server } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { QueryEngine } from "../retrieval/query.js";
import { logger, getDbPath } from "../utils/index.js";
import { SQLiteStorage } from "../storage/index.js";
import { GraphEdge, GraphNode, RankingScore, SourceSpan } from "../types/models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const centrality = Object.fromEntries(
    nodes.map((node) => [node.id, Number(((degree.get(node.id) || 0) / maxDegree).toFixed(6))]),
  );
  const importance = Object.fromEntries(
    nodes.map((node) => {
      const score =
        (incoming.get(node.id) || 0) * 1.4 +
        (outgoing.get(node.id) || 0) +
        (node.type === "project" ? 2 : 0);
      return [node.id, Number((score / Math.max(1, maxDegree * 1.4)).toFixed(6))];
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

  const communities = new Map<number, string[]>();
  // Read communities from stored community_id column in nodes
  for (const node of nodes) {
    const cid = node.communityId ?? -1;
    if (!communities.has(cid)) {
      communities.set(cid, []);
    }
    communities.get(cid)!.push(node.id);
  }

  return {
    status: "ok",
    derivedFrom: "deterministic-graph",
    centrality,
    importance,
    hubs,
    communities: Array.from(communities.entries())
      .map(([communityId, nodeIds]) => ({
        label: `community_${communityId}`,
        communityId,
        nodeIds,
        size: nodeIds.length,
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 50),
    cycles: findCycles(graph, 20),
    health: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      unresolvedEdges: edges.filter((edge) => !edge.resolved).length,
      isolatedNodes: nodes.filter((node) => (degree.get(node.id) || 0) === 0).length,
    },
  };
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
): Promise<Server> {
  const app = express();
  app.use(express.json());
  const uiDist = path.resolve(__dirname, "../../ui/dist");
  const uiPublic = path.resolve(__dirname, "../../ui/public");
  const staticDir = fs.existsSync(uiDist) ? uiDist : uiPublic;
  app.use(express.static(staticDir));

  logger.info(`Server starting for projectRoot: ${projectRoot}`);
  logger.info(`Resolved to: ${path.resolve(projectRoot)}`);

  const storage = new SQLiteStorage(getDbPath(projectRoot));
  const graph = storage.loadGraph(projectRoot);
  const queryEngine = new QueryEngine(graph);
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

  // Helper function: Build lightweight node response
  const buildLightweightNode = (node: GraphNode, includeLayout: boolean = true) => {
    const incoming = graph.getIncomingEdges(node.id);
    const outgoing = graph.getOutgoingEdges(node.id);
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      fullName: node.fullName,
      summary: node.summary || "unknown",
      rank: rankingByNode.get(node.id),
      degree: incoming.length + outgoing.length,
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      ...(includeLayout && { x: node.x ?? null, y: node.y ?? null, communityId: node.communityId ?? null }),
    };
  };

  // GET /api/graph/overview — paginated, lightweight overview
  app.get("/api/graph/overview", (_req, res) => {
    const MAX_OVERVIEW_NODES = 10000; // Show all nodes
    const ARCHITECTURAL_EDGES = new Set(["IMPORTS", "DEPENDS_ON", "EXTENDS", "IMPLEMENTS", "ENTRY_POINT"]);

    const allNodes = graph.getNodes();
    const nodesToRank: Array<{ node: ReturnType<typeof graph.getNode>; priority: number }> = [];

    // Priority 1: All project nodes
    for (const node of allNodes) {
      if (node.type === "project") {
        nodesToRank.push({ node, priority: 10000 });
      }
    }

    // Priority 2: All module nodes (up to 500)
    let moduleCount = 0;
    for (const node of allNodes) {
      if (node.type === "module" && moduleCount < 500) {
        nodesToRank.push({ node, priority: 9000 });
        moduleCount++;
      }
    }

    // Priority 3: Top file nodes by rank score
    const fileNodes = allNodes
      .filter(n => n.type === "file")
      .sort((a, b) => {
        const scoreA = rankingByNode.get(a.id)?.score ?? 0;
        const scoreB = rankingByNode.get(b.id)?.score ?? 0;
        return scoreB - scoreA;
      })
      .slice(0, 500);
    for (const node of fileNodes) {
      const score = rankingByNode.get(node.id)?.score ?? 0;
      nodesToRank.push({ node, priority: 8000 + score * 1000 });
    }

    // Priority 4: Top class/interface nodes by rank score
    const classNodes = allNodes
      .filter(n => ["class", "interface"].includes(n.type))
      .sort((a, b) => {
        const scoreA = rankingByNode.get(a.id)?.score ?? 0;
        const scoreB = rankingByNode.get(b.id)?.score ?? 0;
        return scoreB - scoreA;
      })
      .slice(0, 500);
    for (const node of classNodes) {
      const score = rankingByNode.get(node.id)?.score ?? 0;
      nodesToRank.push({ node, priority: 7000 + score * 1000 });
    }

    // Priority 5: Fill remaining budget with other types by rank score
    const includedIds = new Set(nodesToRank.filter(x => x.node).map(x => x.node!.id));
    const otherNodes = allNodes
      .filter(n => !includedIds.has(n.id))
      .sort((a, b) => {
        const scoreA = rankingByNode.get(a.id)?.score ?? 0;
        const scoreB = rankingByNode.get(b.id)?.score ?? 0;
        return scoreB - scoreA;
      })
      .slice(0, Math.max(0, MAX_OVERVIEW_NODES - nodesToRank.length));
    for (const node of otherNodes) {
      const score = rankingByNode.get(node.id)?.score ?? 0;
      nodesToRank.push({ node, priority: score * 1000 });
    }

    // Build overview nodes response
    const overviewNodeIds = new Set(nodesToRank.filter(x => x.node).slice(0, MAX_OVERVIEW_NODES).map(x => x.node!.id));
    const overviewNodes = allNodes
      .filter(n => overviewNodeIds.has(n.id))
      .map(n => buildLightweightNode(n, true));

    // Build edges: only architectural types, both endpoints in overview
    const overviewEdges: any[] = [];
    for (const edge of graph.getEdges()) {
      if (
        ARCHITECTURAL_EDGES.has(edge.type) &&
        overviewNodeIds.has(edge.from) &&
        overviewNodeIds.has(edge.to)
      ) {
        overviewEdges.push({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          type: edge.type,
          resolved: edge.resolved,
        });
      }
    }

    // Cap at 10,000 edges
    const cappedEdges = overviewEdges.slice(0, 10000);

    res.json({
      nodes: overviewNodes,
      edges: cappedEdges,
      stats,
      ranking: rankingScores.slice(0, 50),
      analytics: {
        health: analytics.health,
        hubs: analytics.hubs,
        communities: analytics.communities,
      },
    });
  });

  app.get("/api/graph", (_req, res) => {
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
      x: node.x ?? null,
      y: node.y ?? null,
      communityId: node.communityId ?? null,
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
    });
  });

  // GET /api/graph/community/:communityId — get all nodes in a community
  app.get("/api/graph/community/:communityId", (req, res) => {
    const communityId = parseInt(req.params.communityId, 10);
    if (isNaN(communityId)) {
      res.status(400).json({ error: "Invalid community ID" });
      return;
    }

    const communityNodeIds = new Set(
      graph.getNodes()
        .filter(n => n.communityId === communityId)
        .map(n => n.id)
    );

    if (communityNodeIds.size === 0) {
      res.status(404).json({ error: "Community not found" });
      return;
    }

    const communityNodes = graph.getNodes()
      .filter(n => communityNodeIds.has(n.id))
      .map(n => buildLightweightNode(n, true));

    const communityEdges = graph.getEdges()
      .filter(e => communityNodeIds.has(e.from) && communityNodeIds.has(e.to))
      .map(e => ({
        id: e.id,
        from: e.from,
        to: e.to,
        type: e.type,
        resolved: e.resolved,
      }));

    res.json({
      nodes: communityNodes,
      edges: communityEdges,
      communityId,
      size: communityNodeIds.size,
    });
  });

  // GET /api/graph/neighbors/:nodeId — get node + neighbors up to depth
  app.get("/api/graph/neighbors/:nodeId", (req, res) => {
    const depth = Math.min(3, parseInt(req.query.depth as string, 10) || 2);
    const nodeId = req.params.nodeId;
    const node = graph.getNode(nodeId);

    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    // BFS to get neighbors
    const visited = new Set<string>();
    const toVisit = [{ id: nodeId, d: 0 }];
    visited.add(nodeId);

    while (toVisit.length > 0) {
      const { id, d } = toVisit.shift()!;
      if (d < depth) {
        for (const edge of graph.getOutgoingEdges(id)) {
          if (!visited.has(edge.to)) {
            visited.add(edge.to);
            toVisit.push({ id: edge.to, d: d + 1 });
          }
        }
        for (const edge of graph.getIncomingEdges(id)) {
          if (!visited.has(edge.from)) {
            visited.add(edge.from);
            toVisit.push({ id: edge.from, d: d + 1 });
          }
        }
      }
    }

    const neighborNodes = graph.getNodes()
      .filter(n => visited.has(n.id))
      .map(n => buildLightweightNode(n, true));

    const neighborEdges = graph.getEdges()
      .filter(e => visited.has(e.from) && visited.has(e.to))
      .map(e => ({
        id: e.id,
        from: e.from,
        to: e.to,
        type: e.type,
        resolved: e.resolved,
      }));

    res.json({
      nodes: neighborNodes,
      edges: neighborEdges,
      center: nodeId,
      depth,
      size: visited.size,
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

  app.get("/api/search", (req, res) => {
    const pattern = String(req.query.q || "").trim();
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

  app.get("*", (_req, res, next) => {
    if (!fs.existsSync(path.join(staticDir, "index.html"))) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.success(`Graph server running on http://localhost:${port}`);
      logger.info("Press Ctrl+C to stop");
      resolve(server);
    });

    server.on("error", (error) => {
      logger.error("Failed to start graph server", error);
      reject(error);
    });
  });
}
