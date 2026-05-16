/**
 * Legend Metrics and Statistics Utilities
 * Provides utilities for calculating and formatting legend data
 */

import { GraphNode, GraphEdge } from '../types';

export interface MetricsSnapshot {
  totalFiles: number;
  totalFunctions: number;
  totalLines: number;
  unusedCount: number;
  healthScore: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

export interface LanguageBreakdown {
  language: string;
  percentage: number;
  color: string;
  count: number;
}

/**
 * Calculate metrics from graph data
 */
export function calculateMetrics(nodes: GraphNode[], edges: GraphEdge[]): MetricsSnapshot {
  const nodesByType: Record<string, number> = {};
  const edgesByType: Record<string, number> = {};

  nodes.forEach(node => {
    nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
  });

  edges.forEach(edge => {
    edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
  });

  const unusedCount = nodes.filter(n => n.incomingCount === 0 && n.outgoingCount === 0).length;

  return {
    totalFiles: nodesByType['file'] || 0,
    totalFunctions: nodesByType['function'] || 0,
    totalLines: 0, // Would need to be calculated from source
    unusedCount,
    healthScore: 75, // Placeholder
    nodesByType,
    edgesByType,
  };
}

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Get health grade based on score
 */
export function getHealthGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Get health color based on grade
 */
export function getHealthColor(grade: string, theme: any): string {
  switch (grade) {
    case 'A':
    case 'B':
      return theme.green;
    case 'C':
      return theme.amber;
    case 'D':
    case 'F':
      return theme.red;
    default:
      return theme.text;
  }
}

/**
 * Calculate language breakdown from nodes
 */
export function calculateLanguageBreakdown(
  nodes: GraphNode[],
  colorMap: Record<string, string>
): LanguageBreakdown[] {
  const languageCounts: Record<string, number> = {};

  nodes.forEach(node => {
    if (node.file) {
      const ext = node.file.split('.').pop() || 'unknown';
      languageCounts[ext] = (languageCounts[ext] || 0) + 1;
    }
  });

  const total = Object.values(languageCounts).reduce((a, b) => a + b, 0);

  return Object.entries(languageCounts)
    .map(([lang, count]) => ({
      language: lang,
      count,
      percentage: calculatePercentage(count, total),
      color: colorMap[lang] || '#94a3b8',
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get node type icon
 */
export function getNodeTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    file: '📄',
    folder: '📁',
    module: '📦',
    class: '🏛️',
    function: '⚙️',
    method: '🔧',
    route: '🛣️',
    config: '⚙️',
    test: '✅',
    doc: '📖',
    interface: '🔌',
    type: '📝',
    constant: '🔒',
    variable: '📊',
    enum: '📋',
  };
  return icons[type] || '•';
}

/**
 * Get edge type icon
 */
export function getEdgeTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    IMPORTS: '📥',
    EXPORTS: '📤',
    CALLS: '📞',
    CALLS_UNRESOLVED: '❓',
    OWNS: '👑',
    DEFINES: '✍️',
    USES: '🔗',
    DEPENDS_ON: '⛓️',
    TESTS: '✅',
    DOCUMENTS: '📚',
    IMPLEMENTS: '🔨',
    EXTENDS: '🔄',
    DECORATES: '✨',
    REFERENCES: '👉',
    ENTRY_POINT: '🚀',
  };
  return icons[type] || '→';
}
