/**
 * Legend builder utilities.
 * Builds the graph legend from the same colors and grouping rules used by the canvas.
 */

import { GraphEdge, GraphNode } from '../types';
import { LegendCategory } from '../components/CodeFlowLegend';
import { calculatePercentage } from './legend-metrics';

const NODE_COLORS: Record<string, string> = {
  project: '#f5c542',
  file: '#4cc9f0',
  module: '#8bd3ff',
  class: '#ff9f1c',
  function: '#4ade80',
  method: '#a78bfa',
  route: '#fb7185',
  config: '#f59e0b',
  test: '#f472b6',
  doc: '#94a3b8',
  interface: '#c084fc',
  type: '#38bdf8',
  constant: '#bef264',
  variable: '#67e8f9',
  enum: '#fdba74',
};

const EDGE_COLORS: Record<string, string> = {
  IMPORTS: '#38bdf8',
  EXPORTS: '#fb7185',
  CALLS: '#4ade80',
  CALLS_UNRESOLVED: '#f59e0b',
  OWNS: '#cbd5e1',
  DEFINES: '#60a5fa',
  USES: '#a78bfa',
  DEPENDS_ON: '#f87171',
  TESTS: '#f472b6',
  DOCUMENTS: '#94a3b8',
  IMPLEMENTS: '#2dd4bf',
  EXTENDS: '#fb923c',
  DECORATES: '#c084fc',
  REFERENCES: '#22d3ee',
  ENTRY_POINT: '#facc15',
};

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

function stableNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pathParts(file?: string): string[] {
  return String(file || '')
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:\//, '')
    .split('/')
    .filter(Boolean);
}

function nodeFilePath(node: GraphNode): string {
  return String(
    node.file ||
    node.location?.file ||
    (node.type === 'file' ? node.fullName || node.name : ''),
  );
}

function topFolder(node: GraphNode): string {
  const nameParts = node.name && /[\\/]/.test(node.name) ? pathParts(node.name) : [];
  if (nameParts.length > 1) return nameParts[0];

  const parts = pathParts(nodeFilePath(node));
  const projectRootMarkers = ['src', 'ui', 'lib', 'app', 'packages', 'dist', 'tests', 'python', 'vscode-extension'];
  const markerIndex = parts.findIndex((part) => projectRootMarkers.includes(part.toLowerCase()));
  if (markerIndex >= 0) return parts[markerIndex];
  return parts[0] ?? 'root';
}

/**
 * Build legend categories from graph nodes and edges.
 */
export function buildLegendCategories(nodes: GraphNode[], edges: GraphEdge[] = []): LegendCategory[] {
  const nodesByType: Record<string, number> = {};
  const nodesByFolder: Record<string, number> = {};
  const nodesByLayer: Record<string, number> = {};
  const edgesByType: Record<string, number> = {};

  nodes.forEach((node) => {
    nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    nodesByFolder[topFolder(node)] = (nodesByFolder[topFolder(node)] || 0) + 1;
    nodesByLayer[getNodeLayer(node.type)] = (nodesByLayer[getNodeLayer(node.type)] || 0) + 1;
  });

  edges.forEach((edge) => {
    edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
  });

  const totalNodes = nodes.length;
  const categories: LegendCategory[] = [
    {
      id: 'node-types',
      label: 'Node Types',
      icon: '#',
      items: Object.entries(nodesByType)
        .map(([type, count]) => ({
          id: `type-${type}`,
          label: type.charAt(0).toUpperCase() + type.slice(1),
          color: NODE_COLORS[type] || '#94a3b8',
          count,
          percentage: calculatePercentage(count, totalNodes),
        }))
        .sort((a, b) => b.count - a.count),
    },
    {
      id: 'folders',
      label: 'Folders',
      icon: '/',
      items: Object.entries(nodesByFolder)
        .map(([folder, count]) => ({
          id: `folder-${folder}`,
          label: folder,
          color: FOLDER_PALETTE[stableNumber(folder) % FOLDER_PALETTE.length],
          count,
          percentage: calculatePercentage(count, totalNodes),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    },
    {
      id: 'layers',
      label: 'Layers',
      icon: 'L',
      items: Object.entries(nodesByLayer)
        .map(([layer, count]) => ({
          id: `layer-${layer}`,
          label: layer,
          color: getLayerColor(layer),
          count,
          percentage: calculatePercentage(count, totalNodes),
        }))
        .sort((a, b) => b.count - a.count),
    },
  ];

  if (edges.length > 0) {
    categories.push({
      id: 'edge-types',
      label: 'Relationships',
      icon: '->',
      items: Object.entries(edgesByType)
        .map(([type, count]) => ({
          id: `edge-${type}`,
          label: type.replace(/_/g, ' '),
          color: EDGE_COLORS[type] || '#94a3b8',
          count,
          percentage: calculatePercentage(count, edges.length),
        }))
        .sort((a, b) => b.count - a.count),
    });
  }

  return categories.filter((category) => category.items.length > 0);
}

function getNodeLayer(type: string): string {
  const layers: Record<string, string> = {
    project: 'Project',
    file: 'File',
    module: 'Module',
    class: 'Class',
    function: 'Function',
    method: 'Method',
    route: 'Route',
    config: 'Config',
    test: 'Test',
    doc: 'Documentation',
    interface: 'Interface',
    type: 'Type',
    constant: 'Constant',
    variable: 'Variable',
    enum: 'Enum',
  };
  return layers[type] || 'Other';
}

function getLayerColor(layer: string): string {
  const colors: Record<string, string> = {
    Project: '#f5c542',
    File: '#4cc9f0',
    Module: '#8bd3ff',
    Class: '#ff9f1c',
    Function: '#4ade80',
    Method: '#a78bfa',
    Route: '#fb7185',
    Config: '#f59e0b',
    Test: '#f472b6',
    Documentation: '#94a3b8',
    Interface: '#c084fc',
    Type: '#38bdf8',
    Constant: '#bef264',
    Variable: '#67e8f9',
    Enum: '#fdba74',
  };
  return colors[layer] || '#94a3b8';
}

export function buildSimpleLegend(nodes: GraphNode[]): LegendCategory[] {
  return buildLegendCategories(nodes).filter((category) => category.id === 'node-types');
}
