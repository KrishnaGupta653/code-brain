import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  Activity,
  BoxSelect,
  Braces,
  CircleDot,
  Code2,
  ExternalLink,
  Filter,
  GitBranch,
  LocateFixed,
  Maximize2,
  Network,
  Route,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  GraphEdge,
  GraphNode,
  GraphPayload,
  NodeDetails,
  SourcePayload,
} from "./types";
import "./styles.css";

const NODE_COLORS: Record<string, string> = {
  project: "#f5c542",
  file: "#4cc9f0",
  module: "#8bd3ff",
  class: "#ff9f1c",
  function: "#4ade80",
  method: "#a78bfa",
  route: "#fb7185",
  config: "#f59e0b",
  test: "#f472b6",
  doc: "#94a3b8",
  interface: "#c084fc",
  type: "#38bdf8",
  constant: "#bef264",
  variable: "#67e8f9",
  enum: "#fdba74",
};

const EDGE_COLORS: Record<string, string> = {
  IMPORTS: "#38bdf8",
  EXPORTS: "#fb7185",
  CALLS: "#4ade80",
  CALLS_UNRESOLVED: "#f59e0b",
  OWNS: "#cbd5e1",
  DEFINES: "#60a5fa",
  USES: "#a78bfa",
  DEPENDS_ON: "#f87171",
  TESTS: "#f472b6",
  DOCUMENTS: "#94a3b8",
  IMPLEMENTS: "#2dd4bf",
  EXTENDS: "#fb923c",
  DECORATES: "#c084fc",
  REFERENCES: "#22d3ee",
  ENTRY_POINT: "#facc15",
};

function nodeSize(node: GraphNode): number {
  const rankBoost = node.rank ? Math.min(10, node.rank.score * 14) : 0;
  return Math.max(3.5, Math.min(18, 4 + Math.sqrt(node.degree || 1) * 1.6 + rankBoost));
}

function typeIcon(type: string) {
  if (type === "route") return <Route size={14} />;
  if (type === "file") return <Code2 size={14} />;
  if (type === "class") return <BoxSelect size={14} />;
  if (type === "function" || type === "method") return <Braces size={14} />;
  return <CircleDot size={14} />;
}

function relativeLabel(value?: string): string {
  if (!value) return "unknown";
  return value.replace(/\\/g, "/").split("/").slice(-4).join("/");
}

function useGraphData() {
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/graph")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load graph");
        return response.json() as Promise<GraphPayload>;
      })
      .then(setPayload)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return { payload, error };
}

