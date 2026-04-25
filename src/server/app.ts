import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { QueryEngine } from "../retrieval/query.js";
import { logger, getDbPath } from "../utils/index.js";
import { SQLiteStorage } from "../storage/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function stripSourceText<T extends { text?: string }>(span: T): T {
  const cleaned = { ...span };
  delete cleaned.text;
  return cleaned;
}

export async function createGraphServer(
  projectRoot: string,
  port: number = 3000,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../../ui/public")));

  logger.info(`Server starting for projectRoot: ${projectRoot}`);
  logger.info(`Resolved to: ${path.resolve(projectRoot)}`);

  const storage = new SQLiteStorage(getDbPath(projectRoot));
  const graph = storage.loadGraph(projectRoot);
  const queryEngine = new QueryEngine(graph);
  const stats = graph.getStats();

  logger.info(`Graph loaded with stats: ${JSON.stringify(stats)}`);

  storage.close();

  logger.success("Graph loaded for visualization");

  app.get("/api/graph", (_req, res) => {
    const nodes = graph.getNodes().map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      fullName: node.fullName,
      summary: node.summary || "unknown",
      file: node.location?.file || "unknown",
      metadata: node.metadata || {},
      degree:
        graph.getIncomingEdges(node.id).length +
        graph.getOutgoingEdges(node.id).length,
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

    res.json({
      ...node,
      location: node.location ? stripSourceText(node.location) : undefined,
      provenance: {
        ...node.provenance,
        source: node.provenance.source.map((source) => stripSourceText(source)),
      },
      outgoing: outgoing.map((edge) => ({
        ...edge,
        sourceLocation: (edge.sourceLocation || []).map((source) =>
          stripSourceText(source),
        ),
        target: graph.getNode(edge.to),
      })),
      incoming: incoming.map((edge) => ({
        ...edge,
        sourceLocation: (edge.sourceLocation || []).map((source) =>
          stripSourceText(source),
        ),
        source: graph.getNode(edge.from),
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
      path: pathIds.map((id) => graph.getNode(id)).filter(Boolean),
    });
  });

  app.get("/api/entry-points", (_req, res) => {
    res.json(queryEngine.findEntryPoints());
  });

  app.get("/api/stats", (_req, res) => {
    res.json(stats);
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.success(`Graph server running on http://localhost:${port}`);
      logger.info("Press Ctrl+C to stop");
      resolve();
    });

    server.on("error", (error) => {
      logger.error("Failed to start graph server", error);
      reject(error);
    });
  });
}
