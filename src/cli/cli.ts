import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { indexCommand } from "./commands/index.js";
import { updateCommand } from "./commands/update.js";
import { graphCommand } from "./commands/graph.js";
import { exportCommand } from "./commands/export.js";
import { watchCommand } from "./commands/watch.js";
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
    .option("--db-path <dbPath>", "Custom database location (useful for network drives or permission issues)")
    .action(async (options) => {
      try {
        await initCommand(options.path, options.dbPath);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("index")
    .description("Index the repository and build the knowledge graph")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--git-blame", "Enrich file nodes with git metadata (author, last modified, commit SHA)")
    .option("--no-docs", "Skip documentation ingestion")
    .option("--no-api", "Skip API schema ingestion")
    .action(async (options) => {
      try {
        await indexCommand(options.path, { 
          gitBlame: options.gitBlame,
          includeDocs: options.docs !== false,
          includeAPI: options.api !== false,
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("update")
    .description("Update the graph index with repository changes")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .action(async (options) => {
      try {
        await updateCommand(options.path);
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
    .option("--port <port>", "Server port (use 0 for auto-assignment)", "3000")
    .action(async (options) => {
      try {
        const port = parseInt(options.port);
        // Allow port 0 for auto-assignment, or valid port range
        if (isNaN(port) || port < 0 || port > 65535 || (port > 0 && port < 1024)) {
          logger.error("Port must be 0 (auto-assign) or between 1024 and 65535");
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
    .option("--focus <module>", "Focus on specific module or symbol")
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
        );
        console.log(output);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("query")
    .description("Query the code graph")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--type <type>", "Query type: search, callers, callees, cycles, dead-exports, orphans, impact, path")
    .option("--text <text>", "Search query text (for search type)")
    .option("--hybrid", "Use hybrid search (BM25 + vector similarity) for search queries")
    .option("--symbol <symbol>", "Symbol name for callers/callees/impact queries")
    .option("--from <from>", "Source node for path query")
    .option("--to <to>", "Target node for path query")
    .option("--limit <limit>", "Maximum results to return", "50")
    .action(async (options) => {
      try {
        const { queryCommand } = await import("./commands/query.js");
        await queryCommand(options.path, {
          type: options.type,
          text: options.text,
          symbol: options.symbol,
          from: options.from,
          to: options.to,
          limit: parseInt(options.limit, 10),
          hybrid: options.hybrid,
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("diff")
    .description("Export only changes since last index")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--format <format>", "Export format: json, yaml, ai", "ai")
    .option("--since <timestamp>", "Compare against specific timestamp (milliseconds)")
    .option("--output <file>", "Output file (default: stdout)")
    .action(async (options) => {
      try {
        const { diffCommand } = await import("./commands/diff.js");
        await diffCommand(options.path, {
          format: options.format,
          since: options.since,
          output: options.output,
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
    .command("mcp")
    .description("Start Model Context Protocol server for AI assistants")
    .action(async () => {
      try {
        const { mcpCommand } = await import("./commands/mcp.js");
        await mcpCommand();
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("summarize")
    .description("Generate LLM-powered summaries for modules (requires ANTHROPIC_API_KEY)")
    .option("--regenerate", "Regenerate all summaries (even if they exist)")
    .option("--stale <days>", "Regenerate summaries older than N days", "7")
    .option("--batch-size <size>", "Number of summaries per batch", "50")
    .option("--concurrency <n>", "Number of concurrent API requests", "3")
    .action(async (options) => {
      try {
        const { summarizeCommand } = await import("./commands/summarize.js");
        await summarizeCommand(program);
        // Re-parse to execute the command
        await program.parseAsync(process.argv);
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("embeddings")
    .description("Generate vector embeddings for semantic search")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--force", "Regenerate all embeddings")
    .option("--model <model>", "Embedding model to use")
    .option("--provider <provider>", "Embedding provider (openai, anthropic, local)")
    .option("--stats", "Show embedding statistics")
    .option("--clear", "Clear all embeddings")
    .action(async (options) => {
      try {
        const { embeddingsCommand } = await import("./commands/embeddings.js");
        await embeddingsCommand(options.path, {
          force: options.force,
          model: options.model,
          provider: options.provider,
          stats: options.stats,
          clear: options.clear,
        });
      } catch (error) {
        logger.error("Command failed", error);
        process.exit(1);
      }
    });

  program
    .command("chat <question>")
    .description("Ask a natural language question about the codebase")
    .option("-p, --path <path>", "Project root path", process.cwd())
    .option("--json", "Output structured JSON instead of streaming text")
    .option("--provider <provider>", "AI provider: anthropic, openai, ollama (default: anthropic)")
    .option("--model <model>", "AI model to use (default: claude-sonnet-4-20250514 for anthropic, gpt-4-turbo-preview for openai, llama3 for ollama)")
    .action(async (question, options) => {
      try {
        const { chatCommand } = await import("./commands/chat.js");
        await chatCommand(options.path, question, { 
          json: options.json,
          provider: options.provider,
          model: options.model,
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
