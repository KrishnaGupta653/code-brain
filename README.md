# code-brain

**100× fewer tokens. Give AI full codebase context.**

`code-brain` is a deterministic codebase intelligence system that transforms multi-language repositories into queryable knowledge graphs. Unlike raw file dumps, code-brain provides structured, AI-ready context with **48-625× token reduction** depending on your use case.

## Why code-brain?

### The Problem
- **Raw file dumps:** 500K+ tokens → exceeds AI context limits
- **Manual selection:** Miss important dependencies and relationships
- **Grep/search:** No understanding of code structure or relationships

### The Solution
- **Structured graph:** Nodes (symbols) + Edges (relationships)
- **Smart compression:** 48× on full exports, up to 3,600× on queries
- **Real-time updates:** Incremental changes, not full rebuilds
- **AI-optimized:** Hierarchical exports with importance ranking

## Quick Start

```bash
# Install
npm install -g code-brain

# Index your repository
code-brain init
code-brain index

# Chat with your codebase (natural language)
code-brain chat "how does authentication work?"

# Export for AI (48× token reduction)
code-brain export --format ai > context.json

# Query specific information (3,600× reduction)
code-brain query --type callers --symbol UserService

# Visual exploration
code-brain graph
```

## Features

### Core Capabilities
- **15 Languages**: TypeScript, JavaScript, Java, Python, Go, Rust, C#, C/C++, Ruby, PHP, Kotlin, Scala, Elixir, Haskell, and more
- **AST-Based Parsing**: Tree-sitter for accurate symbol extraction
- **Real-Time Updates**: WebSocket-based live graph updates
- **Chat Interface**: Natural language queries with multi-provider AI support
- **Git Integration**: Blame, hotspots, churn analysis

### Intelligence Features (v2.0)
- **PageRank Importance**: Graph-based importance scoring
- **Dead Code Detection**: Finds unreachable symbols
- **Cycle Detection**: Identifies circular dependencies
- **Bridge Detection**: Finds critical connection points
- **Recency Weighting**: Prioritizes recently modified code
- **Smart Context Assembly**: Task-aware code selection
- **Pattern Queries**: Structural pattern matching
- **Impact Analysis**: Blast radius calculation
- **Architecture Rules**: Enforce invariants with health scoring

### Performance (v2.0)
- **10,000× faster BFS**: O(n²) → O(n) optimization
- **10-333× faster vector search**: sqlite-vec with HNSW indexing
- **10× token efficiency**: CBv2 compact export format
- **~500 tokens saved**: Optimized export structure
- **Hybrid Search**: BM25 + vector similarity for semantic search

### AI Integration
- **Token Reduction**: 48× on full exports, up to 3,600× on queries ([see benchmarks](BENCHMARKS.md))
- **MCP Server**: Model Context Protocol for AI assistants
- **Multi-Provider Chat**: Anthropic Claude, OpenAI GPT-4, Ollama (local)
- **Embeddings**: OpenAI, Anthropic/Voyage, Ollama support
- **Hierarchical Exports**: Project → Modules → Symbols structure

### Performance & Scale
- **Scalable**: Handles 100K+ node graphs with LOD rendering
- **Fast Search**: FTS5 full-text search with BM25 ranking
- **Incremental Updates**: Hash-based change detection (unique to code-brain)
- **Parallel Parsing**: Multi-core processing for large repos
- **Analytics**: Centrality, community detection, hotspot analysis

### Developer Experience
- **Query Language**: Find callers, callees, cycles, dead code, orphans, impact
- **Visual Graph UI**: Interactive 2D/3D graph visualization with live code viewer
- **Watch Mode**: Auto-update on file changes
- **Export Formats**: JSON, YAML, AI-optimized

### Security & Production
- **Enterprise Security**: Helmet, rate limiting, SSRF protection, input sanitization
- **API Key Auth**: Optional authentication for team/CI environments
- **SQLite Storage**: Persistent, portable, no external dependencies
- **Fault Tolerant**: Continues on parse errors with automatic fallback

## Token Reduction Benchmarks

| Scenario | Raw Tokens | code-brain | Reduction |
|----------|------------|------------|-----------|
| **Full codebase** | 540,000 | 11,250 | **48×** |
| **Focused subsystem** | 45,000 | 2,000 | **22.5×** |
| **Query: "find callers"** | 540,000 | 150 | **3,600×** |
| **Token-limited export** | 1,250,000 | 4,000 | **312×** |

**See [BENCHMARKS.md](BENCHMARKS.md) for detailed analysis and reproduction steps.**

## Comparison with Alternatives

| Feature | code-brain | Graphify | Sourcegraph | GitHub Copilot |
|---------|-----------|----------|-------------|----------------|
| **Token Reduction** | 48-3,600× | 71.5× | N/A | N/A |
| **PageRank Importance** | ✅ | ❌ | ❌ | ❌ |
| **Dead Code Detection** | ✅ | ❌ | ❌ | ❌ |
| **Cycle Detection** | ✅ | ❌ | ✅ | ❌ |
| **Impact Analysis** | ✅ | ❌ | ❌ | ❌ |
| **Pattern Queries** | ✅ | ❌ | ❌ | ❌ |
| **Real-Time Updates** | ✅ | ❌ | ✅ | ❌ |
| **Chat Interface** | ✅ | ❌ | ❌ | ✅ |
| **Languages** | 15 | 11 | 40+ | All |
| **Git Integration** | ✅ | ❌ | ✅ | ✅ |
| **Local/Offline** | ✅ | ✅ | ❌ | ❌ |
| **Multi-Modal** | PDF (Phase 1) | PDF+Images+Video | ❌ | ❌ |
| **Query System** | 8 types | BFS subgraph | Advanced | N/A |
| **Open Source** | ✅ MIT | ✅ MIT | ❌ | ❌ |

