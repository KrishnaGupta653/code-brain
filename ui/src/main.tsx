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
// @ts-ignore - CSS side-effect import is handled by the bundler
import "./styles.css";

// Define node and edge attribute types
interface NodeAttributes {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  type: string;
  baseX?: number;
  baseY?: number;
  baseZ?: number;
  baseSize?: number;
  baseColor?: string;
  z?: number;
  hidden?: boolean;
  highlighted?: boolean;
  forceLabel?: boolean;
  zIndex?: number;
}

interface EdgeAttributes {
  type: string;
  color?: string;
  baseColor?: string;
  size?: number;
  hidden?: boolean;
}

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
  const isCluster = node.metadata?.isCluster;
  const baseSize = isCluster ? 8 : 4; // Clusters are larger
  return Math.max(3.5, Math.min(18, baseSize + Math.sqrt(node.degree || 1) * 1.6 + rankBoost));
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

type LabelData = {
  x: number;
  y: number;
  size: number;
  label: string | null;
  color: string;
};

type LabelSettings = {
  labelSize: number;
  labelFont: string;
  labelWeight: string;
  labelColor: { color?: string; attribute?: string };
};

function drawCleanNodeLabel(
  context: CanvasRenderingContext2D,
  data: LabelData,
  settings: LabelSettings,
) {
  if (!data.label) return;
  const size = settings.labelSize;
  context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  context.fillStyle = settings.labelColor.color || "#dbeafe";
  context.shadowColor = "rgba(2, 6, 23, 0.9)";
  context.shadowBlur = 7;
  context.lineWidth = 3;
  context.strokeStyle = "rgba(2, 6, 23, 0.78)";
  context.strokeText(data.label, data.x + data.size + 5, data.y + size / 3);
  context.fillText(data.label, data.x + data.size + 5, data.y + size / 3);
  context.shadowBlur = 0;
}

