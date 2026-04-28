import { spawn } from 'child_process';
import { getPythonScript } from '../utils/index.js';
import { AnalyticsResult } from '../types/models.js';
import { logger } from '../utils/index.js';

export class PythonBridge {
  static async runAnalytics(graphData: {
    nodes: unknown[];
    edges: unknown[];
  }, pythonPath?: string): Promise<AnalyticsResult> {
    const candidates = [
      pythonPath,
      process.platform === 'win32' ? 'python' : undefined,
      'python3',
      'python'
    ].filter((value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index
    );

    for (const candidate of candidates) {
      const result = await this.tryRunAnalytics(candidate, graphData);
      if (result.ok) {
        return result.analytics;
      }
    }

    logger.warn('Python analytics unavailable; continuing with deterministic graph only');
    return this.emptyAnalytics();
  }

  private static async tryRunAnalytics(
    pythonCommand: string,
    graphData: {
      nodes: unknown[];
      edges: unknown[];
    }
  ): Promise<{ ok: true; analytics: AnalyticsResult } | { ok: false }> {
    return new Promise(resolve => {
      const pythonScript = getPythonScript('main');

      const python = spawn(pythonCommand, [pythonScript]);
      let output = '';

      python.stdout.on('data', data => {
        output += data.toString();
      });

      python.stderr.on('data', data => {
        logger.debug('Python stderr:', data.toString());
      });

      python.on('close', code => {
        if (code !== 0) {
          logger.debug(`Python analytics failed with ${pythonCommand} (code ${code})`);
          return resolve({ ok: false });
        }

        try {
          const results = JSON.parse(output);

          // Convert to AnalyticsResult format
          const centrality = new Map<string, number>(
            Object.entries(results.centrality || {}).map(([nodeId, score]) => [
              nodeId,
              Number(score)
            ])
          );
          const importance = new Map<string, number>(
            Object.entries(results.importance || {}).map(([nodeId, score]) => [
              nodeId,
              Number(score)
            ])
          );

          resolve({
            ok: true,
            analytics: {
              centrality,
              communities: results.communities || [],
              keyPaths: [],
              importance,
              layout: results.layout || {},
              community_membership: results.community_membership || {}
            }
          });
        } catch (e) {
          logger.debug('Failed to parse analytics output', e);
          resolve({ ok: false });
        }
      });

      python.on('error', err => {
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
      communities: [],
      keyPaths: [],
      importance: new Map(),
      layout: {},
      community_membership: {}
    };
  }
}
