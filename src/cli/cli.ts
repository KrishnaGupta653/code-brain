import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { indexCommand } from "./commands/index.js";
import { updateCommand } from "./commands/update.js";
import { graphCommand } from "./commands/graph.js";
import { exportCommand } from "./commands/export.js";
import { watchCommand } from "./commands/watch.js";
import { codemapCommand } from "./commands/codemap.js";
import { agentsCommand } from "./commands/agents.js";
import { doctorCommand } from "./commands/doctor.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { diffCommand } from "./commands/diff.js";
import { logger } from "../utils/index.js";

export function setupCLI(): Command {
  const program = new Command();

  program
    .name("code-brain")
    .description("Deterministic codebase intelligence system")
    .version("1.0.0");

  program
    .command("init")
    .description("Initialize code-brain for a repository")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .action(async (options) => {
      try {
        await initCommand(options.path);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("index")
    .description("Index the repository and build the knowledge graph")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .action(async (options) => {
      try {
        await indexCommand(options.path);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("update")
    .description("Update the graph index with repository changes")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--no-codemap", "Skip CODEMAP.md / AGENTS.md regeneration")
    .action(async (options) => {
      try {
        await updateCommand(options.path, {
          regenerateCodemap: options.codemap !== false,
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("watch")
    .description("Watch the repository and update the graph when files change")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--interval <ms>", "Polling interval in milliseconds", "1000")
    .action(async (options) => {
      try {
        const intervalMs = parseInt(options.interval);
        if (isNaN(intervalMs) || intervalMs < 250) {
          logger.error("Interval must be a number >= 250");
          process.exit(1);
        }

        await watchCommand(options.path, { debounceMs: intervalMs });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("graph")
    .description("Start the interactive graph visualization server")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--port <port>", "Server port", "3000")
    .action(async (options) => {
      try {
        const port = parseInt(options.port);
        if (isNaN(port) || port < 1024 || port > 65535) {
          logger.error("Port must be a number between 1024 and 65535");
          process.exit(1);
        }

        await graphCommand(options.path, port);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("export")
    .description("Export the code graph in various formats")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--format <format>", "Export format: json, yaml, ai", "json")
    .option("--mode <mode>", "Export mode: full, signatures, modules", "full")
    .option("--bundle <name>", "Pre-built bundle: auth, api, tests, database, config, core")
    .option("--focus <module>", "Focus on specific module or symbol")
    .option("--since <ref>", "Git diff: export only changed files since date/commit/branch (e.g., '7 days ago', '2024-01-01', 'main')")
    .option("--max-tokens <number>", "Maximum tokens for AI export (optional)")
    .option("--top <number>", "Export only the top N most important AI nodes")
    .option("--model <model>", "Target AI model (gpt-4, claude-3-opus, gemini-1.5-pro, etc.)")
    .action(async (options) => {
      try {
        const validFormats = ["json", "yaml", "ai"];
        if (!validFormats.includes(options.format)) {
          logger.error(
            `Invalid format: ${options.format}. Valid formats: ${validFormats.join(", ")}`,
          );
          process.exit(1);
        }

        const validModes = ["full", "signatures", "modules"];
        if (options.mode && !validModes.includes(options.mode)) {
          logger.error(
            `Invalid mode: ${options.mode}. Valid modes: ${validModes.join(", ")}`,
          );
          process.exit(1);
        }

        const validBundles = ["auth", "api", "tests", "database", "config", "core"];
        if (options.bundle && !validBundles.includes(options.bundle)) {
          logger.error(
            `Invalid bundle: ${options.bundle}. Valid bundles: ${validBundles.join(", ")}`,
          );
          process.exit(1);
        }

        let maxTokens: number | undefined;
        if (options.maxTokens) {
          maxTokens = parseInt(options.maxTokens);
          if (isNaN(maxTokens) || maxTokens < 100) {
            logger.error("Max tokens must be a number >= 100");
            process.exit(1);
          }
        }

        let top: number | undefined;
        if (options.top) {
          top = parseInt(options.top);
          if (isNaN(top) || top < 1) {
            logger.error("Top must be a number >= 1");
            process.exit(1);
          }
        }

        const output = await exportCommand(
          options.path,
          options.format,
          options.focus,
          maxTokens,
          top,
          options.model,
          options.mode,
          options.bundle,
          options.since,
        );
        console.log(output);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("codemap")
    .description("Generate CODEMAP.md - persistent codebase wiki for humans and AI")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--quiet", "Suppress output messages")
    .action(async (options) => {
      try {
        await codemapCommand(options.path, { quiet: options.quiet });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("agents")
    .description("Generate AGENTS.md - model-agnostic agent instructions file")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--quiet", "Suppress output messages")
    .option("--validate", "Validate detected conventions without writing the file")
    .action(async (options) => {
      try {
        await agentsCommand(options.path, {
          quiet: options.quiet,
          validate: options.validate,
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("doctor")
    .description("Run index and repository health checks")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--json", "Emit machine-readable JSON")
    .option("--fix", "Auto-fix a small set of resolvable issues")
    .action(async (options) => {
      try {
        await doctorCommand(options.path, {
          json: options.json,
          fix: options.fix,
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("snapshot")
    .description("Create a compressed snapshot of the current graph state")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("-o, --output <file>", "Output .codebrain file")
    .action(async (options) => {
      try {
        const output = await snapshotCommand(options.path, {
          output: options.output,
        });
        process.stdout.write(`${output}\n`);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("diff <left> <right>")
    .description("Diff two code-brain snapshots")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .action(async (left, right, options) => {
      try {
        await diffCommand(options.path, left, right);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("query")
    .description("Query the code graph")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--type <type>", "Query type: callers, callees, cycles, dead-exports, orphans, impact, path")
    .option("--symbol <symbol>", "Symbol name for callers/callees/impact queries")
    .option("--from <from>", "Source node for path query")
    .option("--to <to>", "Target node for path query")
    .option("--limit <limit>", "Maximum results to return", "50")
    .action(async (options) => {
      try {
        const { queryCommand } = await import("./commands/query.js");
        await queryCommand(options.path, {
          type: options.type,
          symbol: options.symbol,
          from: options.from,
          to: options.to,
          limit: parseInt(options.limit, 10),
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("analyze")
    .description("Analyze code quality and generate report")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--git", "Include git statistics")
    .option("--format <format>", "Output format: text or json", "text")
    .action(async (options) => {
      try {
        const { analyzeCommand } = await import("./commands/analyze.js");
        await analyzeCommand(options.path, {
          includeGit: options.git,
          outputFormat: options.format,
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("help")
    .description("Show help")
    .action(() => {
      program.outputHelp();
    });

  return program;
}
