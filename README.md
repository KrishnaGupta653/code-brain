# code-brain

`code-brain` is a deterministic codebase intelligence system for multi-language repositories.

It scans a repository, parses source files with AST-based parsers, builds a provenance-aware graph, stores the graph in SQLite, exposes a searchable visual graph, and exports compact AI-ready context bundles without dumping raw files or inventing structure.

## Features

- **Multi-Language Support**: TypeScript, JavaScript, Java, Python, Go
- **AST-Based Parsing**: Tree-sitter for accurate symbol extraction
- **Scalable**: Handles 100K+ node graphs with LOD rendering
- **Real-Time Updates**: WebSocket-based live graph updates
- **Fast Search**: FTS5 full-text search with BM25 ranking
- **Analytics**: Centrality, community detection, hotspot analysis
- **Git Integration**: Change tracking, blame, hotspot detection
- **AI-Optimized Exports**: Hierarchical exports with token budgets
- **MCP Server**: Model Context Protocol for AI assistants
- **Parallel Parsing**: Multi-core processing for large repos
- **Query Language**: Find callers, callees, cycles, dead code
- **Visual Graph UI**: Interactive 2D/3D graph visualization

## Architecture

The runtime is split into a Node product layer and a Python analytics layer.

- `src/cli`
  Handles `init`, `index`, `update`, `graph`, and `export`.
- `src/parser`
  Deterministic parsing using tree-sitter (Java, Python, Go) and TypeScript compiler API (TS/JS).
- `src/graph`
  Graph construction, node/edge creation, relationship wiring.
- `src/storage`
  SQLite schema and persistence.
- `src/retrieval`
  Focus resolution, graph querying, and export bundle generation.
- `src/server`
  Graph UI HTTP server and JSON endpoints.
- `src/python`
  Bridge to the Python analytics process.
- `python/analytics`
  NetworkX centrality, ranking, shortest-path, and clustering support.
- `ui/public`
  2D graph UI for browsing files, symbols, routes, config items, docs, and tests.
- `tests`
  Parser, graph, export, and integration coverage.

## Folder Structure

```text
code-brain/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli/
│   ├── config/
│   ├── graph/
│   ├── parser/
│   ├── provenance/
│   ├── python/
│   ├── retrieval/
│   ├── server/
│   ├── storage/
│   ├── types/
│   └── utils/
├── python/
│   ├── analytics/
│   └── requirements.txt
├── ui/public/
└── tests/
```

## What It Extracts

For supported languages (TypeScript, JavaScript, Java, Python, Go), `code-brain` deterministically extracts:

- files and project ownership
- imports and exports
- functions, classes, methods, interfaces, types, enums, variables, constants
- call relationships where directly detectable
- inheritance and interface implementation
- route definitions such as `app.get(...)` and `router.post(...)`
- config references such as `process.env.X`, `dotenv.config()`, and JSON config imports
- test definitions in `*.test.*`, `*.spec.*`, and `__tests__/`
- documentation references from JSDoc comments
- entry points from exported runtime symbols and common bootstrap files

Every node and edge carries provenance with source spans.

## Storage Model

SQLite is the durable source of persisted graph truth. It stores:

- projects
- indexed files and content hashes
- graph nodes
- graph edges
- provenance records
- ranking scores
- index state

Incremental updates use file hashes and re-index changed files plus importing dependents.

## Commands

All commands accept `--path <repo-root>`. If omitted, the current directory is used.

```bash
code-brain init
code-brain index
code-brain update
code-brain watch
code-brain graph
code-brain query --type callers --symbol MyFunction
code-brain analyze --git
code-brain export --format ai --max-tokens 100000
code-brain export --format ai --focus src/parser --model gpt-4
code-brain mcp
```

### `code-brain init`

Creates:

- `.codebrain/graph.db`
- `.codebrainrc.json`

### `code-brain index`

Scans the repository, parses supported files, builds the graph, and stores it in SQLite.

### `code-brain update`

Detects changed files using stored hashes and re-indexes changed files plus direct import/test dependents.

### `code-brain watch`

