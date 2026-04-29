#!/usr/bin/env python3
"""
Graph analytics module using NetworkX.
"""

from typing import Dict, List, Tuple, Any
try:
    import networkx as nx
except ImportError:
    raise ImportError("networkx is required. Install with: pip install networkx")


class GraphAnalytics:
    """Analyzes code graphs using NetworkX."""

    def __init__(self, nodes: List[Dict], edges: List[Dict]):
        """Initialize with nodes and edges."""
        self.G = self._build_graph(nodes, edges)
        self.nodes = nodes
        self.edges = edges

    def _build_graph(self, nodes: List[Dict], edges: List[Dict]) -> nx.DiGraph:
        """Build directed graph from nodes and edges."""
        G = nx.DiGraph()
        
        for node in nodes:
            G.add_node(node['id'], **node)
        
        for edge in edges:
            G.add_edge(edge['from'], edge['to'], type=edge.get('type', 'UNKNOWN'))
        
        return G

    def centrality(self) -> Dict[str, float]:
        """Compute betweenness centrality with size-aware algorithm selection."""
        n = self.G.number_of_nodes()
        
        try:
            if n < 1000:
                # Small graph: exact betweenness centrality
                return nx.betweenness_centrality(self.G, normalized=True)
            elif n < 10000:
                # Medium graph: approximate with k pivots
                k = min(200, n // 10)
                return nx.betweenness_centrality(self.G, k=k, normalized=True)
            else:
                # Large graph: use degree centrality (instant)
                return nx.degree_centrality(self.G)
        except Exception:
            # Fallback to degree centrality
            try:
                return nx.degree_centrality(self.G)
            except Exception:
                return {}

    def pagerank(self) -> Dict[str, float]:
        """Compute PageRank importance."""
        try:
            return nx.pagerank(self.G)
        except Exception:
            try:
                return nx.degree_centrality(self.G)
            except Exception:
                return {}

    def communities(self) -> List[List[str]]:
        """Detect communities with size-aware algorithm selection."""
        n = self.G.number_of_nodes()
        
        try:
            G_undirected = self.G.to_undirected()
            
            if n < 5000:
                # Small/medium graph: greedy modularity (better quality)
                communities = nx.community.greedy_modularity_communities(G_undirected)
            else:
                # Large graph: label propagation (much faster)
                communities = nx.community.label_propagation_communities(G_undirected)
            
            return [list(c) for c in communities]
        except Exception:
            return []

    def shortest_path(self, source: str, target: str) -> List[str]:
        """Find shortest path."""
        try:
            if source in self.G and target in self.G:
                return nx.shortest_path(self.G, source, target)
        except:
            pass
        return []

    def all_shortest_paths(self, source: str, target: str, limit: int = 5) -> List[List[str]]:
        """Find multiple shortest paths."""
        try:
            if source in self.G and target in self.G:
                paths = list(nx.all_shortest_paths(self.G, source, target))
                return paths[:limit]
        except:
            pass
        return []

    def density(self) -> float:
        """Compute graph density."""
        try:
            return nx.density(self.G)
        except:
            return 0.0

    def statistics(self) -> Dict[str, Any]:
        """Get graph statistics."""
        return {
            'nodes': self.G.number_of_nodes(),
            'edges': self.G.number_of_edges(),
            'density': self.density(),
            'strongly_connected_components': nx.number_strongly_connected_components(self.G),
            'weakly_connected_components': nx.number_weakly_connected_components(self.G)
        }
