#!/usr/bin/env python3
"""
code-brain analytics layer.
Uses NetworkX for graph analysis and centrality computation.
"""

import json
import sys
import math
import signal
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
    """
    Compute betweenness centrality with size-adaptive sampling.
    For graphs > 5000 nodes, uses approximate centrality with k-sample.
    """
    n = G.number_of_nodes()
    try:
        if n <= 1000:
            # Exact computation — small graph
            return {k: float(v) for k, v in nx.betweenness_centrality(G).items()}
        elif n <= 10000:
            # Approximate with 20% sample
            k_sample = max(100, n // 5)
            return {k: float(v) for k, v in nx.betweenness_centrality(G, k=k_sample, seed=42).items()}
        else:
            # Very large: use 500 samples max, timeout after 60s
            k_sample = min(500, max(100, n // 20))
            
            def timeout_handler(signum, frame):
                raise TimeoutError("Centrality computation timeout")
            
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(60)  # 60-second timeout
            try:
                result = nx.betweenness_centrality(G, k=k_sample, seed=42)
                signal.alarm(0)
                return {k: float(v) for k, v in result.items()}
            except TimeoutError:
                signal.alarm(0)
                # Fallback to degree centrality — fast O(V+E)
                print('Centrality timeout — falling back to degree centrality', file=sys.stderr)
                return {k: float(v) for k, v in nx.degree_centrality(G).items()}
    except Exception as e:
        print(f'Error computing centrality: {e}', file=sys.stderr)
        return {k: float(v) for k, v in nx.degree_centrality(G).items()}


def detect_communities(G: nx.DiGraph) -> List[List[str]]:
    """
    Detect communities with size-adaptive algorithm.
    Large graphs use label propagation (O(V+E)) instead of greedy modularity (O(V log^2 V)).
    """
    n = G.number_of_nodes()
    try:
        G_undirected = G.to_undirected()
        if n <= 5000:
            communities = list(nx.community.greedy_modularity_communities(G_undirected))
        else:
            # Label propagation is O(V+E) — scales to 100k+ nodes
            communities = list(nx.community.label_propagation_communities(G_undirected))
        return [list(community) for community in communities]
    except Exception as e:
        print(f'Error detecting communities: {e}', file=sys.stderr)
        # Fallback: connected components
        return [list(c) for c in nx.weakly_connected_components(G)]


def compute_layout(G: nx.DiGraph, communities: List[List[str]]) -> Dict[str, Dict[str, float]]:
    """
    Compute 2D positions using community-aware hierarchical layout.
    Returns {node_id: {x: float, y: float}}.
    Uses spring layout per community, then positions communities in a grid.
    This runs in Python, NOT the browser.
    """
    positions = {}
    
    # Assign community IDs to nodes
    node_to_community = {}
    for i, community in enumerate(communities):
        for node_id in community:
            node_to_community[node_id] = i
    
    # Compute spring layout per community (small subgraph = fast)
    num_communities = len(communities)
    grid_cols = max(1, math.ceil(math.sqrt(num_communities)))
    
    for i, community in enumerate(communities):
        if len(community) == 0:
            continue
        subgraph = G.subgraph(community)
        col = i % grid_cols
        row = i // grid_cols
        # Community center in world space (scale to 1000 units per cell)
        cx = col * 1200
        cy = row * 1200
        
        if len(community) == 1:
            positions[community[0]] = {'x': float(cx), 'y': float(cy)}
            continue
        
        try:
            # Use kamada_kawai_layout for small communities (< 200 nodes), spring for larger
            if len(community) <= 200:
                pos = nx.kamada_kawai_layout(subgraph, scale=500)
            else:
                pos = nx.spring_layout(subgraph, seed=42, scale=500, iterations=50)
            for node_id, (x, y) in pos.items():
                positions[node_id] = {'x': float(x + cx), 'y': float(y + cy)}
        except Exception:
            # Fallback: circular
            for j, node_id in enumerate(community):
                angle = (j / len(community)) * 2 * math.pi
                positions[node_id] = {'x': float(math.cos(angle) * 400 + cx), 'y': float(math.sin(angle) * 400 + cy)}
    
    # Handle nodes not in any community
    for node_id in G.nodes():
        if node_id not in positions:
            positions[node_id] = {'x': 0.0, 'y': 0.0}
    
    return positions


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
    layout = compute_layout(G, communities)
    
    # Build community membership mapping
    community_membership = {}
    for i, community in enumerate(communities):
        for node_id in community:
            community_membership[node_id] = i

    return {
        'centrality': centrality,
        'communities': communities,
        'community_membership': community_membership,
        'importance': importance,
        'layout': layout,
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