Watches the repository for file changes and automatically updates the graph in real-time. Broadcasts updates via WebSocket to connected UI clients.

### `code-brain query`

Query the code graph with powerful analysis tools:

```bash
# Find all callers of a function
code-brain query --type callers --symbol MyFunction

# Find all callees from a function
code-brain query --type callees --symbol MyClass.method

# Detect circular dependencies
code-brain query --type cycles

# Find unused exports
code-brain query --type dead-exports

# Find orphaned files
code-brain query --type orphans

# Analyze impact of changing a symbol
code-brain query --type impact --symbol MyService

# Find path between two nodes
code-brain query --type path --from NodeA --to NodeB
```

### `code-brain analyze`

Generate comprehensive code quality reports:

```bash
# Basic analysis
code-brain analyze

# Include git statistics (hotspots, churn)
code-brain analyze --git

# JSON output
code-brain analyze --format json
```

### `code-brain mcp`

Start Model Context Protocol server for AI assistants (Claude, GPT-4, etc.):

```bash
code-brain mcp
```

The MCP server provides 7 tools:
- `get_graph_export` - Export code graph in AI format
- `search_symbols` - Search for symbols
- `find_callers` - Find callers of a symbol
- `find_callees` - Find callees from a symbol
- `detect_cycles` - Detect circular dependencies
- `find_dead_exports` - Find unused exports
- `analyze_impact` - Analyze impact of changes

### `code-brain graph`

Starts the graph server, usually at `http://localhost:3000`.

### `code-brain export --format ai`

Outputs a compact structured bundle with:

- project metadata
- query scope
- summaries
- verified nodes
- verified edges
- ranking scores when Python analytics succeeds
- explicit AI consumption rules

The AI rules explicitly say:

- do not infer missing behavior
- use only listed nodes and edges
- preserve unknown or unresolved relationships
- do not fabricate flows or APIs

#### Token-Limited Exports

For constrained LLM contexts, use `--max-tokens` to intelligently prune the export:

```bash
# Export with 2000 token budget (GPT-3.5 context)
code-brain export --format ai --max-tokens 2000 > compact.json

# Export with 4000 token budget (Claude Opus context)
code-brain export --format ai --max-tokens 4000 > medium.json

# Export with focus and token limit
code-brain export --format ai --focus src/auth --max-tokens 4000 > auth-context.json
```

The exporter automatically ranks nodes by importance (using analytics centrality + node type priority) and includes the most critical nodes/edges within the token budget. Exports include a `truncated` flag indicating if content was pruned.

## Performance

- **Parsing**: 10-50ms per file (tree-sitter), 3-5x faster with parallel parsing
- **Search**: <50ms with FTS5 full-text search (100x faster than linear)
- **Analytics**: 1ms with cache (30,000x faster), 2-5s without cache
- **UI Load**: Instant with LOD system (handles 100K+ nodes)
- **Graph Resolution**: 80% call resolution with two-pass import analysis

## Supported Languages

| Language | Parser | Features |
|----------|--------|----------|
| TypeScript | TS Compiler API | Full AST, type info, decorators |
| JavaScript | TS Compiler API | Full AST, JSX support |
| Java | Tree-sitter | Classes, methods, annotations, generics |
| Python | Tree-sitter | Functions, classes, decorators, type hints |
| Go | Tree-sitter | Functions, methods, structs, interfaces |

All parsers support:
- Accurate symbol extraction
- Import/export tracking
- Test file detection
- Entry point detection
- Automatic fallback for large files

## How To Run

## Dependencies

### Required
```bash
npm install
```

### Optional (for Python analytics)
```bash
python3 -m pip install -r python/requirements.txt
```

If you skip the Python step, indexing and exports still work, but analytics ranking falls back gracefully.

## Build

```bash
npm run build
```

## Quick Start

### 4. Run against the current repository

```bash
node dist/cli/cli.js init --path .
node dist/cli/cli.js index --path .
node dist/cli/cli.js query --type cycles --path .
node dist/cli/cli.js analyze --git --path .
node dist/cli/cli.js export --format ai --path .
node dist/cli/cli.js graph --path . --port 3000
```

### 5. Optional global CLI

