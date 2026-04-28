import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Graph from "graphology";
import Sigma from "sigma";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  GraphEdge,
  GraphNode,
  GraphPayload,
  NodeDetails,
  SourcePayload,
} from "./types";
import "./styles.css";

/** Prevents the browser from locking up on huge repos when edges dominate. */
const MAX_GRAPH_EDGES = 100_000;

function downsampleEdgesForView(edges: GraphEdge[], _nodeCount: number): GraphEdge[] {
  if (edges.length <= MAX_GRAPH_EDGES) return edges;

  // Priority 1: Always keep architectural edges
  const ARCHITECTURAL = new Set(["IMPORTS", "DEPENDS_ON", "EXTENDS", "IMPLEMENTS", "ENTRY_POINT"]);
  const arch = edges.filter(e => ARCHITECTURAL.has(e.type));

  // Priority 2: Keep CALLS edges where both endpoints have high rank (resolved only)
  const calls = edges.filter(e => e.type === "CALLS" && e.resolved);

  // Priority 3: Keep DEFINES and EXPORTS
  const structural = edges.filter(e => ["DEFINES", "EXPORTS", "OWNS"].includes(e.type));

  // Priority 4: Remaining
  const rest = edges.filter(e =>
    !ARCHITECTURAL.has(e.type) &&
    e.type !== "CALLS" &&
    !["DEFINES", "EXPORTS", "OWNS"].includes(e.type)
  );

  const result: GraphEdge[] = [...arch];
  const remaining = MAX_GRAPH_EDGES - result.length;
  if (remaining <= 0) return result;

  // Fill with calls, structural, then rest — all capped
  const callsBudget = Math.floor(remaining * 0.4);
  const structuralBudget = Math.floor(remaining * 0.4);
  const restBudget = remaining - callsBudget - structuralBudget;

  result.push(...calls.slice(0, callsBudget));
  result.push(...structural.slice(0, structuralBudget));
  result.push(...rest.slice(0, restBudget));

  return result;
}

// Cypher Mesh Design System colors
const DESIGN_SYSTEM = {
  surface: "#0b1326",
  surfaceContainerLow: "#131b2e",
  surfaceContainerHigh: "#222a3d",
  surfaceContainerHighest: "#2d3449",
  primary: "#4cd7f6",
  primaryContainer: "#06b6d4",
  tertiary: "#ffb873",
  onSurface: "#dae2fd",
  onSurfaceVariant: "#bcc9cd",
  outlineVariant: "#3d494c",
};

