import { indexCommand } from './index.js';
import { logger } from '../../utils/index.js';

export interface WatchCommandOptions {
  debounceMs?: number;
}

export async function watchCommand(
  projectRoot: string,
  options: WatchCommandOptions = {},
): Promise<void> {
  const debounceMs = options.debounceMs || 500;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let indexLock = false;
  const pendingFiles = new Set<string>();

  // Dynamic import to avoid startup cost
  const chokidar = await import('chokidar');

  const watcher = chokidar.watch(projectRoot, {
    ignored: /(node_modules|\.git|dist|\.codebrain)/,
    persistent: true,
    ignoreInitial: true,
  });

  const runIndex = async () => {
    if (indexLock) return;
    if (pendingFiles.size === 0) return;

    indexLock = true;
    const filesToIndex = Array.from(pendingFiles);
    pendingFiles.clear();

    try {
      await indexCommand(projectRoot, { filesToIndex });
      logger.success(`Re-indexed ${filesToIndex.length} changed file(s)`);
      
      // Broadcast graph update via WebSocket if server is running
      const broadcast = (global as any).__graphServerBroadcast;
      if (broadcast && typeof broadcast === 'function') {
        broadcast({
          type: 'graph-updated',
          timestamp: Date.now(),
          changedFiles: filesToIndex,
          message: `Re-indexed ${filesToIndex.length} file(s)`,
        });
        logger.debug('Broadcasted graph update to WebSocket clients');
      }
    } catch (err) {
      logger.error('Watch re-index failed', err);
    } finally {
      indexLock = false;
      // Process any files that changed during the index run
      if (pendingFiles.size > 0) {
        debounceTimer = setTimeout(runIndex, debounceMs);
      }
    }
  };

  const onFileChange = (filePath: string) => {
    pendingFiles.add(filePath);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runIndex, debounceMs);
  };

  watcher.on('change', onFileChange);
  watcher.on('add', onFileChange);
  watcher.on('unlink', (filePath) => {
    // Handle deletions: remove from graph
    pendingFiles.add(filePath);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runIndex, debounceMs);
  });

  logger.info('Watching for changes. Press Ctrl+C to stop.');

  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
      logger.info('Stopped watching');
      resolve();
    });
    process.once('SIGTERM', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
      logger.info('Stopped watching');
      resolve();
    });
  });
}
