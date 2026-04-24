import { spawn } from 'child_process';
import { getPythonScript } from '../utils/index.js';
import { AnalyticsResult } from '../types/models.js';
import { logger } from '../utils/index.js';

export class PythonBridge {
  static async runAnalytics(graphData: {
    nodes: unknown[];
    edges: unknown[];
  }): Promise<AnalyticsResult> {
    return new Promise(resolve => {
      const pythonScript = getPythonScript('main');

      const python = spawn('python3', [pythonScript]);
      let output = '';

      python.stdout.on('data', data => {
        output += data.toString();
      });

      python.stderr.on('data', data => {
        logger.debug('Python stderr:', data.toString());
      });

      python.on('close', code => {
        if (code !== 0) {
          logger.warn(`Python process exited with code ${code}`);
          // Return empty results instead of failing
          return resolve({
            centrality: new Map(),
            communities: [],
            keyPaths: [],
            importance: new Map()
          });
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
            centrality,
            communities: results.communities || [],
            keyPaths: [],
            importance
          });
        } catch (e) {
          logger.warn('Failed to parse analytics output', e);
          resolve({
            centrality: new Map(),
            communities: [],
            keyPaths: [],
            importance: new Map()
          });
        }
      });

      python.on('error', err => {
        logger.warn('Python process error:', err);
        resolve({
          centrality: new Map(),
          communities: [],
          keyPaths: [],
          importance: new Map()
        });
      });

      // Send graph data
      python.stdin.write(JSON.stringify(graphData));
      python.stdin.end();
    });
  }
}
