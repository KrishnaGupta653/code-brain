import path from "path";
import { GitIntegration } from "../../git/integration.js";
import { SQLiteStorage } from "../../storage/index.js";
import { SnapshotFile } from "../../types/models.js";
import { getDbPath } from "../../utils/index.js";
import {
  computeSnapshotFingerprint,
  writeSnapshotFile,
} from "../../utils/snapshot.js";

export interface SnapshotCommandOptions {
  output?: string;
}

export async function snapshotCommand(
  projectRoot: string,
  options: SnapshotCommandOptions = {},
): Promise<string> {
  const storage = new SQLiteStorage(getDbPath(projectRoot));

  try {
    const project = storage.getProject(projectRoot);
    if (!project) {
      throw new Error("Project not indexed. Run code-brain index first.");
    }

    const graph = storage.loadGraph(projectRoot);
    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    const fingerprint = computeSnapshotFingerprint(nodes, edges);
    const git = new GitIntegration(projectRoot);
    const gitSha = (await git.getHeadSha()) || undefined;
    const analyticsCache = storage.getAnalyticsCache(
      projectRoot,
      "full_analytics",
      fingerprint,
    );

    const snapshot: SnapshotFile = {
      version: "codebrain-snapshot/v1",
      createdAt: Date.now(),
      gitSha,
      fingerprint,
      project,
      nodes,
      edges,
      analyticsCache:
        analyticsCache && typeof analyticsCache === "object"
          ? (analyticsCache as SnapshotFile["analyticsCache"])
          : undefined,
    };

    const outputPath =
      options.output ||
      path.join(
        projectRoot,
        ".codebrain",
        "snapshots",
        `${gitSha || `snapshot-${snapshot.createdAt}`}.codebrain`,
      );

    writeSnapshotFile(outputPath, snapshot);
    return outputPath;
  } finally {
    storage.close();
  }
}
