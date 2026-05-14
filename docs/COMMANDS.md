# code-brain Commands Reference

Complete reference for all `code-brain` CLI commands and flags.

## Global Options

All commands accept:
- `-p, --path <path>` - Project root path (default: current directory)
- `-h, --help` - Display help for command
- `--version` - Show version number

---

## Commands

### `code-brain init`

Initialize code-brain for a repository.

**Usage:**
```bash
code-brain init [options]
```

**Options:**
- `-p, --path <path>` - Project root path (default: current directory)
- `--db-path <dbPath>` - Custom database location (useful for network drives or permission issues)

**Creates:**
- `.codebrain/graph.db` - SQLite database
- `.codebrainrc.json` - Configuration file

**Example:**
```bash
code-brain init
code-brain init --path /path/to/project
code-brain init --db-path /custom/location/graph.db
```

---

### `code-brain index`

Index the repository and build the knowledge graph.

**Usage:**
```bash
code-brain index [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--git-blame` - Enrich file nodes with git metadata (author, last modified, commit SHA)
- `--no-docs` - Skip documentation ingestion
- `--no-api` - Skip API schema ingestion

**Example:**
```bash
code-brain index
code-brain index --git-blame
code-brain index --no-docs --no-api
```

---

### `code-brain update`

Update the graph index with repository changes (incremental).

**Usage:**
```bash
code-brain update [options]
```

**Options:**
- `-p, --path <path>` - Project root path

**Example:**
```bash
code-brain update
code-brain update --path /path/to/project
```

---

### `code-brain watch`

Watch the repository and update the graph when files change.

**Usage:**
```bash
code-brain watch [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--interval <ms>` - Polling interval in milliseconds (default: 1000, min: 250)

**Example:**
```bash
code-brain watch
code-brain watch --interval 2000
```

---

### `code-brain graph`

Start the interactive graph visualization server.

**Usage:**
```bash
code-brain graph [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--port <port>` - Server port (default: 3000, use 0 for auto-assignment)

**Example:**
```bash
code-brain graph
code-brain graph --port 4000
code-brain graph --port 0  # Auto-assign available port
```

**Opens:** `http://localhost:<port>` in your browser

---

### `code-brain query`

Query the code graph with powerful analysis tools.

**Usage:**
```bash
code-brain query [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--type <type>` - Query type (see below)
- `--text <text>` - Search query text (for search type)
- `--hybrid` - Use hybrid search (BM25 + vector similarity)
- `--symbol <symbol>` - Symbol name for callers/callees/impact queries
- `--from <from>` - Source node for path query
- `--to <to>` - Target node for path query
- `--limit <limit>` - Maximum results to return (default: 50)

**Query Types:**
- `search` - Full-text search
- `callers` - Find all callers of a function
- `callees` - Find all callees from a function
- `cycles` - Detect circular dependencies
- `dead-exports` - Find unused exports
- `orphans` - Find orphaned files
- `impact` - Analyze impact of changing a symbol
- `path` - Find path between two nodes

**Examples:**
```bash
# Search
code-brain query --type search --text "authentication"
code-brain query --type search --text "user login" --hybrid

# Callers/Callees
code-brain query --type callers --symbol MyFunction
code-brain query --type callees --symbol MyClass.method

# Analysis
code-brain query --type cycles
code-brain query --type dead-exports
code-brain query --type orphans
code-brain query --type impact --symbol UserService

# Path finding
code-brain query --type path --from NodeA --to NodeB
```

---

### `code-brain export`

Export the code graph in various formats. **By default, exports are saved to a file** named `<project-name>-export.<ext>`.

**Usage:**
```bash
code-brain export [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--format <format>` - Export format: `json`, `yaml`, `ai`, `cbv2` (default: json)
- `--focus <module>` - Focus on specific module or symbol
- `--max-tokens <number>` - Maximum tokens for AI export
- `--top <number>` - Export only the top N most important nodes
- `--model <model>` - Target AI model (gpt-4, claude-3-opus, gemini-1.5-pro, etc.)
- `--full` - Export all nodes and edges without filtering (⚠️ large output)
- `-o, --output <file>` - Custom output filename (overrides default)
- `--stdout` - Print to stdout instead of saving to file

