import React from 'react';
import { Activity, ChevronDown, Folder, Layers } from 'lucide-react';
import { GraphPayload, ViewMode } from '../types';
import { fileWeight, folderColor, layerColor, nodeTypeColor, topFolder } from '../main';

interface GraphLegendProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  legendCollapsed: boolean;
  setLegendCollapsed: (collapsed: boolean) => void;
  payload: GraphPayload;
  churnData?: Record<string, { changes: number; authors: number; hotspot: boolean }> | null;
}

type LegendMode = {
  id: Extract<ViewMode, 'folder' | 'layer' | 'churn'>;
  label: string;
  meta: string;
  icon: React.ReactNode;
};

const MODES: LegendMode[] = [
  { id: 'folder', label: 'Folder Color', meta: 'Project structure', icon: <Folder size={15} /> },
  { id: 'layer', label: 'Layer Color', meta: 'Architecture depth', icon: <Layers size={15} /> },
  { id: 'churn', label: 'Churn Color', meta: 'Recent file activity', icon: <Activity size={15} /> },
];

export function GraphLegend({
  viewMode,
  setViewMode,
  legendCollapsed,
  setLegendCollapsed,
  payload,
  churnData,
}: GraphLegendProps) {
  const totalLines = payload.nodes.reduce((sum, node) => sum + fileWeight(node), 0);
  const nodePath = (node: GraphPayload['nodes'][number]) => String(
    node.file ||
    node.location?.file ||
    (node.type === 'file' ? node.fullName || node.name : ''),
  );
  const pathParts = (file: string) => file.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '').split('/').filter(Boolean);
  const layerName = (node: GraphPayload['nodes'][number]) => {
    const knownLayers: Record<string, string> = {
      utils: 'Utilities',
      util: 'Utilities',
      services: 'Services',
      service: 'Services',
      components: 'Components',
      component: 'Components',
      controllers: 'Controllers',
      controller: 'Controllers',
      models: 'Models',
      model: 'Models',
      lib: 'Libraries',
      libs: 'Libraries',
      tests: 'Tests',
      test: 'Tests',
      __tests__: 'Tests',
      config: 'Config',
    };
    const part = pathParts(nodePath(node)).map((value) => value.toLowerCase()).find((value) => knownLayers[value]);
    return part ? knownLayers[part] : 'Other';
  };

  type LegendItem = { id: string; label: string; color: string; value: number };
  const folderCounts = new Map<string, number>();
  const layerCounts = new Map<string, number>();
  const deadCounts = new Map<string, number>();
  const bridgeCounts = new Map<string, number>();
  const heatCounts = new Map<string, number>();
  const churnCounts = new Map<string, number>();
  payload.nodes.forEach((node) => {
    const folder = topFolder(node);
    folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
    const layer = layerName(node);
    layerCounts.set(layer, (layerCounts.get(layer) || 0) + 1);
    deadCounts.set(node.metadata?.isDead ? 'Dead' : 'Active', (deadCounts.get(node.metadata?.isDead ? 'Dead' : 'Active') || 0) + 1);
    bridgeCounts.set(node.metadata?.isBridge ? 'Bridge' : 'Normal', (bridgeCounts.get(node.metadata?.isBridge ? 'Bridge' : 'Normal') || 0) + 1);
    const importance = (node as any).importance ?? node.rank?.score ?? 0;
    const heat = importance >= 0.66 ? 'High' : importance >= 0.33 ? 'Medium' : 'Low';
    heatCounts.set(heat, (heatCounts.get(heat) || 0) + 1);
    const churn = churnData?.[nodePath(node)];
    const churnBucket = !churnData ? 'Loading' : !churn ? 'No Git Activity' : churn.hotspot ? 'Hotspot' : churn.changes < 3 ? 'Low Churn' : churn.changes < 8 ? 'Medium Churn' : 'High Churn';
    churnCounts.set(churnBucket, (churnCounts.get(churnBucket) || 0) + 1);
  });

  const folderItems: LegendItem[] = [...folderCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({
      id: label,
      label,
      color: folderColor(label),
      value: count,
    }));

  const typeItems: LegendItem[] = Object.entries(payload.stats.nodesByType)
    .slice(0, 6)
    .map(([label, count]) => ({
      id: label,
      label,
      color: nodeTypeColor(label),
      value: count,
    }));

  const layerItems: LegendItem[] = [...layerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ id: label, label, color: layerColor(label), value: count }));

  const heatItems: LegendItem[] = [...heatCounts.entries()]
    .sort((a, b) => ['High', 'Medium', 'Low'].indexOf(a[0]) - ['High', 'Medium', 'Low'].indexOf(b[0]))
    .map(([label, count]) => ({ id: label, label, color: label === 'High' ? 'rgb(255,0,40)' : label === 'Medium' ? 'rgb(170,85,40)' : 'rgb(0,255,40)', value: count }));

  const deadItems: LegendItem[] = [...deadCounts.entries()]
    .map(([label, count]) => ({ id: label, label, color: label === 'Dead' ? '#ef4444' : 'rgba(71,85,105,0.5)', value: count }));

  const bridgeItems: LegendItem[] = [...bridgeCounts.entries()]
    .map(([label, count]) => ({ id: label, label, color: label === 'Bridge' ? '#f59e0b' : 'rgba(71,85,105,0.5)', value: count }));

  const churnItems: LegendItem[] = [...churnCounts.entries()]
    .map(([label, count]) => ({
      id: label,
      label,
      color: label === 'Hotspot' ? '#ef4444' : label === 'High Churn' ? '#f97316' : label === 'Medium Churn' ? '#eab308' : label === 'Low Churn' ? '#06b6d4' : '#64748b',
      value: count,
    }));

  const items =
    viewMode === 'folder' ? folderItems :
    viewMode === 'layer' ? layerItems :
    viewMode === 'importance' ? heatItems :
    viewMode === 'dead' ? deadItems :
    viewMode === 'bridge' ? bridgeItems :
    viewMode === 'churn' ? churnItems :
    typeItems;

  return (
    <section className={`legend${legendCollapsed ? ' collapsed' : ''}`}>
      <div className="legend-header">
        <div className="legend-title-wrap">
          <span className="legend-kicker">Graph Legend</span>
          <h3 className="legend-title">
            {viewMode === 'folder' ? 'Color By Folder' : viewMode === 'layer' ? 'Color By Layer' : 'Color By Churn'}
          </h3>
        </div>
        <button
          type="button"
          className="legend-toggle"
          onClick={() => setLegendCollapsed(!legendCollapsed)}
          aria-label={legendCollapsed ? 'Expand legend' : 'Collapse legend'}
          aria-expanded={!legendCollapsed}
        >
          <ChevronDown
            size={16}
            style={{ transform: legendCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
          />
        </button>
      </div>

      {!legendCollapsed && (
        <div className="legend-body">
          <div className="legend-actions">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`legend-mode-btn${viewMode === mode.id ? ' is-active' : ''}`}
                onClick={() => setViewMode(mode.id)}
              >
                {mode.icon}
                <span>{mode.label}</span>
                <span className="legend-mode-meta">{mode.meta}</span>
              </button>
            ))}
          </div>

          <div>
            <div className="legend-subtitle">
              {viewMode === 'folder' ? 'Top Folders' : viewMode === 'layer' ? 'Detected Layers' : viewMode === 'type' ? 'Node Types' : 'Current Buckets'}
            </div>
            <div className="legend-list">
              {items.map((item) => (
                <div key={item.id} className="legend-list-item">
                  <span className="legend-dot" style={{ color: item.color, background: item.color }} />
                  <span className="legend-list-label">{item.label}</span>
                  <span className="legend-list-value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="legend-note">
            {totalLines.toLocaleString()} lines of code across the current graph. Use the legend to switch color strategy without losing your current layout or selection.
          </p>
        </div>
      )}
    </section>
  );
}
