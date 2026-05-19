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
  Columns,
  Download,
  ExternalLink,
  FileSearch,
  Filter,
  Folder,
  GitBranch,
  GitCompare,
  Keyboard,
  LocateFixed,
  Maximize2,
  Layers,
  Network,
  Palette,
  Pin,
  Route,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as d3 from "d3";
import {
  GraphEdge,
  GraphNode,
  GraphPayload,
  NodeDetails,
  SourcePayload,
  ViewMode,
  LayoutMode,
  VizType,
} from "./types";
import { github } from "./lib/github-api";
import { GraphToolbar } from "./components/GraphToolbar";
import { GraphLegend } from "./components/GraphLegend";
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
  depthScale?: number;
}

interface EdgeAttributes {
  type: string;
  color?: string;
  baseColor?: string;
  size?: number;
  hidden?: boolean;
}

export const NODE_COLORS: Record<string, string> = {
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

// Exported from types.ts

const FOLDER_PALETTE = [
  '#4d9fff',
  '#22d3ee',
  '#a78bfa',
  '#00ff9d',
  '#ff9f43',
  '#ec4899',
  '#f59e0b',
  '#22c55e',
  '#f87171',
  '#38bdf8',
];

const LAYER_MAP: Record<string, string> = {
  utils: '#f59e0b',
  util: '#f59e0b',
  services: '#a78bfa',
  service: '#a78bfa',
  components: '#4d9fff',
  component: '#4d9fff',
  controllers: '#22d3ee',
  controller: '#22d3ee',
  models: '#ff9f43',
  model: '#ff9f43',
  lib: '#22c55e',
  libs: '#22c55e',
  tests: '#ec4899',
  test: '#ec4899',
  __tests__: '#ec4899',
  config: '#94a3b8',
};

function nodeFilePath(node?: Pick<GraphNode, 'file' | 'location' | 'type' | 'fullName' | 'name'>): string {
  if (!node) return '';
  return String(
    node.file ||
    node.location?.file ||
    (node.type === 'file' ? node.fullName || node.name : ''),
  );
}

function pathParts(file?: string): string[] {
  // Normalise separators and strip Windows drive letters
  const normalised = String(file || '').replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '');
  return normalised.split('/').filter(Boolean);
}

/**
 * Returns the first meaningful top-level folder segment.
 * Handles both local (absolute) and remote (relative) paths consistently.
 * When given a GraphNode, prefers node.name (project-relative path)
 * over node.file (absolute path) for consistent grouping.
 */
export function topFolder(fileOrNode?: string | Pick<GraphNode, 'file' | 'location' | 'type' | 'fullName' | 'name'>): string {
  if (fileOrNode && typeof fileOrNode !== 'string') {
    const name = fileOrNode.name || '';
    // Only use node.name as path if it has a directory separator (is a relative file path)
    if (name.includes('\\') || (name.includes('/') && !name.startsWith('http'))) {
      const nameParts = pathParts(name);
      if (nameParts.length > 1) return nameParts[0];
    }
  }
  const file = typeof fileOrNode === 'string' ? fileOrNode : nodeFilePath(fileOrNode);
  const parts = pathParts(file);
  
  // Empty or single-part paths
  if (parts.length === 0) return 'root';
  if (parts.length === 1) return parts[0];
  
  // Find known project-root markers (src, ui, lib, etc.)
  const projectRootMarkers = ['src', 'ui', 'lib', 'app', 'packages', 'dist', 'tests', 'python', 'vscode-extension', 'api', 'docs', 'templates'];
  const markerIndex = parts.findIndex((p) => projectRootMarkers.includes(p.toLowerCase()));
  if (markerIndex >= 0) return parts[markerIndex];
  
  // Skip common system/temp prefixes (Users, home, tmp, .codebrain, remote-repos, etc.)
  const skipPrefixes = ['users', 'home', 'tmp', 'temp', '.codebrain', 'remote-repos', 'desktop', 'documents'];
  let startIndex = 0;
  while (startIndex < parts.length && skipPrefixes.includes(parts[startIndex].toLowerCase())) {
    startIndex++;
  }
  
  // Return first meaningful folder after skipping prefixes
  return parts[startIndex] ?? parts[0] ?? 'root';
}

function colorForViewMode(nodeData: GraphNode, viewMode: ViewMode, churnData?: Record<string, { changes: number; authors: number; hotspot: boolean }> | null): string {
  if (viewMode === 'importance') {
    const importance = (nodeData as any).importance ?? nodeData.rank?.score ?? 0;
    const red = Math.round(255 * Math.min(1, importance * 2));
    const green = Math.round(255 * Math.min(1, (1 - importance) * 2));
    return `rgb(${red},${green},40)`;
  }

  if (viewMode === 'dead') {
    return nodeData.metadata?.isDead ? '#ef4444' : 'rgba(71,85,105,0.5)';
  }

  if (viewMode === 'bridge') {
    return nodeData.metadata?.isBridge ? '#f59e0b' : 'rgba(71,85,105,0.5)';
  }

  if (viewMode === 'folder') {
    const folder = topFolder(nodeData);
    return FOLDER_PALETTE[stableNumber(folder) % FOLDER_PALETTE.length];
  }

  if (viewMode === 'layer') {
    const layer = pathParts(nodeFilePath(nodeData)).map((part) => part.toLowerCase()).find((part) => LAYER_MAP[part]);
    return layer ? LAYER_MAP[layer] : '#64748b';
  }

  if (viewMode === 'churn') {
    if (!churnData) return '#94a3b8'; // Default loading color
    const file = nodeFilePath(nodeData);
    const stats = churnData[file];
    if (!stats) return 'rgba(71,85,105,0.3)'; // Untouched file
    if (stats.hotspot) return '#ef4444'; // Red for hotspots
    // Heatmap from cold blue to warm orange
    if (stats.changes === 0) return '#3b82f6';
    if (stats.changes < 3) return '#06b6d4';
    if (stats.changes < 8) return '#eab308';
    return '#f97316';
  }

  return NODE_COLORS[nodeData.type] ?? '#94a3b8';
}

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

function withAlpha(color: string, alpha: number): string {
  const safeAlpha = clamp(alpha, 0, 1);
  if (color.startsWith("#")) return hexToRgba(color, safeAlpha);

  const rgbaMatch = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbaMatch) return color;

  const channels = rgbaMatch[1].split(",").map((part) => part.trim());
  if (channels.length < 3) return color;
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${safeAlpha})`;
}

function nodeDepthScale(attrs: Partial<NodeAttributes>): number {
  return clamp(Number(attrs.depthScale ?? 1), 0.84, 1.18);
}

function scaledNodeSize(attrs: Partial<NodeAttributes>, emphasis = 1): number {
  const baseSize = Number(attrs.baseSize ?? attrs.size ?? 4);
  return baseSize * nodeDepthScale(attrs) * emphasis;
}

function depthTintedColor(baseColor: string, attrs: Partial<NodeAttributes>, opacity = 1): string {
  const depthOpacity = 0.66 + (nodeDepthScale(attrs) - 0.84) * 0.9;
  return withAlpha(baseColor, depthOpacity * opacity);
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

function showNotification(message: string, type: 'success' | 'error' = 'success') {
  const notification = document.createElement('div');
  notification.textContent = message;
  const bgColor = type === 'success' ? '#10b981' : '#ef4444';
  notification.style.cssText = `position:fixed;top:20px;right:20px;background:${bgColor};color:white;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:slideIn 0.3s ease-out`;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 2500);
}

function buildCommunityLookup(payload: GraphPayload): Map<string, number> {
  const lookup = new Map<string, number>();
  payload.analytics?.communities?.forEach((community, index) => {
    community.nodeIds.forEach((nodeId) => lookup.set(nodeId, index));
  });
  return lookup;
}

function basename(file: string): string {
  return pathParts(file).slice(-1)[0] || file || 'unknown';
}

function truncateMiddle(value: string, maxLength = 18): string {
  if (value.length <= maxLength) return value;
  const keep = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

export function folderColor(folder: string, opacity = 1): string {
  const color = FOLDER_PALETTE[stableNumber(folder) % FOLDER_PALETTE.length];
  return opacity >= 1 ? color : hexToRgba(color, opacity);
}

function folderLabel(node: GraphNode): string {
  // Prefer node.name (project-relative) over the absolute file path
  const relativeParts = node.name ? pathParts(node.name) : [];
  const parts = relativeParts.length > 0 ? relativeParts : pathParts(nodeFilePath(node));
  if (parts.length <= 1) return 'root';
  return parts.slice(0, Math.min(3, parts.length - 1)).join('/');
}

function flowGroupLabel(node: GraphNode): string {
  const relativeNameParts = node.name && /[\\/]/.test(node.name) ? pathParts(node.name) : [];
  const fullNameParts = node.fullName && /[\\/]/.test(node.fullName) ? pathParts(node.fullName) : [];
  const rawParts = relativeNameParts.length > 1
    ? relativeNameParts
    : fullNameParts.length > 1
      ? fullNameParts
      : pathParts(nodeFilePath(node));
  
  // Skip common system/temp prefixes for consistency
  const skipPrefixes = ['users', 'home', 'tmp', 'temp', '.codebrain', 'remote-repos', 'desktop', 'documents'];
  let startIndex = 0;
  while (startIndex < rawParts.length && skipPrefixes.includes(rawParts[startIndex].toLowerCase())) {
    startIndex++;
  }
  
  const projectMarkers = ['src', 'ui', 'lib', 'app', 'packages', 'dist', 'tests', 'test-languages', 'python', 'vscode-extension', 'api', 'docs', 'templates'];
  const markerIndex = rawParts.findIndex((part) => projectMarkers.includes(part.toLowerCase()));
  const parts = markerIndex >= 0 ? rawParts.slice(markerIndex) : rawParts.slice(startIndex);

  if (parts.length === 0) return topFolder(node);
  if (parts.length === 1) return parts[0];

  const [first, second] = parts;
  if (!second || /\.[A-Za-z0-9]+$/.test(second)) return first;

  const third = parts[2];
  if (first === 'ui' && second === 'src' && third && !/\.[A-Za-z0-9]+$/.test(third)) {
    return `${first}/${second}/${third}`;
  }

  return `${first}/${second}`;
}

export function fileWeight(node: GraphNode): number {
  const locationLines = node.location
    ? Math.max(1, node.location.endLine - node.location.startLine + 1)
    : 0;
  const metadataLines = Number(node.metadata?.lines ?? node.metadata?.lineCount ?? 0);
  return Math.max(1, metadataLines || locationLines || (node.degree ?? 1));
}

function selectSourceNodeId(node: GraphNode): string {
  return typeof node.metadata?.sourceNodeId === 'string' ? node.metadata.sourceNodeId : node.id;
}

function buildFlowPayload(payload: GraphPayload): GraphPayload {
  const originalLookup = new Map(payload.nodes.map((node) => [node.id, node]));
  const fileNodeByPath = new Map<string, GraphNode>();
  const fallbackByPath = new Map<string, GraphNode>();

  payload.nodes.forEach((node) => {
    const file = nodeFilePath(node);
    if (!file) return;
    fallbackByPath.set(file, fallbackByPath.get(file) ?? node);
    if (node.type === 'file') {
      fileNodeByPath.set(file, node);
    }
  });

  const paths = [...new Set([...fileNodeByPath.keys(), ...fallbackByPath.keys()])].sort();
  const nodes = paths.map((file) => {
    const source = fileNodeByPath.get(file) ?? fallbackByPath.get(file)!;
    const dependents = payload.edges.filter((edge) => {
      const from = originalLookup.get(edge.from);
      const to = originalLookup.get(edge.to);
      return nodeFilePath(to) === file && nodeFilePath(from) !== file;
    }).length;
    const dependencies = payload.edges.filter((edge) => {
      const from = originalLookup.get(edge.from);
      const to = originalLookup.get(edge.to);
      return nodeFilePath(from) === file && nodeFilePath(to) !== file;
    }).length;

    return {
      ...source,
      name: basename(file),
      fullName: file,
      file,
      type: 'file',
      summary: `${dependencies} dependencies, ${dependents} dependents`,
      degree: dependencies + dependents,
      incomingCount: dependents,
      outgoingCount: dependencies,
      metadata: {
        ...source.metadata,
        flowMap: true,
        sourceNodeId: source.id,
        dependencies,
        dependents,
      },
    };
  });

  const nodeIdByPath = new Map(nodes.map((node) => [nodeFilePath(node), node.id]));
  const edgeCounts = new Map<string, { from: string; to: string; count: number; unresolved: number }>();

  payload.edges.forEach((edge) => {
    const from = originalLookup.get(edge.from);
    const to = originalLookup.get(edge.to);
    const fromPath = nodeFilePath(from);
    const toPath = nodeFilePath(to);
    const fromId = nodeIdByPath.get(fromPath);
    const toId = nodeIdByPath.get(toPath);
    if (!fromId || !toId || fromId === toId) return;
    const key = `${fromId}->${toId}`;
    const existing = edgeCounts.get(key) ?? { from: fromId, to: toId, count: 0, unresolved: 0 };
    existing.count += 1;
    if (!edge.resolved) existing.unresolved += 1;
    edgeCounts.set(key, existing);
  });

  const edges = [...edgeCounts.values()].map((edge) => ({
    id: `flow:${edge.from}:${edge.to}`,
    from: edge.from,
    to: edge.to,
    type: 'DEPENDS_ON',
    resolved: edge.unresolved === 0,
    metadata: {
      flowMap: true,
      count: edge.count,
      unresolved: edge.unresolved,
    },
  }));

  return {
    ...payload,
    nodes,
    edges,
    stats: {
      ...payload.stats,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodesByType: { file: nodes.length },
      edgesByType: { DEPENDS_ON: edges.length },
    },
  };
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

function HealthRing({ score }: { score: number }) {
  const roundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const fill = (roundedScore / 100) * circumference;
  const grade = roundedScore >= 90 ? 'A' : roundedScore >= 80 ? 'B' : roundedScore >= 70 ? 'C' : roundedScore >= 60 ? 'D' : 'F';
  const color = roundedScore >= 80 ? '#10b981' : roundedScore >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="health-ring">
      <svg width={48} height={48} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
        <circle cx={24} cy={24} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
        <circle
          cx={24}
          cy={24}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={`${fill} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div>
        <div className="health-ring-score" style={{ color }}>
          {roundedScore}<span>/100</span>
        </div>
        <div className="health-ring-label">Health - Grade {grade}</div>
      </div>
    </div>
  );
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
            } else if (message.type === 'analysis-progress') {
              window.dispatchEvent(new CustomEvent('codebrain:analysis-progress', { detail: message }));
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

  return { payload, setPayload, error, level, expandCommunity, lastUpdate };
}