**Examples:**
```bash
# Default: saves to code-brain-export.json automatically
code-brain export --format json

# YAML format: saves to code-brain-export.yaml
code-brain export --format yaml

# Custom filename
code-brain export --format json -o my-export.json

# AI-optimized export with custom name
code-brain export --format ai --max-tokens 100000 -o ai-context.json

# Compact CBv2 format (10× smaller)
code-brain export --format cbv2 -o compact.json

# Print to stdout (for piping)
code-brain export --format json --stdout > output.json
code-brain export --format json --stdout | jq '.nodes | length'

# Full export (all nodes and edges)
code-brain export --format json --full -o full-graph.json

# Focused export
code-brain export --format ai --focus src/parser -o parser-context.json
code-brain export --format ai --focus MyClass --model gpt-4

# Absolute path
code-brain export --format json -o /path/to/output/export.json
```

**Export Modes:**
- **Default:** Smart overview (~160 most important nodes from entry points)
- **`--full`:** Complete graph (all nodes and edges) - ⚠️ Large file
- **`--focus`:** Focused on specific module/symbol and its dependencies
- **`--max-tokens`:** Limits nodes based on token budget
- **`--top N`:** Only top N most important nodes

**Export Formats:**
- **`json`:** Standard JSON format with full metadata
- **`yaml`:** YAML format for human readability
- **`ai`:** Optimized for AI consumption with hierarchical structure
- **`cbv2`:** Compact binary-like format (10× smaller, tuple-based)

**Default Behavior:**
- Exports are **automatically saved to a file** named after your project
- JSON format → `<project-name>-export.json`
- YAML format → `<project-name>-export.yaml`
- Use `--stdout` to print to terminal instead
- Use `-o` to specify a custom filename

---

### `code-brain diff`

Export only changes since last index.

**Usage:**
```bash
code-brain diff [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--format <format>` - Export format: `json`, `yaml`, `ai` (default: ai)
- `--since <timestamp>` - Compare against specific timestamp (milliseconds)
- `--output <file>` - Output file (default: stdout)

**Examples:**
```bash
code-brain diff
code-brain diff --format json
code-brain diff --since 1704067200000
code-brain diff --output changes.json
```

---

### `code-brain analyze`

Analyze code quality and generate report.

**Usage:**
```bash
code-brain analyze [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--git` - Include git statistics
- `--format <format>` - Output format: `text` or `json` (default: text)

**Examples:**
```bash
code-brain analyze
code-brain analyze --git
code-brain analyze --format json > report.json
```

---

### `code-brain chat`

Ask a natural language question about the codebase.

**Usage:**
```bash
code-brain chat <question> [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--json` - Output structured JSON instead of streaming text
- `--provider <provider>` - AI provider: `anthropic`, `openai`, `ollama` (default: anthropic)
- `--model <model>` - AI model to use (default varies by provider)

**Default Models:**
- Anthropic: `claude-sonnet-4-20250514`
- OpenAI: `gpt-4-turbo-preview`
- Ollama: `llama3`

**Examples:**
```bash
code-brain chat "how does authentication work?"
code-brain chat "find all database queries" --json
code-brain chat "explain the payment flow" --provider openai
code-brain chat "what are the main entry points?" --provider ollama --model llama3
```

**Requires:** API key in environment variable
- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Ollama: Local installation

---

### `code-brain embeddings`

Generate vector embeddings for semantic search.

**Usage:**
```bash
code-brain embeddings [options]
```

**Options:**
- `-p, --path <path>` - Project root path
- `--force` - Regenerate all embeddings
- `--model <model>` - Embedding model to use
- `--provider <provider>` - Embedding provider: `openai`, `anthropic`, `local`
- `--stats` - Show embedding statistics
- `--clear` - Clear all embeddings