function GraphStage({
  payload,
  selectedId,
  hoveredId,
  activeTypes,
  onSelect,
  onHover,
}: {
  payload: GraphPayload;
  selectedId: string | null;
  hoveredId: string | null;
  activeTypes: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodeLookup = useMemo(
    () => new Map(payload.nodes.map((node) => [node.id, node])),
    [payload.nodes],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph({ multi: true, type: "directed" });
    const radius = Math.max(8, Math.sqrt(payload.nodes.length) * 2.2);

    payload.nodes.forEach((node, index) => {
      const angle = (index / Math.max(1, payload.nodes.length)) * Math.PI * 2;
      const communityOffset = node.type.charCodeAt(0) % 9;
      graph.addNode(node.id, {
        label: node.name,
        x: Math.cos(angle) * radius + communityOffset * 3,
        y: Math.sin(angle) * radius + communityOffset * 3,
        size: nodeSize(node),
        color: NODE_COLORS[node.type] || "#e2e8f0",
        semanticType: node.type,
      });
    });

    payload.edges.forEach((edge) => {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to) && !graph.hasEdge(edge.id)) {
        graph.addDirectedEdgeWithKey(edge.id, edge.from, edge.to, {
          label: edge.type,
          size: edge.resolved ? 1.2 : 0.8,
          color: edge.resolved ? EDGE_COLORS[edge.type] || "#64748b" : "#f59e0b",
          type: "arrow",
        });
      }
    });

    if (graph.order > 2) {
      forceAtlas2.assign(graph, {
        iterations: Math.min(140, Math.max(45, graph.order * 2)),
        settings: forceAtlas2.inferSettings(graph),
      });
    }

    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      defaultEdgeType: "arrow",
      labelColor: { color: "#dbeafe" },
      labelSize: 12,
      labelWeight: "600",
      minCameraRatio: 0.08,
      maxCameraRatio: 4,
    });

    sigma.on("clickNode", ({ node }) => onSelect(node));
    sigma.on("enterNode", ({ node }) => onHover(node));
    sigma.on("leaveNode", () => onHover(null));
    sigmaRef.current = sigma;
    graphRef.current = graph;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [payload, onSelect, onHover]);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    const selectedNeighbors = new Set<string>();
    const focusId = hoveredId || selectedId;
    if (focusId && graph.hasNode(focusId)) {
      selectedNeighbors.add(focusId);
      graph.forEachNeighbor(focusId, (neighbor) => selectedNeighbors.add(neighbor));
    }

    graph.forEachNode((id, attrs) => {
      const node = nodeLookup.get(id);
      const visibleByType = node ? activeTypes.has(node.type) : true;
      const related = !focusId || selectedNeighbors.has(id);
      graph.setNodeAttribute(id, "hidden", !visibleByType);
      graph.setNodeAttribute(id, "color", related ? attrs.color : "#334155");
      graph.setNodeAttribute(id, "zIndex", id === selectedId ? 10 : related ? 2 : 0);
      graph.setNodeAttribute(
        id,
        "size",
        node ? nodeSize(node) * (id === selectedId ? 1.35 : related ? 1 : 0.75) : attrs.size,
      );
    });

    graph.forEachEdge((edgeId, attrs, source, target) => {
      const related = !focusId || selectedNeighbors.has(source) || selectedNeighbors.has(target);
      graph.setEdgeAttribute(edgeId, "hidden", !related);
      graph.setEdgeAttribute(edgeId, "color", related ? attrs.color : "#1e293b");
      graph.setEdgeAttribute(edgeId, "size", related ? 1.5 : 0.4);
    });

    if (selectedId && graph.hasNode(selectedId)) {
      const position = sigma.getNodeDisplayData(selectedId);
      if (position) {
        sigma.getCamera().animate(
          { x: position.x, y: position.y, ratio: 0.55 },
          { duration: 420 },
        );
      }
    }
    sigma.refresh();
  }, [activeTypes, hoveredId, nodeLookup, selectedId]);

  const zoom = (factor: number) => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const camera = sigma.getCamera();
    camera.animate({ ratio: camera.getState().ratio * factor }, { duration: 180 });
  };

  const resetCamera = () => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  };

  return (
    <section className="graph-stage">
      <div ref={containerRef} className="sigma-stage" />
      <div className="graph-actions" aria-label="Graph controls">
        <button type="button" title="Zoom in" onClick={() => zoom(0.72)}>
          <ZoomIn size={18} />
        </button>
        <button type="button" title="Zoom out" onClick={() => zoom(1.28)}>
          <ZoomOut size={18} />
        </button>
        <button type="button" title="Reset camera" onClick={resetCamera}>
          <Maximize2 size={18} />
        </button>
      </div>
    </section>
  );
}

