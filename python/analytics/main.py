#!/usr/bin/env python3
"""
code-brain analytics layer.
Uses NetworkX for graph analysis and centrality computation.
"""

import argparse
import json
import sys
from typing import Dict, List, Any

try:
    import networkx as nx
except ImportError:
    print('Error: networkx not installed. Run: pip install networkx', file=sys.stderr)
    sys.exit(1)

from graph import GraphAnalytics


def analyze_graph(graph_data: Dict[str, Any], fast_mode: bool = False) -> Dict[str, Any]:
    """Main analysis function with partial result support."""
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])
    fingerprint = graph_data.get('fingerprint', '')

    if not nodes:
        return {'error': 'No nodes provided', 'fingerprint': fingerprint}

    # Build graph
    try:
        analytics = GraphAnalytics(nodes, edges)
    except Exception as e:
        return {'error': f'Failed to build graph: {e}', 'fingerprint': fingerprint}

    # Initialize results with defaults
    results: Dict[str, Any] = {
        'centrality': {},
        'communities': {},
        'importance': {},
        'keyPaths': [],
        'clustering': {},
        'layers': {},
        'removalImpact': {},
        'fingerprint': fingerprint,
        'graph_stats': {
            'nodes': len(nodes),
            'edges': len(edges),
            'density': 0.0
        },
        'partial': False,
        'errors': []
    }

    # Compute centrality (always try, even in fast mode)
    try:
        if not fast_mode:
            results['centrality'] = analytics.centrality()
    except Exception as e:
        results['errors'].append(f'Centrality failed: {str(e)}')
        results['partial'] = True

    # Compute importance (PageRank or degree centrality)
    try:
        results['importance'] = analytics.pagerank()
    except Exception as e:
        results['errors'].append(f'Importance failed: {str(e)}')
        results['partial'] = True

    # Detect communities (skip in fast mode for very large graphs)
    try:
        if not fast_mode or len(nodes) < 10000:
            communities_list = analytics.communities()
            # Convert to nodeId -> communityId map
            community_map = {}
            for idx, community in enumerate(communities_list):
                for node_id in community:
                    community_map[node_id] = idx
            results['communities'] = community_map
    except Exception as e:
        results['errors'].append(f'Communities failed: {str(e)}')
        results['partial'] = True

    # Compute clustering coefficients
    try:
        if not fast_mode:
            results['clustering'] = analytics.clustering()
    except Exception as e:
        results['errors'].append(f'Clustering failed: {str(e)}')
        results['partial'] = True

    # Compute topological layers
    try:
        if not fast_mode:
            results['layers'] = analytics.topological_layers()
    except Exception as e:
        results['errors'].append(f'Layers failed: {str(e)}')
        results['partial'] = True

    # Compute removal impact
    try:
        if not fast_mode and len(nodes) < 1000:
            results['removalImpact'] = analytics.removal_impact()
    except Exception as e:
        results['errors'].append(f'Removal impact failed: {str(e)}')
        results['partial'] = True

    # Find key paths
    try:
        if not fast_mode and len(nodes) < 5000:
            results['keyPaths'] = analytics.key_paths(limit=10)
    except Exception as e:
        results['errors'].append(f'Key paths failed: {str(e)}')
        results['partial'] = True

    # Compute graph statistics
    try:
        stats = analytics.statistics()
        results['graph_stats'] = stats
    except Exception as e:
        results['errors'].append(f'Statistics failed: {str(e)}')

    return results


def main():
    """Read graph from stdin and output analysis results."""
    parser = argparse.ArgumentParser(description='Analyze code graph')
    parser.add_argument('--fast', action='store_true', 
                       help='Fast mode: skip expensive algorithms')
    
    args = parser.parse_args()

    try:
        input_data = json.load(sys.stdin)
        results = analyze_graph(input_data, fast_mode=args.fast)
        json.dump(results, sys.stdout, indent=2)
    except json.JSONDecodeError as e:
        error_result = {
            'error': f'JSON parse error: {e}',
            'centrality': {},
            'communities': {},
            'importance': {},
            'keyPaths': [],
            'clustering': {},
            'layers': {},
            'removalImpact': {},
            'partial': True
        }
        json.dump(error_result, sys.stdout, indent=2)
        sys.exit(1)
    except Exception as e:
        error_result = {
            'error': str(e),
            'centrality': {},
            'communities': {},
            'importance': {},
            'keyPaths': [],
            'clustering': {},
            'layers': {},
            'removalImpact': {},
            'partial': True
        }
        json.dump(error_result, sys.stdout, indent=2)
        sys.exit(1)


if __name__ == '__main__':
    main()
