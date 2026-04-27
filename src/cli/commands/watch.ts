import fs from "fs";
import { ConfigManager } from "../../config/index.js";
import { updateCommand } from "./update.js";
import { logger, scanSourceFiles } from "../../utils/index.js";

export interface WatchCommandOptions {
  intervalMs?: number;
}

interface FileSnapshot {
  mtimeMs: number;
  size: number;
}

export async function watchCommand(
  projectRoot: string,
  options: WatchCommandOptions = {},
): Promise<void> {
  const intervalMs = options.intervalMs || 1000;
  const configManager = new ConfigManager(projectRoot);
  const config = configManager.getConfig();
  const include = config.include || ["**"];
  const exclude = config.exclude || [
    "node_modules",
    "dist",
    ".codebrain",
    ".git",
  ];

  let snapshot = takeSnapshot(projectRoot, include, exclude);
  let updating = false;
  let pending = false;

  logger.info(`Watching repository: ${projectRoot}`);
  logger.info(`Polling every ${intervalMs}ms for source changes`);

  const runUpdate = async (changedFiles: string[]): Promise<void> => {
    if (updating) {
      pending = true;
      return;
    }

    updating = true;
    try {
      logger.info(`Detected ${changedFiles.length} changed file(s)`);
      await updateCommand(projectRoot);
    } finally {
      updating = false;
      if (pending) {
        pending = false;
        await runUpdate(["pending changes"]);
      }
    }
  };

  const timer = setInterval(() => {
    const nextSnapshot = takeSnapshot(projectRoot, include, exclude);
    const changedFiles = diffSnapshots(snapshot, nextSnapshot);
    snapshot = nextSnapshot;
    if (changedFiles.length > 0) {
      void runUpdate(changedFiles);
    }
  }, intervalMs);

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      clearInterval(timer);
      logger.info("Stopped watching");
      resolve();
    });
    process.once("SIGTERM", () => {
      clearInterval(timer);
      logger.info("Stopped watching");
      resolve();
    });
  });
}

function takeSnapshot(
  projectRoot: string,
  include: string[],
  exclude: string[],
): Map<string, FileSnapshot> {
  const snapshot = new Map<string, FileSnapshot>();
  for (const filePath of scanSourceFiles(projectRoot, include, exclude)) {
    try {
      const stats = fs.statSync(filePath);
      snapshot.set(filePath, {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      });
    } catch {
      // The next polling tick will treat disappearing files as deletions.
    }
  }
  return snapshot;
}

function diffSnapshots(
  previous: Map<string, FileSnapshot>,
  next: Map<string, FileSnapshot>,
): string[] {
  const changed = new Set<string>();

  for (const [filePath, nextSnapshot] of next.entries()) {
    const previousSnapshot = previous.get(filePath);
    if (
      !previousSnapshot ||
      previousSnapshot.mtimeMs !== nextSnapshot.mtimeMs ||
      previousSnapshot.size !== nextSnapshot.size
    ) {
      changed.add(filePath);
    }
  }

  for (const filePath of previous.keys()) {
    if (!next.has(filePath)) {
      changed.add(filePath);
    }
  }

  return Array.from(changed).sort();
}