function App() {
  const { payload, error } = useGraphData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [source, setSource] = useState<SourcePayload | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (payload) {
      setActiveTypes(new Set(Object.keys(payload.stats.nodesByType)));
    }
  }, [payload]);

  const selectNode = useCallback((id: string) => {
    setSelectedId(id);
    fetch(`/api/node/${encodeURIComponent(id)}`)
      .then((response) => response.json() as Promise<NodeDetails>)
      .then((node) => {
        setDetails(node);
        if (node.sourcePreview) {
          const params = new URLSearchParams({
            file: node.sourcePreview.file,
            startLine: String(node.sourcePreview.startLine),
            endLine: String(node.sourcePreview.endLine),
            context: "8",
          });
          return fetch(`/api/source?${params}`).then(
            (response) => response.json() as Promise<SourcePayload>,
          );
        }
        setSource(null);
        return null;
      })
      .then((sourcePayload) => {
        if (sourcePayload) setSource(sourcePayload);
      })
      .catch(() => {
        setDetails(null);
        setSource(null);
      });
  }, []);

  const search = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      .then((response) => response.json() as Promise<GraphNode[]>)
      .then((items) => {
        setResults(items);
        if (items[0]) selectNode(items[0].id);
      })
      .catch(() => setResults([]));
  }, [query, selectNode]);

  const toggleType = (type: string) => {
    setActiveTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (error) {
    return <div className="loading">Graph failed to load: {error}</div>;
  }

  if (!payload) {
    return <div className="loading">Loading code-brain graph...</div>;
  }

  const selectedNode = details || payload.nodes.find((node) => node.id === selectedId) || null;
  const topHubs = payload.analytics?.hubs.slice(0, 5) || [];

  return (
    <main className="app-shell">
      <aside className="left-rail">
        <header className="brand-block">
          <div className="brand-mark"><Network size={22} /></div>
          <div>
            <h1>code-brain</h1>
            <p>Deterministic graph intelligence</p>
          </div>
        </header>

        <section className="tool-panel search-panel">
          <label>
            <Search size={15} />
            <span>Search graph</span>
          </label>
          <div className="search-box">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && search()}
              placeholder="Symbol, file, route, config"
            />
            <button type="button" onClick={search} title="Search">
              <LocateFixed size={17} />
            </button>
          </div>
          <div className="result-list">
            {results.slice(0, 12).map((node) => (
              <button key={node.id} type="button" onClick={() => selectNode(node.id)}>
                <span>{typeIcon(node.type)} {node.name}</span>
                <small>{node.type} - {relativeLabel(node.fullName)}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="tool-panel metric-grid">
          <div>
            <strong>{payload.stats.nodeCount}</strong>
            <span>Nodes</span>
          </div>
          <div>
            <strong>{payload.stats.edgeCount}</strong>
            <span>Edges</span>
          </div>
          <div>
            <strong>{payload.analytics?.health.unresolvedEdges ?? 0}</strong>
            <span>Unresolved</span>
          </div>
          <div>
            <strong>{payload.analytics?.communities.length ?? 0}</strong>
            <span>Clusters</span>
          </div>
        </section>

        <section className="tool-panel">
          <h2><Filter size={15} /> Node Types</h2>
          <div className="filter-list">
            {Object.entries(payload.stats.nodesByType).map(([type, count]) => (
              <button
                key={type}
                type="button"
                className={activeTypes.has(type) ? "active" : ""}
                onClick={() => toggleType(type)}
              >
                <span className="dot" style={{ background: NODE_COLORS[type] || "#e2e8f0" }} />
                <span>{type}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="tool-panel">
          <h2><Activity size={15} /> Signal Hubs</h2>
          <div className="hub-list">
            {topHubs.map((hub) => (
              <button key={hub.id} type="button" onClick={() => selectNode(hub.id)}>
                <span>{hub.name}</span>
                <small>{hub.type} - degree {hub.degree}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <GraphStage
        payload={payload}
        selectedId={selectedId}
        hoveredId={hoveredId}
        activeTypes={activeTypes}
        onSelect={selectNode}
        onHover={setHoveredId}
      />

      <aside className="right-rail">
        <section className="inspector-head">
          <span><Sparkles size={16} /> Live Node</span>
          {selectedNode && (
            <button type="button" title="Clear selection" onClick={() => {
              setSelectedId(null);
              setDetails(null);
              setSource(null);
            }}>
              <X size={16} />
            </button>
          )}
        </section>

        {selectedNode ? (
          <>
            <section className="node-card">
              <div className="node-title">
                <span className="node-glow" style={{ background: NODE_COLORS[selectedNode.type] || "#e2e8f0" }} />
                <div>
                  <h2>{selectedNode.name}</h2>
                  <p>{selectedNode.type} - {relativeLabel(selectedNode.fullName)}</p>
                </div>
              </div>
              <p className="summary">{selectedNode.summary || "No summary captured."}</p>
              <div className="score-row">
                <div><strong>{selectedNode.degree}</strong><span>degree</span></div>
                <div><strong>{selectedNode.incomingCount}</strong><span>incoming</span></div>
                <div><strong>{selectedNode.outgoingCount}</strong><span>outgoing</span></div>
                <div><strong>{selectedNode.rank?.score?.toFixed(3) || "n/a"}</strong><span>rank</span></div>
              </div>
              {selectedNode.vscodeUri && (
                <a className="source-link" href={selectedNode.vscodeUri}>
                  <ExternalLink size={15} />
                  Open exact source
                </a>
              )}
            </section>

            {details && (
              <section className="tool-panel relations-panel">
                <h2><GitBranch size={15} /> Relationships</h2>
                {[
                  ...details.outgoing.slice(0, 10).map((edge) => ({
                    ...edge,
                    related: edge.target,
                  })),
                  ...details.incoming.slice(0, 10).map((edge) => ({
                    ...edge,
                    related: edge.source,
                  })),
                ].map((edge) => {
                  const related = edge.related;
                  return (
                    <button
                      key={`${edge.id}-${related?.id || "unknown"}`}
                      type="button"
                      onClick={() => related?.id && selectNode(related.id)}
                    >
                      <span style={{ color: EDGE_COLORS[edge.type] || "#cbd5e1" }}>{edge.type}</span>
                      <strong>{related?.name || "unknown"}</strong>
                      <small>{related?.type || "node"}</small>
                    </button>
                  );
                })}
              </section>
            )}

            {source && (
              <section className="source-panel">
                <header>
                  <span><Code2 size={15} /> {source.relativeFile}</span>
                  {source.vscodeUri && <a href={source.vscodeUri}>Open</a>}
                </header>
                <pre>
                  {source.lines.map((line) => (
                    <div key={line.line} className={line.highlighted ? "hot-line" : ""}>
                      <span>{line.line}</span>
                      <code>{line.text || " "}</code>
                    </div>
                  ))}
                </pre>
              </section>
            )}
          </>
        ) : (
          <section className="empty-state">
            <Network size={42} />
            <h2>Select a node</h2>
            <p>Click any node to inspect provenance, relationships, importance, and exact source.</p>
          </section>
        )}
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