```bash
npm link
code-brain init --path /absolute/path/to/your/repo
code-brain index --path /absolute/path/to/your/repo
code-brain analyze --git --path /absolute/path/to/your/repo
```

## Example Workflow

```bash
# Initialize
code-brain init --path /repo

# Index the repository
code-brain index --path /repo

# Start visual graph server
code-brain graph --path /repo

# Query the graph
code-brain query --type callers --symbol MyFunction --path /repo
code-brain query --type cycles --path /repo

# Analyze code quality
code-brain analyze --git --path /repo

# Export for AI
code-brain export --format ai --max-tokens 100000 --path /repo > context.json

# Watch for changes (real-time updates)
code-brain watch --path /repo

# Update incrementally
code-brain update --path /repo

# Start MCP server for AI assistants
code-brain mcp
```

## Advanced Features

### Level-of-Detail (LOD) Rendering

The UI uses a 3-level LOD system for scalability:
- **Level 0**: Cluster view (30-100 community nodes)
- **Level 1**: File-level view (no methods)
- **Level 2**: Full detail with focus expansion

This allows instant loading of graphs with 100K+ nodes.

### Hierarchical AI Export

Exports use a 3-level structure optimized for AI consumption:
- **Project**: Overview, modules, unresolved calls
- **Modules**: Directory-level summaries with top symbols
- **Symbols**: Individual functions, classes, methods

Token budgets automatically prune based on importance scores.

### Git Integration

Track code evolution and identify hotspots:
```bash
code-brain analyze --git
```

Provides:
- File change frequency
- Author statistics
- Hotspot detection (high-churn files)
- Blame information

### Parallel Parsing

Automatically uses worker threads for large repositories:
- 3-5x faster on multi-core systems
- Automatic batch processing
- Fault-tolerant (continues on errors)

### Real-Time Updates

WebSocket-based live updates:
```bash
code-brain watch --path /repo
```

The UI automatically refreshes when files change.

## Export Shape

The AI export is a single structured object. It contains:

- `project`
- `nodes`
- `edges`
- `summaries`
- `query`
- `ranking`
- `rules`

All exported nodes and edges include provenance.

## Development

```bash
npm run build
npm test
```

## Configuration

Create `.codebrainrc.json` in your project root:

```json
{
  "include": ["src/**", "lib/**"],
  "exclude": ["node_modules", "dist", "build", "**/*.test.ts"],
  "languages": ["typescript", "javascript", "java", "python", "go"]
}
```

## API Endpoints

The graph server exposes several endpoints:

- `GET /api/graph?level=0` - Cluster view
- `GET /api/graph?level=1` - File-level view
- `GET /api/graph?level=2&focus=nodeId` - Full detail with focus
- `GET /api/graph?community=N` - Expand community
- `GET /api/search?q=query` - Full-text search
- `GET /api/node/:id` - Get node details
- `GET /api/analytics` - Get analytics results
- `GET /api/query/callers/:symbol` - Find callers
- `GET /api/query/callees/:symbol` - Find callees
- `GET /api/analyze/cycles` - Detect cycles
- `GET /api/analyze/dead-exports` - Find dead exports
- `WebSocket /ws` - Real-time updates

## Notes

- Parsing is deterministic and AST-based (tree-sitter for Java/Python/Go, TS compiler API for TS/JS).
- The parser is the source of truth for structure.
- Python analytics never invent structure or override parser truth.
- External modules and unresolved call targets are preserved explicitly instead of guessed.
- System is fault-tolerant: continues on parse errors with automatic fallback.
- Scales to 100K+ nodes with LOD rendering and analytics caching.

## Documentation

- **[QUICK_SETUP.md](QUICK_SETUP.md)** - Get started in 2 minutes (API keys, first chat)
- **[QUICKSTART.md](QUICKSTART.md)** - Complete quickstart guide
- **[USER_GUIDE.md](USER_GUIDE.md)** - Full user guide with all features
- **[COMMANDS.md](COMMANDS.md)** - CLI command reference
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
- **[docs/API.md](docs/API.md)** - HTTP API reference
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment guide

## License

MIT