function drawCleanNodeHover(
  context: CanvasRenderingContext2D,
  data: LabelData,
  settings: LabelSettings,
) {
  context.beginPath();
  context.arc(data.x, data.y, data.size + 4, 0, Math.PI * 2);
  context.strokeStyle = "rgba(76, 201, 240, 0.9)";
  context.lineWidth = 2;
  context.stroke();
  drawCleanNodeLabel(context, data, settings);
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function useGraphData() {
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(0);
  const [expandedCommunities, setExpandedCommunities] = useState<Set<number>>(new Set());
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  useEffect(() => {
    // Determine which level to fetch based on graph size
    fetch("/api/graph?level=0")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load graph");
        return response.json() as Promise<GraphPayload>;
      })
      .then((data) => {
        // If cluster view has < 100 nodes, fetch full graph instead
        if (data.nodes.length < 100 && data.stats.nodeCount > 100) {
          return fetch("/api/graph?level=1").then(r => r.json() as Promise<GraphPayload>);
        }
        return data;
      })
      .then(setPayload)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // WebSocket connection for live updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    
    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.info('WebSocket connected');
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'graph-updated') {
              console.info('Graph updated:', message.message);
              setLastUpdate(message.message);
              
              // Reload graph data
              fetch("/api/graph?level=0")
                .then((response) => response.json() as Promise<GraphPayload>)
                .then((data) => {
                  if (data.nodes.length < 100 && data.stats.nodeCount > 100) {
                    return fetch("/api/graph?level=1").then(r => r.json() as Promise<GraphPayload>);
                  }
                  return data;
                })
                .then(setPayload)
                .catch((err) => console.error('Failed to reload graph:', err));
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
        
        ws.onclose = () => {
          console.info('WebSocket disconnected, reconnecting in 3s...');
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
    
    connect();
    
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const expandCommunity = async (communityId: number) => {
    if (expandedCommunities.has(communityId)) return;
    
    try {
      const response = await fetch(`/api/graph?community=${communityId}`);
      const communityData = await response.json() as GraphPayload;
      
      setPayload((prev) => {
        if (!prev) return communityData;
        
        // Merge community nodes into existing graph
        const existingNodeIds = new Set(prev.nodes.map(n => n.id));
        const newNodes = communityData.nodes.filter(n => !existingNodeIds.has(n.id));
        const newEdges = communityData.edges.filter(e => 
          !prev.edges.some(existing => existing.id === e.id)
        );
        
        // Remove the cluster node
        const filteredNodes = prev.nodes.filter(n => n.id !== `cluster_${communityId}`);
        
        return {
          ...prev,
          nodes: [...filteredNodes, ...newNodes],
          edges: [...prev.edges, ...newEdges],
        };
      });
      
      setExpandedCommunities(prev => new Set([...prev, communityId]));
    } catch (err) {
      console.error('Failed to expand community', err);
    }
  };

  return { payload, error, level, expandCommunity, lastUpdate };
}

function GraphStage({
  payload,
  selectedId,
  hoveredId,
  activeTypes,
  onSelect,
  onHover,
  onExpandCluster,
}: {
  payload: GraphPayload;
  selectedId: string | null;
  hoveredId: string | null;
  activeTypes: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onExpandCluster?: (communityId: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<any>(null);
  const rotationRef = useRef({ x: -0.18, y: 0.42 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rotationX: number;
    rotationY: number;
  } | null>(null);
  const nodeLookup = useMemo(
    () => new Map(payload.nodes.map((node) => [node.id, node])),
    [payload.nodes],
  );

  const projectSphere = useCallback(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    const { x: pitch, y: yaw } = rotationRef.current;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);
    const maxDepth = Math.max(
      1,
      ...graph.nodes().map((id: string) =>
        Math.abs(Number(graph.getNodeAttribute(id, "baseZ") ?? 0)),
      ),
    );

    graph.forEachNode((id: string, attrs: NodeAttributes) => {
      const baseX = Number(attrs.baseX ?? attrs.x ?? 0);
      const baseY = Number(attrs.baseY ?? attrs.y ?? 0);
      const baseZ = Number(attrs.baseZ ?? 0);
      const yawX = baseX * cosY + baseZ * sinY;
      const yawZ = -baseX * sinY + baseZ * cosY;
      const projectedY = baseY * cosX - yawZ * sinX;
      const projectedZ = baseY * sinX + yawZ * cosX;
      const depthScale = 0.72 + ((projectedZ / maxDepth + 1) / 2) * 0.56;
      const baseSize = Number(attrs.baseSize ?? attrs.size ?? 4);
      const baseColor = String(attrs.baseColor || attrs.color || "#e2e8f0");

      graph.setNodeAttribute(id, "x", yawX);
      graph.setNodeAttribute(id, "y", projectedY);
      graph.setNodeAttribute(id, "size", baseSize * depthScale);
      graph.setNodeAttribute(id, "color", hexToRgba(baseColor, 0.62 + depthScale * 0.28));
      graph.setNodeAttribute(id, "zIndex", Math.round(depthScale * 100));
    });

    sigma.refresh();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const graph: any = new Graph({ multi: true, type: "directed" });
    const radius = Math.max(8, Math.sqrt(payload.nodes.length) * 2.2);

    payload.nodes.forEach((node, index) => {
      const angle = (index / Math.max(1, payload.nodes.length)) * Math.PI * 2;
      const communityOffset = node.type.charCodeAt(0) % 9;
      const depthAngle = angle * 1.7 + communityOffset;
      const baseSize = nodeSize(node);
      graph.addNode(node.id, {
        label: node.name,
        x: Math.cos(angle) * radius + communityOffset * 3,
        y: Math.sin(angle) * radius + communityOffset * 3,
        z: Math.sin(depthAngle) * radius * 0.72,
        size: baseSize,
        color: NODE_COLORS[node.type] || "#e2e8f0",
        baseColor: NODE_COLORS[node.type] || "#e2e8f0",
        baseSize,
        semanticType: node.type,
      });
    });

    payload.edges.forEach((edge) => {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to) && !graph.hasEdge(edge.id)) {
        graph.addDirectedEdgeWithKey(edge.id, edge.from, edge.to, {
          label: edge.type,
          size: edge.resolved ? 1.2 : 0.8,
          color: edge.resolved ? EDGE_COLORS[edge.type] || "#64748b" : "#f59e0b",
          baseColor: edge.resolved ? EDGE_COLORS[edge.type] || "#64748b" : "#f59e0b",
          type: "arrow",
        });
      }
    });

    // Only run ForceAtlas2 for small to medium graphs
    // For large graphs (>1000 nodes), use the initial circular layout
    if (graph.order > 2 && graph.order < 1000) {
      forceAtlas2.assign(graph, {
        iterations: Math.min(140, Math.max(45, graph.order * 2)),
        settings: forceAtlas2.inferSettings(graph),
      });
    } else if (graph.order >= 1000) {
      console.info(`Large graph detected (${graph.order} nodes), using optimized layout`);
    }

    graph.forEachNode((id: string, attrs: NodeAttributes) => {
      graph.setNodeAttribute(id, "baseX", attrs.x);
      graph.setNodeAttribute(id, "baseY", attrs.y);
      graph.setNodeAttribute(id, "baseZ", attrs.z ?? 0);
    });

    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      defaultEdgeType: "arrow",
      labelColor: { color: "#dbeafe" },
      labelSize: 12,
      labelWeight: "600",
      labelDensity: 0.04,
      labelGridCellSize: 120,
      labelRenderedSizeThreshold: 16,
      defaultDrawNodeLabel: drawCleanNodeLabel,
      defaultDrawNodeHover: drawCleanNodeHover,
      minCameraRatio: 0.08,
      maxCameraRatio: 4,
    });

    sigma.on("clickNode", ({ node }) => {
      const nodeData = nodeLookup.get(node);
      // Check if this is a cluster node
      if (nodeData?.metadata?.isCluster && onExpandCluster) {
        const communityId = nodeData.metadata.communityId;
        if (typeof communityId === 'number') {
          onExpandCluster(communityId);
          return;
        }
      }
      onSelect(node);
    });
    sigma.on("enterNode", ({ node }) => onHover(node));
    sigma.on("leaveNode", () => onHover(null));
    sigmaRef.current = sigma;
    graphRef.current = graph;
    projectSphere();

    return () => {
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [payload, onSelect, onHover, projectSphere]);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    const selectedNeighbors = new Set<string>();
    const focusId = hoveredId || selectedId;
    if (focusId && graph.hasNode(focusId)) {
      selectedNeighbors.add(focusId);
      graph.forEachNeighbor(focusId, (neighbor: string) => selectedNeighbors.add(neighbor));
    }

    graph.forEachNode((id: string, attrs: NodeAttributes) => {
      const node = nodeLookup.get(id);
      const visibleByType = node ? activeTypes.has(node.type) : true;
      const related = !focusId || selectedNeighbors.has(id);
      graph.setNodeAttribute(id, "hidden", !visibleByType);
      graph.setNodeAttribute(
        id,
        "color",
        related
          ? attrs.color || attrs.baseColor
          : hexToRgba(String(attrs.baseColor || attrs.color || "#e2e8f0"), 0.44),
      );
      graph.setNodeAttribute(id, "highlighted", id === selectedId || id === hoveredId);
      graph.setNodeAttribute(id, "forceLabel", id === selectedId || id === hoveredId);
      graph.setNodeAttribute(id, "zIndex", id === selectedId ? 10 : related ? 2 : 0);
      graph.setNodeAttribute(
        id,
        "size",
        Number(attrs.size ?? (node ? nodeSize(node) : 4)) *
          (id === selectedId ? 1.25 : related ? 1 : 0.9),
      );
    });

    graph.forEachEdge((edgeId: string, attrs: EdgeAttributes, source: string, target: string) => {
      const sourceVisible = !graph.getNodeAttribute(source, "hidden");
      const targetVisible = !graph.getNodeAttribute(target, "hidden");
      const related =
        !focusId || selectedNeighbors.has(source) || selectedNeighbors.has(target);
      const baseColor = String(attrs.baseColor || attrs.color || "#64748b");
      graph.setEdgeAttribute(edgeId, "hidden", false);
      graph.setEdgeAttribute(
        edgeId,
        "color",
        related ? baseColor : hexToRgba(baseColor, 0.34),
      );
      graph.setEdgeAttribute(
        edgeId,
        "size",
        sourceVisible && targetVisible ? (related ? 1.7 : 0.75) : 0.4,
      );
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

  const resetSphere = () => {
    rotationRef.current = { x: -0.18, y: 0.42 };
    projectSphere();
    resetCamera();
  };

  const startSphereDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(".graph-actions")) return;
    if (!event.shiftKey && !event.altKey && event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rotationX: rotationRef.current.x,
      rotationY: rotationRef.current.y,
    };
  };

  const rotateSphere = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    rotationRef.current = {
      x: clamp(drag.rotationX + dy * 0.006, -1.15, 1.15),
      y: drag.rotationY + dx * 0.006,
    };
    projectSphere();
  };

  const stopSphereDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <section
      className="graph-stage"
      onPointerDown={startSphereDrag}
      onPointerMove={rotateSphere}
      onPointerUp={stopSphereDrag}
      onPointerCancel={stopSphereDrag}
    >
      <div ref={containerRef} className="sigma-stage" />
      <div className="graph-actions" aria-label="Graph controls">
        <button type="button" title="Zoom in" onClick={() => zoom(0.72)}>
          <ZoomIn size={18} />
        </button>
        <button type="button" title="Zoom out" onClick={() => zoom(1.28)}>
          <ZoomOut size={18} />
        </button>
        <button type="button" title="Reset sphere" onClick={resetSphere}>
          <Maximize2 size={18} />
        </button>
      </div>
    </section>
  );
}