function GraphStage({
  payload,
  selectedId,
  hoveredId,
  activeTypes,
  onSelect,
  onHover,
  onExpandCluster,
  cameraLocked,
  onToggleCameraLock,
  viewMode,
  onViewModeChange,
  layoutMode,
  onLayoutModeChange,
  vizType,
  onVizTypeChange,
  blastNodes,
  blastSourceId,
  pathNodes,
  pathSourceId,
  onClearPath,
  onContextMenu,
  searchQuery,
  churnData,
  showSidebars,
  setShowSidebars,
}: {
  payload: GraphPayload;
  selectedId: string | null;
  hoveredId: string | null;
  activeTypes: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onExpandCluster?: (communityId: number) => void;
  cameraLocked?: boolean;
  onToggleCameraLock?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  vizType: VizType;
  onVizTypeChange: (type: VizType) => void;
  blastNodes: Set<string>;
  blastSourceId: string | null;
  pathNodes: Set<string>;
  pathSourceId: string | null;
  onClearPath: () => void;
  onContextMenu: (x: number, y: number, nodeId: string, nodeName: string) => void;
  searchQuery: string;
  churnData?: Record<string, { changes: number; authors: number; hotspot: boolean }> | null;
  showSidebars?: boolean;
  setShowSidebars?: (show: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const d3StageRef = useRef<HTMLDivElement | null>(null);
  const d3ZoomRef = useRef<any>(null);
  const d3SvgRef = useRef<any>(null);
  const d3NodesRef = useRef<any[]>([]);
  const treemapRef = useRef<HTMLDivElement | null>(null);
  const miniMapRef = useRef<HTMLCanvasElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<any>(null);
  const graphInstanceRef = useRef(0);
  const lastAppliedLayoutRef = useRef<LayoutMode | null>(null);
  const refreshRafRef = useRef<number | null>(null);
  const prevNodeCount = useRef(0);
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(() => new Set(['root']));
  const rotationRef = useRef({ x: -0.18, y: 0.42 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rotationX: number;
    rotationY: number;
  } | null>(null);
  const filePayload = useMemo(() => buildFlowPayload(payload), [payload]);
  const visualPayload = useMemo(
    () => (vizType === 'symbols' || vizType === 'vector') ? payload : filePayload,
    [filePayload, payload, vizType],
  );
  const nodeLookup = useMemo(
    () => new Map(visualPayload.nodes.map((node) => [node.id, node])),
    [visualPayload.nodes],
  );
  const communityLookup = useMemo(() => buildCommunityLookup(visualPayload), [visualPayload]);
  const hasGraphOverlay = blastNodes.size > 0 || pathNodes.size > 0;
  const hasGraphOverlayRef = useRef(false);

  useEffect(() => {
    hasGraphOverlayRef.current = hasGraphOverlay;
  }, [hasGraphOverlay]);

  useEffect(() => {
    setExpandedTreePaths(new Set(['root']));
  }, [visualPayload, vizType]);

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
      const depthScale = vizType === "vector"
        ? 0.9 + ((projectedZ / maxDepth + 1) / 2) * 0.18
        : 0.72 + ((projectedZ / maxDepth + 1) / 2) * 0.56;
      const baseSize = Number(attrs.baseSize ?? attrs.size ?? 4);
      const baseColor = String(attrs.baseColor || attrs.color || "#e2e8f0");

      graph.setNodeAttribute(id, "x", yawX);
      graph.setNodeAttribute(id, "y", projectedY);
      graph.setNodeAttribute(id, "size", baseSize * depthScale);
      graph.setNodeAttribute(id, "depthScale", depthScale);
      graph.setNodeAttribute(id, "color", depthTintedColor(baseColor, { depthScale }));
      graph.setNodeAttribute(id, "zIndex", Math.round(depthScale * 100));
    });

    sigma.refresh();
  }, [vizType]);

  useEffect(() => {
    if (!containerRef.current || (vizType !== 'symbols' && vizType !== 'vector')) return;

    const instanceId = graphInstanceRef.current + 1;
    graphInstanceRef.current = instanceId;
    let cancelled = false;

    const scheduleSigmaRefresh = () => {
      if (refreshRafRef.current !== null) return;
      refreshRafRef.current = requestAnimationFrame(() => {
        refreshRafRef.current = null;
        if (!cancelled && graphInstanceRef.current === instanceId) {
          sigmaRef.current?.refresh();
        }
      });
    };

    const graph: any = new Graph({ multi: true, type: "directed" });
    const radius = Math.max(12, Math.sqrt(visualPayload.nodes.length) * 3.5);
    const communityCount = Math.max(1, visualPayload.analytics?.communities?.length || 1);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const importantNodeIds = new Set(
      [...visualPayload.nodes]
        .sort((a, b) =>
          ((b.rank?.score ?? 0) - (a.rank?.score ?? 0)) ||
          ((b.degree ?? 0) - (a.degree ?? 0)),
        )
        .slice(0, Math.min(28, Math.max(10, Math.floor(visualPayload.nodes.length * 0.05))))
        .map((node) => node.id),
    );
    const displayLabelFor = (node: GraphNode): string => {
      if (node.type === 'file') return truncateMiddle(relativeLabel(node.fullName || node.file || node.name), 24);
      if (node.type === 'module' && String(node.metadata?.external) === 'true') return truncateMiddle(node.name, 20);
      return truncateMiddle(node.name, 24);
    };

    visualPayload.nodes.forEach((node, index) => {
      const fileSeed = nodeFilePath(node) || node.type;
      const community = communityLookup.get(node.id) ?? Number(node.metadata?.communityId ?? stableNumber(String(fileSeed)) % communityCount);
      const communityAngle = community * goldenAngle;
      const communityRadius = Math.sqrt(community + 1) * radius * 2.8;
      const localSeed = stableNumber(`${node.id}:${index}`);
      const localAngle = (localSeed % 3600) / 3600 * Math.PI * 2;
      const localRadius = Math.sqrt((localSeed % 1000) / 1000) * Math.max(8, radius * 1.2);
      const rankScore = node.rank?.score ?? 0;
      const depthAngle = localAngle * 1.7 + communityAngle;
      const baseSize = vizType === 'vector'
        ? Math.min(12, nodeSize(node) * 0.82)
        : nodeSize(node);
      const baseColor = colorForViewMode(node, viewMode, churnData);
      graph.addNode(node.id, {
        type: "circle",
        label: displayLabelFor(node),
        x: Math.cos(communityAngle) * communityRadius + Math.cos(localAngle) * localRadius,
        y: Math.sin(communityAngle) * communityRadius + Math.sin(localAngle) * localRadius,
        z: Math.sin(depthAngle) * radius * (0.65 + rankScore * 0.8),
        size: baseSize,
        color: baseColor,
        baseColor,
        baseSize,
        semanticType: node.type,
        community,
        rankScore,
        forceLabel: node.type === 'project' || importantNodeIds.has(node.id),
        labelPriority: importantNodeIds.has(node.id) ? 1 : 0,
      });
    });

    visualPayload.edges.forEach((edge) => {
      if (graph.hasNode(edge.from) && graph.hasNode(edge.to) && !graph.hasEdge(edge.id)) {
        graph.addDirectedEdgeWithKey(edge.id, edge.from, edge.to, {
          label: edge.type,
          size: edge.resolved ? 0.8 : 0.55,
          color: edge.resolved
            ? hexToRgba(EDGE_COLORS[edge.type] || "#64748b", 0.34)
            : "rgba(245, 158, 11, 0.42)",
          baseColor: edge.resolved ? EDGE_COLORS[edge.type] || "#64748b" : "#f59e0b",
          baseSize: edge.resolved ? 0.8 : 0.55,
          weight: edgeWeight(edge.type, edge.resolved),
          type: "arrow",
        });
      }
    });

    const snapshotBasePositions = () => {
      graph.forEachNode((id: string, attrs: NodeAttributes) => {
        graph.setNodeAttribute(id, "baseX", attrs.x);
        graph.setNodeAttribute(id, "baseY", attrs.y);
        graph.setNodeAttribute(id, "baseZ", attrs.z ?? 0);
      });
    };

    const isExpansion = prevNodeCount.current > 0 && graph.order > prevNodeCount.current;
    prevNodeCount.current = graph.order;

    // Community-seeded ForceAtlas2 with MessageChannel chunked rendering.
    // MessageChannel is a browser-native microtask queue — it yields between
    // every chunk, allowing the browser to paint and keep the UI responsive.
    if (graph.order > 2 && graph.order < 1800) {
      const inferred = forceAtlas2.inferSettings(graph);
      const totalIterations = isExpansion
        ? Math.min(80, graph.order)
        : Math.min(260, Math.max(70, graph.order * 2.4));
      const chunkSize = graph.order > 600 ? 20 : 40;
      const fa2Settings = {
        ...inferred,
        gravity: vizType === 'vector' ? 0.035 : 0.05,
        scalingRatio: graph.order > 600 ? (vizType === 'vector' ? 40 : 28) : (vizType === 'vector' ? 26 : 18),
        strongGravityMode: false,
        adjustSizes: true,
        barnesHutOptimize: graph.order > 250,
        edgeWeightInfluence: vizType === 'vector' ? 0.38 : 0.6,
        slowDown: vizType === 'vector' ? 4.2 : 3.2,
      };

      // Yield between chunks via MessageChannel (more reliable than setTimeout(0))
      const yieldToMain = () => new Promise<void>(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      });

      (async () => {
        let remaining = totalIterations;
        while (remaining > 0) {
          if (cancelled || graphInstanceRef.current !== instanceId) return;
          const batch = Math.min(chunkSize, remaining);
          forceAtlas2.assign(graph, { iterations: batch, settings: fa2Settings });
          remaining -= batch;
          scheduleSigmaRefresh();
          await yieldToMain();
        }
        if (cancelled || graphInstanceRef.current !== instanceId) return;
        // Final snapshot and render once layout has converged
        snapshotBasePositions();
        if (sigmaRef.current && graphRef.current === graph) {
          scheduleSigmaRefresh();
          projectSphere();
        }
      })();
    } else if (graph.order >= 1800) {
      console.info(`Large graph detected (${graph.order} nodes), using optimized layout`);
      snapshotBasePositions();
    } else {
      snapshotBasePositions();
    }

    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      defaultEdgeType: "arrow",
      labelColor: { color: "#dbeafe" },
      labelSize: 11,
      labelWeight: "650",
      labelDensity: vizType === 'vector' ? 0.004 : 0.008,
      labelGridCellSize: vizType === 'vector' ? 300 : 240,
      labelRenderedSizeThreshold: vizType === 'vector' ? 18 : 16,
      defaultDrawNodeLabel: drawCleanNodeLabel,
      defaultDrawNodeHover: drawCleanNodeHover,
      minCameraRatio: vizType === 'vector' ? 0.18 : 0.08,
      maxCameraRatio: vizType === 'vector' ? 3.2 : 4,
      // Keep edges visible during movement. Hiding them is faster, but it makes
      // the vector graph feel broken on dense repos because pan/zoom can leave
      // users looking at nodes only until the next render.
      hideEdgesOnMove: false,
      hideLabelsOnMove: vizType === 'vector' ? false : true,
      enableEdgeEvents: false,        // Disables all edge events (click, hover, wheel)
      zIndex: true,                   // Important nodes render on top
      defaultEdgeColor: "#334155",    // Fast rendering without lookup
    });

    // Coalesce movement refreshes into a single render frame.
    let moveTimeout: NodeJS.Timeout | null = null;
    const scheduleRefresh = () => {
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        scheduleSigmaRefresh();
        moveTimeout = null;
      }, 80);
    };

    // Restore edges after zoom/wheel events
    sigma.on("wheelStage", () => scheduleRefresh());
    // Restore edges after pan/drag completes
    sigma.on("upStage", () => scheduleRefresh());

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
      const sourceNodeId = nodeData?.metadata?.sourceNodeId;
      onSelect(typeof sourceNodeId === 'string' ? sourceNodeId : node);
    });
    sigma.on("enterNode", ({ node }) => onHover(node));
    sigma.on("leaveNode", () => onHover(null));

    // Hover dimming: applied directly on graph attributes inside the Sigma event
    // handlers to avoid triggering React re-renders on every mousemove.
    // Uses a ref snapshot of applyFocusState so the closure is always fresh.
    const applyHoverRef = { fn: null as null | ((id: string | null) => void) };
    const hoverDimHandler = (hoverId: string | null) => {
      if (applyHoverRef.fn) applyHoverRef.fn(hoverId);
    };
    sigma.on('enterNode', ({ node }) => hoverDimHandler(node));
    sigma.on('leaveNode', () => hoverDimHandler(null));
    // Expose setter so the applyFocusState callback can be injected after mount
    (sigma as any)._hoverApplyRef = applyHoverRef;

    // Context menu on right-click
    sigma.on("rightClickNode", ({ node, event }) => {
      event.original.preventDefault();
      const nodeData = nodeLookup.get(node);
      onContextMenu(event.x, event.y, node, nodeData?.name ?? node);
    });
    sigma.on("rightClickStage", () => onContextMenu(0, 0, '', ''));
    sigma.on("clickStage", () => onContextMenu(0, 0, '', ''));

    sigma.on("afterRender", () => {
      const miniMap = miniMapRef.current;
      if (!miniMap) return;
      const context = miniMap.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, miniMap.width, miniMap.height);
      context.fillStyle = 'rgba(10,14,23,0.84)';
      context.fillRect(0, 0, miniMap.width, miniMap.height);

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      graph.forEachNode((id: string, attrs: NodeAttributes) => {
        if (attrs.hidden) return;
        minX = Math.min(minX, Number(attrs.x));
        maxX = Math.max(maxX, Number(attrs.x));
        minY = Math.min(minY, Number(attrs.y));
        maxY = Math.max(maxY, Number(attrs.y));
      });

      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

      const pad = 8;
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const width = miniMap.width - pad * 2;
      const height = miniMap.height - pad * 2;

      graph.forEachNode((id: string, attrs: NodeAttributes) => {
        if (attrs.hidden) return;
        const x = pad + ((Number(attrs.x) - minX) / rangeX) * width;
        const y = pad + ((Number(attrs.y) - minY) / rangeY) * height;
        context.fillStyle = attrs.color ?? '#64748b';
        context.beginPath();
        context.arc(x, y, Math.max(1, Math.min(2.2, Number(attrs.size ?? 2) / 5)), 0, Math.PI * 2);
        context.fill();
      });

      const cameraState = sigma.getCamera().getState();
      const viewportWidth = (1 / cameraState.ratio) * rangeX * 0.38;
      const viewportHeight = (1 / cameraState.ratio) * rangeY * 0.38;
      const viewportX = pad + ((cameraState.x - viewportWidth / 2 - minX) / rangeX) * width;
      const viewportY = pad + ((cameraState.y - viewportHeight / 2 - minY) / rangeY) * height;
      const viewportW = (viewportWidth / rangeX) * width;
      const viewportH = (viewportHeight / rangeY) * height;

      context.strokeStyle = '#22d3ee';
      context.lineWidth = 1.5;
      context.strokeRect(viewportX, viewportY, viewportW, viewportH);
    });

    sigmaRef.current = sigma;
    graphRef.current = graph;
    lastAppliedLayoutRef.current = layoutMode;
    projectSphere();

    return () => {
      cancelled = true;
      if (refreshRafRef.current !== null) {
        cancelAnimationFrame(refreshRafRef.current);
        refreshRafRef.current = null;
      }
      if (moveTimeout) clearTimeout(moveTimeout);
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [visualPayload, vizType, viewMode, onSelect, onHover, projectSphere, communityLookup, showSidebars]);

  // Wire global keyboard zoom/fit shortcuts into the Sigma camera via custom events
  // (App-level keyboard handler doesn't have access to sigmaRef, so we use DOM events)
  useEffect(() => {
    const handleZoom = (event: Event) => {
      const sigma = sigmaRef.current;
      if (!sigma) return;
      const direction = (event as CustomEvent).detail?.direction;
      const camera = sigma.getCamera();
      const state = camera.getState();
      const factor = direction === 'in' ? 0.72 : 1.38;
      camera.animate({ ratio: state.ratio * factor }, { duration: 200 });
    };
    const handleFit = () => {
      const sigma = sigmaRef.current;
      if (!sigma) return;
      sigma.getCamera().animatedReset({ duration: 350 });
    };
    window.addEventListener('codebrain:zoom', handleZoom);
    window.addEventListener('codebrain:fit', handleFit);
    return () => {
      window.removeEventListener('codebrain:zoom', handleZoom);
      window.removeEventListener('codebrain:fit', handleFit);
    };
  }, []); // stable — no deps, reads via ref

  // Track last applied focus so we can undo it cheaply on the next hover
  const lastFocusRef = useRef<{ focusId: string | null; neighbors: Set<string> }>({
    focusId: null,
    neighbors: new Set(),
  });
  const hoverRafRef = useRef<number | null>(null);

  // Helper: apply dim/highlight state for a given focusId to only affected nodes
  const applyFocusState = useCallback((
    graph: any,
    focusId: string | null,
    activeTypes: Set<string>,
    selectedId: string | null,
  ) => {
    const neighbors = new Set<string>();
    if (focusId && graph.hasNode(focusId)) {
      neighbors.add(focusId);
      graph.forEachNeighbor(focusId, (n: string) => neighbors.add(n));
    }
    lastFocusRef.current = { focusId, neighbors };

    graph.forEachNode((id: string, attrs: NodeAttributes) => {
      const node = nodeLookup.get(id);
      const visibleByType = node ? activeTypes.has(node.type) : true;
      const related = !focusId || neighbors.has(id);
      const emphasis = id === selectedId
        ? (vizType === 'vector' ? 1.12 : 1.3)
        : related
          ? (vizType === 'vector' ? 1 : 1.05)
          : (vizType === 'vector' ? 0.82 : 0.7);
      const baseColor = String(attrs.baseColor || attrs.color || "#e2e8f0");

      graph.setNodeAttribute(id, "hidden", !visibleByType);
      const opacity = related ? 1.0 : (focusId ? 0.16 : 0.4);
      graph.setNodeAttribute(
        id, "color",
        depthTintedColor(baseColor, attrs, opacity),
      );
      graph.setNodeAttribute(id, "highlighted", id === selectedId || id === focusId);
      graph.setNodeAttribute(id, "forceLabel", id === selectedId || id === focusId);
      graph.setNodeAttribute(id, "zIndex", id === selectedId ? 10 : related ? 2 : 0);
      graph.setNodeAttribute(id, "size", scaledNodeSize(attrs, emphasis));
    });

    graph.forEachEdge((edgeId: string, attrs: EdgeAttributes, source: string, target: string) => {
      const sourceVisible = !graph.getNodeAttribute(source, "hidden");
      const targetVisible = !graph.getNodeAttribute(target, "hidden");
      const related = !focusId || neighbors.has(source) || neighbors.has(target);
      const baseColor = String(attrs.baseColor || attrs.color || "#64748b");
      const baseSize = Number((attrs as any).baseSize ?? attrs.size ?? 0.8);
      const edgeOpacity = focusId ? (related ? 0.9 : 0.05) : 0.24;
      graph.setEdgeAttribute(edgeId, "hidden", !(sourceVisible && targetVisible));
      graph.setEdgeAttribute(edgeId, "color", hexToRgba(baseColor, edgeOpacity));
      graph.setEdgeAttribute(edgeId, "size", sourceVisible && targetVisible ? (focusId ? (related ? 2.2 : 0.35) : baseSize) : 0.25);
    });
  }, [nodeLookup, vizType]);

  // Selection effect: runs on click, camera animation, and type filter, but not hover.
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;
    if (hasGraphOverlay) return;

    applyFocusState(graph, selectedId, activeTypes, selectedId);

    if (selectedId && graph.hasNode(selectedId) && !cameraLocked) {
      const position = sigma.getNodeDisplayData(selectedId);
      const camera = sigma.getCamera();
      const currentState = camera.getState();
      if (position) {
        const dx = position.x - currentState.x;
        const dy = position.y - currentState.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const viewportRadius = 1 / currentState.ratio;
        if (distance > viewportRadius * 0.6) {
          sigma.getCamera().animate(
            { x: position.x, y: position.y, ratio: Math.min(currentState.ratio, 0.7) },
            { duration: 300 },
          );
        }
      }
    }

    requestAnimationFrame(() => { sigma.refresh(); });
  }, [activeTypes, selectedId, cameraLocked, applyFocusState, hasGraphOverlay]);

  // Hover effect: wired directly into Sigma events (not React state) to avoid
  // re-renders on every mousemove. We inject applyFocusState into the sigma
  // hover ref so the event handler always calls the latest closure.
  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph) return;
    const applyHoverRef = (sigma as any)._hoverApplyRef;
    if (!applyHoverRef) return;

    applyHoverRef.fn = (hoverId: string | null) => {
      if (hasGraphOverlayRef.current) return;
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current);
      // When hovering a node: dim everything except it and its neighbors.
      // When leaving: restore to selection focus (or no focus).
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const effectiveFocus = hoverId ?? selectedId;
        applyFocusState(graph, effectiveFocus, activeTypes, selectedId);
        sigma.refresh();
      });
    };

    return () => {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      if (applyHoverRef) applyHoverRef.fn = null;
    };
  }, [activeTypes, selectedId, applyFocusState]);

  // View mode effect: recolor nodes based on selected visualization mode
  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph) return;
    if (hasGraphOverlay) return;

    graph.forEachNode((id: string) => {
      const nodeData = nodeLookup.get(id);
      if (!nodeData) return;

      let color: string;
      if (vizType === 'flow' && viewMode === 'type') {
        color = colorForViewMode(nodeData, 'folder');
      } else if (viewMode === 'importance') {
        const imp = (nodeData as any).importance ?? nodeData.rank?.score ?? 0;
        // green (low) to amber (mid) to red (high)
        const r = Math.round(255 * Math.min(1, imp * 2));
        const g = Math.round(255 * Math.min(1, (1 - imp) * 2));
        color = `rgb(${r},${g},40)`;
      } else if (viewMode === 'dead') {
        color = nodeData.metadata?.isDead ? '#ef4444' : 'rgba(71,85,105,0.5)';
      } else if (viewMode === 'bridge') {
        color = nodeData.metadata?.isBridge ? '#f59e0b' : 'rgba(71,85,105,0.5)';
      } else if (viewMode === 'folder' || viewMode === 'layer' || viewMode === 'churn') {
        color = colorForViewMode(nodeData, viewMode, churnData);
      } else {
        color = NODE_COLORS[nodeData.type] ?? '#94a3b8';
      }

      graph.setNodeAttribute(id, 'color', color);
      graph.setNodeAttribute(id, 'baseColor', color);
      graph.setNodeAttribute(id, 'color', depthTintedColor(color, {
        depthScale: graph.getNodeAttribute(id, 'depthScale'),
      }));
    });

    // Use requestAnimationFrame to batch refresh and prevent flashing
    requestAnimationFrame(() => {
      sigma.refresh();
    });
  }, [viewMode, vizType, nodeLookup, hasGraphOverlay, churnData]);

  // Search dimming effect: dim non-matching nodes as user types
  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph) return;
    if (hasGraphOverlay) return;

    if (selectedId && searchQuery.length > 0) return;

    if (searchQuery.length === 0) {
      graph.forEachNode((id: string) => {
        const nodeData = nodeLookup.get(id);
        if (!nodeData) return;
        const color = colorForViewMode(nodeData, viewMode, churnData);
        graph.setNodeAttribute(id, 'baseColor', color);
        graph.setNodeAttribute(id, 'color', depthTintedColor(color, {
          depthScale: graph.getNodeAttribute(id, 'depthScale'),
        }));
      });
      requestAnimationFrame(() => {
        sigma.refresh();
      });
      return;
    }

    if (searchQuery.length < 2) {
      return;
    }

    const lower = searchQuery.toLowerCase();
    graph.forEachNode((id: string) => {
      const nodeData = nodeLookup.get(id);
      if (!nodeData) return;

      const matches = nodeData.name?.toLowerCase().includes(lower) ||
        nodeData.fullName?.toLowerCase().includes(lower) ||
        nodeFilePath(nodeData).toLowerCase().includes(lower);

      const baseColor = colorForViewMode(nodeData, viewMode, churnData);
      const color = matches
        ? depthTintedColor(baseColor, { depthScale: graph.getNodeAttribute(id, 'depthScale') })
        : 'rgba(71,85,105,0.2)';
      graph.setNodeAttribute(id, 'color', color);
    });

    // Use requestAnimationFrame to batch refresh and prevent flashing
    requestAnimationFrame(() => {
      sigma.refresh();
    });
  }, [searchQuery, nodeLookup, selectedId, viewMode, hasGraphOverlay, churnData]);

  const overlayWasActiveRef = useRef(false);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    const activeOverlay = pathNodes.size > 0 ? pathNodes : blastNodes;
    const sourceId = pathNodes.size > 0 ? pathSourceId : blastSourceId;
    const mode = pathNodes.size > 0 ? 'path' : 'blast';

    if (activeOverlay.size === 0) {
      if (overlayWasActiveRef.current) {
        overlayWasActiveRef.current = false;
        applyFocusState(graph, selectedId, activeTypes, selectedId);
        requestAnimationFrame(() => sigma.refresh());
      }
      return;
    }

    overlayWasActiveRef.current = true;

    graph.forEachNode((id: string, attrs: NodeAttributes) => {
      const node = nodeLookup.get(id);
      const visibleByType = node ? activeTypes.has(node.type) : true;
      const isSource = id === sourceId;
      const isActive = activeOverlay.has(id);
      const emphasis = mode === 'path'
        ? (isActive ? (isSource ? 1.22 : 1.08) : 0.62)
        : (isSource ? 1.28 : isActive ? 1.04 : 0.68);

      graph.setNodeAttribute(id, 'hidden', !visibleByType);
      graph.setNodeAttribute(id, 'forceLabel', isSource || isActive);
      graph.setNodeAttribute(id, 'highlighted', isSource || isActive);
      graph.setNodeAttribute(id, 'zIndex', isSource ? 20 : isActive ? 12 : 0);

      if (mode === 'path') {
        graph.setNodeAttribute(id, 'color', isActive ? '#22c55e' : 'rgba(71,85,105,0.12)');
      } else {
        // Blast radius: source = gold (the changed file), affected = orange, rest = dimmed
        graph.setNodeAttribute(
          id,
          'color',
          isSource ? '#fbbf24' : isActive ? '#f97316' : 'rgba(71,85,105,0.12)',
        );
      }
      graph.setNodeAttribute(id, 'size', scaledNodeSize(attrs, emphasis));
    });

    graph.forEachEdge((edgeId: string, attrs: EdgeAttributes, source: string, target: string) => {
      const sourceActive = activeOverlay.has(source);
      const targetActive = activeOverlay.has(target);
      const related = sourceActive && targetActive;
      graph.setEdgeAttribute(edgeId, 'hidden', false);
      graph.setEdgeAttribute(edgeId, 'color', related ? (mode === 'path' ? '#22c55e' : '#f97316') : 'rgba(71,85,105,0.08)');
      graph.setEdgeAttribute(edgeId, 'size', related ? 2.6 : 0.35);
    });

    requestAnimationFrame(() => sigma.refresh());
  }, [
    activeTypes,
    applyFocusState,
    blastNodes,
    blastSourceId,
    nodeLookup,
    pathNodes,
    pathSourceId,
    selectedId,
  ]);

  const applyLayout = useCallback((mode: LayoutMode) => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    const container = containerRef.current;
    if (!graph || !sigma || !container) return;
    if (hasGraphOverlayRef.current) return;

    const nodes = graph.nodes().map((id: string) => ({
      id,
      type: nodeLookup.get(id)?.type ?? 'file',
      ...graph.getNodeAttributes(id),
    }));
    if (nodes.length === 0) return;

    const width = Math.max(640, container.offsetWidth || 1);
    const height = Math.max(480, container.offsetHeight || 1);

    if (mode === 'radial') {
      const radius = Math.min(width, height) * 0.35;
      nodes.forEach((node: any, index: number) => {
        const angle = (index / nodes.length) * 2 * Math.PI;
        graph.setNodeAttribute(node.id, 'x', Math.cos(angle) * radius);
        graph.setNodeAttribute(node.id, 'y', Math.sin(angle) * radius);
      });
    } else if (mode === 'hierarchical') {
      const layerOrder: Record<string, number> = {
        project: 0,
        file: 1,
        module: 2,
        class: 3,
        function: 4,
        method: 5,
        route: 6,
        test: 7,
        config: 8,
      };
      const groups = new Map<number, string[]>();
      nodes.forEach((node: any) => {
        const layer = layerOrder[node.type] ?? 4;
        groups.set(layer, [...(groups.get(layer) ?? []), node.id]);
      });
      const ordered = [...groups.entries()].sort(([a], [b]) => a - b);
      const graphWidth = Math.min(width * 0.78, ordered.length * 220);
      const startX = -graphWidth / 2;
      ordered.forEach(([, ids], layerIndex) => {
        const x = startX + ((layerIndex + 0.5) / ordered.length) * graphWidth;
        const layerHeight = Math.min(height * 0.78, Math.max(260, ids.length * 28));
        ids.forEach((id, index) => {
          graph.setNodeAttribute(id, 'x', x);
          graph.setNodeAttribute(id, 'y', -layerHeight / 2 + ((index + 1) / (ids.length + 1)) * layerHeight);
        });
      });
    } else if (mode === 'grid') {
      const columns = Math.ceil(Math.sqrt(nodes.length));
      const rows = Math.ceil(nodes.length / columns);
      const cellWidth = Math.min(120, width / Math.max(1, columns));
      const cellHeight = Math.min(90, height / Math.max(1, rows));
      nodes.forEach((node: any, index: number) => {
        graph.setNodeAttribute(node.id, 'x', (index % columns - (columns - 1) / 2) * cellWidth);
        graph.setNodeAttribute(node.id, 'y', (Math.floor(index / columns) - (rows - 1) / 2) * cellHeight);
      });
    } else {
      const inferred = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: Math.min(120, Math.max(40, graph.order)),
        settings: { ...inferred, gravity: 0.05, scalingRatio: 18, adjustSizes: true },
      });
    }

    graph.forEachNode((id: string, attrs: NodeAttributes) => {
      graph.setNodeAttribute(id, 'baseX', attrs.x);
      graph.setNodeAttribute(id, 'baseY', attrs.y);
      graph.setNodeAttribute(id, 'baseZ', attrs.z ?? 0);
    });
    sigma.getCamera().animatedReset({ duration: 400 });
    projectSphere();
    sigma.refresh();
  }, [nodeLookup, projectSphere]);

  useEffect(() => {
    if (lastAppliedLayoutRef.current === layoutMode) return;
    lastAppliedLayoutRef.current = layoutMode;
    applyLayout(layoutMode);
  }, [applyLayout, layoutMode]);

  const isSigmaViz = vizType === 'symbols' || vizType === 'vector';
  const isTreemapViz = vizType === 'treemap';
  const isD3Viz = !isSigmaViz && !isTreemapViz;

  const withD3Viewport = (action: (svg: any, zoomBehavior: any) => void, warning: string) => {
    const svg = d3SvgRef.current;
    const zoomBehavior = d3ZoomRef.current;
    if (!svg || !zoomBehavior) {
      console.warn(warning);
      return;
    }
    action(svg, zoomBehavior);
  };

  const exportPNG = () => {
    try {
      if (isSigmaViz) {
        const sigma = sigmaRef.current;
        if (!sigma) {
          console.warn('Export PNG: Sigma instance not found');
          alert('Cannot export: Graph not fully loaded. Please wait and try again.');
          return;
        }
        const canvas = sigma.getContainer().querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) {
          console.warn('Export PNG: Canvas element not found');
          alert('Cannot export: Canvas not found. Please try again.');
          return;
        }
        const output = document.createElement('canvas');
        output.width = canvas.width;
        output.height = canvas.height;
        const context = output.getContext('2d');
        if (!context) {
          alert('Cannot export: Failed to create canvas context.');
          return;
        }
        context.fillStyle = '#0a0e17';
        context.fillRect(0, 0, output.width, output.height);
        context.drawImage(canvas, 0, 0);
        const link = document.createElement('a');
        link.download = `code-brain-${vizType}.png`;
        link.href = output.toDataURL('image/png');
        link.click();
        console.info('✓ PNG exported successfully');
        showNotification('✓ PNG exported successfully');
      } else {
        const container = d3StageRef.current;
        if (!container) {
          console.warn('Export PNG: Container not found');
          alert('Cannot export: Graph container not found. Please try again.');
          return;
        }
        const svg = container.querySelector('svg');
        if (!svg) {
          console.warn('Export PNG: SVG element not found in container');
          alert('Cannot export: SVG not found. Make sure the graph is fully rendered.');
          return;
        }
        const serializer = new XMLSerializer();
        let svgStr = serializer.serializeToString(svg);
        
        if (!svgStr.includes('background-color')) {
          svgStr = svgStr.replace('<svg ', '<svg style="background-color:#0a0e17;" ');
        }

        const img = new Image();
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        img.onload = () => {
          const output = document.createElement('canvas');
          output.width = svg.clientWidth || 1920;
          output.height = svg.clientHeight || 1080;
          const context = output.getContext('2d');
          if (!context) {
            alert('Cannot export: Failed to create canvas context.');
            URL.revokeObjectURL(url);
            return;
          }
          context.fillStyle = '#0a0e17';
          context.fillRect(0, 0, output.width, output.height);
          context.drawImage(img, 0, 0);
          
          const link = document.createElement('a');
          link.download = `code-brain-${vizType}.png`;
          link.href = output.toDataURL('image/png');
          link.click();
          URL.revokeObjectURL(url);
          console.info('✓ PNG exported successfully');
          showNotification('✓ PNG exported successfully');
        };
        img.onerror = () => {
          console.error('Export PNG: Failed to load SVG as image');
          alert('Failed to export PNG. The graph may be too complex. Try exporting as SVG instead.');
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    } catch (error) {
      console.error('Failed to export PNG:', error);
      alert('Failed to export PNG. Check console for details.');
    }
  };

  const exportJSON = () => {
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        vizType,
        nodes: visualPayload.nodes.map(n => ({
          id: n.id,
          name: n.name,
          type: n.type,
          file: n.file,
          degree: n.degree,
          rank: n.rank?.score,
          folder: topFolder(n),
          isDead: n.metadata?.isDead,
          isBridge: n.metadata?.isBridge,
        })),
        edges: visualPayload.edges.map(e => ({
          id: e.id,
          from: e.from,
          to: e.to,
          type: e.type,
          resolved: e.resolved,
        })),
        stats: visualPayload.stats,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.download = 'code-brain-graph.json';
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      console.info('✓ Graph JSON exported successfully');
      showNotification('✓ Graph JSON exported successfully');
    } catch (error) {
      console.error('Failed to export JSON:', error);
      alert('Failed to export JSON. Check console for details.');
    }
  };

  const exportAIJSON = async () => {
    try {
      console.info('Fetching AI export from server...');
      
      // Call the backend API endpoint with no token limit for full export
      // This matches the CLI behavior when no maxTokens is specified
      const response = await fetch('/api/export/ai?maxTokens=200000');
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Server returned ${response.status}`);
      }
      
      const aiBundle = await response.json();
      
      // Download the AI export
      const blob = new Blob([JSON.stringify(aiBundle, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.download = 'code-brain-ai-analysis.json';
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      console.info('✓ AI-optimized JSON exported successfully (codebrain-ai/v3-hierarchical format)');
      showNotification('✓ AI JSON exported successfully');
    } catch (error) {
      console.error('Failed to export AI JSON:', error);
      alert(`Failed to export AI JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const exportMarkdown = () => {
    try {
      const nodes = visualPayload.nodes;
      const topHubs = [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 15);
      const deadNodes = nodes.filter(n => n.metadata?.isDead);
      const bridgeNodes = nodes.filter(n => n.metadata?.isBridge);
      const cycles = visualPayload.analytics?.cycles ?? [];

      const lines = [
        `# Code-Brain Graph Report`,
        ``,
        `> Generated: ${new Date().toLocaleString()}`,
        ``,
        `## Overview`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Nodes | ${nodes.length} |`,
        `| Edges | ${visualPayload.edges.length} |`,
        `| Clusters | ${visualPayload.analytics?.communities?.length ?? 0} |`,
        `| Unresolved Edges | ${visualPayload.analytics?.health?.unresolvedEdges ?? 0} |`,
        ``,
        `## Top Signal Hubs (by degree)`,
        ``,
        ...topHubs.map(n => `- **${n.name}** (${n.type}) — degree ${n.degree}, rank ${n.rank?.score?.toFixed(3) ?? 'n/a'}`),
        ``,
        deadNodes.length > 0 ? `## Dead Code (${deadNodes.length} nodes)` : '',
        deadNodes.length > 0 ? `` : '',
        ...deadNodes.slice(0, 20).map(n => `- ${n.name} (${n.file ?? 'unknown'})`),
        deadNodes.length > 0 ? `` : '',
        bridgeNodes.length > 0 ? `## Bridge Nodes (${bridgeNodes.length} critical connectors)` : '',
        bridgeNodes.length > 0 ? `` : '',
        ...bridgeNodes.slice(0, 10).map(n => `- **${n.name}** — removing this breaks graph connectivity`),
        bridgeNodes.length > 0 ? `` : '',
        cycles.length > 0 ? `## Circular Dependencies (${cycles.length})` : '',
        cycles.length > 0 ? `` : '',
        ...cycles.slice(0, 10).map((cycle: string[], i: number) => `${i + 1}. ${cycle.join(' → ')}`),
      ].filter(l => l !== undefined);

      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
      const link = document.createElement('a');
      link.download = 'code-brain-report.md';
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      console.info('✓ Markdown report exported successfully');
      showNotification('✓ Markdown report exported successfully');
    } catch (error) {
      console.error('Failed to export Markdown:', error);
      alert('Failed to export Markdown. Check console for details.');
    }
  };

  const exportSVG = () => {
    try {
      const container = d3StageRef.current;
      if (!container) {
        console.warn('Export SVG: Container not found');
        alert('Cannot export: Graph container not found. Please try again.');
        return;
      }
      const svg = container.querySelector('svg');
      if (!svg) {
        console.warn('Export SVG: SVG element not found in container');
        alert('Cannot export: SVG not found. Make sure the graph is fully rendered.');
        return;
      }
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const link = document.createElement('a');
      link.download = `code-brain-${vizType}.svg`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      console.info('✓ SVG exported successfully');
      showNotification('✓ SVG exported successfully');
    } catch (error) {
      console.error('Failed to export SVG:', error);
      alert('Failed to export SVG. Check console for details.');
    }
  };

  useEffect(() => {
    const container = d3StageRef.current;
    if (!container || vizType === 'symbols' || vizType === 'vector' || vizType === 'treemap') {
      // Clear refs when not using D3 visualizations
      if (vizType === 'symbols' || vizType === 'vector' || vizType === 'treemap') {
        d3SvgRef.current = null;
        d3ZoomRef.current = null;
      }
      return;
    }

    const rect = container.getBoundingClientRect();
    const width = Math.max(720, rect.width || 1);
    const height = Math.max(520, rect.height || 1);
    const nodes = visualPayload.nodes.map((node) => ({
      ...node,
      folder: topFolder(node),
      folderPath: folderLabel(node),
      weight: fileWeight(node),
      radius: Math.max(7, Math.min(30, 7 + Math.sqrt(node.degree || 1) * 2.6)),
    }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const links = visualPayload.edges
      .map((edge) => ({
        ...edge,
        sourceNode: nodeById.get(edge.from),
        targetNode: nodeById.get(edge.to),
        weight: Number(edge.metadata?.count ?? 1),
      }))
      .filter((edge) => edge.sourceNode && edge.targetNode);

    let simulation: d3.Simulation<any, undefined> | null = null;
    container.innerHTML = '';

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img');

    const rootLayer = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.12, 8])
      .on('zoom', (event) => rootLayer.attr('transform', event.transform));
    svg.call(zoom as any);
    d3ZoomRef.current = zoom;
    d3SvgRef.current = svg;
    d3NodesRef.current = nodes;

    const selectNode = (node: GraphNode) => onSelect(selectSourceNodeId(node));

    const drawForceGraph = () => {
      const isVein = vizType === 'vein';
      const linkLayer = rootLayer.append('g').attr('class', 'codeflow-links');
      const hullLayer = rootLayer.append('g').attr('class', 'codeflow-hulls');
      const nodeLayer = rootLayer.append('g').attr('class', 'codeflow-nodes');
      const labelLayer = rootLayer.append('g').attr('class', 'codeflow-labels');

      const graphLinks = links.map((edge) => ({
        ...edge,
        source: edge.sourceNode!.id,
        target: edge.targetNode!.id,
      }));

      const linkSelection = linkLayer
        .selectAll('path')
        .data(graphLinks)
        .join('path')
        .attr('fill', 'none')
        .attr('stroke', (edge) => folderColor(edge.sourceNode!.folder, edge.resolved ? 0.48 : 0.28))
        .attr('stroke-width', (edge) => Math.max(0.8, Math.min(3.5, Math.sqrt(edge.weight))))
        .attr('stroke-opacity', 0.52);

      const getRadius = (node: any) => isVein ? Math.max(4, Math.min(18, node.radius * 0.6)) : node.radius;

      const nodeSelection = nodeLayer
        .selectAll('circle')
        .data(nodes)
        .join('circle')
        .attr('r', getRadius)
        .attr('fill', (node) => folderColor(node.folder, 0.95))
        .attr('stroke', '#071018')
        .attr('stroke-width', isVein ? 1.5 : 2.4)
        .style('cursor', 'pointer')
        .on('click', (_event, node) => selectNode(node));

      nodeSelection.append('title').text((node) => `${nodeFilePath(node)}\n${node.degree} links`);

      const labels = labelLayer
        .selectAll('text')
        .data(nodes.filter((node) => getRadius(node) > (isVein ? 8 : 11) || (node.degree ?? 0) > 2))
        .join('text')
        .attr('fill', isVein ? '#eee' : '#e5edf9')
        .attr('font-size', (node) => isVein ? Math.max(6, Math.min(10, getRadius(node) * 0.6)) : (getRadius(node) > 20 ? 14 : 11))
        .attr('font-weight', isVein ? 500 : 700)
        .attr('paint-order', 'stroke')
        .attr('stroke', isVein ? 'none' : 'rgba(2,6,23,0.8)')
        .attr('stroke-width', isVein ? 0 : 3)
        .attr('text-anchor', 'middle')
        .attr('pointer-events', 'none')
        .text((node) => {
          const name = node.name.replace(/\.[^.]+$/, '');
          return isVein ? (name.length > Math.max(4, Math.floor(getRadius(node) / 2)) + 1 ? name.slice(0, Math.max(4, Math.floor(getRadius(node) / 2))) + '…' : name) : truncateMiddle(node.name, getRadius(node) > 18 ? 18 : 12);
        });

      const getClusterKey = (node: any) => {
        if (!isVein) return node.folderPath || 'root';
        
        if (viewMode === 'layer') return node.layer || 'Unknown Layer';
        if (viewMode === 'type') {
          const name = node.name || '';
          return name.includes('.') ? name.split('.').pop() : 'folder';
        }
        if (viewMode === 'dead') return node.degree === 0 ? 'Dead' : 'Active';
        if (viewMode === 'bridge') return (node.degree || 0) > 10 ? 'Hub' : 'Node';
        
        // For 'folder', 'importance', or default: group by physical folder structure
        const fullPath = nodeFilePath(node);
        if (fullPath) {
          const parts = fullPath.split(/[\\/]/).filter(Boolean);
          if (parts.length > 1) return parts.slice(0, -1).join('/');
        }
        return 'root';
      };

      const drawHulls = () => {
        const grouped = d3.group(nodes, getClusterKey);
        // Enhanced styling for vein graph
        const pad = isVein ? 40 : 30;
        const fillOpacity = isVein ? 0.08 : 0.04;
        const strokeOpacity = isVein ? 0.5 : 0.25;
        const strokeWidth = isVein ? 2.5 : 2;
        const fontSize = isVein ? 11 : 10;
        const fontWeight = isVein ? 700 : 600;

        const hulls = [...grouped.entries()]
          .map(([clusterKey, groupNodes]) => {
            const points: [number, number][] = [];
            groupNodes.forEach((node: any) => {
              if (isVein) {
                // Circular point distribution for softer organic boundaries
                for(let i = 0; i < 8; i++) {
                  const angle = (i / 8) * Math.PI * 2;
                  points.push([node.x + Math.cos(angle) * pad, node.y + Math.sin(angle) * pad]);
                }
              } else {
                points.push(
                  [node.x - pad, node.y - pad],
                  [node.x + pad, node.y - pad],
                  [node.x + pad, node.y + pad],
                  [node.x - pad, node.y + pad],
                );
              }
            });
            const hull = d3.polygonHull(points);
            if (!hull) return null;
            const cx = d3.mean(groupNodes, (node: any) => node.x) ?? 0;
            // Position label at TOP of hull (like codeflow), not center
            const cy = d3.min(groupNodes, (node: any) => node.y) ?? 0;
            return { folder: clusterKey, hull, cx, cy, color: folderColor(clusterKey) };
          })
          .filter(Boolean) as Array<{ folder: string; hull: [number, number][]; cx: number; cy: number; color: string }>;

        const hullGroup = hullLayer.selectAll('g').data(hulls, (datum: any) => datum.folder).join('g');
        hullGroup
          .selectAll('path')
          .data((datum) => [datum])
          .join('path')
          .attr('d', (datum) => isVein ? `${d3.line<[number, number]>().curve(d3.curveCatmullRomClosed)(datum.hull)}` : `${d3.line<[number, number]>()(datum.hull)}Z`)
          .attr('fill', (datum) => hexToRgba(datum.color, fillOpacity))
          .attr('stroke', (datum) => hexToRgba(datum.color, strokeOpacity))
          .attr('stroke-width', strokeWidth)
          .attr('filter', isVein ? 'drop-shadow(0px 8px 16px rgba(0,0,0,0.3))' : null);
          
        hullGroup
          .selectAll('text')
          .data((datum) => [datum])
          .join('text')
          .attr('x', (datum) => datum.cx)
          .attr('y', (datum) => datum.cy - pad - (isVein ? 12 : 8))
          .attr('fill', (datum) => datum.color)
          .attr('font-size', fontSize)
          .attr('font-weight', fontWeight)
          .attr('text-anchor', 'middle')
          .attr('paint-order', 'stroke')
          .attr('stroke', 'rgba(2,6,23,0.85)')
          .attr('stroke-width', isVein ? 5 : 4)
          .attr('style', `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; letter-spacing: ${isVein ? '0.08em' : '0'}; text-transform: uppercase;`)
          .text((datum) => {
            const label = datum.folder === 'root' ? 'ROOT' : datum.folder.split(/[\\\/]/).pop() || datum.folder;
            return truncateMiddle(label, 28);
          });
      };


      const folderGroups = [...new Set(nodes.map(n => getClusterKey(n)))];
      const cols = Math.max(2, Math.ceil(Math.sqrt(folderGroups.length)));
      const cw = width / (cols + 1);
      const ch = height / (Math.ceil(folderGroups.length / cols) + 1);
      const centers: Record<string, { x: number; y: number }> = {};
      folderGroups.forEach((f, i) => {
        centers[f] = { x: (i % cols + 1) * cw, y: (Math.floor(i / cols) + 1) * ch };
      });

      let forceLinkDist: any = (edge: any) => isVein ? 90 : (80 + Math.min(80, edge.weight * 8));
      let forceLinkStrength = isVein ? 0.3 : 0.28;
      let forceCharge = isVein ? -350 : -210;
      let forceChargeMax = isVein ? 500 : 1000;
      let collideRadius: any = (node: any) => node.radius + (isVein ? 20 : 13);
      
      let xForce = d3.forceX<any>((node) => isVein && centers[getClusterKey(node)] ? centers[getClusterKey(node)].x : width * (0.2 + (stableNumber(node.folderPath) % 600) / 1000)).strength(isVein ? 0.18 : 0.035);
      let yForce = d3.forceY<any>((node) => isVein && centers[getClusterKey(node)] ? centers[getClusterKey(node)].y : height * (0.18 + (stableNumber(`${node.folderPath}:y`) % 640) / 1000)).strength(isVein ? 0.18 : 0.035);

      if (layoutMode === 'radial') {
        const r = Math.min(width, height) * 0.35;
        nodes.forEach((n: any, i: number) => {
          const angle = (i / nodes.length) * 2 * Math.PI;
          n.targetX = width / 2 + Math.cos(angle) * r;
          n.targetY = height / 2 + Math.sin(angle) * r;
        });
        forceLinkDist = () => isVein ? 45 : 40;
        forceLinkStrength = 0.05;
        forceCharge = isVein ? -100 : -60;
        collideRadius = (node: any) => node.radius + 8;
        xForce = d3.forceX<any>((node) => node.targetX).strength(0.8);
        yForce = d3.forceY<any>((node) => node.targetY).strength(0.8);
      } else if (layoutMode === 'hierarchical') {
        const clusters = [...new Set(nodes.map(n => getClusterKey(n)))].sort((a, b) => a.localeCompare(b));
        const numCols = Math.max(3, Math.ceil(Math.sqrt(clusters.length / 1.5)));
        const colW = width / (numCols + 1);
        
        const clusterNodes: Record<string, any[]> = {};
        nodes.forEach((n: any) => {
          const c = getClusterKey(n);
          if (!clusterNodes[c]) clusterNodes[c] = [];
          clusterNodes[c].push(n);
        });

        const clustersInCol: string[][] = Array.from({ length: numCols }, () => []);
        clusters.forEach((c, i) => clustersInCol[i % numCols].push(c));

        clustersInCol.forEach((colClusters, colIndex) => {
          const targetX = (colIndex + 1) * colW;
          let currentY = 100;
          
          colClusters.forEach((c) => {
            const g = clusterNodes[c];
            const clusterHeight = g.length * 30;
            const clusterCenterY = currentY + clusterHeight / 2;
            
            g.forEach((n: any, ni: number) => {
              n.targetX = targetX;
              const yOffset = (ni - g.length / 2) * 25; 
              n.targetY = clusterCenterY + yOffset;
            });
            
            currentY += clusterHeight + 100; // Gap between clusters
          });
        });

        forceLinkDist = () => isVein ? 30 : 40;
        forceLinkStrength = 0.15;
        forceCharge = isVein ? -120 : -80;
        forceChargeMax = 300;
        collideRadius = (node: any) => node.radius + 15;
        xForce = d3.forceX<any>((node) => node.targetX || width / 2).strength(0.85);
        yForce = d3.forceY<any>((node) => node.targetY || height / 2).strength(0.7);
      } else if (layoutMode === 'grid') {
        const gridCols = Math.ceil(Math.sqrt(nodes.length));
        const cellW = width / (gridCols + 1);
        const cellH = height / (Math.ceil(nodes.length / gridCols) + 1);
        nodes.forEach((n: any, i: number) => {
          n.targetX = (i % gridCols + 1) * cellW;
          n.targetY = (Math.floor(i / gridCols) + 1) * cellH;
        });
        forceLinkDist = () => isVein ? 135 : 120;
        forceLinkStrength = 0.02;
        collideRadius = (node: any) => node.radius + 15;
        xForce = d3.forceX<any>((node) => node.targetX).strength(1);
        yForce = d3.forceY<any>((node) => node.targetY).strength(1);
      }

      simulation = d3.forceSimulation(nodes as any[])
        .force('link', d3.forceLink(graphLinks as any[]).id((datum: any) => datum.id).distance(forceLinkDist).strength(forceLinkStrength))
        .force('charge', d3.forceManyBody().strength(forceCharge).distanceMax(forceChargeMax))
        .force('center', layoutMode === 'force' && !isVein ? d3.forceCenter(width / 2, height / 2) : null)
        .force('collide', d3.forceCollide<any>(collideRadius))
        .force('x', xForce)
        .force('y', yForce)
        .on('tick', () => {
          linkSelection.attr('d', (edge: any) => {
            const sx = edge.source.x;
            const sy = edge.source.y;
            const tx = edge.target.x;
            const ty = edge.target.y;
            const mx = (sx + tx) / 2;
            const my = (sy + ty) / 2 - Math.min(90, Math.hypot(tx - sx, ty - sy) * 0.18);
            return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
          });
          nodeSelection.attr('cx', (node: any) => node.x).attr('cy', (node: any) => node.y);
          labels.attr('x', (node: any) => node.x).attr('y', (node: any) => node.y + 4);
          drawHulls();
        });
    };

    const drawMatrix = () => {
      const maxMatrixNodes = Math.min(nodes.length, width < 1100 ? 72 : 108);
      const ordered = [...nodes]
        .sort((a, b) =>
          a.folder.localeCompare(b.folder) ||
          topFolder(a).localeCompare(topFolder(b)) ||
          (b.degree ?? 0) - (a.degree ?? 0) ||
          a.name.localeCompare(b.name)
        )
        .slice(0, maxMatrixNodes);
      const indexById = new Map(ordered.map((node, index) => [node.id, index]));
      const margin = { top: 136, right: 40, bottom: 44, left: 196 };
      const cell = Math.max(10, Math.min(26, Math.floor(Math.min(width - margin.left - margin.right, height - margin.top - margin.bottom) / Math.max(1, ordered.length))));
      const grid = rootLayer.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const matrixSize = ordered.length * cell;
      const folderBreaks: Array<{ folder: string; start: number; end: number }> = [];

      ordered.forEach((node, index) => {
        const folder = node.folder;
        const current = folderBreaks[folderBreaks.length - 1];
        if (!current || current.folder !== folder) {
          folderBreaks.push({ folder, start: index, end: index });
        } else {
          current.end = index;
        }
      });

      rootLayer.append('text')
        .attr('x', 24)
        .attr('y', 34)
        .attr('fill', '#22d3ee')
        .attr('font-size', 13)
        .attr('font-weight', 760)
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(2,6,23,0.92)')
        .attr('stroke-width', 3)
        .text(`Dependency matrix • ${ordered.length} most connected files • Click labels or cells to inspect`);

      rootLayer.append('text')
        .attr('x', 24)
        .attr('y', 54)
        .attr('fill', '#7d8594')
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .text(`Rows are sources, columns are targets. Grouped by folder for easier scanning.`);

      grid.append('rect')
        .attr('x', -1)
        .attr('y', -1)
        .attr('width', matrixSize + 2)
        .attr('height', matrixSize + 2)
        .attr('rx', 10)
        .attr('fill', 'rgba(8,12,20,0.45)')
        .attr('stroke', 'rgba(148,163,184,0.12)');

      grid
        .selectAll('rect.bg')
        .data(ordered.flatMap((row, y) => ordered.map((col, x) => ({ row, col, x, y }))))
        .join('rect')
        .attr('x', (datum) => datum.x * cell)
        .attr('y', (datum) => datum.y * cell)
        .attr('width', cell - 1)
        .attr('height', cell - 1)
        .attr('rx', 2)
        .attr('fill', (datum) => datum.x === datum.y ? 'rgba(56,189,248,0.08)' : 'rgba(148,163,184,0.05)');

      grid.append('g')
        .selectAll('path.folder-break-row')
        .data(folderBreaks)
        .join('path')
        .attr('d', (datum) => `M0,${datum.start * cell - 4} H${matrixSize}`)
        .attr('stroke', 'rgba(34,211,238,0.18)')
        .attr('stroke-width', 1);

      grid.append('g')
        .selectAll('path.folder-break-col')
        .data(folderBreaks)
        .join('path')
        .attr('d', (datum) => `M${datum.start * cell - 4},0 V${matrixSize}`)
        .attr('stroke', 'rgba(34,211,238,0.18)')
        .attr('stroke-width', 1);

      const cellLinks = links
        .map((edge) => ({ edge, x: indexById.get(edge.from), y: indexById.get(edge.to) }))
        .filter((datum) => datum.x !== undefined && datum.y !== undefined);

      const rowHighlight = grid.append('rect')
        .attr('fill', 'rgba(34,211,238,0.08)')
        .attr('rx', 6)
        .style('display', 'none')
        .style('pointer-events', 'none');

      const colHighlight = grid.append('rect')
        .attr('fill', 'rgba(34,211,238,0.08)')
        .attr('rx', 6)
        .style('display', 'none')
        .style('pointer-events', 'none');

      const showMatrixHighlight = (index: number) => {
        rowHighlight
          .style('display', null)
          .attr('x', -4)
          .attr('y', index * cell - 4)
          .attr('width', matrixSize + 8)
          .attr('height', cell + 8);
        colHighlight
          .style('display', null)
          .attr('x', index * cell - 4)
          .attr('y', -4)
          .attr('width', cell + 8)
          .attr('height', matrixSize + 8);
      };

      const hideMatrixHighlight = () => {
        rowHighlight.style('display', 'none');
        colHighlight.style('display', 'none');
      };

      const linkCells = grid
        .selectAll('rect.link')
        .data(cellLinks)
        .join('rect')
        .attr('x', (datum) => Number(datum.x) * cell)
        .attr('y', (datum) => Number(datum.y) * cell)
        .attr('width', cell - 1)
        .attr('height', cell - 1)
        .attr('rx', 3)
        .attr('fill', (datum) => folderColor(datum.edge.sourceNode!.folder, Math.min(0.92, 0.42 + datum.edge.weight * 0.08)))
        .attr('stroke', (datum) => datum.x === datum.y ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.14)')
        .attr('stroke-width', (datum) => datum.x === datum.y ? 1.2 : 0.6)
        .style('cursor', 'pointer')
        .on('mouseenter', (_event, datum) => {
          showMatrixHighlight(Number(datum.y));
          d3.selectAll<SVGRectElement, any>('rect.link')
            .attr('opacity', 0.16);
          d3.selectAll<SVGTextElement, any>('text.matrix-label')
            .attr('fill', '#6b7280');
          linkCells
            .filter((d: any) => d.x === datum.x || d.y === datum.y)
            .attr('opacity', 1);
          rowLabels
            .filter((_d: any, i: number) => i === datum.y)
            .attr('fill', '#22d3ee');
          colLabels
            .filter((_d: any, i: number) => i === datum.x)
            .attr('fill', '#22d3ee');
        })
        .on('mouseleave', () => {
          hideMatrixHighlight();
          linkCells.attr('opacity', 1);
          rowLabels.attr('fill', '#9fb2c9');
          colLabels.attr('fill', '#9fb2c9');
        })
        .on('click', (_event, datum) => onSelect(selectSourceNodeId(datum.edge.sourceNode!)));

      linkCells.append('title')
        .text((datum) => `${datum.edge.sourceNode!.name} -> ${datum.edge.targetNode!.name}\n${datum.edge.weight} connections`);

      const rowLabels = grid
        .append('g')
        .selectAll('text.row')
        .data(ordered)
        .join('text')
        .attr('class', 'matrix-label')
        .attr('x', -14)
        .attr('y', (_node, index) => index * cell + cell * 0.72)
        .attr('text-anchor', 'end')
        .attr('fill', '#9fb2c9')
        .attr('font-size', 12)
        .attr('font-weight', (node) => (node.degree ?? 0) > 10 ? 700 : 560)
        .style('cursor', 'pointer')
        .text((node) => truncateMiddle(relativeLabel(node.fullName || node.file || node.name), 22))
        .on('mouseenter', (_event, node) => showMatrixHighlight(indexById.get(node.id) ?? 0))
        .on('mouseleave', hideMatrixHighlight)
        .on('click', (_event, node) => onSelect(selectSourceNodeId(node)));

      const colLabels = grid
        .append('g')
        .selectAll('text.col')
        .data(ordered)
        .join('text')
        .attr('class', 'matrix-label')
        .attr('transform', (_node, index) => `translate(${index * cell + cell * 0.6},-16) rotate(-50)`)
        .attr('text-anchor', 'start')
        .attr('fill', '#9fb2c9')
        .attr('font-size', 12)
        .attr('font-weight', (node) => (node.degree ?? 0) > 10 ? 700 : 560)
        .style('cursor', 'pointer')
        .text((node) => truncateMiddle(relativeLabel(node.fullName || node.file || node.name), 22))
        .on('mouseenter', (_event, node) => showMatrixHighlight(indexById.get(node.id) ?? 0))
        .on('mouseleave', hideMatrixHighlight)
        .on('click', (_event, node) => onSelect(selectSourceNodeId(node)));

      rootLayer.append('text')
        .attr('x', margin.left)
        .attr('y', margin.top - 96)
        .attr('fill', '#94a3b8')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('letter-spacing', '0.08em')
        .text('TARGET FILES');

      rootLayer.append('text')
        .attr('transform', `translate(${margin.left - 156},${margin.top + matrixSize / 2}) rotate(-90)`)
        .attr('fill', '#94a3b8')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('letter-spacing', '0.08em')
        .text('SOURCE FILES');
    };

    const drawTree = () => {
      const root: any = { name: 'root', children: [], path: 'root', branchCount: 0, leafCount: 0 };
      const ensureChild = (parent: any, name: string, path: string) => {
        parent.children ??= [];
        let child = parent.children.find((item: any) => item.name === name);
        if (!child) {
          child = { name, path, children: [], branchCount: 0, leafCount: 0 };
          parent.children.push(child);
        }
        return child;
      };

      const toProjectParts = (node: GraphNode): string[] => {
        const relativeNameParts = node.name && /[\\/]/.test(node.name) ? pathParts(node.name) : [];
        const fullNameParts = node.fullName && /[\\/]/.test(node.fullName) ? pathParts(node.fullName) : [];
        const rawParts = relativeNameParts.length > 1 ? relativeNameParts : (fullNameParts.length > 1 ? fullNameParts : pathParts(nodeFilePath(node)));
        const markers = ['src', 'ui', 'api', 'python', 'tests', 'test-languages', 'vscode-extension', 'docs', 'templates', 'dist'];
        const markerIndex = rawParts.findIndex((part) => markers.includes(part.toLowerCase()));
        if (markerIndex >= 0) return rawParts.slice(markerIndex).slice(0, 5);

        const repoIndex = rawParts.findIndex((part) => part.toLowerCase() === 'code-brain');
        if (repoIndex >= 0 && repoIndex < rawParts.length - 1) return rawParts.slice(repoIndex + 1).slice(0, 5);

        return rawParts.slice(-3).slice(0, 5);
      };

      nodes.forEach((node) => {
        const parts = toProjectParts(node);
        if (parts.length === 0) return;
        let cursor = root;
        parts.forEach((part, index) => {
          const path = parts.slice(0, index + 1).join('/');
          cursor = ensureChild(cursor, part, path);
          cursor.branchCount = (cursor.branchCount || 0) + (index < parts.length - 1 ? 1 : 0);
          cursor.leafCount = (cursor.leafCount || 0) + (index === parts.length - 1 ? 1 : 0);
        });
        cursor.node = node;
        delete cursor.children;
      });

      const initialExpanded = new Set(expandedTreePaths);
      if (initialExpanded.size === 1 && initialExpanded.has('root')) {
        (root.children || [])
          .slice()
          .sort((a: any, b: any) => (b.leafCount || 0) - (a.leafCount || 0))
          .slice(0, width < 1100 ? 3 : 4)
          .forEach((child: any) => initialExpanded.add(child.path));
      }

      const hierarchy = d3.hierarchy(root, (datum: any) => {
        const children = [...(datum.children || [])]
          .sort((a: any, b: any) => (b.leafCount || 0) - (a.leafCount || 0) || a.name.localeCompare(b.name));
        if (datum.path === 'root') return children;
        if (datum.node) return undefined;
        return initialExpanded.has(datum.path) ? children : undefined;
      });

      const descendants = hierarchy.descendants();
      const hasHiddenDescendants = new Set<string>();
      descendants.forEach((datum) => {
        if (!datum.data.children?.length || datum.data.node) return;
        if (!initialExpanded.has(datum.data.path) && datum.data.path !== 'root') {
          hasHiddenDescendants.add(datum.data.path);
        }
      });

      const tree = d3.tree<any>()
        .nodeSize([30, Math.max(150, Math.min(240, width / Math.max(3.2, hierarchy.height + 1)))])
        .separation((a, b) => a.parent === b.parent ? 1.15 : 1.5);
      tree(hierarchy);
      const allDesc = hierarchy.descendants();
      const minX = d3.min(allDesc, (datum) => datum.x) ?? 0;
      const maxX = d3.max(allDesc, (datum) => datum.x) ?? 0;
      const contentHeight = Math.max(1, maxX - minX);
      const initialScale = 1; // Always use scale 1, let user zoom as needed
      const group = rootLayer.append('g').attr('transform', `translate(96,${Math.max(84, (height - contentHeight * initialScale) / 2) - minX * initialScale}) scale(${initialScale})`);
      const linkGen = d3.linkHorizontal<any, any>().x((datum) => datum.y).y((datum) => datum.x);

      group.selectAll('path')
        .data(hierarchy.links())
        .join('path')
        .attr('d', linkGen)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(148,163,184,0.2)') // Increased opacity from 0.14 to 0.2
        .attr('stroke-width', 2); // Increased from 1.6 to 2

      const treeNodes = group.selectAll('g.node')
        .data(hierarchy.descendants())
        .join('g')
        .attr('class', 'tree-node')
        .attr('transform', (datum) => `translate(${datum.y},${datum.x})`)
        .style('cursor', (datum) => (datum.data.node || datum.data.children?.length) ? 'pointer' : 'default')
        .on('click', (_event, datum) => {
          if (datum.data.node) {
            selectNode(datum.data.node);
            return;
          }
          if (datum.data.children?.length) {
            setExpandedTreePaths((current) => {
              const next = new Set(current);
              if (next.has(datum.data.path)) next.delete(datum.data.path);
              else next.add(datum.data.path);
              next.add('root');
              return next;
            });
          }
        })
        .on('mouseenter', function(event, datum) {
          // Highlight the node on hover
          d3.select(this).select('circle')
            .transition()
            .duration(150)
            .attr('r', (d: any) => d.data.node ? 10 : d.data.children?.length ? 9 : 7)
            .attr('stroke-width', 3.5);
          d3.select(this).select('text')
            .transition()
            .duration(150)
            .attr('fill', '#22d3ee')
            .attr('font-size', (d: any) => d.depth <= 2 ? 14 : 12);
        })
        .on('mouseleave', function(event, datum) {
          // Reset on mouse leave
          d3.select(this).select('circle')
            .transition()
            .duration(150)
            .attr('r', (d: any) => d.data.node ? 8 : d.data.children?.length ? 7 : 6)
            .attr('stroke-width', 2.4);
          d3.select(this).select('text')
            .transition()
            .duration(150)
            .attr('fill', (d: any) => d.data.node ? '#d8dee9' : '#9fb2c9')
            .attr('font-size', (d: any) => d.depth <= 2 ? 13 : 11);
        });

      treeNodes.append('circle')
        .attr('r', (datum) => datum.data.node ? 8 : datum.data.children?.length ? 7 : 6)
        .attr('fill', (datum) => datum.data.node ? folderColor(topFolder(datum.data.node), 0.95) : 'rgba(10,14,23,0.9)')
        .attr('stroke', (datum) => hasHiddenDescendants.has(datum.data.path) ? '#22d3ee' : datum.data.node ? '#071018' : 'rgba(148,163,184,0.55)')
        .attr('stroke-width', 2.4);

      treeNodes
        .filter((datum: any) => hasHiddenDescendants.has(datum.data.path))
        .append('text')
        .attr('x', 0)
        .attr('y', 3)
        .attr('text-anchor', 'middle')
        .attr('fill', '#22d3ee')
        .attr('font-size', 10)
        .attr('font-weight', 800)
        .text('+');

      treeNodes.append('title')
        .text((datum) => {
          if (datum.data.node) {
            return `${nodeFilePath(datum.data.node)}\nDegree: ${datum.data.node.degree ?? 0}\nType: ${datum.data.node.type}`;
          }
          const childCount = datum.data.children?.length ?? 0;
          const hiddenLabel = hasHiddenDescendants.has(datum.data.path) ? '\nClick to expand' : childCount > 0 ? '\nClick to collapse' : '';
          return `${datum.data.path || datum.data.name}\n${datum.data.leafCount || childCount} items${hiddenLabel}`;
        });

      const labels = treeNodes.filter((datum) =>
        datum.depth <= 5 ||
        Boolean(datum.data.node && ((datum.data.node.degree ?? 0) >= 1 || datum.depth <= 6)),
      );

      labels.append('text')
        .attr('x', (datum) => datum.children ? -16 : 16)
        .attr('dy', 4)
        .attr('text-anchor', (datum) => datum.children ? 'end' : 'start')
        .attr('fill', (datum) => datum.data.node ? '#d8dee9' : '#9fb2c9')
        .attr('font-size', (datum) => datum.depth <= 2 ? 13 : 11)
        .attr('font-weight', (datum) => datum.depth <= 2 ? 750 : 620)
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(2,6,23,0.96)')
        .attr('stroke-width', 4)
        .text((datum) => {
          if (!datum.data.node && hasHiddenDescendants.has(datum.data.path)) {
            return `${truncateMiddle(datum.data.name, datum.depth <= 2 ? 28 : 22)} (${datum.data.children?.length ?? 0})`;
          }
          return truncateMiddle(datum.data.name, datum.depth <= 2 ? 32 : 24);
        });

      rootLayer
        .append('text')
        .attr('x', 18)
        .attr('y', height - 18)
        .attr('fill', '#22d3ee')
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(2,6,23,0.9)')
        .attr('stroke-width', 3)
        .text(`Tree starts partially expanded • Click folders to expand/collapse • Click files to inspect`);
    };

    const drawFlow = () => {
      const nodeGroup = new Map(nodes.map((node) => [node.id, flowGroupLabel(node)]));
      const groupCounts = d3.rollups(nodes, (items) => items.length, (node) => nodeGroup.get(node.id) || node.folder);
      const groupCountMap = new Map(groupCounts);
      const linkGroups = links
        .map((edge) => ({
          source: nodeGroup.get(edge.sourceNode!.id) || edge.sourceNode!.folder,
          target: nodeGroup.get(edge.targetNode!.id) || edge.targetNode!.folder,
          value: edge.weight,
        }))
        .filter((edge) => edge.source && edge.target);

      const activity = new Map<string, number>();
      linkGroups.forEach((edge) => {
        activity.set(edge.source, (activity.get(edge.source) || 0) + edge.value);
        activity.set(edge.target, (activity.get(edge.target) || 0) + edge.value);
      });

      const maxGroups = Math.max(12, Math.min(32, Math.floor(height / 60))); // Increased from 8-16 to 12-32, reduced spacing from 78 to 60
      const groups = [...new Set([...activity.keys(), ...groupCountMap.keys()])]
        .sort((a, b) => {
          const activityDelta = (activity.get(b) || 0) - (activity.get(a) || 0);
          if (activityDelta !== 0) return activityDelta;
          return (groupCountMap.get(b) || 0) - (groupCountMap.get(a) || 0);
        })
        .slice(0, maxGroups);
      const visibleGroups = new Set(groups);
      const aggregated = d3.rollups(
        linkGroups.filter((edge) => visibleGroups.has(edge.source) && visibleGroups.has(edge.target)),
        (items) => d3.sum(items, (edge) => edge.value),
        (edge) => edge.source,
        (edge) => edge.target,
      );

      const flatLinks = aggregated
        .flatMap(([source, targets]) => targets.map(([target, value]) => ({ source, target, value })))
        .sort((a, b) => b.value - a.value);
      const sourceX = 120; // Increased from 80 to give more label space
      const midX = width * 0.5; // Centered from 0.47
      const targetX = width - 160; // Increased margin from 130 to 160
      const yFor = (index: number, count: number) => 70 + (index / Math.max(1, count - 1)) * (height - 140); // Reduced top margin from 88 to 70, bottom from 176 to 140
      const groupY = new Map(groups.map((group, index) => [group, yFor(index, groups.length)]));

      if (flatLinks.length === 0) {
        rootLayer.append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', '#9ca3af')
          .attr('font-size', 15)
          .attr('font-weight', 700)
          .attr('paint-order', 'stroke')
          .attr('stroke', 'rgba(2,6,23,0.9)')
          .attr('stroke-width', 4)
          .text('No dependency flow found between the visible groups');
      }

      rootLayer.append('text')
        .attr('x', 24)
        .attr('y', 30)
        .attr('fill', '#22d3ee')
        .attr('font-size', 13)
        .attr('font-weight', 750)
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(2,6,23,0.9)')
        .attr('stroke-width', 3)
        .text(`Showing ${groups.length} of ${[...new Set([...activity.keys(), ...groupCountMap.keys()])].length} dependency groups • Hover to highlight`);

      const flowPaths = rootLayer.selectAll<SVGPathElement, { source: string; target: string; value: number }>('path.flow-link')
        .data(flatLinks)
        .join('path')
        .attr('class', 'flow-link')
        .attr('d', (edge) => {
          const sy = groupY.get(edge.source) ?? height / 2;
          const ty = groupY.get(edge.target) ?? height / 2;
          const lift = edge.source === edge.target ? Math.max(26, Math.min(80, edge.value * 2.2)) : 0;
          return `M${sourceX + 12},${sy} C${midX},${sy - lift} ${midX},${ty - lift} ${targetX - 12},${ty}`;
        })
        .attr('fill', 'none')
        .attr('stroke', (edge) => edge.source === edge.target ? folderColor(edge.source, 0.26) : folderColor(edge.source, 0.38))
        .attr('stroke-width', (edge) => Math.max(5, Math.min(42, Math.sqrt(edge.value) * 7)))
        .attr('stroke-linecap', 'round')
        .style('cursor', 'pointer')
        .on('mouseenter', function(event, edge) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke', folderColor(edge.source, 0.8))
            .attr('stroke-width', (d: any) => Math.max(7, Math.min(48, Math.sqrt(d.value) * 8)));
        })
        .on('mouseleave', function(event, edge) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke', edge.source === edge.target ? folderColor(edge.source, 0.26) : folderColor(edge.source, 0.38))
            .attr('stroke-width', (d: any) => Math.max(5, Math.min(42, Math.sqrt(d.value) * 7)));
        });
      flowPaths.append('title')
        .text((edge) => `${edge.source} -> ${edge.target}: ${edge.value} links`);

      const folderNodes = [
        ...groups.map((folder, index) => ({ folder, x: sourceX, y: yFor(index, groups.length), side: 'source' })),
        ...groups.map((folder, index) => ({ folder, x: targetX, y: yFor(index, groups.length), side: 'target' })),
      ];
      const folderGroups = rootLayer.selectAll('g.flow-folder').data(folderNodes).join('g')
        .attr('class', 'flow-folder')
        .attr('transform', (datum) => `translate(${datum.x},${datum.y})`)
        .style('cursor', 'pointer')
        .on('mouseenter', function() {
          d3.select(this).select('rect')
            .transition()
            .duration(200)
            .attr('width', 24)
            .attr('height', 72)
            .attr('x', -12)
            .attr('y', -36);
          d3.select(this).select('text')
            .transition()
            .duration(200)
            .attr('fill', '#22d3ee')
            .attr('font-size', 16);
        })
        .on('mouseleave', function() {
          d3.select(this).select('rect')
            .transition()
            .duration(200)
            .attr('width', 20)
            .attr('height', 68)
            .attr('x', -10)
            .attr('y', -34);
          d3.select(this).select('text')
            .transition()
            .duration(200)
            .attr('fill', '#e5edf9')
            .attr('font-size', 14);
        });
      folderGroups.append('rect')
        .attr('x', -10)
        .attr('y', -34)
        .attr('width', 20)
        .attr('height', 68)
        .attr('rx', 5)
        .attr('fill', (datum) => folderColor(datum.folder, 0.95));
      folderGroups.append('text')
        .attr('x', (datum) => datum.side === 'source' ? 24 : -24) // Increased spacing from 20/-20 to 24/-24
        .attr('y', 5)
        .attr('text-anchor', (datum) => datum.side === 'source' ? 'start' : 'end')
        .attr('fill', '#e5edf9')
        .attr('font-size', 14) // Increased from 15 to 14 for better fit
        .attr('font-weight', 750)
        .attr('paint-order', 'stroke')
        .attr('stroke', 'rgba(2,6,23,0.9)')
        .attr('stroke-width', 4)
        .text((datum) => `${truncateMiddle(datum.folder, 36)} (${groupCountMap.get(datum.folder) ?? 0})`); // Increased from 24 to 36 chars
    };

    const drawCluster = () => {
      const grouped = d3.groups(nodes, (node) => node.folder)
        .sort((a, b) => b[1].length - a[1].length);
      const columns = Math.max(2, Math.ceil(Math.sqrt(grouped.length)));
      const gap = 28;
      const cardW = (width - gap * (columns + 1)) / columns;
      const cardH = Math.max(180, (height - gap * (Math.ceil(grouped.length / columns) + 1)) / Math.ceil(grouped.length / columns));

      const folderCards = rootLayer.selectAll('g.cluster-card').data(grouped).join('g')
        .attr('transform', (_datum, index) => {
          const x = gap + (index % columns) * (cardW + gap);
          const y = gap + Math.floor(index / columns) * (cardH + gap);
          return `translate(${x},${y})`;
        });
      folderCards.append('rect')
        .attr('width', cardW)
        .attr('height', cardH)
        .attr('rx', 8)
        .attr('fill', ([folder]) => folderColor(folder, 0.08))
        .attr('stroke', ([folder]) => folderColor(folder, 0.25));
      folderCards.append('text')
        .attr('x', 16)
        .attr('y', 26)
        .attr('fill', ([folder]) => folderColor(folder))
        .attr('font-size', 15)
        .attr('font-weight', 800)
        .text(([folder]) => truncateMiddle(folder, 28));
      folderCards.each(function ([folder, groupNodes]) {
        const local = d3.select(this);
        const circles = local.selectAll('circle').data(groupNodes.slice(0, 80)).join('circle')
          .attr('cx', (node, index) => 32 + ((stableNumber(`${node.id}:x`) + index * 37) % Math.max(40, cardW - 64)))
          .attr('cy', (node, index) => 52 + ((stableNumber(`${node.id}:y`) + index * 53) % Math.max(40, cardH - 78)))
          .attr('r', (node) => Math.max(6, Math.min(18, node.radius * 0.72)))
          .attr('fill', folderColor(folder, 0.95))
          .attr('stroke', '#071018')
          .attr('stroke-width', 2)
          .style('cursor', 'pointer')
          .on('click', (_event, node) => selectNode(node));
        circles.append('title').text((node) => nodeFilePath(node));
      });
    };

    const drawBundle = () => {
      const ordered = [...nodes].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name)).slice(0, 140);
      const index = new Map(ordered.map((node, itemIndex) => [node.id, itemIndex]));
      const radius = Math.min(width, height) * 0.37;
      const center = { x: width / 2, y: height / 2 + 20 };
      const angleFor = (itemIndex: number) => (itemIndex / Math.max(1, ordered.length)) * Math.PI * 2 - Math.PI / 2;
      const positionFor = (itemIndex: number, offset = 0) => {
        const angle = angleFor(itemIndex);
        return {
          x: center.x + Math.cos(angle) * (radius + offset),
          y: center.y + Math.sin(angle) * (radius + offset),
          angle,
        };
      };

      const bundleLinks = links
        .map((edge) => ({ edge, s: index.get(edge.from), t: index.get(edge.to) }))
        .filter((datum) => datum.s !== undefined && datum.t !== undefined)
        .slice(0, 260);

      rootLayer.selectAll('path.bundle-link')
        .data(bundleLinks)
        .join('path')
        .attr('fill', 'none')
        .attr('stroke', (datum) => folderColor(datum.edge.sourceNode!.folder, 0.35))
        .attr('stroke-width', (datum) => Math.max(0.8, Math.min(3.2, Math.sqrt(datum.edge.weight))))
        .attr('d', (datum) => {
          const source = positionFor(Number(datum.s), -28);
          const target = positionFor(Number(datum.t), -28);
          const line = d3.line<[number, number]>().curve(d3.curveBundle.beta(0.82));
          return line([[source.x, source.y], [center.x, center.y], [target.x, target.y]]);
        });

      const byFolder = d3.groups(ordered, (node) => node.folder);
      const arc = d3.arc<any>().innerRadius(radius + 10).outerRadius(radius + 18);
      rootLayer.selectAll('path.bundle-arc')
        .data(byFolder)
        .join('path')
        .attr('d', ([, groupNodes]) => {
          const indexes = groupNodes.map((node) => index.get(node.id) ?? 0);
          return arc({
            startAngle: angleFor(Math.min(...indexes)) + Math.PI / 2,
            endAngle: angleFor(Math.max(...indexes) + 1) + Math.PI / 2,
          });
        })
        .attr('transform', `translate(${center.x},${center.y})`)
        .attr('fill', ([folder]) => folderColor(folder, 0.56));

      const itemGroups = rootLayer.selectAll('g.bundle-node').data(ordered).join('g')
        .attr('class', 'bundle-node')
        .attr('transform', (_node, itemIndex) => {
          const position = positionFor(itemIndex);
          return `translate(${position.x},${position.y})`;
        })
        .style('cursor', 'pointer')
        .on('click', (_event, node) => selectNode(node));
      itemGroups.append('circle')
        .attr('r', (node) => Math.max(5, Math.min(11, node.radius * 0.55)))
        .attr('fill', (node) => folderColor(node.folder, 0.95))
        .attr('stroke', '#071018')
        .attr('stroke-width', 2);
      itemGroups.append('text')
        .attr('transform', (_node, itemIndex) => {
          const angle = angleFor(itemIndex);
          const degrees = angle * 180 / Math.PI;
          return `rotate(${degrees}) translate(16,4) ${degrees > 90 || degrees < -90 ? 'rotate(180)' : ''}`;
        })
        .attr('text-anchor', (_node, itemIndex) => {
          const angle = angleFor(itemIndex);
          return angle > Math.PI / 2 || angle < -Math.PI / 2 ? 'end' : 'start';
        })
        .attr('fill', '#9fb2c9')
        .attr('font-size', 11)
        .text((node) => truncateMiddle(node.name, 15));
    };

    if (vizType === 'graph') drawForceGraph();
    if (vizType === 'vein') drawForceGraph(); // Vein uses same rendering as graph with enhanced hulls
    if (vizType === 'matrix') drawMatrix();
    if (vizType === 'tree') drawTree();
    if (vizType === 'flow') drawFlow();
    if (vizType === 'cluster') drawCluster();
    if (vizType === 'bundle') drawBundle();

    return () => {
      simulation?.stop();
      container.innerHTML = '';
    };
  }, [onSelect, visualPayload, viewMode, vizType, showSidebars, expandedTreePaths]);

  const treemapData = useMemo(() => {
    const children = visualPayload.nodes
      .filter((node) => (node.degree ?? 0) > 0)
      .map((node) => ({
        name: node.name,
        value: fileWeight(node),
        type: node.type,
        id: node.id,
        folder: folderLabel(node),
      }));
    const folders = new Map<string, typeof children>();
    children.forEach((child) => {
      const folderChildren = folders.get(child.folder) ?? [];
      folderChildren.push(child);
      folders.set(child.folder, folderChildren);
    });
    return {
      name: 'root',
      children: [...folders.entries()].map(([name, folderChildren]) => ({ name, children: folderChildren })),
    };
  }, [visualPayload.nodes]);

  useEffect(() => {
    const container = treemapRef.current;
    if (!container || vizType !== 'treemap') return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(240, rect.height);
    container.innerHTML = '';

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img');

    const root = d3
      .hierarchy<any>(treemapData)
      .sum((datum) => datum.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const treemapRoot = d3.treemap<any>()
      .size([width, height])
      .paddingOuter(14)
      .paddingTop(24)
      .paddingInner(3)
      .round(true)(root) as d3.HierarchyRectangularNode<any>;

    const folders = svg
      .selectAll('g.treemap-folder')
      .data(treemapRoot.children ?? [])
      .join('g')
      .attr('class', 'treemap-folder');

    folders
      .append('text')
      .attr('x', (datum) => datum.x0 + 8)
      .attr('y', (datum) => datum.y0 + 16)
      .attr('fill', '#94a3b8')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .text((datum) => datum.data.name);

    const leaves = svg
      .selectAll('g.treemap-cell')
      .data(treemapRoot.leaves())
      .join('g')
      .attr('class', 'treemap-cell')
      .attr('transform', (datum) => `translate(${datum.x0},${datum.y0})`)
      .style('cursor', 'pointer')
      .on('click', (_event, datum) => {
        const node = nodeLookup.get(datum.data.id);
        onSelect(node ? selectSourceNodeId(node) : datum.data.id);
      });

    leaves
      .append('rect')
      .attr('width', (datum) => Math.max(0, datum.x1 - datum.x0))
      .attr('height', (datum) => Math.max(0, datum.y1 - datum.y0))
      .attr('rx', 5)
      .attr('fill', (datum) => colorForViewMode(nodeLookup.get(datum.data.id) ?? datum.data, viewMode, churnData))
      .attr('fill-opacity', 0.72)
      .attr('stroke', 'rgba(255,255,255,0.18)');

    leaves
      .append('text')
      .attr('x', 6)
      .attr('y', 16)
      .attr('fill', '#f8fafc')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .text((datum) => {
        const width = datum.x1 - datum.x0;
        const maxChars = Math.max(4, Math.floor(width / 7));
        return String(datum.data.name).slice(0, maxChars);
      });

    leaves
      .append('title')
      .text((datum) => `${datum.data.name} - degree ${datum.data.value}`);
  }, [nodeLookup, onSelect, treemapData, viewMode, vizType, showSidebars]);

  const zoom = (factor: number) => {
    if (isSigmaViz) {
      const sigma = sigmaRef.current;
      if (!sigma) {
        console.warn('Zoom: Sigma instance not found');
        return;
      }
      const camera = sigma.getCamera();
      const currentState = camera.getState();
      camera.setState({
        ...currentState,
        ratio: currentState.ratio * factor
      });
    } else {
      withD3Viewport(
        (svg, zoomBehavior) => {
          svg
            .transition()
            .duration(300)
            .call((selection: any) => zoomBehavior.scaleBy(selection, 1 / factor));
        },
        'Zoom: D3 SVG or zoom behavior not initialized'
      );
    }
  };

  const resetCamera = () => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  };

  const resetSphere = () => {
    if (isSigmaViz) {
      if (hasGraphOverlay) return;
      rotationRef.current = { x: -0.18, y: 0.42 };
      projectSphere();
      resetCamera();
    } else {
      withD3Viewport(
        (svg, zoomBehavior) => {
          svg
            .transition()
            .duration(500)
            .call((selection: any) => zoomBehavior.transform(selection, d3.zoomIdentity));
        },
        'Reset: D3 SVG or zoom behavior not initialized'
      );
    }
  };

  const startSphereDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(".graph-actions, .graph-toolbar, .treemap-overlay, .minimap-overlay")) return;
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
    if (hasGraphOverlay) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    rotationRef.current = {
      x: clamp(drag.rotationX + dy * 0.006, -1.15, 1.15),
      y: drag.rotationY + dx * 0.006,
    };
    // Throttle sphere rotation updates with requestAnimationFrame
    if (refreshRafRef.current === null) {
      refreshRafRef.current = requestAnimationFrame(() => {
        refreshRafRef.current = null;
        projectSphere();
      });
    }
  };

  const stopSphereDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handleMinimapInteraction = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.buttons !== 1) return;
    
    const canvas = miniMapRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (isD3Viz) {
      if (!d3ZoomRef.current || !d3SvgRef.current || d3NodesRef.current.length === 0) return;
      
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      d3NodesRef.current.forEach((n) => {
        if (n.x === undefined || n.y === undefined) return;
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      });
      if (minX === Infinity) return;
      
      const padding = 10;
      const graphWidth = maxX - minX || 1;
      const graphHeight = maxY - minY || 1;
      const scaleX = (canvas.width - padding * 2) / graphWidth;
      const scaleY = (canvas.height - padding * 2) / graphHeight;
      const scale = Math.min(scaleX, scaleY);
      
      const offsetX = (canvas.width - graphWidth * scale) / 2 - minX * scale;
      const offsetY = (canvas.height - graphHeight * scale) / 2 - minY * scale;
      
      const targetX = (x - offsetX) / scale;
      const targetY = (y - offsetY) / scale;
      
      const svgElement = d3SvgRef.current.node() as SVGSVGElement;
      const svgRect = svgElement.getBoundingClientRect();
      const currentTransform = d3.zoomTransform(svgElement);
      
      const newX = svgRect.width / 2 - targetX * currentTransform.k;
      const newY = svgRect.height / 2 - targetY * currentTransform.k;
      
      d3SvgRef.current.call(d3ZoomRef.current.transform, d3.zoomIdentity.translate(newX, newY).scale(currentTransform.k));
    } else {
      const sigma = sigmaRef.current;
      if (!sigma) return;
      const camera = sigma.getCamera();
      
      const graph = sigma.getGraph();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      graph.forEachNode((_, attrs) => {
        if (attrs.hidden) return;
        minX = Math.min(minX, Number(attrs.x));
        maxX = Math.max(maxX, Number(attrs.x));
        minY = Math.min(minY, Number(attrs.y));
        maxY = Math.max(maxY, Number(attrs.y));
      });
      if (minX === Infinity) return;
      
      const padding = 10;
      const graphWidth = maxX - minX || 1;
      const graphHeight = maxY - minY || 1;
      const scaleX = (canvas.width - padding * 2) / graphWidth;
      const scaleY = (canvas.height - padding * 2) / graphHeight;
      const scale = Math.min(scaleX, scaleY);
      
      const offsetX = (canvas.width - graphWidth * scale) / 2 - minX * scale;
      const offsetY = (canvas.height - graphHeight * scale) / 2 - minY * scale;
      
      const targetX = (x - offsetX) / scale;
      const targetY = (y - offsetY) / scale;
      
      camera.setState({ x: targetX, y: targetY });
    }
  };

  useEffect(() => {
    if (vizType === 'vector' || isTreemapViz) return;
    
    let rafId: number;
    const renderMiniMap = () => {
      const miniMap = miniMapRef.current;
      if (!miniMap) {
        rafId = requestAnimationFrame(renderMiniMap);
        return;
      }
      
      const isSigma = vizType === 'symbols';
      const sigma = sigmaRef.current;
      const sigmaGraph = graphRef.current;
      
      if (isSigma && (!sigma || !sigmaGraph)) {
        rafId = requestAnimationFrame(renderMiniMap);
        return;
      }
      if (!isSigma && (!d3NodesRef.current.length || !d3ZoomRef.current)) {
        rafId = requestAnimationFrame(renderMiniMap);
        return;
      }

      const context = miniMap.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, miniMap.width, miniMap.height);
      context.fillStyle = 'rgba(10,14,23,0.84)';
      context.fillRect(0, 0, miniMap.width, miniMap.height);

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      
      if (isSigma) {
        sigmaGraph.forEachNode((id: string, attr: any) => {
          if (attr.x === undefined || attr.y === undefined) return;
          minX = Math.min(minX, attr.x);
          maxX = Math.max(maxX, attr.x);
          minY = Math.min(minY, attr.y);
          maxY = Math.max(maxY, attr.y);
        });
      } else {
        d3NodesRef.current.forEach((n) => {
          if (n.x === undefined || n.y === undefined) return;
          minX = Math.min(minX, n.x);
          maxX = Math.max(maxX, n.x);
          minY = Math.min(minY, n.y);
          maxY = Math.max(maxY, n.y);
        });
      }

      if (minX === Infinity) {
        rafId = requestAnimationFrame(renderMiniMap);
        return;
      }

      const padding = 10;
      const graphWidth = maxX - minX || 1;
      const graphHeight = maxY - minY || 1;
      const scaleX = (miniMap.width - padding * 2) / graphWidth;
      const scaleY = (miniMap.height - padding * 2) / graphHeight;
      const scale = Math.min(scaleX, scaleY);

      const offsetX = (miniMap.width - graphWidth * scale) / 2 - minX * scale;
      const offsetY = (miniMap.height - graphHeight * scale) / 2 - minY * scale;

      context.fillStyle = '#38bdf8';
      context.beginPath();
      
      if (isSigma) {
        sigmaGraph.forEachNode((id: string, attr: any) => {
          if (attr.x === undefined || attr.y === undefined) return;
          const x = attr.x * scale + offsetX;
          const y = attr.y * scale + offsetY;
          context.moveTo(x + 1, y);
          context.arc(x, y, 1, 0, Math.PI * 2);
        });
      } else {
        d3NodesRef.current.forEach((n) => {
          if (n.x === undefined || n.y === undefined) return;
          const x = n.x * scale + offsetX;
          const y = n.y * scale + offsetY;
          context.moveTo(x + 1, y);
          context.arc(x, y, 1, 0, Math.PI * 2);
        });
      }
      context.fill();

      if (isSigma && sigma) {
        const state = sigma.getCamera().getState();
        const rect = sigma.getContainer().getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && state.ratio > 0) {
          const vw = rect.width * state.ratio;
          const vh = rect.height * state.ratio;
          const vx = state.x - vw / 2;
          const vy = state.y - vh / 2;
          context.strokeStyle = 'rgba(56, 189, 248, 0.8)';
          context.lineWidth = 1;
          context.strokeRect(
            vx * scale + offsetX,
            vy * scale + offsetY,
            vw * scale,
            vh * scale
          );
        }
      } else if (!isSigma && d3SvgRef.current) {
        const svgElement = d3SvgRef.current.node() as SVGSVGElement;
        const rect = svgElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const transform = d3.zoomTransform(svgElement);
          const vw = rect.width / transform.k;
          const vh = rect.height / transform.k;
          const vx = -transform.x / transform.k;
          const vy = -transform.y / transform.k;

          context.strokeStyle = 'rgba(56, 189, 248, 0.8)';
          context.lineWidth = 1;
          context.strokeRect(
            vx * scale + offsetX,
            vy * scale + offsetY,
            vw * scale,
            vh * scale
          );
        }
      }

      rafId = requestAnimationFrame(renderMiniMap);
    };
    
    rafId = requestAnimationFrame(renderMiniMap);
    return () => cancelAnimationFrame(rafId);
  }, [vizType]);

  return (
    <section
      className={`graph-stage codeflow-active codeflow-${vizType}`}
      onPointerDown={startSphereDrag}
      onPointerMove={rotateSphere}
      onPointerUp={stopSphereDrag}
      onPointerCancel={stopSphereDrag}
    >
      <div
        ref={containerRef}
        className="sigma-stage"
        style={{ opacity: (vizType === 'symbols' || vizType === 'vector') ? 1 : 0, pointerEvents: (vizType === 'symbols' || vizType === 'vector') ? 'auto' : 'none' }}
      />
      <div
        ref={d3StageRef}
        className="codeflow-stage"
        style={{ 
          display: isD3Viz ? 'block' : 'none',
          width: '100%',
          height: '100%'
        }}
      />
      <div
        ref={treemapRef}
        className="treemap-overlay"
        style={{ display: vizType === 'treemap' ? 'block' : 'none' }}
      />
      {vizType !== 'treemap' && (
        <canvas 
          ref={miniMapRef} 
          className="minimap-overlay" 
          width={160} 
          height={100} 
          onPointerDown={handleMinimapInteraction as any}
          onPointerMove={(e) => {
            if (e.buttons === 1) handleMinimapInteraction(e as any);
          }}
          style={{ cursor: 'crosshair', touchAction: 'none' }}
        />
      )}
      {isD3Viz && (
        <div className="flow-map-chip">
          <strong>{vizType === 'graph' ? 'Folder Graph' : vizType}</strong>
          <span>{visualPayload.nodes.length} files, {visualPayload.edges.length} dependency links</span>
        </div>
      )}
      {vizType !== 'treemap' && (
        <div className="graph-actions" aria-label="Graph controls">
          <button type="button" title="Zoom in (+)" onClick={() => zoom(0.72)}>
            <ZoomIn size={18} />
          </button>
          <button type="button" title="Zoom out (-)" onClick={() => zoom(1.28)}>
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            title={cameraLocked ? "Unlock camera (allow auto-focus)" : "Lock camera (prevent auto-focus)"}
            onClick={onToggleCameraLock}
            style={{
              background: cameraLocked
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.35), rgba(139, 92, 246, 0.25))'
                : undefined
            }}
          >
            {cameraLocked ? <LocateFixed size={18} /> : <Pin size={18} />}
          </button>
          <button type="button" title="Reset / Fit (f)" onClick={resetSphere}>
            <Maximize2 size={18} />
          </button>
          <button type="button" title={showSidebars ? "Hide Sidebars" : "Show Sidebars"} onClick={() => setShowSidebars && setShowSidebars(!showSidebars)}>
            <Columns size={18} />
          </button>
          <button type="button" title="Export PNG" onClick={exportPNG}>
            <Download size={18} />
          </button>
          {isD3Viz && (
            <button
              type="button"
              title="Export SVG"
              onClick={exportSVG}
              style={{ fontSize: '11px', fontWeight: 700, padding: '0 10px', letterSpacing: '0.04em' }}
            >
              SVG
            </button>
          )}
          <button
            type="button"
            title="Export JSON"
            onClick={exportJSON}
            style={{ fontSize: '11px', fontWeight: 700, padding: '0 10px', letterSpacing: '0.04em' }}
          >
            JSON
          </button>
          <button
            type="button"
            title="Export AI-optimized JSON (for LLMs)"
            onClick={exportAIJSON}
            style={{ fontSize: '11px', fontWeight: 700, padding: '0 10px', letterSpacing: '0.04em', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))' }}
          >
            AI
          </button>
          <button
            type="button"
            title="Export Markdown report"
            onClick={exportMarkdown}
            style={{ fontSize: '11px', fontWeight: 700, padding: '0 10px', letterSpacing: '0.04em' }}
          >
            .md
          </button>
          {pathNodes.size > 0 && (
            <button type="button" title="Clear path" onClick={onClearPath}>
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* View mode toggle bar */}
      <GraphToolbar
        vizType={vizType}
        onVizTypeChange={onVizTypeChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        layoutMode={layoutMode}
        onLayoutModeChange={onLayoutModeChange}
      />
    </section>
  );
}

function App() {
  const { payload, setPayload, error, level, expandCommunity, lastUpdate } = useGraphData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // CRITICAL FIX: Use ref instead of state for hoveredId
  // This prevents React rerenders on every mousemove, which was causing:
  // - Graph refresh cycles
  // - Canvas redraws
  // - Sigma internal state thrashing
  // Sigma handles hover visualization natively (enterNode/leaveNode), so we don't need state updates
  const hoveredIdRef = useRef<string | null>(null);
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
  const [showSidebars, setShowSidebars] = useState(true);
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [compareNode, setCompareNode] = useState<GraphNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => 
    (typeof window !== 'undefined' ? localStorage.getItem("codebrain:viewMode") as ViewMode : null) || 'type'
  );
  const [churnData, setChurnData] = useState<Record<string, { changes: number; authors: number; hotspot: boolean }> | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => 
    (typeof window !== 'undefined' ? localStorage.getItem("codebrain:layoutMode") as LayoutMode : null) || 'force'
  );
  const [vizType, setVizType] = useState<VizType>(() => 
    (typeof window !== 'undefined' ? localStorage.getItem("codebrain:vizType") as VizType : null) || 'graph'
  );
  const [blastNodes, setBlastNodes] = useState<Set<string>>(new Set());
  const [blastSourceId, setBlastSourceId] = useState<string | null>(null);
  const [pathMode, setPathMode] = useState<{ source: string | null }>({ source: null });
  const [pathNodes, setPathNodes] = useState<Set<string>>(new Set());
  const [pathSourceId, setPathSourceId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; nodeName: string } | null>(null);
  const [legendCollapsed, setLegendCollapsed] = useState(() => 
    typeof window !== 'undefined' ? localStorage.getItem("codebrain:legendCollapsed") === "true" : false
  );
  const [relationshipsHeight, setRelationshipsHeight] = useState(() =>
    typeof window !== 'undefined' ? Number(localStorage.getItem("codebrain:relationshipsHeight") || 300) : 300,
  );
  const [sourceCodeHeight, setSourceCodeHeight] = useState(() =>
    typeof window !== 'undefined' ? Number(localStorage.getItem("codebrain:sourceCodeHeight") || 400) : 400,
  );
  const [leftWidth, setLeftWidth] = useState(() =>
    typeof window !== 'undefined' ? clamp(Number(localStorage.getItem("codebrain:leftWidth") || 280), 240, 360) : 280,
  );
  const [rightWidth, setRightWidth] = useState(() =>
    typeof window !== 'undefined' ? clamp(Number(localStorage.getItem("codebrain:rightWidth") || 360), 300, 460) : 360,
  );

  // Analysis panels state
  const [deadCode, setDeadCode] = useState<any[]>([]);
  const [bridges, setBridges] = useState<any[]>([]);
  const [securityIssues, setSecurityIssues] = useState<any[]>([]);
  const [invariants, setInvariants] = useState<any>(null);
  const [showDeadCode, setShowDeadCode] = useState(false);
  const [showBridges, setShowBridges] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showInvariants, setShowInvariants] = useState(false);
  const [patternQuery, setPatternQuery] = useState('');
  const [patternResults, setPatternResults] = useState<any[]>([]);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternError, setPatternError] = useState('');


  // codeflow-style analysis state
  const [complexity, setComplexity] = useState<any>(null);
  const [showComplexity, setShowComplexity] = useState(false);
  const [duplicates, setDuplicates] = useState<any>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [layerViolations, setLayerViolations] = useState<any>(null);
  const [showLayerViolations, setShowLayerViolations] = useState(false);
  const [healthScore, setHealthScore] = useState<any>(null);
  const [showHealthScore, setShowHealthScore] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [darkMode, setDarkMode] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('codebrain:darkMode') !== 'false' : true,
  );

  // GitHub repo input state
  const [repoUrl, setRepoUrl] = useState('');

  const [isAnalyzingGitHub, setIsAnalyzingGitHub] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<string>('');
  const [analysisFileProgress, setAnalysisFileProgress] = useState<string>('');
  const [isInitializingLocal, setIsInitializingLocal] = useState(false);

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
    if (viewMode === 'churn' && !churnData) {
      fetch('/api/churn')
        .then(r => r.ok ? r.json() : { files: {} })
        .then(d => setChurnData(d.files))
        .catch(() => setChurnData({}));
    }
  }, [viewMode]);

  useEffect(() => {
    if (!payload) return;
    fetch('/api/analyze/invariants')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data) setInvariants(data);
      })
      .catch(() => { });
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

  useEffect(() => {
    localStorage.setItem("codebrain:viewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("codebrain:layoutMode", layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    localStorage.setItem("codebrain:vizType", vizType);
  }, [vizType]);

  useEffect(() => {
    localStorage.setItem("codebrain:legendCollapsed", String(legendCollapsed));
  }, [legendCollapsed]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('light-mode', !darkMode);
    document.body.classList.toggle('light-mode', !darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    localStorage.setItem('codebrain:darkMode', String(darkMode));

    return () => {
      document.documentElement.classList.remove('light-mode');
      document.body.classList.remove('light-mode');
      document.documentElement.style.colorScheme = 'dark';
    };
  }, [darkMode]);

  useEffect(() => {
    const handleAnalysisProgress = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (typeof detail.message === 'string') {
        setAnalyzeProgress(detail.message);
      }
      if (detail.current && detail.total) {
        const fileName = typeof detail.filePath === 'string'
          ? detail.filePath.split(/[\\/]/).pop()
          : '';
        setAnalysisFileProgress(
          fileName
            ? `Analyzing ${detail.current}/${detail.total}: ${fileName}`
            : `Analyzing ${detail.current}/${detail.total}`
        );
      } else {
        setAnalysisFileProgress('');
      }
    };

    window.addEventListener('codebrain:analysis-progress', handleAnalysisProgress);
    return () => window.removeEventListener('codebrain:analysis-progress', handleAnalysisProgress);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't fire shortcuts when typing in an input or textarea
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

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
      // + / = : Zoom in (no modifier needed)
      if ((event.key === '+' || event.key === '=') && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        // Sigma zoom: handled via sigmaRef in GraphStage — emit a custom event
        window.dispatchEvent(new CustomEvent('codebrain:zoom', { detail: { direction: 'in' } }));
      }
      // - : Zoom out
      if (event.key === '-' && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('codebrain:zoom', { detail: { direction: 'out' } }));
      }
      // f : Fit graph / reset camera
      if (event.key === 'f' && !event.metaKey && !event.ctrlKey) {
        window.dispatchEvent(new CustomEvent('codebrain:fit'));
      }
      // b : Run blast radius on the currently selected node
      if (event.key === 'b' && !event.metaKey && !event.ctrlKey && selectedId && payload) {
        const node = payload.nodes.find(n => n.id === selectedId);
        if (node) analyzeImpact(selectedId, node.name);
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

  const handleGraphHover = useCallback((id: string | null) => {
    hoveredIdRef.current = id;
  }, []);

  const handleGraphContextMenu = useCallback((x: number, y: number, nodeId: string, nodeName: string) => {
    if (nodeId) setContextMenu({ x, y, nodeId, nodeName });
    else setContextMenu(null);
  }, []);

  const loadFullFile = () => {
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
  };

  const search = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
      .then((response) => response.json() as Promise<GraphNode[]>)
      .then((items) => {
        setResults(items);
        if (items[0]) selectNode(items[0].id);
      })
      .catch(() => setResults([]));
  };

  const analyzeGitHubRepo = async () => {
    const parsed = github.parseRepoUrl(repoUrl);
    if (!parsed) {
      alert('Invalid URL. Use format: owner/repo or https://github.com/owner/repo');
      return;
    }

    setIsAnalyzingGitHub(true);
    setAnalyzeProgress('Preparing repository analysis...');
    setAnalysisFileProgress('');
    try {
      // Send to server for analysis directly (bypasses GitHub API rate limits by downloading ZIP natively)
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: `${parsed.owner}/${parsed.repo}`
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Analysis failed');
      }

      setAnalyzeProgress('Processing graph...');
      const result = await response.json() as GraphPayload;
      setPayload(result);
      setSelectedId(null);
      setDetails(null);
      setSource(null);
      setResults([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzingGitHub(false);
      setAnalyzeProgress('');
      setAnalysisFileProgress('');
    }
  };

  const initializeLocalRepo = async () => {
    setIsInitializingLocal(true);
    setAnalyzeProgress('Initializing local repository...');
    setAnalysisFileProgress('');
    try {
      const response = await fetch('/api/repo/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reindex: true }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Repository initialization failed');
      }

      const result = await response.json() as { stats?: GraphPayload['stats'] };
      const graphResponse = await fetch('/api/graph?level=0');
      if (!graphResponse.ok) throw new Error('Repository initialized, but graph reload failed');
      const nextPayload = await graphResponse.json() as GraphPayload;
      setPayload(nextPayload);
      setSelectedId(null);
      setDetails(null);
      setSource(null);
      setResults([]);
      console.info('Local repository initialized', result.stats);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Repository initialization failed');
    } finally {
      setIsInitializingLocal(false);
      setAnalyzeProgress('');
      setAnalysisFileProgress('');
    }
  };

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

  const changeVizType = useCallback((nextType: VizType) => {
    setVizType(nextType);
    if (nextType === 'flow' && viewMode === 'type') {
      setViewMode('folder');
    }
    if (nextType === 'flow' && layoutMode === 'grid') {
      setLayoutMode('force');
    }
  }, [layoutMode, viewMode]);

  if (error) {
    return <div className="loading">Graph failed to load: {error}</div>;
  }

  if (!payload) {
    return <div className="loading">Loading code-brain graph...</div>;
  }

  const selectedNode = details || payload.nodes.find((node) => node.id === selectedId) || null;
  const totalLinesOfCode = payload.nodes.reduce((sum, node) => sum + fileWeight(node), 0);
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

  const legendPanel = (
    <GraphLegend
      viewMode={viewMode}
      setViewMode={setViewMode}
      legendCollapsed={legendCollapsed}
      setLegendCollapsed={setLegendCollapsed}
      payload={payload}
    />
  );

  // Analysis panel fetch functions
  const loadDeadCode = async () => {
    try {
      const res = await fetch('/api/analyze/dead-code');
      const data = await res.json();
      setDeadCode(data.nodes || []);
      setShowDeadCode(true);
    } catch (err) {
      console.error('Failed to load dead code:', err);
    }
  };

  const loadBridges = async () => {
    try {
      const res = await fetch('/api/analyze/bridges');
      const data = await res.json();
      setBridges(data.nodes || []);
      setShowBridges(true);
    } catch (err) {
      console.error('Failed to load bridges:', err);
    }
  };

  const loadSecurity = async () => {
    try {
      const res = await fetch('/api/analyze/security');
      const data = await res.json();
      setSecurityIssues(data.issues || []);
      setShowSecurity(true);
    } catch (err) {
      console.error('Failed to load security issues:', err);
    }
  };

  const loadInvariants = async () => {
    try {
      const res = await fetch('/api/analyze/invariants');
      const data = await res.json();
      setInvariants(data);
      setShowInvariants(true);
    } catch (err) {
      console.error('Failed to load invariants:', err);
    }
  };


  const loadComplexity = async () => {
    try {
      const res = await fetch('/api/analyze/complexity');
      const data = await res.json();
      setComplexity(data);
      setShowComplexity(true);
    } catch (err) { console.error('Failed to load complexity:', err); }
  };

  const loadDuplicates = async () => {
    try {
      const res = await fetch('/api/analyze/duplicates');
      const data = await res.json();
      setDuplicates(data);
      setShowDuplicates(true);
    } catch (err) { console.error('Failed to load duplicates:', err); }
  };

  const loadLayerViolations = async () => {
    try {
      const res = await fetch('/api/analyze/layer-violations');
      const data = await res.json();
      setLayerViolations(data);
      setShowLayerViolations(true);
    } catch (err) { console.error('Failed to load layer violations:', err); }
  };

  const loadHealthScore = async () => {
    try {
      const res = await fetch('/api/analyze/health-score');
      const data = await res.json();
      setHealthScore(data);
      setShowHealthScore(true);
    } catch (err) { console.error('Failed to load health score:', err); }
  };

  const loadSuggestions = async () => {
    try {
      const res = await fetch('/api/analyze/suggestions');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch (err) { console.error('Failed to load suggestions:', err); }
  };

  const analyzeImpact = async (nodeId: string, nodeName: string) => {
    try {
      const res = await fetch(`/api/query/impact-full?target=${encodeURIComponent(nodeName)}`);
      const data = await res.json();
      const affectedSet = new Set<string>(
        (data.results ?? []).map((node: any) => node.id ?? node.nodeId).filter(Boolean),
      );
      affectedSet.add(nodeId);
      setBlastSourceId(nodeId);
      setBlastNodes(affectedSet);
      setPathNodes(new Set());
      setPathSourceId(null);
    } catch (err) {
      console.error('Impact analysis failed:', err);
    }
  };

  const clearBlast = () => {
    setBlastNodes(new Set());
    setBlastSourceId(null);
  };

  const clearPath = () => {
    setPathMode({ source: null });
    setPathNodes(new Set());
    setPathSourceId(null);
  };

  const findPath = async (from: string, to: string) => {
    try {
      const res = await fetch(`/api/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const data = await res.json();
      const pathSet = new Set<string>((data.path ?? []).map((node: any) => node.id ?? node.nodeId ?? node).filter(Boolean));
      if (pathSet.size === 0) {
        pathSet.add(from);
        pathSet.add(to);
      }
      setPathSourceId(from);
      setPathNodes(pathSet);
      setBlastNodes(new Set());
      setBlastSourceId(null);
    } catch (err) {
      console.error('Path search failed:', err);
    } finally {
      setPathMode({ source: null });
      setContextMenu(null);
    }
  };

  const runPatternQuery = async () => {
    if (!patternQuery.trim()) return;
    setPatternLoading(true);
    setPatternError('');
    try {
      const params = new URLSearchParams({ limit: '25' });
      for (const part of patternQuery.trim().split(/\s+/)) {
        if (part.startsWith('type:')) params.append('types', part.slice(5));
        else if (part.startsWith('no-edge:')) {
          const [, t, d] = part.split(':');
          params.set('not_edge', t);
          if (d) params.set('not_edge_dir', d);
        } else if (part.startsWith('has-edge:')) {
          const [, t, d] = part.split(':');
          params.set('has_edge', t);
          if (d) params.set('has_edge_dir', d);
        } else if (part === 'dead') params.set('is_dead', 'true');
        else if (part === 'bridge') params.set('is_bridge', 'true');
        else if (part.startsWith('name:')) params.set('name', part.slice(5));
        else if (part.startsWith('min-importance:')) params.set('min_importance', part.slice(15));
      }
      const res = await fetch(`/api/query/pattern?${params}`);
      const data = await res.json();
      setPatternResults(data.results ?? []);
      if (!data.results?.length) setPatternError('No matches found');
    } catch (e) {
      setPatternError('Query failed');
    } finally {
      setPatternLoading(false);
    }
  };

  const isBusy = isAnalyzingGitHub || isInitializingLocal;

  return (
    <main
      ref={shellRef}
      className={`app-shell${darkMode ? "" : " light-mode"}`}
      style={{
        "--left-width": showSidebars ? `${leftWidth}px` : "0px",
        "--right-width": showSidebars ? `${rightWidth}px` : "0px",
        gridTemplateColumns: showSidebars
          ? undefined
          : "minmax(0, 1fr)",
      } as React.CSSProperties}
    >
      {showSidebars && (
        <aside className="left-rail">
        <header className="brand-block">
          <div className="brand-mark"><Network size={22} /></div>
          <div style={{ flex: 1 }}>
            <h1>code-brain</h1>
            <p>Deterministic graph intelligence</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSidebars(false)}
            title="Collapse sidebars"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              color: 'var(--muted)', borderRadius: '6px', display: 'flex', alignItems: 'center',
              transition: 'color 0.2s',
            }}
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              color: 'var(--muted)', borderRadius: '6px', display: 'flex', alignItems: 'center',
              transition: 'color 0.2s',
            }}
          >
            {darkMode ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
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

        <section className="tool-panel" style={{ padding: '12px 14px', gap: '8px' }}>
          <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitBranch size={14} />
            <span>GitHub Repository</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              className="repo-input"
              placeholder="owner/repo or GitHub URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && analyzeGitHubRepo()}
            />

            <button
              className="primary-btn"
              onClick={analyzeGitHubRepo}
              disabled={isAnalyzingGitHub || !repoUrl}
            >
              {isAnalyzingGitHub ? 'Analyzing...' : 'Analyze'}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={initializeLocalRepo}
              disabled={isInitializingLocal || isAnalyzingGitHub}
              title="Initialize and re-index this local repository"
            >
              {isInitializingLocal ? 'Initializing...' : 'Init / Re-index Current Repo'}
            </button>
          </div>
          {isAnalyzingGitHub && analyzeProgress && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--muted)', fontFamily: 'monospace' }}>
              {analyzeProgress}
            </div>
          )}
        </section>

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
                <small>{relativeLabel(node.fullName || node.file)} | degree {node.degree}</small>
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

        {/* Language stats bar — derived from graph node types */}
        {payload && (() => {
          const extMap: Record<string, number> = {};
          payload.nodes.forEach(n => {
            const file = n.file || n.location?.file || '';
            const ext = file.includes('.') ? file.split('.').pop()!.toLowerCase() : '';
            if (ext && ext.length <= 6) extMap[ext] = (extMap[ext] || 0) + 1;
          });
          const sorted = Object.entries(extMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
          const total = sorted.reduce((s, [, c]) => s + c, 0);
          const langColors: Record<string, string> = {
            ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#f7df1e',
            py: '#3572A5', go: '#00ADD8', rs: '#dea584', java: '#b07219',
            cs: '#178600', cpp: '#f34b7d', c: '#555555', rb: '#701516',
            php: '#4F5D95', swift: '#F05138', kt: '#A97BFF', md: '#083fa1',
            json: '#40a02b', yaml: '#cb171e', css: '#563d7c', scss: '#c6538c',
          };
          if (sorted.length === 0) return null;
          return (
            <section className="tool-panel" style={{ paddingBottom: '4px' }}>
              <h2>
                <Code2 size={15} /> Languages
              </h2>
              <div style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: '12px', fontWeight: 600 }}>
                {totalLinesOfCode.toLocaleString()} lines of code
              </div>
              <div style={{ display: 'flex', height: '6px', borderRadius: '4px', overflow: 'hidden', margin: '0 0 8px' }}>
                {sorted.map(([ext, cnt]) => (
                  <div key={ext} style={{ flex: cnt, background: langColors[ext] || '#64748b', transition: 'flex 0.3s' }} title={`${ext}: ${cnt}`} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {sorted.map(([ext, cnt]) => (
                  <span key={ext} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: `${langColors[ext] || '#64748b'}22`, color: langColors[ext] || '#94a3b8', border: `1px solid ${langColors[ext] || '#64748b'}44` }}>
                    .{ext} <span style={{ opacity: 0.7 }}>{Math.round(cnt / total * 100)}%</span>
                  </span>
                ))}
              </div>
            </section>
          );
        })()}

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

        <section className="tool-panel">
          <h2>
            <AlertTriangle size={15} /> Dead Code
            <button
              type="button"
              onClick={loadDeadCode}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Scan
            </button>
          </h2>
          {showDeadCode && (
            <div className="hub-list">
              {deadCode.length === 0 ? (
                <div style={{ padding: '8px', color: '#64748b', fontSize: '12px' }}>
                  No dead code detected
                </div>
              ) : (
                deadCode.slice(0, 10).map((node: any) => (
                  <button key={node.id} type="button" onClick={() => selectNode(node.id)}>
                    <span>{node.name}</span>
                    <small>{node.type} - {node.file?.split('/').pop()}</small>
                  </button>
                ))
              )}
              {deadCode.length > 10 && (
                <div style={{ padding: '4px 8px', color: '#64748b', fontSize: '11px' }}>
                  +{deadCode.length - 10} more
                </div>
              )}
            </div>
          )}
        </section>

        <section className="tool-panel">
          <h2>
            <GitBranch size={15} /> Bridge Nodes
            <button
              type="button"
              onClick={loadBridges}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Find
            </button>
          </h2>
          {showBridges && (
            <div className="hub-list">
              {bridges.length === 0 ? (
                <div style={{ padding: '8px', color: '#64748b', fontSize: '12px' }}>
                  No bridge nodes found
                </div>
              ) : (
                bridges.map((node: any) => (
                  <button key={node.id} type="button" onClick={() => selectNode(node.id)}>
                    <span>{node.name}</span>
                    <small>{node.type} - importance {((node.importance || 0) * 100).toFixed(0)}%</small>
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        <section className="tool-panel">
          <h2>
            <AlertTriangle size={15} /> Security Signals
            <button
              type="button"
              onClick={loadSecurity}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Scan
            </button>
          </h2>
          {showSecurity && (
            <div className="hub-list">
              {securityIssues.length === 0 ? (
                <div style={{ padding: '8px', color: '#64748b', fontSize: '12px' }}>
                  No security signals detected
                </div>
              ) : (
                securityIssues.slice(0, 10).map((issue: any) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => {
                      const match = payload.nodes.find((node) => nodeFilePath(node) === issue.path);
                      if (match) selectNode(match.id);
                    }}
                  >
                    <span>{issue.title}</span>
                    <small>
                      {issue.severity} - {relativeLabel(issue.path)}:{issue.line}
                    </small>
                  </button>
                ))
              )}
              {securityIssues.length > 10 && (
                <div style={{ padding: '4px 8px', color: '#64748b', fontSize: '11px' }}>
                  +{securityIssues.length - 10} more
                </div>
              )}
            </div>
          )}
        </section>

        <section className="tool-panel">
          <h2>
            <CheckCircle2 size={15} /> Invariants
            <button
              type="button"
              onClick={loadInvariants}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Check
            </button>
          </h2>
          {invariants && <HealthRing score={Number(invariants.healthScore ?? 0)} />}
          {showInvariants && invariants && (
            <div style={{ fontSize: '12px' }}>
              <div style={{ padding: '8px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ marginTop: '4px', color: '#64748b' }}>
                  {invariants.errors?.length || 0} errors, {invariants.warnings?.length || 0} warnings
                </div>
              </div>
              {invariants.errors?.slice(0, 3).map((v: any, i: number) => (
                <div key={i} style={{ padding: '6px 8px', borderLeft: '3px solid #ef4444', margin: '4px 0', background: 'rgba(239,68,68,0.05)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>{v.nodeName}</div>
                  <div style={{ fontSize: '11px', color: '#f87171' }}>{v.message}</div>
                </div>
              ))}
              {invariants.warnings?.slice(0, 2).map((v: any, i: number) => (
                <div key={i} style={{ padding: '6px 8px', borderLeft: '3px solid #f59e0b', margin: '4px 0', background: 'rgba(245,158,11,0.05)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>{v.nodeName}</div>
                  <div style={{ fontSize: '11px', color: '#fbbf24' }}>{v.message}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pattern Query Panel */}
        <section className="tool-panel">
          <h2><Search size={15} /> Pattern Query</h2>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
            Find nodes by structure. Examples:
            <code style={{ display: 'block', marginTop: '4px', padding: '4px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '10px' }}>
              type:route no-edge:TESTS:incoming
            </code>
          </div>
          <div className="search-box" style={{ marginBottom: '6px' }}>
            <input
              value={patternQuery}
              onChange={e => setPatternQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runPatternQuery()}
              placeholder="type:route no-edge:TESTS:incoming"
              style={{ fontSize: '12px' }}
            />
            <button type="button" onClick={runPatternQuery} disabled={patternLoading}>
              {patternLoading ? '...' : 'Run'}
            </button>
          </div>
          {patternError && <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '4px 0' }}>{patternError}</div>}
          <div className="hub-list">
            {patternResults.map(n => (
              <button key={n.id} type="button" onClick={() => selectNode(n.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="dot" style={{ background: NODE_COLORS[n.type] || '#94a3b8', flexShrink: 0, width: '8px', height: '8px', borderRadius: '50%' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                <small style={{ opacity: 0.6, flexShrink: 0 }}>{n.type}</small>
              </button>
            ))}
          </div>
        </section>

        {/* ─── Complexity Panel ─────────────────────────────────────── */}
        <section className="tool-panel">
          <h2>
            <Activity size={15} /> Complexity
            <button
              type="button"
              onClick={loadComplexity}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Scan
            </button>
          </h2>
          {complexity && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '4px 8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['critical', 'high', 'medium', 'low'] as const).map(lv => {
                const colors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#4ade80' };
                return (
                  <span key={lv} style={{ color: colors[lv] }}>
                    {complexity.distribution[lv]} <span style={{ opacity: 0.6 }}>{lv}</span>
                  </span>
                );
              })}
            </div>
          )}
          {showComplexity && complexity && (
            <div className="hub-list">
              {(complexity.files as any[]).slice(0, 10).map((f: any) => {
                const colors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#4ade80' };
                return (
                  <button key={f.id} type="button" onClick={() => selectNode(f.id)}>
                    <span>{f.name}</span>
                    <small style={{ color: colors[f.level] }}>score {f.score} — {f.level}</small>
                  </button>
                );
              })}
              {complexity.total > 10 && (
                <div style={{ padding: '4px 8px', color: '#64748b', fontSize: '11px' }}>
                  +{complexity.total - 10} more files
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─── Duplicate Functions Panel ─────────────────────────────── */}
        <section className="tool-panel">
          <h2>
            <Code2 size={15} /> Duplicates
            <button
              type="button"
              onClick={loadDuplicates}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Scan
            </button>
          </h2>
          {showDuplicates && duplicates && (
            <div className="hub-list">
              {duplicates.total === 0 ? (
                <div style={{ padding: '8px', color: '#64748b', fontSize: '12px' }}>No duplicate function names detected</div>
              ) : (
                (duplicates.duplicates as any[]).slice(0, 8).map((d: any) => (
                  <div key={d.name} style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#f59e0b' }}>{d.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      Found in {d.count} files
                    </div>
                    {(d.files as string[]).slice(0, 2).map((f: string) => (
                      <div key={f} style={{ fontSize: '10px', color: '#64748b', paddingLeft: '8px' }}>
                        | {f.split('/').slice(-2).join('/')}
                      </div>
                    ))}
                  </div>
                ))
              )}
              {duplicates.total > 8 && (
                <div style={{ padding: '4px 8px', color: '#64748b', fontSize: '11px' }}>+{duplicates.total - 8} more</div>
              )}
            </div>
          )}
        </section>

        {/* ─── Layer Violations Panel ────────────────────────────────── */}
        <section className="tool-panel">
          <h2>
            <Filter size={15} /> Layer Violations
            <button
              type="button"
              onClick={loadLayerViolations}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Check
            </button>
          </h2>
          {showLayerViolations && layerViolations && (
            <div className="hub-list">
              {layerViolations.total === 0 ? (
                <div style={{ padding: '8px', color: '#4ade80', fontSize: '12px' }}>✓ No architecture violations found</div>
              ) : (
                (layerViolations.violations as any[]).slice(0, 8).map((v: any, i: number) => (
                  <div key={i} style={{ padding: '6px 8px', borderLeft: '3px solid #ef4444', margin: '4px 0', background: 'rgba(239,68,68,0.04)', fontSize: '11px' }}>
                    <div style={{ fontWeight: 600, color: '#f87171' }}>{v.fromLayer} → {v.toLayer}</div>
                    <div style={{ color: 'var(--muted)', marginTop: '2px' }}>
                      {v.from.split('/').pop()} imports {v.to.split('/').pop()}
                    </div>
                  </div>
                ))
              )}
              {layerViolations.total > 8 && (
                <div style={{ padding: '4px 8px', color: '#64748b', fontSize: '11px' }}>+{layerViolations.total - 8} more</div>
              )}
            </div>
          )}
        </section>

        {/* ─── Health Score Panel ─────────────────────────────────────── */}
        <section className="tool-panel">
          <h2>
            <CheckCircle2 size={15} /> Health Score
            <button
              type="button"
              onClick={loadHealthScore}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Compute
            </button>
          </h2>
          {showHealthScore && healthScore && (
            <div style={{ fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderBottom: '1px solid var(--line)' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: `conic-gradient(${healthScore.score >= 80 ? '#4ade80' : healthScore.score >= 60 ? '#f59e0b' : '#ef4444'} ${healthScore.score * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                  boxShadow: '0 0 0 3px var(--surface)',
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1, color: healthScore.score >= 80 ? '#4ade80' : healthScore.score >= 60 ? '#f59e0b' : '#ef4444' }}>
                    {healthScore.grade}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 700 }}>{healthScore.score}<span style={{ fontSize: '12px', opacity: 0.5 }}>/100</span></div>
                  <div style={{ color: 'var(--muted)', fontSize: '11px' }}>Overall health grade</div>
                </div>
              </div>
              <div style={{ padding: '6px 8px' }}>
                {Object.entries(healthScore.breakdown as Record<string, number>).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--muted)', fontSize: '11px' }}>
                    <span>{key.replace(/([A-Z])/g, ' $1').replace('Penalty', ' −').trim()}</span>
                    <span style={{ color: val > 0 ? '#f87171' : '#4ade80', fontWeight: 600 }}>{val > 0 ? `-${Math.round(val)}` : '0'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── Suggestions Panel ─────────────────────────────────────── */}
        <section className="tool-panel">
          <h2>
            <Braces size={15} /> Suggestions
            <button
              type="button"
              onClick={loadSuggestions}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
            >
              Analyze
            </button>
          </h2>
          {showSuggestions && (
            <div style={{ fontSize: '12px' }}>
              {suggestions.length === 0 ? (
                <div style={{ padding: '8px', color: '#4ade80' }}>✓ No improvements needed — looking great!</div>
              ) : (
                suggestions.map((s, i) => {
                  const priorityColors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#4ade80' };
                  return (
                    <div key={i} style={{ padding: '8px', borderLeft: `3px solid ${priorityColors[s.priority]}`, margin: '4px 0', background: `${priorityColors[s.priority]}08` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ background: priorityColors[s.priority], color: '#000', borderRadius: '4px', padding: '1px 5px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>{s.priority}</span>
                        <span style={{ fontWeight: 600 }}>{s.title}</span>
                      </div>
                      <div style={{ color: 'var(--muted)', marginBottom: '3px' }}>{s.desc}</div>
                      <div style={{ fontSize: '10px', color: '#60a5fa' }}>→ {s.action}</div>
                      <div style={{ fontSize: '10px', color: '#4ade80', marginTop: '2px' }}>✦ {s.impact}</div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

      </aside>
      )}

      {showSidebars && (
        <div
          className="panel-resizer"
          role="separator"
          aria-label="Resize left panel"
          aria-orientation="vertical"
          onPointerDown={(event) => startResize("left", event)}
        />
      )}

      <GraphStage
        payload={payload}
        selectedId={selectedId}
        hoveredId={hoveredIdRef.current}
        activeTypes={activeTypes}
        onSelect={selectNode}
        onHover={handleGraphHover}
        onExpandCluster={expandCommunity}
        cameraLocked={isCameraLocked}
        onToggleCameraLock={() => setIsCameraLocked(!isCameraLocked)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        vizType={vizType}
        onVizTypeChange={changeVizType}
        blastNodes={blastNodes}
        blastSourceId={blastSourceId}
        pathNodes={pathNodes}
        pathSourceId={pathSourceId}
        onClearPath={clearPath}
        onContextMenu={handleGraphContextMenu}
        searchQuery={query}
        churnData={churnData}
        showSidebars={showSidebars}
        setShowSidebars={setShowSidebars}
      />

      {legendPanel}

      {/* Context menu */}
      {contextMenu && contextMenu.nodeId && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: 'rgba(15,20,30,0.97)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px', padding: '6px', zIndex: 100, minWidth: '200px',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)',
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--muted)', borderBottom: '1px solid var(--line)', marginBottom: '4px' }}>
            <strong style={{ color: 'var(--text)' }}>{contextMenu.nodeName}</strong>
          </div>
          {[
            { label: 'Focus and expand', action: () => { selectNode(contextMenu.nodeId); setContextMenu(null); } },
            { label: 'Analyze impact', action: () => { analyzeImpact(contextMenu.nodeId, contextMenu.nodeName); setContextMenu(null); } },
            { label: 'Set as path source', action: () => { setPathMode({ source: contextMenu.nodeId }); setPathSourceId(contextMenu.nodeId); setContextMenu(null); } },
            ...(pathMode.source && pathMode.source !== contextMenu.nodeId
              ? [{ label: 'Find path from source', action: () => findPath(pathMode.source!, contextMenu.nodeId) }]
              : []),
            { label: 'Find callers', action: () => { selectNode(contextMenu.nodeId); setContextMenu(null); } },
            { label: 'Copy node ID', action: () => { navigator.clipboard.writeText(contextMenu.nodeId); setContextMenu(null); } },
          ].map(item => (
            <button key={item.label} type="button" onClick={item.action}
              style={{
                display: 'block', width: '100%', padding: '7px 10px', textAlign: 'left',
                background: 'transparent', border: 'none', borderRadius: '6px',
                color: 'var(--text)', fontSize: '12px', cursor: 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {showSidebars && (
        <div
          className="panel-resizer"
          role="separator"
          aria-label="Resize live node panel"
          aria-orientation="vertical"
          onPointerDown={(event) => startResize("right", event)}
        />
      )}

      {showSidebars && (
        <aside className="right-rail inspector-shell">
        <section className="inspector-head inspector-head-modern">
          <div className="inspector-breadcrumb">
            <span>Live Node Inspector</span>
            <small>{selectedNode ? relativeLabel(selectedNode.fullName || selectedNode.file) : "No node selected"}</small>
          </div>
          <div className="inspector-actions">
            <button
              type="button"
              title="Collapse sidebars"
              onClick={() => setShowSidebars(false)}
            >
              <X size={15} />
            </button>
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

        {blastNodes.size > 0 && (
          <div className="blast-banner">
            <span>{Math.max(0, blastNodes.size - 1)} nodes affected by this node</span>
            <button type="button" onClick={clearBlast}>Clear</button>
          </div>
        )}

        {pathMode.source && pathNodes.size === 0 && (
          <div className="path-banner">
            <span>Path source set. Right-click a target node.</span>
            <button type="button" onClick={clearPath}>Clear</button>
          </div>
        )}

        {pathNodes.size > 0 && (
          <div className="path-banner">
            <span>{pathNodes.size} nodes on shortest path</span>
            <button type="button" onClick={clearPath}>Clear</button>
          </div>
        )}

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
              {/* Security signals matching this node's file */}
              {(() => {
                const nodeFile = nodeFilePath(selectedNode);
                const matches = securityIssues.filter((issue: any) =>
                  issue.path && nodeFile && (
                    issue.path === nodeFile ||
                    issue.path.endsWith(nodeFile) ||
                    nodeFile.endsWith(issue.path)
                  )
                );
                if (matches.length === 0) return null;
                return (
                  <div style={{
                    marginTop: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                  }}>
                    {matches.map((issue: any, i: number) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        background: issue.severity === 'high'
                          ? 'rgba(239,68,68,0.12)'
                          : issue.severity === 'medium'
                            ? 'rgba(245,158,11,0.12)'
                            : 'rgba(148,163,184,0.08)',
                        border: `1px solid ${issue.severity === 'high' ? 'rgba(239,68,68,0.35)'
                          : issue.severity === 'medium' ? 'rgba(245,158,11,0.35)'
                            : 'rgba(148,163,184,0.2)'
                          }`,
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}>
                        <AlertTriangle
                          size={13}
                          style={{
                            flexShrink: 0,
                            marginTop: '1px',
                            color: issue.severity === 'high' ? '#ef4444'
                              : issue.severity === 'medium' ? '#f59e0b' : '#94a3b8',
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>
                            {issue.title}
                          </div>
                          <div style={{ color: 'var(--muted)' }}>
                            {issue.severity} | line {issue.line}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
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
                  maxHeight: showRelationships ? `${relationshipsHeight}px` : '56px',
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
                  v
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
      )}

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
                  <kbd>+</kbd> / <kbd>-</kbd>
                </div>
                <span>Zoom in / out</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>f</kbd>
                </div>
                <span>Fit graph to screen</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <kbd>b</kbd>
                </div>
                <span>Blast radius on selected node</span>
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

      {isBusy && (
        <div className="analysis-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="analysis-overlay__card">
            <div className="analysis-overlay__spinner" />
            <div className="analysis-overlay__title">
              {isInitializingLocal ? 'Initializing Repository...' : 'Analyzing Repository...'}
            </div>
            <div className="analysis-overlay__message">
              {analyzeProgress || 'Preparing analysis...'}
            </div>
            {analysisFileProgress && (
              <div className="analysis-overlay__detail">{analysisFileProgress}</div>
            )}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <footer style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: '28px',
        background: 'rgba(6,8,15,0.96)', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: '20px',
        fontSize: '11px', color: 'var(--muted)', backdropFilter: 'blur(12px)', zIndex: 50,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
          code-brain
        </span>
        <span>{payload?.stats.nodeCount ?? 0} nodes | {payload?.stats.edgeCount ?? 0} edges | {totalLinesOfCode.toLocaleString()} LOC</span>
        {payload?.analytics?.health && (
          <span>Health: <strong style={{ color: (payload.analytics.health.unresolvedEdges / Math.max(1, payload.stats.edgeCount)) < 0.1 ? '#10b981' : '#f59e0b' }}>
            {(100 - (payload.analytics.health.unresolvedEdges / Math.max(1, payload.stats.edgeCount)) * 100).toFixed(0)}%
          </strong></span>
        )}
        <span>View: <strong style={{ color: 'var(--accent)' }}>{viewMode}</strong></span>
        {lastUpdate && <span style={{ opacity: 0.7 }}>Updated: {lastUpdate}</span>}
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>Ctrl+K search | +/- zoom | F fit | B blast | Right-click nodes for actions</span>
      </footer>

    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
