import React from 'react';
import { Activity, ChevronDown, Folder, Layers } from 'lucide-react';
import { GraphPayload, ViewMode } from '../types';
import { fileWeight, NODE_COLORS, folderColor, topFolder } from '../main';

interface GraphLegendProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  legendCollapsed: boolean;
  setLegendCollapsed: (collapsed: boolean) => void;
  payload: GraphPayload;
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
}: GraphLegendProps) {
  const totalLines = payload.nodes.reduce((sum, node) => sum + fileWeight(node), 0);
  const folderCounts = new Map<string, number>();
  payload.nodes.forEach((node) => {
    const folder = topFolder(node);
    folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
  });

  const folderItems = [...folderCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({
      id: label,
      label,
      color: folderColor(label),
      value: count,
    }));

  const layerItems = Object.entries(payload.stats.nodesByType)
    .slice(0, 6)
    .map(([label, count]) => ({
      id: label,
      label,
      color: NODE_COLORS[label] || '#94a3b8',
      value: count,
    }));

  const items = viewMode === 'folder' ? folderItems : layerItems;

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
              {viewMode === 'folder' ? 'Top Folders' : viewMode === 'layer' ? 'Top Types' : 'Node Types'}
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
