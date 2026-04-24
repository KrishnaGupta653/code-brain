"""
Analysis functions for code graphs.
"""

from typing import Dict, List, Any
try:
    import networkx as nx
except ImportError:
    raise ImportError("networkx is required")


def find_entry_points(G: nx.DiGraph, exported_nodes: List[str]) -> List[str]:
    """Find entry points (exported nodes with high out-degree)."""
    entry_points = []
    
    for node in exported_nodes:
        if node in G:
            out_degree = G.out_degree(node)
            if out_degree > 0:
                entry_points.append(node)
    
    return sorted(entry_points, key=lambda n: G.out_degree(n), reverse=True)


def find_leaf_nodes(G: nx.DiGraph) -> List[str]:
    """Find leaf nodes (no outgoing edges)."""
    return [node for node in G.nodes() if G.out_degree(node) == 0]


def find_hub_nodes(G: nx.DiGraph, limit: int = 20) -> List[str]:
    """Find hub nodes (high degree)."""
    degrees = dict(G.in_degree())
    sorted_nodes = sorted(degrees.items(), key=lambda x: x[1], reverse=True)
    return [node for node, _ in sorted_nodes[:limit]]


def find_dependencies(G: nx.DiGraph, node: str) -> Dict[str, List[str]]:
    """Find all dependencies of a node."""
    dependencies = {
        'direct': list(G.successors(node)),
        'indirect': []
    }
    
    # Find indirect dependencies
    visited = set([node])
    queue = list(G.successors(node))
    
    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        
        for successor in G.successors(current):
            if successor not in visited:
                queue.append(successor)
                if successor not in dependencies['direct']:
                    dependencies['indirect'].append(successor)
    
    return dependencies


def find_dependents(G: nx.DiGraph, node: str) -> Dict[str, List[str]]:
    """Find all nodes that depend on this node."""
    dependents = {
        'direct': list(G.predecessors(node)),
        'indirect': []
    }
    
    # Find indirect dependents
    visited = set([node])
    queue = list(G.predecessors(node))
    
    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        
        for predecessor in G.predecessors(current):
            if predecessor not in visited:
                queue.append(predecessor)
                if predecessor not in dependents['direct']:
                    dependents['indirect'].append(predecessor)
    
    return dependents
