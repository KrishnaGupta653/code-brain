/**
 * Legend builder utilities.
 * Builds the graph legend from the same colors and grouping rules used by the canvas.
 */

import { GraphEdge, GraphNode } from '../types';
import { LegendCategory } from '../components/CodeFlowLegend';
import { calculatePercentage } from './legend-metrics';

function stableNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function colorFromKey(key: string, saturation: number, lightness: number): string {
  return hslToHex(stableNumber(key) % 360, saturation, lightness);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] :
    [c, 0, x];
  return `#${[r, g, b].map((channel) => {
    const value = Math.round((channel + m) * 255);
    return value.toString(16).padStart(2, '0');
  }).join('')}`;
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
          color: colorFromKey(`type:${type}`, 70, 62),
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
          color: colorFromKey(`folder:${folder}`, 74, 58),
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
          color: colorFromKey(`edge:${type}`, 68, 60),
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
  return colorFromKey(`layer:${layer}`, 66, 60);
}

export function buildSimpleLegend(nodes: GraphNode[]): LegendCategory[] {
  return buildLegendCategories(nodes).filter((category) => category.id === 'node-types');
}
