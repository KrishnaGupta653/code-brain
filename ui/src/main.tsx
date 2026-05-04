import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BoxSelect,
  Braces,
  CheckCircle2,
  CircleDot,
  Code2,
  ExternalLink,
  FileSearch,
  Filter,
  GitBranch,
  GitCompare,
  Keyboard,
  LocateFixed,
  Maximize2,
  Network,
  Pin,
  Route,
  Search,
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
  community?: number;
  rankScore?: number;
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

function relationshipKind(type: string): "method" | "event" | "dependency" {
  if (type.includes("CALL") || type.includes("USES") || type.includes("REFERENCES")) return "method";
  if (type.includes("ENTRY") || type.includes("DECORATES") || type.includes("TESTS")) return "event";
  return "dependency";
}

function renderCodeTokens(text: string) {
  const parts = text.split(/(\b(?:async|await|const|let|var|function|return|class|interface|type|import|export|from|if|else|for|while|try|catch|new|private|public|protected|static)\b|["'`][^"'`]*["'`]|\/\/.*|\b\d+(?:\.\d+)?\b)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    let className = "tok-plain";
    if (/^["'`]/.test(part)) className = "tok-string";
    else if (/^\/\//.test(part)) className = "tok-comment";
    else if (/^\d/.test(part)) className = "tok-number";
    else if (/^\b(?:async|await|const|let|var|function|return|class|interface|type|import|export|from|if|else|for|while|try|catch|new|private|public|protected|static)\b$/.test(part)) className = "tok-keyword";
    return <span key={`${part}-${index}`} className={className}>{part}</span>;
  });
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

function stableNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildCommunityLookup(payload: GraphPayload): Map<string, number> {
  const lookup = new Map<string, number>();
  payload.analytics?.communities?.forEach((community, index) => {
    community.nodeIds.forEach((nodeId) => lookup.set(nodeId, index));
  });
  return lookup;
}

function edgeWeight(type: string, resolved: boolean): number {
  const base: Record<string, number> = {
    ENTRY_POINT: 5,
    DEFINES: 4,
    CALLS: 3.5,
    IMPORTS: 3,
    DEPENDS_ON: 3,
    EXTENDS: 2.8,
    IMPLEMENTS: 2.5,
    TESTS: 1.8,
    REFERENCES: 1.4,
    CALLS_UNRESOLVED: 0.8,
  };
  return (base[type] || 1.2) * (resolved ? 1 : 0.55);
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
  const communityLookup = useMemo(() => buildCommunityLookup(payload), [payload]);

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
    const communityCount = Math.max(1, payload.analytics?.communities?.length || 1);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    payload.nodes.forEach((node, index) => {
      const community = communityLookup.get(node.id) ?? Number(node.metadata?.communityId ?? stableNumber(String(node.file || node.type)) % communityCount);
      const communityAngle = community * goldenAngle;
      const communityRadius = Math.sqrt(community + 1) * radius * 1.7;
      const localSeed = stableNumber(`${node.id}:${index}`);
      const localAngle = (localSeed % 3600) / 3600 * Math.PI * 2;
      const localRadius = Math.sqrt((localSeed % 1000) / 1000) * Math.max(5, radius * 0.72);
      const rankScore = node.rank?.score ?? 0;
      const depthAngle = localAngle * 1.7 + communityAngle;
      const baseSize = nodeSize(node);
      graph.addNode(node.id, {
        label: node.name,
        x: Math.cos(communityAngle) * communityRadius + Math.cos(localAngle) * localRadius,
        y: Math.sin(communityAngle) * communityRadius + Math.sin(localAngle) * localRadius,
        z: Math.sin(depthAngle) * radius * (0.45 + rankScore),
        size: baseSize,
        color: NODE_COLORS[node.type] || "#e2e8f0",
        baseColor: NODE_COLORS[node.type] || "#e2e8f0",
        baseSize,
        semanticType: node.type,
        community,
        rankScore,
      });
    });

    payload.edges.forEach((edge) => {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to) && !graph.hasEdge(edge.id)) {
        graph.addDirectedEdgeWithKey(edge.id, edge.from, edge.to, {
          label: edge.type,
          size: edge.resolved ? 1.2 : 0.8,
          color: edge.resolved ? EDGE_COLORS[edge.type] || "#64748b" : "#f59e0b",
          baseColor: edge.resolved ? EDGE_COLORS[edge.type] || "#64748b" : "#f59e0b",
          weight: edgeWeight(edge.type, edge.resolved),
          type: "arrow",
        });
      }
    });

    // Community-seeded ForceAtlas2: fast, stable, and readable for architecture maps.
    // For very large graphs we keep the seeded LOD layout and let cluster expansion refine locally.
    if (graph.order > 2 && graph.order < 1800) {
      const inferred = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: Math.min(260, Math.max(70, graph.order * 2.4)),
        settings: {
          ...inferred,
          gravity: 0.08,
          scalingRatio: graph.order > 600 ? 18 : 11,
          strongGravityMode: false,
          adjustSizes: true,
          barnesHutOptimize: graph.order > 250,
          edgeWeightInfluence: 0.72,
          slowDown: 2.4,
        },
      });
    } else if (graph.order >= 1800) {
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
  }, [payload, onSelect, onHover, projectSphere, communityLookup]);

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
      const baseSize = Number(attrs.baseSize ?? attrs.size ?? (node ? nodeSize(node) : 4));

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
        baseSize * (id === selectedId ? 1.15 : related ? 1 : 0.95),
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
          { x: position.x, y: position.y, ratio: 0.15 },
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
  const [showFullFile, setShowFullFile] = useState(false);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRelationships, setShowRelationships] = useState(true);
  const [showSourceCode, setShowSourceCode] = useState(true);
  const [relationshipSearch, setRelationshipSearch] = useState("");
  const [expandedRelationships, setExpandedRelationships] = useState<Set<string>>(new Set());
  const [isInspectorPinned, setIsInspectorPinned] = useState(false);
  const [compareNode, setCompareNode] = useState<GraphNode | null>(null);
  const [relationshipsHeight, setRelationshipsHeight] = useState(() =>
    Number(localStorage.getItem("codebrain:relationshipsHeight") || 300),
  );
  const [sourceCodeHeight, setSourceCodeHeight] = useState(() =>
    Number(localStorage.getItem("codebrain:sourceCodeHeight") || 400),
  );
  const [leftWidth, setLeftWidth] = useState(() =>
    Number(localStorage.getItem("codebrain:leftWidth") || 320),
  );
  const [rightWidth, setRightWidth] = useState(() =>
    Number(localStorage.getItem("codebrain:rightWidth") || 420),
  );
  const shellRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const relationshipSearchInputRef = useRef<HTMLInputElement | null>(null);
  const relationshipsRef = useRef<HTMLElement | null>(null);
  const sourceCodeRef = useRef<HTMLElement | null>(null);
  const comparePanelRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    localStorage.setItem("codebrain:relationshipsHeight", String(relationshipsHeight));
  }, [relationshipsHeight]);

  useEffect(() => {
    localStorage.setItem("codebrain:sourceCodeHeight", String(sourceCodeHeight));
  }, [sourceCodeHeight]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + K: Focus search
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      // Cmd/Ctrl + /: Toggle shortcuts panel
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      // Escape: Clear selection or close shortcuts
      if (event.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else if (selectedId) {
          setSelectedId(null);
          setDetails(null);
          setSource(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, showShortcuts]);

  const selectNode = useCallback((id: string) => {
    setSelectedId(id);
    setShowFullFile(false);
    setShowRelationships(true);
    setShowSourceCode(true);

    fetch(`/api/node/${encodeURIComponent(id)}`)
      .then((response) => {
        if (!response.ok) {
          setDetails(null);
          setSource(null);
          return null;
        }
        return response.json() as Promise<NodeDetails>;
      })
      .then((node) => {
        if (!node) return null;
        setDetails(node);
        if (node.sourcePreview) {
          const params = new URLSearchParams({
            file: node.sourcePreview.file,
            startLine: String(node.sourcePreview.startLine),
            endLine: String(node.sourcePreview.endLine),
            context: "20",
          });
          return fetch(`/api/source?${params}`).then((response) => {
            if (!response.ok) return null;
            return response.json() as Promise<SourcePayload>;
          });
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

  const loadFullFile = useCallback(() => {
    if (!details?.sourcePreview) return;

    // Load entire file by requesting from line 1 to a very large number
    const params = new URLSearchParams({
      file: details.sourcePreview.file,
      startLine: "1",
      endLine: "999999", // Large number to get entire file
      context: "0",
    });

    fetch(`/api/source?${params}`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load full source file");
        return response.json() as Promise<SourcePayload>;
      })
      .then((sourcePayload) => {
        setSource(sourcePayload);
        setShowFullFile(true);
      })
      .catch((err) => console.error('Failed to load full file:', err));
  }, [details]);

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

  const startRelationshipsResize = (event: React.PointerEvent) => {
    const relationshipsEl = relationshipsRef.current;
    if (!relationshipsEl) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startY = event.clientY;
    const startHeight = relationshipsHeight;

    const onPointerMove = (event: PointerEvent) => {
      const delta = event.clientY - startY;
      const newHeight = Math.min(700, Math.max(180, startHeight + delta));
      setRelationshipsHeight(newHeight);
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

  const startSourceCodeResize = (event: React.PointerEvent) => {
    const sourceCodeEl = sourceCodeRef.current;
    if (!sourceCodeEl) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const startY = event.clientY;
    const startHeight = sourceCodeHeight;

    const onPointerMove = (event: PointerEvent) => {
      const delta = event.clientY - startY;
      const newHeight = Math.min(800, Math.max(200, startHeight + delta));
      setSourceCodeHeight(newHeight);
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
  const searchSuggestions = (() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const scoreNode = (node: GraphNode) => {
      const name = node.name.toLowerCase();
      const fullName = String(node.fullName || "").toLowerCase();
      const file = String(node.file || "").toLowerCase();
      const type = node.type.toLowerCase();
      let score = 0;
      if (name === term) score += 120;
      if (name.startsWith(term)) score += 80;
      if (name.includes(term)) score += 50;
      if (fullName.includes(term)) score += 28;
      if (file.includes(term)) score += 22;
      if (type.includes(term)) score += 12;
      score += Math.min(18, node.degree || 0);
      return score;
    };
    return payload.nodes
      .map((node) => ({ node, score: scoreNode(node) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.node.degree - a.node.degree || a.node.name.localeCompare(b.node.name))
      .slice(0, 10)
      .map((item) => item.node);
  })();
  const visibleSearchResults = query.trim() ? searchSuggestions : results.slice(0, 12);
  const relationshipItems = details?.outgoing && details?.incoming
    ? [
        ...details.outgoing.map((edge) => ({
          ...edge,
          related: edge.target,
          direction: "outgoing" as const,
        })),
        ...details.incoming.map((edge) => ({
          ...edge,
          related: edge.source,
          direction: "incoming" as const,
        })),
      ]
    : [];
  const filteredRelationships = relationshipItems
    .filter((edge) => {
      const query = relationshipSearch.trim().toLowerCase();
      if (!query) return true;
      return [
        edge.type,
        edge.from,
        edge.to,
        edge.related?.name,
        edge.related?.type,
        edge.related?.fullName,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    })
    .slice(0, 40);
  const selectedStatus = selectedNode?.fullName?.startsWith("unresolved:")
    || selectedNode?.type === "unresolved"
    || details?.outgoing?.some((edge) => !edge.resolved)
    ? "unresolved"
    : "resolved";
  const sourceLineLabel = source
    ? showFullFile && source.lines
      ? `Full file, ${source.lines.length} lines`
      : `Viewing lines ${source.requestedStartLine}-${source.requestedEndLine}`
    : "Source unavailable";
  const handleTraceUsage = () => {
    setShowRelationships(true);
    setRelationshipSearch("");
    window.setTimeout(() => {
      relationshipsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      relationshipSearchInputRef.current?.focus();
    }, 50);
  };
  const handleCompareNode = () => {
    if (!selectedNode) return;
    setCompareNode(selectedNode);
    window.setTimeout(() => {
      comparePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

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
            padding: '10px 14px',
            margin: '0 0 8px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
            animation: 'fadeIn 400ms ease'
          }}>
            <Activity size={14} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            {lastUpdate}
          </div>
        )}

        <section className="tool-panel search-panel">
          <label>
            <Search size={15} />
            <span>Search graph</span>
          </label>
          <div className="search-box">
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (searchSuggestions[0]) {
                  selectNode(searchSuggestions[0].id);
                  setResults(searchSuggestions);
                  return;
                }
                search();
              }}
              placeholder="Symbol, file, route, config"
            />
            <button type="button" onClick={search} title="Search">
              <LocateFixed size={17} />
            </button>
          </div>
          <div className="search-assist">
            {query.trim() ? (
              <span>{searchSuggestions.length ? `${searchSuggestions.length} suggestions` : "No local matches yet"}</span>
            ) : (
              <span>Start typing for instant graph suggestions</span>
            )}
          </div>
          <div className="result-list search-suggestions">
            {visibleSearchResults.map((node) => (
              <button key={node.id} type="button" onClick={() => selectNode(node.id)}>
                <span>
                  {typeIcon(node.type)}
                  <strong>{node.name}</strong>
                  <em>{node.type}</em>
                </span>
                <small>{relativeLabel(node.fullName || node.file)} · degree {node.degree}</small>
              </button>
            ))}
            {query.trim() && visibleSearchResults.length === 0 && (
              <div className="search-empty">
                <Search size={18} />
                <p>No matching nodes found in the loaded graph.</p>
              </div>
            )}
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

      <aside className="right-rail inspector-shell">
        <section className="inspector-head inspector-head-modern">
          <div className="inspector-breadcrumb">
            <span>Live Node Inspector</span>
            <small>{selectedNode ? relativeLabel(selectedNode.fullName || selectedNode.file) : "No node selected"}</small>
          </div>
          <div className="inspector-actions">
            <button
              type="button"
              className={isInspectorPinned ? "is-active" : ""}
              title="Pin node"
              onClick={() => setIsInspectorPinned((value) => !value)}
            >
              <Pin size={15} />
            </button>
            {selectedNode && (
              <button type="button" title="Clear selection (Esc)" onClick={() => {
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
            <section className="node-card inspector-node-panel">
              <div className="node-title">
                <span className="node-type-mark" style={{ color: NODE_COLORS[selectedNode.type] || "#e2e8f0" }}>
                  {typeIcon(selectedNode.type)}
                </span>
                <div>
                  <h2>{selectedNode.name}</h2>
                  <p>{relativeLabel(selectedNode.fullName || selectedNode.file)}</p>
                </div>
                <span className={`status-pill ${selectedStatus}`}>
                  {selectedStatus === "resolved" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {selectedStatus === "resolved" ? "Resolved" : "Unresolved target"}
                </span>
              </div>
              <div className="node-meta-row">
                <span>{selectedNode.type}</span>
                <span>{selectedNode.file ? relativeLabel(selectedNode.file) : "graph node"}</span>
                <span>{selectedNode.rank?.algorithm || "deterministic"}</span>
              </div>
              <p className="summary">{selectedNode.summary || "No summary captured for this symbol yet."}</p>
              <div className="score-row">
                <div><strong>{selectedNode.degree}</strong><span>Degree</span></div>
                <div><strong>{selectedNode.incomingCount}</strong><span>Incoming</span></div>
                <div><strong>{selectedNode.outgoingCount}</strong><span>Outgoing</span></div>
                <div><strong>{selectedNode.rank?.score?.toFixed(3) || "n/a"}</strong><span>Rank</span></div>
              </div>
              <div className="quick-actions">
                {selectedNode.vscodeUri && (
                  <a className="ghost-action" href={selectedNode.vscodeUri}>
                    <ExternalLink size={14} />
                    Jump to definition
                  </a>
                )}
                <button type="button" className="ghost-action" onClick={handleTraceUsage}>
                  <FileSearch size={14} />
                  Trace usage
                </button>
                <button
                  type="button"
                  className={`ghost-action ${compareNode?.id === selectedNode.id ? "is-active" : ""}`}
                  onClick={handleCompareNode}
                >
                  <GitCompare size={14} />
                  {compareNode?.id === selectedNode.id ? "Compare target" : "Compare"}
                </button>
              </div>
            </section>

            {compareNode && (
              <section ref={comparePanelRef} className="compare-panel">
                <header>
                  <span><GitCompare size={14} /> Compare nodes</span>
                  <button type="button" onClick={() => setCompareNode(null)}>Clear</button>
                </header>
                {compareNode.id === selectedNode.id ? (
                  <p className="compare-hint">
                    This node is pinned as the comparison target. Select another node to compare degree, direction, rank, and type.
                  </p>
                ) : (
                  <div className="compare-grid">
                    <div>
                      <small>Target</small>
                      <strong>{compareNode.name}</strong>
                      <span>{compareNode.type}</span>
                    </div>
                    <div>
                      <small>Current</small>
                      <strong>{selectedNode.name}</strong>
                      <span>{selectedNode.type}</span>
                    </div>
                    <div>
                      <small>Degree delta</small>
                      <strong>{selectedNode.degree - compareNode.degree > 0 ? "+" : ""}{selectedNode.degree - compareNode.degree}</strong>
                      <span>{compareNode.degree} {"->"} {selectedNode.degree}</span>
                    </div>
                    <div>
                      <small>Rank delta</small>
                      <strong>
                        {((selectedNode.rank?.score || 0) - (compareNode.rank?.score || 0)).toFixed(3)}
                      </strong>
                      <span>{(compareNode.rank?.score || 0).toFixed(3)} {"->"} {(selectedNode.rank?.score || 0).toFixed(3)}</span>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="mini-dependency-panel" aria-label="Node relationship summary">
              <div className="mini-dependency-title">
                <span>Dependency flow</span>
                <small>
                  {selectedNode.incomingCount} incoming, {selectedNode.outgoingCount} outgoing
                </small>
              </div>
              <div className="mini-flow">
                <div className="mini-node-group" title="Nodes that reference, call, import, or depend on this node">
                  <div className="mini-node muted">{selectedNode.incomingCount}</div>
                  <span>Incoming</span>
                </div>
                <div className="mini-edge incoming">
                  <small>feeds into</small>
                </div>
                <div className="mini-node-group selected" title={selectedNode.name}>
                  <div className="mini-node active">{selectedNode.name.slice(0, 2).toUpperCase()}</div>
                  <span>Selected</span>
                </div>
                <div className="mini-edge outgoing">
                  <small>points to</small>
                </div>
                <div className="mini-node-group" title="Nodes this node references, calls, imports, or depends on">
                  <div className="mini-node muted">{selectedNode.outgoingCount}</div>
                  <span>Outgoing</span>
                </div>
              </div>
            </section>

            {details && (
              <section
                ref={relationshipsRef}
                className="tool-panel relations-panel inspector-section"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: showRelationships ? 'none' : '56px',
                  minHeight: '56px',
                  overflow: 'hidden',
                  transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(0, 0, 0, 0.5))',
                    borderRadius: '10px',
                    marginBottom: showRelationships ? '12px' : '0',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    transition: 'all 0.25s ease',
                    flexShrink: 0
                  }}
                  onClick={() => setShowRelationships(!showRelationships)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.18), rgba(0, 0, 0, 0.6))';
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(0, 0, 0, 0.5))';
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.2)';
                  }}
                >
                  <h2 style={{
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: 'var(--text-bright)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    <GitBranch size={15} style={{ color: 'var(--accent)' }} />
                    Relationships
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(6, 182, 212, 0.2)',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--accent-bright)'
                    }}>
                      {relationshipItems.length}
                    </span>
                  </h2>
                  <span style={{
                    transform: showRelationships ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease',
                    display: 'inline-block',
                    color: 'var(--accent)',
                    fontSize: '1.2rem',
                    fontWeight: '700'
                  }}>
                    ▼
                  </span>
                </div>
                {showRelationships && (
                  <>
                    <div className="relationship-search">
                      <Search size={14} />
                      <input
                        ref={relationshipSearchInputRef}
                        value={relationshipSearch}
                        onChange={(event) => setRelationshipSearch(event.target.value)}
                        placeholder="Filter by edge, node, or type"
                      />
                    </div>
                    <div style={{
                      flex: '1 1 auto',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      display: 'grid',
                      gap: '7px',
                      paddingRight: '4px',
                      minHeight: 0
                    }}
                    className="relationship-list">
                      {filteredRelationships.length > 0 ? filteredRelationships.map((edge) => {
                        const related = edge.related;
                        const relatedId = edge.direction === "outgoing" ? edge.to : edge.from;
                        const relatedName = related?.name || relativeLabel(relatedId);
                        const relatedType = related?.type || (edge.resolved ? "node" : "unresolved");
                        const relatedPath = relativeLabel(related?.fullName || related?.file || relatedId);
                        const expanded = expandedRelationships.has(edge.id);
                        const kind = relationshipKind(edge.type);
                        return (
                          <article
                            key={`${edge.id}-${related?.id || "unknown"}`}
                            className={`relationship-item ${kind}`}
                            style={{
                              border: '1px solid var(--line)',
                              borderRadius: '10px',
                              background: 'rgba(17, 24, 39, 0.7)',
                              transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                              overflow: 'hidden'
                            }}
                          >
                            <button
                              type="button"
                              className="relationship-main"
                              onClick={() => {
                                setExpandedRelationships((current) => {
                                  const next = new Set(current);
                                  if (next.has(edge.id)) next.delete(edge.id);
                                  else next.add(edge.id);
                                  return next;
                                });
                              }}
                            >
                              <span className="flow-icon" style={{ color: EDGE_COLORS[edge.type] || "#cbd5e1" }}>
                                {edge.direction === "outgoing" ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                              </span>
                              <span className="relationship-copy">
                                <strong>{relatedName}</strong>
                                <small>{edge.direction === "outgoing" ? "Calls or depends on" : "Called by or feeds into"}</small>
                              </span>
                              <span className="edge-chip">{edge.type}</span>
                            </button>
                            {expanded && (
                              <div className="relationship-detail">
                                <span>{relatedType}</span>
                                <span>{relatedPath}</span>
                                <button type="button" onClick={() => selectNode(related?.id || relatedId)}>
                                  Inspect node
                                </button>
                              </div>
                            )}
                          </article>
                        );
                      }) : (
                        <div className="empty-inline">
                          <GitBranch size={24} />
                          <p>{relationshipSearch ? "No relationships match this filter." : "No relationships have been indexed for this node yet."}</p>
                        </div>
                      )}
                    </div>
                    {false && <div
                      style={{
                        height: '12px',
                        cursor: 'ns-resize',
                        background: 'linear-gradient(to bottom, transparent, rgba(6, 182, 212, 0.25), transparent)',
                        borderRadius: '6px',
                        marginTop: '8px',
                        position: 'relative',
                        flexShrink: 0,
                        transition: 'all 200ms ease'
                      }}
                      onPointerDown={startRelationshipsResize}
                      title="Drag to resize relationships panel"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(to bottom, transparent, rgba(6, 182, 212, 0.4), transparent)';
                        e.currentTarget.style.height = '14px';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(to bottom, transparent, rgba(6, 182, 212, 0.25), transparent)';
                        e.currentTarget.style.height = '12px';
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '50px',
                        height: '4px',
                        background: 'rgba(6, 182, 212, 0.6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)'
                      }} />
                    </div>}
                  </>
                )}
              </section>
            )}

            {/* Source Code Section - Resizable */}
            <section
              ref={sourceCodeRef}
              className="source-panel inspector-section"
              style={{
                display: 'flex',
                flexDirection: 'column',
                maxHeight: showSourceCode ? 'none' : '56px',
                minHeight: '56px',
                overflow: 'hidden',
                transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(0, 0, 0, 0.5))',
                  borderRadius: '10px',
                  marginBottom: showSourceCode ? '12px' : '0',
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  transition: 'all 0.25s ease',
                  flexShrink: 0
                }}
                onClick={() => setShowSourceCode(!showSourceCode)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(0, 0, 0, 0.6))';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(0, 0, 0, 0.5))';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                }}
              >
                <h2 style={{
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  color: 'var(--text-bright)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  <Code2 size={15} style={{ color: 'var(--accent-3)' }} />
                  Source Code
                  {source && (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(139, 92, 246, 0.2)',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--accent-3)'
                    }}>
                      {sourceLineLabel}
                    </span>
                  )}
                </h2>
                <span style={{
                  transform: showSourceCode ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.3s ease',
                  display: 'inline-block',
                  color: 'var(--accent-3)',
                  fontSize: '1.2rem',
                  fontWeight: '700'
                }}>
                  ▼
                </span>
              </div>

              {showSourceCode && (
                <>
                  {source ? (
                    <div style={{
                      flex: '1 1 auto',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      border: '1px solid var(--line-bright)',
                      borderRadius: '10px',
                      background: 'var(--panel-strong)',
                      minHeight: 0
                    }}>
                      <header style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '14px',
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--line-bright)',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(0, 0, 0, 0.5))',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        flexShrink: 0
                      }}>
                        <span style={{
                          display: 'flex',
                          minWidth: 0,
                          alignItems: 'center',
                          gap: '10px',
                          overflow: 'hidden',
                          color: 'var(--text-bright)',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          <Code2 size={14} style={{ flexShrink: 0 }} />
                          {source.relativeFile}
                        </span>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          {!showFullFile && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                loadFullFile();
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                borderRadius: '8px',
                                background: 'rgba(139, 92, 246, 0.15)',
                                color: 'var(--accent-3)',
                                cursor: 'pointer',
                                transition: 'all 200ms ease',
                                fontWeight: '600'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.25)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                                e.currentTarget.style.transform = 'translateY(0)';
                              }}
                            >
                              <Maximize2 size={12} />
                              Full File
                            </button>
                          )}
                          {showFullFile && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowFullFile(false);
                                selectNode(selectedId!);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                border: '1px solid rgba(148, 163, 184, 0.2)',
                                borderRadius: '8px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                transition: 'all 200ms ease',
                                fontWeight: '600'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
                              }}
                            >
                              Show Less
                            </button>
                          )}
                          {source.vscodeUri && (
                            <a
                              href={source.vscodeUri}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                border: '1px solid var(--line-bright)',
                                borderRadius: '8px',
                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(6, 182, 212, 0.15))',
                                color: 'var(--text-bright)',
                                textDecoration: 'none',
                                fontWeight: '600',
                                transition: 'all 200ms ease',
                                cursor: 'pointer'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.35), rgba(6, 182, 212, 0.25))';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(6, 182, 212, 0.15))';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              <ExternalLink size={12} />
                              Open
                            </a>
                          )}
                        </div>
                      </header>
                      <div style={{
                        padding: '8px 12px',
                        background: 'rgba(139, 92, 246, 0.08)',
                        borderBottom: '1px solid var(--line-bright)',
                        fontSize: '0.75rem',
                        color: 'var(--muted)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0
                      }}>
                        <span style={{ fontWeight: '500' }}>
                          {sourceLineLabel}
                        </span>
                      </div>
                      <pre style={{
                        flex: '1 1 auto',
                        margin: 0,
                        overflow: 'auto',
                        padding: '12px 0',
                        background: 'rgba(0, 0, 0, 0.8)',
                        fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", Consolas, monospace',
                        fontSize: '0.8rem',
                        lineHeight: '1.7',
                        minHeight: 0
                      }}>
                        {source.lines.map((line) => (
                          <div key={line.line} className={line.highlighted ? "hot-line" : ""}>
                            <span>{line.line}</span>
                            <code>{renderCodeTokens(line.text || " ")}</code>
                          </div>
                        ))}
                      </pre>
                    </div>
                  ) : (
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '16px',
                      padding: '48px 24px',
                      textAlign: 'center',
                      color: 'var(--muted)',
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(0, 0, 0, 0.7))',
                      borderRadius: '12px',
                      border: '1px dashed rgba(139, 92, 246, 0.3)'
                    }}>
                      <Code2 size={48} style={{ opacity: 0.3, color: 'var(--accent-3)' }} />
                      <div>
                        <p style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: 'var(--text)' }}>
                          {selectedNode?.type === 'file'
                            ? 'File node selected'
                            : 'No source code available'
                          }
                        </p>
                        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', opacity: 0.8 }}>
                          {selectedNode?.type === 'file'
                            ? 'Click a function, class, or method to see code'
                            : 'Try selecting a function, class, or method node'
                          }
                        </p>
                      </div>
                    </div>
                  )}
                  {source && (
                    <div
                      style={{
                        height: '12px',
                        cursor: 'ns-resize',
                        background: 'linear-gradient(to bottom, transparent, rgba(139, 92, 246, 0.25), transparent)',
                        borderRadius: '6px',
                        marginTop: '8px',
                        position: 'relative',
                        flexShrink: 0,
                        transition: 'all 200ms ease'
                      }}
                      onPointerDown={startSourceCodeResize}
                      title="Drag to resize source code panel"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(to bottom, transparent, rgba(139, 92, 246, 0.4), transparent)';
                        e.currentTarget.style.height = '14px';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(to bottom, transparent, rgba(139, 92, 246, 0.25), transparent)';
                        e.currentTarget.style.height = '12px';
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '50px',
                        height: '4px',
                        background: 'rgba(139, 92, 246, 0.6)',
                        borderRadius: '2px',
                        boxShadow: '0 0 10px rgba(139, 92, 246, 0.4)'
                      }} />
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        ) : (
          <section className="empty-state">
            <Network size={42} />
            <h2>Select a node</h2>
            <p>Click any node to inspect provenance, relationships, importance, and exact source.</p>
          </section>
        )}
      </aside>

      {/* Keyboard Shortcuts Panel */}
      {showShortcuts && (
        <div
          className="shortcuts-overlay"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="shortcuts-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Keyboard size={20} />
                <h2>Keyboard Shortcuts</h2>
              </div>
              <button type="button" onClick={() => setShowShortcuts(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="shortcuts-list">
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Ctrl</kbd> + <kbd>K</kbd>
                </div>
                <span>Focus search</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Ctrl</kbd> + <kbd>/</kbd>
                </div>
                <span>Toggle shortcuts</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Esc</kbd>
                </div>
                <span>Clear selection / Close panel</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Enter</kbd>
                </div>
                <span>Execute search</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Shift</kbd> + <kbd>Drag</kbd>
                </div>
                <span>Rotate 3D sphere</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Alt</kbd> + <kbd>Drag</kbd>
                </div>
                <span>Rotate 3D sphere</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Click</kbd>
                </div>
                <span>Select node</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>Hover</kbd>
                </div>
                <span>Preview node connections</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Shortcuts Button */}
      <button
        className="shortcuts-fab"
        onClick={() => setShowShortcuts(true)}
        title="Keyboard shortcuts (Ctrl+/)"
      >
        <Keyboard size={20} />
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
