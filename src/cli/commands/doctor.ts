import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { ConfigManager } from "../../config/index.js";
import { QueryEngine } from "../../retrieval/query.js";
import { CURRENT_SCHEMA_VERSION } from "../../storage/schema.js";
import { SQLiteStorage } from "../../storage/index.js";
import { getDbPath, scanSourceFiles } from "../../utils/index.js";

export interface DoctorCommandOptions {
  json?: boolean;
  fix?: boolean;
}

export async function doctorCommand(
  projectRoot: string,
  options: DoctorCommandOptions = {},
): Promise<void> {
  const storage = new SQLiteStorage(getDbPath(projectRoot));

  try {
    const config = new ConfigManager(projectRoot).getConfig();
    const graph = storage.loadGraph(projectRoot);
    const queryEngine = new QueryEngine(graph, storage, projectRoot);
    const stats = graph.getStats();
    const indexState = storage.getIndexState(projectRoot);
    const parseErrors = storage.listParseErrors(projectRoot);
    const schemaVersion = storage.getSchemaVersion();
    const schemaOk = schemaVersion === CURRENT_SCHEMA_VERSION;

    const include = config.include || ["**"];
    const exclude = config.exclude || ["node_modules", "dist"];
    const files = scanSourceFiles(projectRoot, include, exclude);
    const staleFiles = files.filter((file) => {
      if (!indexState?.lastIndexedAt) return true;
      return fs.statSync(file).mtimeMs > indexState.lastIndexedAt;
    });

    const pythonAvailable = detectPython(config.pythonPath);
    const lastAnalyticsRun = storage.getLastAnalyticsRun(projectRoot);

    const uiStatus = getUiStatus(projectRoot);
    const brokenImports = graph
      .getEdges()
      .filter((edge) => edge.type === "IMPORTS" && !edge.resolved)
      .filter((edge) => {
        const target = graph.getNode(edge.to);
        return !(target?.metadata?.external === true);
      });
    const cycles = queryEngine.findCycles(20);
    const deadExports = queryEngine.findDeadExports();
    const callEdges = graph
      .getEdges()
      .filter((edge) => edge.type === "CALLS" || edge.type === "CALLS_UNRESOLVED");
    const resolvedCalls = callEdges.filter(
      (edge) => edge.type === "CALLS" && edge.resolved,
    ).length;
    const unresolvedCallPct = Math.round(
      ((callEdges.length - resolvedCalls) / Math.max(1, callEdges.length)) * 100,
    );

    const score = computeHealthScore({
      schemaOk,
      staleFiles: staleFiles.length,
      parseErrors: parseErrors.length,
      uiFresh: uiStatus.fresh,
      brokenImports: brokenImports.length,
      cycles: cycles.length,
      deadExports: deadExports.length,
      unresolvedCallPct,
    });

    if (options.fix) {
      if (!uiStatus.fresh) {
        fs.mkdirSync(uiStatus.distDir, { recursive: true });
        fs.cpSync(uiStatus.publicDir, uiStatus.distDir, { recursive: true });
      }
    }

    const report = {
      schema: {
        current: schemaVersion,
        expected: CURRENT_SCHEMA_VERSION,
        ok: schemaOk,
      },
      index: {
        lastIndexedAt: indexState?.lastIndexedAt ?? null,
        staleFiles,
      },
      parseErrors,
      python: {
        available: pythonAvailable,
        lastRunAt: lastAnalyticsRun,
      },
      ui: uiStatus,
      brokenImports: brokenImports.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
      })),
      cycles: cycles.map((cycle) => cycle.map((node) => node.fullName || node.name)),
      deadExports: deadExports.map((node) => ({
        id: node.id,
        name: node.name,
        file: node.location?.file,
      })),
      calls: {
        total: callEdges.length,
        resolved: resolvedCalls,
        unresolvedPct: unresolvedCallPct,
      },
      overview: stats,
      health: score,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }

    const lines = [
      "code-brain health check",
      "-------------------------------------------",
      `${statusIcon(schemaOk)}  Schema          migration ${schemaVersion} (${schemaOk ? "current" : `expected ${CURRENT_SCHEMA_VERSION}`})`,
      `${statusIcon(staleFiles.length === 0)}  Index           ${staleFiles.length === 0 ? "fresh" : `${staleFiles.length} stale files detected`}`,
      `${statusIcon(parseErrors.length === 0, true)}  Parse errors    ${parseErrors.length === 0 ? "none" : `${parseErrors.length} files failed to parse`}`,
      `${statusIcon(pythonAvailable)}  Python          ${pythonAvailable ? "available" : "unavailable"}${lastAnalyticsRun ? ` - last run ${timeAgo(lastAnalyticsRun)}` : ""}`,
      `${statusIcon(uiStatus.fresh, true)}  UI              ${uiStatus.fresh ? "dist/ up to date" : "dist/ is stale or missing"}`,
      `${statusIcon(brokenImports.length === 0, true)}  Broken imports  ${brokenImports.length} unresolved internal imports`,
      `${statusIcon(cycles.length === 0, true)}  Cycles          ${cycles.length} circular dependency chains`,
      `${statusIcon(deadExports.length === 0, true)}  Dead exports    ${deadExports.length} exported symbols never imported`,
      `${statusIcon(unresolvedCallPct < 25, true)}  Call resolution ${100 - unresolvedCallPct}% resolved (${unresolvedCallPct}% unresolved)`,
      "",
      `Overall health: ${score.score}/100 (grade: ${score.grade})`,
    ];

    if (parseErrors.length > 0) {
      lines.push("");
      lines.push("Parse error details:");
      for (const item of parseErrors.slice(0, 5)) {
        lines.push(`  - ${item.filePath}: ${item.error}`);
      }
    }

    if (cycles.length > 0) {
      lines.push("");
      lines.push("Cycle samples:");
      for (const cycle of cycles.slice(0, 3)) {
        lines.push(`  - ${cycle.map((node) => node.name).join(" -> ")}`);
      }
    }

    process.stdout.write(`${lines.join("\n")}\n`);
  } finally {
    storage.close();
  }
}

