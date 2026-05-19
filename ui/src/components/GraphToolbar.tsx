import React from 'react';
import {
  LocateFixed,
  Network,
  BoxSelect,
  Keyboard,
  GitBranch,
  ArrowRight,
  Activity,
  CircleDot
} from 'lucide-react';
import { VizType, ViewMode, LayoutMode } from '../types';

interface GraphToolbarProps {
  vizType: VizType;
  onVizTypeChange: (type: VizType) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
}

export function GraphToolbar({
  vizType,
  onVizTypeChange,
  viewMode,
  onViewModeChange,
  layoutMode,
  onLayoutModeChange
}: GraphToolbarProps) {
  return (
    <>
      <div className="graph-toolbar" style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-start', maxWidth: 'min(92%, 860px)', gap: '5px', background: 'rgba(10,14,23,0.92)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
        padding: '3px', zIndex: 20, backdropFilter: 'blur(16px)', overflowX: 'auto', overflowY: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        {([
          ['vector', LocateFixed, 'Vector Graph'],
          ['graph', Network, 'Graph'],
          ['vein', Network, 'Vein'],
          ['treemap', BoxSelect, 'Treemap'],
          ['matrix', Keyboard, 'Matrix'],
          ['tree', GitBranch, 'Tree'],
          ['flow', ArrowRight, 'Flow'],
          ['cluster', Activity, 'Cluster'],
          ['bundle', CircleDot, 'Bundle'],
        ] as const).map(([type, Icon, label]) => (
          <button
            key={type}
            type="button"
            onClick={() => onVizTypeChange(type as VizType)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              padding: '7px 11px',
              borderRadius: '7px',
              border: 'none',
              fontSize: '11px',
              fontWeight: 750,
              cursor: 'pointer',
              transition: 'all 150ms',
              background: vizType === type ? 'rgba(34,197,94,0.16)' : 'transparent',
              color: vizType === type ? '#6dff9d' : '#9ca3af',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div className="graph-toolbar" style={{
        position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexWrap: 'nowrap', justifyContent: 'flex-start', maxWidth: 'min(88%, 560px)', gap: '3px', background: 'rgba(10,14,23,0.82)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
        padding: '3px', zIndex: 20, backdropFilter: 'blur(16px)', overflowX: 'auto', overflowY: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}>
        {(['type', 'importance', 'dead', 'bridge', 'folder', 'layer', 'churn'] as const).map(mode => (
          <button key={mode} type="button"
            onClick={() => onViewModeChange(mode as ViewMode)}
            style={{
              padding: '5px 9px',
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              borderRadius: '7px',
              border: 'none',
              background: viewMode === mode ? 'rgba(6,182,212,0.2)' : 'transparent',
              color: viewMode === mode ? '#22d3ee' : '#64748b',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}>
            {mode === 'type' ? 'Type' : mode === 'importance' ? 'Heat' : mode === 'dead' ? 'Dead' : mode === 'bridge' ? 'Bridge' : mode === 'folder' ? 'Folder' : mode === 'churn' ? 'Churn' : 'Layer'}
          </button>
        ))}
      </div>
      {(['vein', 'symbols', 'vector', 'graph'].includes(vizType)) && (
        <div className="graph-toolbar" style={{
          position: 'absolute', top: 108, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexWrap: 'nowrap', gap: '3px', background: 'rgba(10,14,23,0.82)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
          padding: '3px', zIndex: 20, backdropFilter: 'blur(16px)', overflowX: 'auto', overflowY: 'hidden', maxWidth: 'min(88%, 420px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          {(['force', 'radial', 'hierarchical', 'grid'] as const).map(mode => (
            <button key={mode} type="button"
              onClick={() => onLayoutModeChange(mode as LayoutMode)}
              style={{
                padding: '5px 12px',
                flex: '0 0 auto',
                whiteSpace: 'nowrap',
                borderRadius: '7px',
                border: 'none',
                background: layoutMode === mode ? 'rgba(6,182,212,0.2)' : 'transparent',
                color: layoutMode === mode ? '#22d3ee' : '#64748b',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}>
              {mode === 'force' ? 'Force' : mode === 'radial' ? 'Radial' : mode === 'hierarchical' ? 'Layers' : 'Grid'}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
