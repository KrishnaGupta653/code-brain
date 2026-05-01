import fs from "fs";
import path from "path";
import { SnapshotFile } from "../../types/models.js";
import { readSnapshotFile } from "../../utils/snapshot.js";

export async function diffCommand(
  projectRoot: string,
  left: string,
  right: string,
): Promise<void> {
  const leftSnapshot = readSnapshotFile(resolveSnapshotPath(projectRoot, left));
  const rightSnapshot = readSnapshotFile(resolveSnapshotPath(projectRoot, right));

  const leftNodes = new Map(leftSnapshot.nodes.map((node) => [node.id, node]));
  const rightNodes = new Map(rightSnapshot.nodes.map((node) => [node.id, node]));
  const leftEdges = new Map(leftSnapshot.edges.map((edge) => [edge.id, edge]));
  const rightEdges = new Map(rightSnapshot.edges.map((edge) => [edge.id, edge]));

  const addedNodes = rightSnapshot.nodes.filter((node) => !leftNodes.has(node.id));
  const removedNodes = leftSnapshot.nodes.filter((node) => !rightNodes.has(node.id));
  const modifiedNodes = rightSnapshot.nodes.filter((node) => {
    const previous = leftNodes.get(node.id);
    return previous && JSON.stringify(previous) !== JSON.stringify(node);
  });

  const addedEdges = rightSnapshot.edges.filter((edge) => !leftEdges.has(edge.id));
  const removedEdges = leftSnapshot.edges.filter((edge) => !rightEdges.has(edge.id));

  const leftCycles = detectCycles(leftSnapshot);
  const rightCycles = detectCycles(rightSnapshot);
  const newCycles = rightCycles.filter((cycle) => !leftCycles.includes(cycle));
  const resolvedCycles = leftCycles.filter((cycle) => !rightCycles.includes(cycle));

  const leftCallResolution = computeCallResolution(leftSnapshot);
  const rightCallResolution = computeCallResolution(rightSnapshot);

  const lines = [
    `code-brain diff ${labelFor(left, leftSnapshot)} -> ${labelFor(right, rightSnapshot)}`,
    "-------------------------------------------",
    `Files        +${countByType(addedNodes, "file")} added   -${countByType(removedNodes, "file")} removed   ~${countByType(modifiedNodes, "file")} modified`,
    `Symbols      +${addedNodes.length - countByType(addedNodes, "file")} added  -${removedNodes.length - countByType(removedNodes, "file")} removed  ~${modifiedNodes.length - countByType(modifiedNodes, "file")} modified`,
    `Edges        +${addedEdges.length} added  -${removedEdges.length} removed`,
    "",
    `New cycles:      ${newCycles.length}`,
    `Resolved cycles: ${resolvedCycles.length}`,
    `Call resolution: ${leftCallResolution}% -> ${rightCallResolution}% (${rightCallResolution - leftCallResolution >= 0 ? "+" : ""}${rightCallResolution - leftCallResolution}pp)`,
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function resolveSnapshotPath(projectRoot: string, value: string): string {
  if (fs.existsSync(value)) {
    return value;
  }

  const snapshotDir = path.join(projectRoot, ".codebrain", "snapshots");
  const candidate = path.join(snapshotDir, `${value}.codebrain`);
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  throw new Error(`Snapshot not found: ${value}`);
}

function labelFor(input: string, snapshot: SnapshotFile): string {
  return snapshot.gitSha || path.basename(input);
}

function countByType(
  nodes: SnapshotFile["nodes"],
  type: string,
): number {
  return nodes.filter((node) => node.type === type).length;
}

function detectCycles(snapshot: SnapshotFile): string[] {
  const relevantTypes = new Set(["IMPORTS", "DEPENDS_ON", "EXTENDS", "IMPLEMENTS"]);
  const adjacency = new Map<string, string[]>();

  for (const edge of snapshot.edges) {
    if (!relevantTypes.has(edge.type) || !edge.resolved) continue;
    const arr = adjacency.get(edge.from) || [];
    arr.push(edge.to);
    adjacency.set(edge.from, arr);
  }

  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[] = [];
  let counter = 0;

  const strongConnect = (nodeId: string): void => {
    index.set(nodeId, counter);
    lowlink.set(nodeId, counter);
    counter += 1;
    stack.push(nodeId);
    onStack.add(nodeId);

    for (const next of adjacency.get(nodeId) || []) {
      if (!index.has(next)) {
        strongConnect(next);
        lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, lowlink.get(next)!));
      } else if (onStack.has(next)) {
        lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, index.get(next)!));
      }
    }

    if (lowlink.get(nodeId) === index.get(nodeId)) {
      const component: string[] = [];
      let current = "";
      do {
        current = stack.pop()!;
        onStack.delete(current);
        component.push(current);
      } while (current !== nodeId);

      if (component.length > 1) {
        cycles.push(component.sort().join("::"));
      }
    }
  };

  for (const node of snapshot.nodes) {
    if (!index.has(node.id)) {
      strongConnect(node.id);
    }
  }

  return cycles.sort();
}

function computeCallResolution(snapshot: SnapshotFile): number {
  const calls = snapshot.edges.filter(
    (edge) => edge.type === "CALLS" || edge.type === "CALLS_UNRESOLVED",
  );
  const resolved = calls.filter(
    (edge) => edge.type === "CALLS" && edge.resolved,
  ).length;
  return Math.round((resolved / Math.max(1, calls.length)) * 100);
}