**Examples:**
```bash
code-brain embeddings
code-brain embeddings --force
code-brain embeddings --provider openai --model text-embedding-3-small
code-brain embeddings --stats
code-brain embeddings --clear
```

**Requires:** API key for cloud providers
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`

---

### `code-brain summarize`

Generate LLM-powered summaries for modules.

**Usage:**
```bash
code-brain summarize [options]
```

**Options:**
- `--regenerate` - Regenerate all summaries (even if they exist)
- `--stale <days>` - Regenerate summaries older than N days (default: 7)
- `--batch-size <size>` - Number of summaries per batch (default: 50)
- `--concurrency <n>` - Number of concurrent API requests (default: 3)

**Examples:**
```bash
code-brain summarize
code-brain summarize --regenerate
code-brain summarize --stale 30
code-brain summarize --batch-size 100 --concurrency 5
```

**Requires:** `ANTHROPIC_API_KEY` environment variable

---

### `code-brain mcp`

Start Model Context Protocol server for AI assistants.

**Usage:**
```bash
code-brain mcp
```

**No options** - Starts MCP server on stdio for AI assistant integration.

**Example:**
```bash
code-brain mcp
```

**Use with:** Claude Desktop, Cline, or other MCP-compatible AI assistants

---

### `code-brain clean`

Remove `.codebrain` directory and all indexed data.

**Usage:**
```bash
code-brain clean [options]
```

**Options:**
- `--path <path>` - Path to project root (required)
- `--force` - Skip confirmation prompt

**Examples:**
```bash
# Show what will be deleted (safe, won't delete)
code-brain clean --path /path/to/project

# Actually delete (requires --force)
code-brain clean --path /path/to/project --force
```

**Deletes:**
- Graph database (`.codebrain/graph.db`)
- Configuration files
- Embeddings
- All backups (`.codebrain.backup.*`)

**Warning:** This is permanent! Use `--force` to confirm.

---

## Configuration File

`.codebrainrc.json` - Project configuration

**Example:**
```json
{
  "include": ["**"],
  "exclude": [
    "node_modules",
    "dist",
    "build",
    ".git",
    ".codebrain",
    "coverage"
  ],
  "languages": [
    "typescript",
    "javascript",
    "python",
    "java",
    "go"
  ],
  "enableAnalytics": true,
  "maxTokensExport": 8000,
  "embeddings": {
    "enabled": true,
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimensions": 1536,
    "batchSize": 100
  }
}
```

---

## Environment Variables

**Required for AI features:**
- `ANTHROPIC_API_KEY` - For Claude chat and summarization
- `OPENAI_API_KEY` - For GPT chat and embeddings

**Optional:**
- `CODE_BRAIN_DB_PATH` - Override default database location
- `CODE_BRAIN_LOG_LEVEL` - Set log level (debug, info, warn, error)

---

## Common Workflows

### Initial Setup
```bash
code-brain init
code-brain index
code-brain graph  # Visual exploration
```

### Daily Development
```bash
code-brain watch  # Auto-update on changes
code-brain chat "explain this feature"
```

### Code Review
```bash
code-brain diff --format ai > changes.json
code-brain analyze --git
```

### AI Context Generation
```bash
code-brain export --format ai --max-tokens 100000 > context.json
code-brain chat "summarize the architecture"
```

### Cleanup
```bash
code-brain clean --path /path/to/project --force
```

---

## Tips

1. **Use `--help` on any command** for detailed options
2. **Start with `code-brain graph`** for visual exploration
3. **Use `--hybrid` search** for better semantic results (requires embeddings)
4. **Set `--max-tokens`** when exporting for specific AI models
5. **Use `watch` mode** during active development
6. **Run `analyze --git`** to find hotspots and technical debt

---

## See Also

- [README.md](README.md) - Overview and features
- [USER_GUIDE.md](USER_GUIDE.md) - Detailed user guide
- [QUICK_SETUP.md](QUICK_SETUP.md) - Quick start guide
- [BENCHMARKS.md](BENCHMARKS.md) - Performance benchmarks
