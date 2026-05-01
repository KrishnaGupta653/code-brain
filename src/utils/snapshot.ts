import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { GraphEdge, GraphNode, SnapshotFile } from "../types/models.js";

export function computeSnapshotFingerprint(
  nodes: GraphNode[],
  edges: GraphEdge[],
): string {
  const payload = JSON.stringify({
    nodes: nodes.map((node) => [
      node.id,
      node.type,
      node.fullName || node.name,
      node.location?.file || "",
      node.location?.startLine || 0,
    ]),
    edges: edges.map((edge) => [
      edge.id,
      edge.type,
      edge.from,
      edge.to,
      edge.resolved,
    ]),
  });

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function writeSnapshotFile(
  outputPath: string,
  snapshot: SnapshotFile,
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot), "utf-8"));
  fs.writeFileSync(outputPath, compressed);
}

export function readSnapshotFile(snapshotPath: string): SnapshotFile {
  const compressed = fs.readFileSync(snapshotPath);
  const json = zlib.gunzipSync(compressed).toString("utf-8");
  return JSON.parse(json) as SnapshotFile;
}