**Unique Strengths:**
- ✅ **PageRank importance** - Graph-based scoring
- ✅ **Dead code detection** - Find unreachable symbols
- ✅ **Cycle detection** - Identify circular dependencies
- ✅ **Impact analysis** - Blast radius calculation
- ✅ **Pattern queries** - Structural pattern matching
- ✅ **Smart context assembly** - Task-aware code selection
- ✅ **Real-time updates** during development
- ✅ **Chat interface** for natural language queries
- ✅ **Incremental updates** (hash-based, fast)
- ✅ **Query-based compression** (up to 3,600× reduction)
- ✅ **Git integration** (blame, hotspots, churn)

## Architecture

The runtime is split into a Node product layer and a Python analytics layer.

- `src/cli`
  Handles `init`, `index`, `update`, `graph`, `chat`, and `export`.
- `src/parser`
  Deterministic parsing using tree-sitter (15 languages) and TypeScript compiler API.
- `src/graph`
  Graph construction, node/edge creation, relationship wiring.
- `src/storage`
  SQLite schema and persistence.
- `src/retrieval`
  Focus resolution, graph querying, hybrid search, and export bundle generation.
- `src/server`
  Graph UI HTTP server and JSON endpoints with security middleware.
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

Starts the interactive graph visualization server at `http://localhost:3000`.

**Features:**
- **Live Code Viewer**: Click any node to see its source code with syntax highlighting
- **Interactive Navigation**: Zoom, pan, search, and filter nodes
- **Relationship Explorer**: See incoming/outgoing connections
- **Path Finding**: Shift+click two nodes to find paths between them
- **Real-Time Updates**: WebSocket-based live graph updates
- **Minimap**: Bird's-eye view of the entire graph
- **Analytics**: Centrality, importance, communities, cycles

**Usage:**
```bash
code-brain graph              # Start on default port 3000
code-brain graph --port 8080  # Custom port
```

Click any node to view:
- Node metadata (name, type, location)
- Source code with syntax highlighting (20+ languages)
- Relationships (callers, callees, dependencies)
- Toggle code visibility as needed

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

- **[QUICK_SETUP.md](QUICK_SETUP.md)** ⭐ **START HERE** - Get started in 2 minutes
- **[BENCHMARKS.md](BENCHMARKS.md)** 📊 - Token reduction benchmarks (48-3,600×)
- **[SECURITY.md](SECURITY.md)** 🔒 - Enterprise security features
- **[QUICKSTART.md](QUICKSTART.md)** - Complete quickstart guide
- **[USER_GUIDE.md](USER_GUIDE.md)** - Full user guide with all features
- **[COMMANDS.md](COMMANDS.md)** - CLI command reference
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
- **[docs/API.md](docs/API.md)** - HTTP API reference
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment guide

## Use Cases

### 1. AI-Assisted Development
```bash
# Give AI full codebase context (48× compression)
code-brain export --format ai > context.json
cat context.json | your-ai-tool

# Natural language queries
code-brain chat "how does the authentication system work?"
code-brain chat "which functions have no tests?"
```

### 2. Code Review & Refactoring
```bash
# Find all callers before refactoring
code-brain query --type callers --symbol OldFunction

# Analyze impact of changes
code-brain query --type impact --symbol CriticalService

# Detect circular dependencies
code-brain query --type cycles
```

### 3. Onboarding & Documentation
```bash
# Visual exploration
code-brain graph

# Find entry points
code-brain query --type search --text "main"

# Export architecture overview
code-brain export --format ai --top 50 > overview.json
```

### 4. Code Quality Analysis
```bash
# Find dead code
code-brain query --type dead-exports

# Find orphaned files
code-brain query --type orphans

# Analyze with git history
code-brain analyze --git
```

## Performance

- **Parsing**: 10-50ms per file (tree-sitter), 3-5× faster with parallel parsing
- **Search**: <50ms with FTS5 full-text search (100× faster than linear)
- **Analytics**: 1ms with cache (30,000× faster), 2-5s without cache
- **UI Load**: Instant with LOD system (handles 100K+ nodes)
- **Graph Resolution**: 80% call resolution with two-pass import analysis
- **Token Reduction**: 48× on full exports, up to 3,600× on queries

## Supported Languages

| Language | Parser | Features |
|----------|--------|----------|
| TypeScript | TS Compiler API | Full AST, type info, decorators |
| JavaScript | TS Compiler API | Full AST, JSX support |
| Java | Tree-sitter | Classes, methods, annotations, generics |
| Python | Tree-sitter | Functions, classes, decorators, type hints |
| Go | Tree-sitter | Functions, methods, structs, interfaces |
| Rust | Tree-sitter | Functions, structs, traits, impl blocks |
| C# | Tree-sitter | Classes, methods, properties, namespaces |
| C/C++ | Tree-sitter | Functions, structs, classes |
| Ruby | Tree-sitter | Classes, methods, modules |
| PHP | Tree-sitter | Classes, functions, traits |
| Kotlin | Tree-sitter | Classes, functions, objects |
| Scala | Tree-sitter | Classes, objects, traits |
| Elixir | Tree-sitter | Functions, modules |
| Haskell | Tree-sitter | Functions, types |
| **PDF** | Multi-modal | Documentation (Phase 1) |

All parsers support:
- Accurate symbol extraction
- Import/export tracking
- Test file detection
- Entry point detection
- Automatic fallback for large files

## License

MIT

