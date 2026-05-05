/**
 * Semantic Compression Module
 * 
 * Compression techniques for AI export optimization
 * Implements:
 * 1. Exact deduplication (same ID = same node)
 * 2. Metadata stripping (remove redundant data)
 */

import { GraphNode, GraphEdge } from '../types/models.js';
import { logger } from '../utils/logger.js';

interface CompressionStats {
  originalNodes: number;
  originalEdges: number;
  compressedNodes: number;
  compressedEdges: number;
  compressionRatio: number;
  techniques: string[];
}

/**
 * Strip redundant metadata to reduce size
 */
export function stripRedundantMetadata(nodes: GraphNode[]): GraphNode[] {
  return nodes.map(node => {
    const stripped = { ...node };

    // Remove metadata that can be inferred
    if (stripped.metadata) {
      const metadata = { ...stripped.metadata };

      // Remove redundant file paths (already in location)
      if (metadata.filePath && node.location?.file) {
        delete metadata.filePath;
      }

      // Remove empty arrays/objects
      for (const [key, value] of Object.entries(metadata)) {
        if (Array.isArray(value) && value.length === 0) {
          delete metadata[key];
        }
        if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
          delete metadata[key];
        }
      }

      stripped.metadata = Object.keys(metadata).length > 0 ? metadata : undefined;
    }

    // Truncate long summaries
    if (stripped.summary && stripped.summary.length > 200) {
      stripped.summary = stripped.summary.slice(0, 197) + '...';
    }

    return stripped;
  });
}

/**
 * Apply semantic compression (exact deduplication + metadata stripping only)
 */
export function applySemanticCompression(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: {
    metadataStripping?: boolean;
  } = {}
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: CompressionStats;
} {
  const { metadataStripping = true } = options;
  const originalCount = nodes.length;
  const techniques: string[] = [];

  // Exact deduplication only — same id = same node, keep first occurrence
  const seen = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (!seen.has(node.id)) seen.set(node.id, node);
  }
  let resultNodes = Array.from(seen.values());
  const resultEdges = edges.filter(e => seen.has(e.from) && seen.has(e.to));
  techniques.push('exact-dedup');

  if (metadataStripping) {
    resultNodes = stripRedundantMetadata(resultNodes);
    techniques.push('metadata-stripping');
  }

  const ratio = originalCount / Math.max(1, resultNodes.length);
  return {
    nodes: resultNodes,
    edges: resultEdges,
    stats: {
      originalNodes: originalCount,
      originalEdges: edges.length,
      compressedNodes: resultNodes.length,
      compressedEdges: resultEdges.length,
      compressionRatio: ratio,
      techniques,
    },
  };
}