function App() {
  const { payload, error, level, expandCommunity, lastUpdate } = useGraphData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [source, setSource] = useState<SourcePayload | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [leftWidth, setLeftWidth] = useState(() =>
    Number(localStorage.getItem("codebrain:leftWidth") || 320),
  );
  const [rightWidth, setRightWidth] = useState(() =>
    Number(localStorage.getItem("codebrain:rightWidth") || 390),
  );
  const shellRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (payload) {
      setActiveTypes(new Set(Object.keys(payload.stats.nodesByType)));
    }
  }, [payload]);

  useEffect(() => {
    localStorage.setItem("codebrain:leftWidth", String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem("codebrain:rightWidth", String(rightWidth));
  }, [rightWidth]);

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

  const startResize = (side: "left" | "right", event: React.PointerEvent) => {
    const shell = shellRef.current;
    if (!shell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const onPointerMove = (event: PointerEvent) => {
      const rect = shell.getBoundingClientRect();
      if (side === "left") {
        const next = Math.round(event.clientX - rect.left);
        setLeftWidth(Math.min(520, Math.max(240, next)));
      } else {
        const next = Math.round(rect.right - event.clientX);
        setRightWidth(Math.min(620, Math.max(280, next)));
      }
    };

    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("is-resizing");
    };

    document.body.classList.add("is-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
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
    <main
      ref={shellRef}
      className="app-shell"
      style={{
        "--left-width": `${leftWidth}px`,
        "--right-width": `${rightWidth}px`,
      } as React.CSSProperties}
    >
      <aside className="left-rail">
        <header className="brand-block">
          <div className="brand-mark"><Network size={22} /></div>
          <div>
            <h1>code-brain</h1>
            <p>Deterministic graph intelligence</p>
          </div>
        </header>

        {lastUpdate && (
          <div style={{
            padding: '8px 12px',
            margin: '8px 12px',
            background: 'rgba(74, 222, 128, 0.1)',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#4ade80'
          }}>
            ✓ {lastUpdate}
          </div>
        )}

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

      <div
        className="panel-resizer"
        role="separator"
        aria-label="Resize left panel"
        aria-orientation="vertical"
        onPointerDown={(event) => startResize("left", event)}
      />

      <GraphStage
        payload={payload}
        selectedId={selectedId}
        hoveredId={hoveredId}
        activeTypes={activeTypes}
        onSelect={selectNode}
        onHover={setHoveredId}
        onExpandCluster={expandCommunity}
      />

      <div
        className="panel-resizer"
        role="separator"
        aria-label="Resize live node panel"
        aria-orientation="vertical"
        onPointerDown={(event) => startResize("right", event)}
      />

      <aside className="right-rail">
        <section className="inspector-head">
          <span><Sparkles size={16} /> Live Node</span>
          <div className="inspector-actions">
            {selectedNode && (
              <button type="button" title="Clear selection" onClick={() => {
                setSelectedId(null);
                setDetails(null);
                setSource(null);
              }}>
                <X size={16} />
              </button>
            )}
          </div>
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