const NODE_COLORS: Record<string, string> = {
  project: "#4cd7f6",
  file: "#06b6d4",
  module: "#4cd7f6",
  class: "#ffb873",
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
  enum: "#ffb873",
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
    fetch("/api/graph/overview")
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
  isLargeGraph,
  edgesSimplified,
}: {
  payload: GraphPayload;
  selectedId: string | null;
  hoveredId: string | null;
  activeTypes: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  isLargeGraph: boolean;
  edgesSimplified: boolean;
}) {  type Percentiles = { p995: number; p90: number; p70: number; p50: number };

  // Compute percentiles once at graph load time
  const percentiles = useMemo((): Percentiles => {
    const scores = payload.nodes
      .map(n => n.rank?.score ?? 0)
      .sort((a, b) => a - b);
    if (scores.length === 0) return { p995: 0, p90: 0, p70: 0, p50: 0 };
    const at = (pct: number) => scores[Math.floor(scores.length * pct)] ?? 0;
    return {
      p995: at(0.995),
      p90: at(0.90),
      p70: at(0.70),
      p50: at(0.50),
    };
  }, [payload.nodes]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const nodeLookup = useMemo(
    () => new Map(payload.nodes.map((node) => [node.id, node])),
    [payload.nodes],
  );
  const [zoomTier, setZoomTier] = useState("far");
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph({ multi: true, type: "directed" });
    const n = payload.nodes.length;
    const radius = Math.max(8, Math.sqrt(n) * 2.2);

    payload.nodes.forEach((node, index) => {
      const hasLayout = node.x != null && node.y != null;
      const angle = (index / Math.max(1, n)) * Math.PI * 2;
      const fallbackX = Math.cos(angle) * radius;
      const fallbackY = Math.sin(angle) * radius;
      const communityOffset = node.type.charCodeAt(0) % 9;
      const baseColor = NODE_COLORS[node.type] || "#e2e8f0";
      graph.addNode(node.id, {
        label: node.name,
        x: hasLayout ? node.x! : fallbackX + communityOffset * 3,
        y: hasLayout ? node.y! : fallbackY + communityOffset * 3,
        size: nodeSize(node),
        color: baseColor,
        baseColor,
        semanticType: node.type,
      });
    });

    payload.edges.forEach((edge) => {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to) && !graph.hasEdge(edge.id)) {
        const baseColor = edge.resolved ? EDGE_COLORS[edge.type] || "#64748b" : "#f59e0b";
        graph.addDirectedEdgeWithKey(edge.id, edge.from, edge.to, {
          label: edge.type,
          size: edge.resolved ? 1.2 : 0.8,
          color: baseColor,
          baseColor,
          type: "arrow",
        });
      }
    });

    // No ForceAtlas2 computation — use pre-computed layout from Python or fallback

    const minCam = n > 5_000 ? 0.012 : 0.06;
    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderLabels: false,
      renderEdgeLabels: false,
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      enableEdgeEvents: false,
      defaultEdgeType: "arrow",
      labelColor: { color: "#dbeafe" },
      labelSize: 12,
      labelWeight: "600",
      minCameraRatio: minCam,
      maxCameraRatio: 5,
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

  // ZOOM TIER FEATURE DISABLED - Show all nodes at all times
  // const getZoomVisibility = useCallback((zoomRatio: number, node: GraphNode | undefined): boolean => {
  //   if (!node) return true;
  //   const s = (node.rank?.score || 0) as number;
  //
  //   // Far zoom (zoomRatio > 0.5): show top 0.5% by score + project + routes
  //   if (zoomRatio > 0.5) {
  //     if (node.type === "project") return true;
  //     if (node.type === "route") return true;
  //     return s >= percentiles.p995;
  //   }
  //
  //   // Medium zoom (0.15 < zoomRatio <= 0.5): show top 10%
  //   if (zoomRatio > 0.15) {
  //     if (["method", "variable", "constant"].includes(node.type)) return s >= percentiles.p70;
  //     return s >= percentiles.p90;
  //   }
  //
  //   // Close zoom: show everything
  //   return true;
  // }, [percentiles]);

  const runGraphRefresh = useCallback(
    (sigma: Sigma, graph: Graph) => {
      // ZOOM TIER FEATURE DISABLED - Show all nodes regardless of zoom level
      // const zoomRatio = sigma.getCamera().getState().ratio;
      const selectedNeighbors = new Set<string>();
      const focusId = hoveredId || selectedId;
      if (focusId && graph.hasNode(focusId)) {
        selectedNeighbors.add(focusId);
        graph.forEachNeighbor(focusId, (neighbor) => selectedNeighbors.add(neighbor));
      }

      // ZOOM TIER FEATURE DISABLED
      // const cullDistantEdges = isLargeGraph && zoomRatio > 0.4 && !focusId;

      graph.forEachNode((id, attrs) => {
        const node = nodeLookup.get(id);
        const visibleByType = node ? activeTypes.has(node.type) : true;
        // ZOOM TIER FEATURE DISABLED - Always show nodes
        // const visibleByZoom = getZoomVisibility(zoomRatio, node);
        const visibleByZoom = true;
        const related = !focusId || selectedNeighbors.has(id);
        const baseColor = String(attrs.baseColor || attrs.color || "#e2e8f0");
        graph.setNodeAttribute(id, "hidden", !visibleByType || !visibleByZoom);
        graph.setNodeAttribute(id, "color", related ? baseColor : "#475569");
        graph.setNodeAttribute(id, "zIndex", id === selectedId ? 10 : related ? 2 : 0);
        graph.setNodeAttribute(
          id,
          "size",
          node ? nodeSize(node) * (id === selectedId ? 1.35 : related ? 1 : 0.88) : Number(attrs.size),
        );
      });

      graph.forEachEdge((edgeId, attrs, source, target) => {
        const srcVis = !graph.getNodeAttribute(source, "hidden");
        const tgtVis = !graph.getNodeAttribute(target, "hidden");
        
        // ZOOM TIER FEATURE DISABLED - Show all edges
        // if (cullDistantEdges) {
        //   const isArchitecturalEdge = ["IMPORTS", "DEPENDS_ON", "EXTENDS", "IMPLEMENTS", "ENTRY_POINT"].includes(
        //     String(attrs.label || "")
        //   );
        //   // Hide edge if either endpoint is hidden OR if it's a symbol-level edge at far zoom
        //   if (!srcVis || !tgtVis || !isArchitecturalEdge) {
        //     graph.setEdgeAttribute(edgeId, "hidden", true);
        //     return;
        //   }
        //   // Edge passed architectural filter, show it
        //   graph.setEdgeAttribute(edgeId, "hidden", false);
        // } else {
        //   // Not culling distant edges, use relationship-based visibility
        //   const related = !focusId || selectedNeighbors.has(source) || selectedNeighbors.has(target);
        //   graph.setEdgeAttribute(edgeId, "hidden", !related || !srcVis || !tgtVis);
        // }
        
        const related = !focusId || selectedNeighbors.has(source) || selectedNeighbors.has(target);
        graph.setEdgeAttribute(edgeId, "hidden", !related || !srcVis || !tgtVis);
        
        const baseColor = String(attrs.baseColor || attrs.color || "#64748b");
        graph.setEdgeAttribute(edgeId, "color", related ? baseColor : "#334155");
        graph.setEdgeAttribute(edgeId, "size", related ? 1.5 : 0.4);
      });
    },
    [activeTypes, hoveredId, isLargeGraph, nodeLookup, selectedId],
  );

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    let lastRun = 0;
    const minInterval = isLargeGraph ? 120 : 72;

    const onUpdated = () => {
      const now = performance.now();
      if (now - lastRun < minInterval) return;
      lastRun = now;
      runGraphRefresh(sigma, graph);

      // ZOOM TIER FEATURE DISABLED - No longer tracking zoom tier
      // const ratio = sigma.getCamera().getState().ratio;
      // if (ratio < 0.15) setZoomTier("very-close");
      // else if (ratio < 0.5) setZoomTier("medium");
      // else setZoomTier("far");

      let count = 0;
      graph.forEachNode((id) => {
        if (!graph.getNodeAttribute(id, "hidden")) count += 1;
      });
      setVisibleCount(count);
    };

    sigma.on("afterRender", onUpdated);
    lastRun = 0;
    onUpdated();

    return () => {
      sigma.off("afterRender", onUpdated);
    };
  }, [runGraphRefresh, isLargeGraph, payload]);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma || !selectedId || !graph.hasNode(selectedId)) return;
    const position = sigma.getNodeDisplayData(selectedId);
    if (position) {
      sigma.getCamera().animate(
        { x: position.x, y: position.y, ratio: isLargeGraph ? 0.4 : 0.55 },
        { duration: 420 },
      );
    }
  }, [selectedId, isLargeGraph, payload]);

  const zoom = (factor: number) => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const camera = sigma.getCamera();
    camera.animate({ ratio: camera.getState().ratio * factor }, { duration: 180 });
  };

  const resetCamera = () => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  };

  // Compute layout status from payload
  const hasPrecomputedLayout = payload.nodes.some(n => n.x != null);

  return (
    <section className="graph-stage">
      <div ref={containerRef} className="sigma-stage" />
      {!hasPrecomputedLayout && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            background: "rgba(212, 175, 55, 0.2)",
            border: "1px solid rgb(212, 175, 55)",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 13,
            color: "#fef08a",
            fontFamily: "sans-serif",
            zIndex: 100,
          }}
        >
          <div style={{ fontWeight: 600 }}>⚠ Layout not pre-computed</div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
            Run <code style={{ background: "rgba(0, 0, 0, 0.3)", padding: "2px 6px", borderRadius: 4 }}>code-brain index</code> with Python analytics enabled for optimal visualization.
          </div>
        </div>
      )}
      {/* ZOOM TIER FEATURE DISABLED - Hiding zoom info display */}
      {/* <div
        className="zoom-info"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "rgba(15, 23, 42, 0.8)",
          border: "1px solid rgba(226, 232, 240, 0.2)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          color: "#cbd5e1",
          fontFamily: "monospace",
        }}
      >
        <div>
          {zoomTier === "far"
            ? "Far: essential nodes (zoom in for detail)"
            : zoomTier === "medium"
              ? "Mid: more symbols"
              : "Close: full detail"}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>{visibleCount} visible nodes</div>
        {edgesSimplified && (
          <div style={{ marginTop: 4, fontSize: 10, color: "#f59e0b" }}>
            Edge view sampled for performance (search & data unchanged).
          </div>
        )}
      </div> */}
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

