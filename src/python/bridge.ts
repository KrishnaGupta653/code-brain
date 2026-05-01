import { spawn } from 'child_process';
import crypto from 'crypto';
import { getPythonScript } from '../utils/index.js';
import { AnalyticsResult } from '../types/models.js';
import { logger } from '../utils/index.js';
import { SQLiteStorage } from '../storage/index.js';

export class PythonBridge {
  static async runAnalytics(
    graphData: {
      nodes: unknown[];
      edges: unknown[];
    },
    pythonPath?: string,
    storage?: SQLiteStorage,
    projectRoot?: string
  ): Promise<AnalyticsResult> {
    // FILTER: only send structural nodes to Python
    const ANALYTICS_NODE_TYPES = new Set(['file', 'module', 'class', 'function', 'route']);
    const filteredNodes = (graphData.nodes as Array<{id: string; type: string; name: string}>)
      .filter(n => ANALYTICS_NODE_TYPES.has(n.type))
      .map(n => ({ id: n.id, type: n.type, name: n.name })); // strip metadata

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = (graphData.edges as Array<{from: string; to: string; type: string}>)
      .filter(e => filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to))
      .map(e => ({ from: e.from, to: e.to, type: e.type })); // strip metadata

    // Compute graph fingerprint for caching
    const fingerprint = this.computeFingerprint(filteredNodes, filteredEdges);
    
    // Check cache if storage is available
    if (storage && projectRoot) {
      const cached = storage.getAnalyticsCache(projectRoot, 'full_analytics', fingerprint);
      if (cached) {
        logger.debug('Using cached analytics results');
        return this.parseAnalyticsResult(cached);
      }
    }

    const safePayload = { nodes: filteredNodes, edges: filteredEdges, fingerprint };

    const candidates = [
      pythonPath,
      process.platform === 'win32' ? 'python' : undefined,
      'python3',
      'python'
    ].filter((value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index
    );

    for (const candidate of candidates) {
      const result = await this.tryRunAnalytics(candidate, safePayload);
      if (result.ok) {
        // Cache the results
        if (storage && projectRoot) {
          storage.saveAnalyticsCache(projectRoot, 'full_analytics', result.rawResult, fingerprint);
        }
        return result.analytics;
      }
    }

    logger.warn('Python analytics unavailable; continuing with deterministic graph only');
    return this.emptyAnalytics();
  }

  private static computeFingerprint(nodes: unknown[], edges: unknown[]): string {
    // Create a stable hash of node and edge IDs
    const nodeIds = (nodes as Array<{id: string}>).map(n => n.id).sort();
    const edgeIds = (edges as Array<{from: string; to: string}>)
      .map(e => `${e.from}->${e.to}`)
      .sort();
    
    const combined = JSON.stringify({ nodes: nodeIds, edges: edgeIds });
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }

  private static parseAnalyticsResult(data: unknown): AnalyticsResult {
    const r = data as {
      centrality?: Record<string, number>;
      importance?: Record<string, number>;
      communities?: Record<string, number>;
      keyPaths?: string[][];
      clustering?: Record<string, number>;
      layers?: Record<string, number>;
      removalImpact?: Record<string, number>;
    };

    return {
      centrality:     new Map(Object.entries(r.centrality    || {})),
      importance:     new Map(Object.entries(r.importance    || {})),
      communities:    new Map(Object.entries(r.communities   || {}).map(([k,v]) => [k, Number(v)])),
      keyPaths:       r.keyPaths || [],
      clustering:     new Map(Object.entries(r.clustering    || {})),
      layers:         new Map(Object.entries(r.layers        || {}).map(([k,v]) => [k, Number(v)])),
      removalImpact:  new Map(Object.entries(r.removalImpact || {})),
    };
  }

  private static async tryRunAnalytics(
    pythonCommand: string,
    graphData: {
      nodes: unknown[];
      edges: unknown[];
      fingerprint: string;
    }
  ): Promise<{ ok: true; analytics: AnalyticsResult; rawResult: unknown } | { ok: false }> {
    return new Promise(resolve => {
      const pythonScript = getPythonScript('main');

      const python = spawn(pythonCommand, [pythonScript]);
      let output = '';

      // Add timeout
      const timeout = setTimeout(() => {
        python.kill();
        logger.debug(`Python analytics timeout for ${pythonCommand}`);
        resolve({ ok: false });
      }, 30_000); // 30 second timeout

      python.stdout.on('data', data => {
        output += data.toString();
      });

      python.stderr.on('data', data => {
        logger.debug('Python stderr:', data.toString());
      });

      python.on('close', code => {
        clearTimeout(timeout);
        if (code !== 0) {
          logger.debug(`Python analytics failed with ${pythonCommand} (code ${code})`);
          return resolve({ ok: false });
        }

        try {
          const results = JSON.parse(output);
          const analytics = this.parseAnalyticsResult(results);

          resolve({
            ok: true,
            analytics,
            rawResult: results
          });
        } catch (e) {
          logger.debug('Failed to parse analytics output', e);
          resolve({ ok: false });
        }
      });

      python.on('error', err => {
        clearTimeout(timeout);
        logger.debug(`Python process error for ${pythonCommand}:`, err);
        resolve({ ok: false });
      });

      // Send graph data
      python.stdin.write(JSON.stringify(graphData));
      python.stdin.end();
    });
  }

  private static emptyAnalytics(): AnalyticsResult {
    return {
      centrality: new Map(),
      communities: new Map(),
      keyPaths: [],
      importance: new Map(),
      clustering: new Map(),
      layers: new Map(),
      removalImpact: new Map(),
    };
  }
}
