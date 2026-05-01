#!/usr/bin/env python3
"""
Persistent Python daemon for code-brain analytics.
Listens on stdin for JSON requests and responds with analytics results.
Avoids subprocess spawn overhead (2-4 second speedup per call).
"""

import json
import sys
import signal
from typing import Dict, Any, Optional

try:
    import networkx as nx
except ImportError:
    print('Error: networkx not installed. Run: pip install networkx', file=sys.stderr)
    sys.exit(1)

from graph import GraphAnalytics


class AnalyticsDaemon:
    """Persistent daemon for graph analytics."""
    
    def __init__(self):
        self.running = True
        self.request_count = 0
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.max_cache_size = 100
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self.handle_shutdown)
        signal.signal(signal.SIGINT, self.handle_shutdown)
    
    def handle_shutdown(self, signum, frame):
        """Handle shutdown signals gracefully."""
        self.running = False
        self.send_response({'status': 'shutdown', 'request_count': self.request_count})
        sys.exit(0)
    
    def send_response(self, data: Dict[str, Any]) -> None:
        """Send JSON response to stdout."""
        try:
            json.dump(data, sys.stdout)
            sys.stdout.write('\n')
            sys.stdout.flush()
        except Exception as e:
            # If we can't send response, log to stderr
            print(f'Failed to send response: {e}', file=sys.stderr)
    
    def analyze_graph(self, graph_data: Dict[str, Any], fast_mode: bool = False) -> Dict[str, Any]:
        """Analyze graph and return results."""
        nodes = graph_data.get('nodes', [])
        edges = graph_data.get('edges', [])
        fingerprint = graph_data.get('fingerprint', '')
        
        # Check cache
        if fingerprint and fingerprint in self.cache:
            cached = self.cache[fingerprint].copy()
            cached['cached'] = True
            return cached
        
        if not nodes:
            return {'error': 'No nodes provided', 'fingerprint': fingerprint}
        
        # Build graph
        try:
            analytics = GraphAnalytics(nodes, edges)
        except Exception as e:
            return {'error': f'Failed to build graph: {e}', 'fingerprint': fingerprint}
        
        # Initialize results
        results: Dict[str, Any] = {
            'centrality': {},
            'communities': [],
            'importance': {},
            'fingerprint': fingerprint,
            'graph_stats': {
                'nodes': len(nodes),
                'edges': len(edges),
                'density': 0.0
            },
            'partial': False,
            'errors': [],
            'cached': False
        }
        
        # Compute centrality
        try:
            if not fast_mode:
                results['centrality'] = analytics.centrality()
        except Exception as e:
            results['errors'].append(f'Centrality failed: {str(e)}')
            results['partial'] = True
        
        # Compute importance (PageRank)
        try:
            results['importance'] = analytics.pagerank()
        except Exception as e:
            results['errors'].append(f'Importance failed: {str(e)}')
            results['partial'] = True
        
        # Detect communities
        try:
            if not fast_mode or len(nodes) < 10000:
                results['communities'] = analytics.communities()
        except Exception as e:
            results['errors'].append(f'Communities failed: {str(e)}')
            results['partial'] = True
        
        # Compute statistics
        try:
            stats = analytics.statistics()
            results['graph_stats'] = stats
        except Exception as e:
            results['errors'].append(f'Statistics failed: {str(e)}')
        
        # Cache results
        if fingerprint:
            self.cache[fingerprint] = results.copy()
            
            # Limit cache size (LRU-like)
            if len(self.cache) > self.max_cache_size:
                # Remove oldest entry
                oldest_key = next(iter(self.cache))
                del self.cache[oldest_key]
        
        return results
    
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a single request."""
        command = request.get('command', 'analyze')
        
        if command == 'ping':
            return {'status': 'ok', 'request_count': self.request_count}
        
        elif command == 'shutdown':
            self.running = False
            return {'status': 'shutdown', 'request_count': self.request_count}
        
        elif command == 'clear_cache':
            cache_size = len(self.cache)
            self.cache.clear()
            return {'status': 'ok', 'cleared': cache_size}
        
        elif command == 'stats':
            return {
                'status': 'ok',
                'request_count': self.request_count,
                'cache_size': len(self.cache),
                'cache_max': self.max_cache_size
            }
        
        elif command == 'analyze':
            graph_data = request.get('data', {})
            fast_mode = request.get('fast', False)
            return self.analyze_graph(graph_data, fast_mode)
        
        else:
            return {'error': f'Unknown command: {command}'}
    
    def run(self) -> None:
        """Main daemon loop."""
        # Send ready signal
        self.send_response({'status': 'ready', 'pid': sys.argv[0]})
        
        while self.running:
            try:
                # Read line from stdin
                line = sys.stdin.readline()
                
                if not line:
                    # EOF reached, exit gracefully
                    break
                
                line = line.strip()
                if not line:
                    continue
                
                # Parse request
                try:
                    request = json.loads(line)
                except json.JSONDecodeError as e:
                    self.send_response({'error': f'JSON parse error: {e}'})
                    continue
                
                # Handle request
                self.request_count += 1
                response = self.handle_request(request)
                self.send_response(response)
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                self.send_response({'error': f'Request handling error: {e}'})
        
        # Send final shutdown message
        self.send_response({'status': 'shutdown', 'request_count': self.request_count})


def main():
    """Start the analytics daemon."""
    daemon = AnalyticsDaemon()
    daemon.run()


if __name__ == '__main__':
    main()