function useResizable(
  key: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
  options: { invertDelta?: boolean } = {},
) {
  const { invertDelta = false } = options;
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(`sidebar-${key}`);
    return stored ? Math.max(minWidth, Math.min(maxWidth, parseInt(stored, 10))) : defaultWidth;
  });

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const raw = moveEvent.clientX - startX;
        const delta = invertDelta ? -raw : raw;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, minWidth, maxWidth, invertDelta],
  );

  useEffect(() => {
    localStorage.setItem(`sidebar-${key}`, width.toString());
  }, [width, key]);

  return { width, startResize };
}

function ResizeHandle({
  onMouseDown,
  orientation,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  orientation: "vertical";
}) {
  return (
    <div
      className={`resize-handle resize-handle-${orientation}`}
      onMouseDown={onMouseDown}
      title="Drag to resize"
    />
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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const leftPanel = useResizable("left", 260, 150, 640);
  const rightPanel = useResizable("right", 300, 150, 640, { invertDelta: true });

  const viewPayload = useMemo((): GraphPayload | null => {
    if (!payload) return null;
    const edges = downsampleEdgesForView(payload.edges, payload.nodes.length);
    return { ...payload, edges };
  }, [payload]);
  const edgesSimplified = Boolean(payload && payload.edges.length > MAX_GRAPH_EDGES);
  const isLargeGraph = (payload?.stats.nodeCount ?? 0) > 12_000;

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

  if (!payload || !viewPayload) {
    return <div className="loading">Loading code-brain graph...</div>;
  }

  const selectedNode = details || payload.nodes.find((node) => node.id === selectedId) || null;
  const topHubs = payload.analytics?.hubs.slice(0, 5) || [];

  return (
    <main className="app-shell">
      {!leftCollapsed && (
        <aside
          className="left-rail"
          style={{ width: leftPanel.width, minWidth: 150, maxWidth: 640, flexShrink: 0 }}
        >
          <header className="brand-block">
            <div className="brand-mark">
              <Network size={22} />
            </div>
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
            <h2>
              <Filter size={15} /> Node Types
            </h2>
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
            <h2>
              <Activity size={15} /> Signal Hubs
            </h2>
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
      )}

      {!leftCollapsed && (
        <ResizeHandle orientation="vertical" onMouseDown={leftPanel.startResize} />
      )}

      <div className="app-shell__graph">
        <button
          className={`sidebar-toggle left-toggle ${leftCollapsed ? "collapsed" : ""}`}
          type="button"
          onClick={() => setLeftCollapsed(!leftCollapsed)}
          title={leftCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
        >
          {leftCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <GraphStage
          payload={viewPayload}
          selectedId={selectedId}
          hoveredId={hoveredId}
          activeTypes={activeTypes}
          onSelect={selectNode}
          onHover={setHoveredId}
          isLargeGraph={isLargeGraph}
          edgesSimplified={edgesSimplified}
        />

        <button
          className={`sidebar-toggle right-toggle ${rightCollapsed ? "collapsed" : ""}`}
          type="button"
          onClick={() => setRightCollapsed(!rightCollapsed)}
          title={rightCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
        >
          {rightCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {!rightCollapsed && (
        <ResizeHandle orientation="vertical" onMouseDown={rightPanel.startResize} />
      )}

      {!rightCollapsed && (
        <aside
          className="right-rail"
          style={{ width: rightPanel.width, minWidth: 150, maxWidth: 640, flexShrink: 0 }}
        >
          <section className="inspector-head">
            <span>
              <Sparkles size={16} /> Live Node
            </span>
            {selectedNode && (
              <button
                type="button"
                title="Clear selection"
                onClick={() => {
                  setSelectedId(null);
                  setDetails(null);
                  setSource(null);
                }}
              >
                <X size={16} />
              </button>
            )}
          </section>

          {selectedNode ? (
            <>
              <section className="node-card">
                <div className="node-title">
                  <span
                    className="node-glow"
                    style={{ background: NODE_COLORS[selectedNode.type] || "#e2e8f0" }}
                  />
                  <div>
                    <h2>{selectedNode.name}</h2>
                    <p>{selectedNode.type} - {relativeLabel(selectedNode.fullName)}</p>
                  </div>
                </div>
                <p className="summary">{selectedNode.summary || "No summary captured."}</p>
                <div className="score-row">
                  <div>
                    <strong>{selectedNode.degree}</strong>
                    <span>degree</span>
                  </div>
                  <div>
                    <strong>{selectedNode.incomingCount}</strong>
                    <span>incoming</span>
                  </div>
                  <div>
                    <strong>{selectedNode.outgoingCount}</strong>
                    <span>outgoing</span>
                  </div>
                  <div>
                    <strong>{selectedNode.rank?.score?.toFixed(3) || "n/a"}</strong>
                    <span>rank</span>
                  </div>
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
                  <h2>
                    <GitBranch size={15} /> Relationships
                  </h2>
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
                        <span style={{ color: EDGE_COLORS[edge.type] || "#cbd5e1" }}>
                          {edge.type}
                        </span>
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
                    <span>
                      <Code2 size={15} /> {source.relativeFile}
                    </span>
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
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
