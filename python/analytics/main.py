#!/usr/bin/env python3
"""
code-brain analytics layer.
Uses NetworkX for graph analysis and centrality computation.
"""

import json
import sys
from typing import Dict, List, Tuple, Any

try:
    import networkx as nx
except ImportError:
    print('Error: networkx not installed. Run: pip install networkx', file=sys.stderr)
    sys.exit(1)


def build_graph(nodes: List[Dict], edges: List[Dict]) -> nx.DiGraph:
    """Build a directed graph from nodes and edges."""
    G = nx.DiGraph()

    # Add nodes with attributes
    for node in nodes:
        G.add_node(node['id'], **node)

    # Add edges
    for edge in edges:
        G.add_edge(edge['from'], edge['to'], type=edge.get('type', 'UNKNOWN'))

    return G


def compute_centrality(G: nx.DiGraph) -> Dict[str, float]:
    """Compute betweenness centrality for all nodes."""
    try:
        centrality = nx.betweenness_centrality(G)
        return {k: float(v) for k, v in centrality.items()}
    except Exception as e:
        print(f'Error computing centrality: {e}', file=sys.stderr)
        return {}


def detect_communities(G: nx.DiGraph) -> List[List[str]]:
    """Detect communities using modularity optimization."""
    try:
        # Convert to undirected for community detection
        G_undirected = G.to_undirected()
        communities = list(nx.community.greedy_modularity_communities(G_undirected))
        return [list(community) for community in communities]
    except Exception as e:
        print(f'Error detecting communities: {e}', file=sys.stderr)
        return []


def find_shortest_paths(G: nx.DiGraph, source: str, target: str) -> List[str]:
    """Find shortest path between two nodes."""
    try:
        if source not in G or target not in G:
            return []
        return nx.shortest_path(G, source, target)
    except nx.NetworkXNoPath:
        return []
    except Exception as e:
        print(f'Error finding shortest path: {e}', file=sys.stderr)
        return []


def compute_importance(G: nx.DiGraph) -> Dict[str, float]:
    """Compute node importance using PageRank."""
    try:
        importance = nx.pagerank(G)
        return {k: float(v) for k, v in importance.items()}
    except Exception as e:
        try:
            degree = nx.degree_centrality(G)
            return {k: float(v) for k, v in degree.items()}
        except Exception:
            print(f'Error computing importance: {e}', file=sys.stderr)
            return {}


def analyze_graph(graph_data: Dict[str, Any]) -> Dict[str, Any]:
    """Main analysis function."""
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])

    if not nodes or not edges:
        return {'error': 'No nodes or edges provided'}

    # Build graph
    G = build_graph(nodes, edges)

    # Run analyses
    centrality = compute_centrality(G)
    communities = detect_communities(G)
    importance = compute_importance(G)

    return {
        'centrality': centrality,
        'communities': communities,
        'importance': importance,
        'graph_stats': {
            'nodes': G.number_of_nodes(),
            'edges': G.number_of_edges(),
            'density': float(nx.density(G))
        }
    }


def main():
    """Read graph from stdin and output analysis results."""
    try:
        input_data = json.load(sys.stdin)
        results = analyze_graph(input_data)
        json.dump(results, sys.stdout, indent=2)
    except json.JSONDecodeError as e:
        print(f'Error parsing JSON: {e}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