function detectPython(configuredPath?: string): boolean {
  const candidates = [configuredPath, "python3", "python"].filter(
    (value): value is string => Boolean(value),
  );

  return candidates.some((candidate) => {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    return result.status === 0;
  });
}

function getUiStatus(projectRoot: string): {
  fresh: boolean;
  distDir: string;
  publicDir: string;
} {
  const publicDir = path.join(projectRoot, "ui", "public");
  const distDir = path.join(projectRoot, "ui", "dist");

  if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, "index.html"))) {
    return { fresh: false, distDir, publicDir };
  }

  const distMtime = fs.statSync(path.join(distDir, "index.html")).mtimeMs;
  const publicFiles = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [];
  const newestPublicMtime = publicFiles.reduce((latest, file) => {
    const filePath = path.join(publicDir, file);
    return Math.max(latest, fs.statSync(filePath).mtimeMs);
  }, 0);

  return {
    fresh: distMtime >= newestPublicMtime,
    distDir,
    publicDir,
  };
}

function computeHealthScore(input: {
  schemaOk: boolean;
  staleFiles: number;
  parseErrors: number;
  uiFresh: boolean;
  brokenImports: number;
  cycles: number;
  deadExports: number;
  unresolvedCallPct: number;
}): { score: number; grade: "A" | "B" | "C" | "D" | "F" } {
  let score = 100;
  if (!input.schemaOk) score -= 15;
  score -= Math.min(20, input.staleFiles * 3);
  score -= Math.min(20, input.parseErrors * 5);
  if (!input.uiFresh) score -= 5;
  score -= Math.min(15, input.brokenImports);
  score -= Math.min(10, input.cycles * 2);
  score -= Math.min(10, input.deadExports);
  score -= Math.min(20, Math.round(input.unresolvedCallPct / 2));

  const finalScore = Math.max(0, score);
  const grade =
    finalScore >= 90
      ? "A"
      : finalScore >= 80
        ? "B"
        : finalScore >= 70
          ? "C"
          : finalScore >= 60
            ? "D"
            : "F";

  return { score: finalScore, grade };
}

function statusIcon(ok: boolean, warnInstead: boolean = false): string {
  if (ok) return "OK";
  return warnInstead ? "WARN" : "ERR";
}

function timeAgo(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
