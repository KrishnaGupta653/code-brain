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

    def clustering(self) -> Dict[str, float]:
        """Compute local clustering coefficient for each node."""
        try:
            G_undirected = self.G.to_undirected()
            return nx.clustering(G_undirected)
        except Exception:
            return {}

    def topological_layers(self) -> Dict[str, int]:
        """Compute topological generation (layer) for each node."""
        try:
            layers = {}
            for layer_idx, nodes in enumerate(nx.topological_generations(self.G)):
                for node in nodes:
                    layers[node] = layer_idx
            return layers
        except nx.NetworkXUnfeasible:
            # Graph has cycles — use in-degree as proxy for depth
            in_degrees = dict(self.G.in_degree())
            max_in = max(in_degrees.values()) if in_degrees else 1
            return {n: round(d / max_in * 10) for n, d in in_degrees.items()}
        except Exception:
            return {}

    def removal_impact(self) -> Dict[str, float]:
        """
        For each node, compute fraction of graph unreachable after removal.
        Uses sampling for large graphs (>5K nodes) for performance.
        """
        try:
            all_nodes = list(self.G.nodes())
            n = len(all_nodes)
            
            if n > 5000:
                # Sample 500 random nodes for large graphs
                import random
                sample = random.sample(all_nodes, min(500, n))
            else:
                sample = all_nodes
            
            # Compute baseline reachability
            baseline = sum(len(nx.descendants(self.G, node)) for node in sample)
            scores = {}
            
            for node in all_nodes:
                G_copy = self.G.copy()
                G_copy.remove_node(node)
                remaining = sum(
                    len(nx.descendants(G_copy, n)) for n in sample if n != node
                )
                scores[node] = round(
                    (baseline - remaining) / max(1, baseline), 4
                )
            
            return scores
        except Exception:
            return {}

    def key_paths(self, limit: int = 10) -> List[List[str]]:
        """Find important shortest paths between high-centrality nodes."""
        try:
            # Get top nodes by centrality
            centrality = self.centrality()
            if not centrality:
                return []
            
            top_nodes = sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:20]
            top_node_ids = [n[0] for n in top_nodes]
            
            paths = []
            for i, source in enumerate(top_node_ids[:10]):
                for target in top_node_ids[i+1:]:
                    try:
                        path = nx.shortest_path(self.G, source, target)
                        if len(path) > 2:  # Only interesting paths
                            paths.append(path)
                            if len(paths) >= limit:
                                return paths
                    except:
                        continue
            
            return paths
        except Exception:
            return []
