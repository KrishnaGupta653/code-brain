"""
Ranking and importance analysis for code graphs.
"""

from typing import Dict, List, Tuple
try:
    import networkx as nx
except ImportError:
    raise ImportError("networkx is required")


def rank_by_centrality(centrality: Dict[str, float], limit: int = 50) -> List[Tuple[str, float]]:
    """Rank nodes by centrality score."""
    sorted_nodes = sorted(centrality.items(), key=lambda x: x[1], reverse=True)
    return sorted_nodes[:limit]


def rank_by_importance(importance: Dict[str, float], limit: int = 50) -> List[Tuple[str, float]]:
    """Rank nodes by importance (PageRank)."""
    sorted_nodes = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    return sorted_nodes[:limit]


def rank_by_combined_score(
    centrality: Dict[str, float],
    importance: Dict[str, float],
    limit: int = 50,
    centrality_weight: float = 0.5
) -> List[Tuple[str, float]]:
    """Rank nodes by combined score."""
    scores = {}
    
    # Normalize scores
    centrality_max = max(centrality.values()) if centrality else 1
    importance_max = max(importance.values()) if importance else 1
    
    for node_id in set(centrality.keys()) | set(importance.keys()):
        c_score = centrality.get(node_id, 0) / centrality_max if centrality_max > 0 else 0
        i_score = importance.get(node_id, 0) / importance_max if importance_max > 0 else 0
        
        scores[node_id] = (c_score * centrality_weight) + (i_score * (1 - centrality_weight))
    
    sorted_nodes = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return sorted_nodes[:limit]
