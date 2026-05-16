import React from 'react';
import { Folder, Layers, Activity } from 'lucide-react';
import { ViewMode, GraphPayload } from '../types';
import { NODE_COLORS, folderColor, topFolder } from '../main';

interface GraphLegendProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  legendCollapsed: boolean;
  setLegendCollapsed: (collapsed: boolean) => void;
  payload: GraphPayload;
}

export function GraphLegend({
  viewMode,
  setViewMode,
  legendCollapsed,
  setLegendCollapsed,
  payload
}: GraphLegendProps) {
  return (
    <section 
      className={`legend ${legendCollapsed ? 'collapsed' : ''}`}
      style={{ 
        position: 'absolute', 
        bottom: '24px', 
        right: '24px', 
        zIndex: 50, 
        width: '260px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        background: 'rgba(10, 15, 25, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'all 0.2s',
      }}
    >
      <div 
        className="legend-header" 
        style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: legendCollapsed ? 'none' : '1px solid rgba(255,255,255,0.08)' }}
        onClick={() => setLegendCollapsed(!legendCollapsed)}
      >
        <div className="legend-title" style={{ margin: 0, fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
          {viewMode === 'folder' ? 'Folders' : viewMode === 'layer' ? 'Layers' : viewMode === 'churn' ? 'Churn' : 'Legend'}
        </div>
        <span className="legend-toggle" style={{ fontSize: '10px', transform: legendCollapsed ? 'rotate(-90deg)' : 'rotate(0)' }}>▼</span>
      </div>

      {!legendCollapsed && (
        <div style={{ padding: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: '12px', textTransform: 'uppercase' }}>Color By</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={() => setViewMode('folder')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
                background: viewMode === 'folder' ? 'rgba(74, 222, 128, 0.08)' : 'transparent',
                color: viewMode === 'folder' ? '#4ade80' : 'var(--text)',
                border: 'none',
                textAlign: 'left',
                width: '100%',
                fontFamily: 'inherit',
                fontSize: '13px'
              }}
            >
              <Folder size={15} /> Folder
            </button>
            <button
              onClick={() => setViewMode('layer')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
                background: viewMode === 'layer' ? 'rgba(74, 222, 128, 0.08)' : 'transparent',
                color: viewMode === 'layer' ? '#4ade80' : 'var(--text)',
                border: 'none',
                textAlign: 'left',
                width: '100%',
                fontFamily: 'inherit',
                fontSize: '13px'
              }}
            >
              <Layers size={15} /> Layer
            </button>
            <button
              onClick={() => setViewMode('churn')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
                background: viewMode === 'churn' ? 'rgba(74, 222, 128, 0.08)' : 'transparent',
                color: viewMode === 'churn' ? '#4ade80' : 'var(--text)',
                border: 'none',
                textAlign: 'left',
                width: '100%',
                fontFamily: 'inherit',
                fontSize: '13px'
              }}
            >
              <Activity size={15} /> Churn
            </button>
          </div>
          
          <div style={{ marginTop: '20px', fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: '12px', textTransform: 'uppercase' }}>
            {viewMode === 'folder' ? 'Folders' : viewMode === 'layer' ? 'Layers' : 'Types'}
          </div>
          
          {viewMode === 'folder' && (() => {
            const folderCounts = new Map<string, number>();
            payload.nodes.forEach((node) => {
              const folder = topFolder(node);
              folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
            });
            const folders = [...folderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {folders.map(([folder, count]) => (
                  <div key={folder} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--muted)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: folderColor(folder) }} />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder}</span>
                    <span style={{ opacity: 0.5 }}>{count}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          
          {viewMode !== 'folder' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.entries(payload.stats.nodesByType).slice(0, 6).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--muted)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: NODE_COLORS[type] || "#e2e8f0" }} />
                  <span style={{ flex: 1, textTransform: 'capitalize' }}>{type}</span>
                  <span style={{ opacity: 0.5 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
