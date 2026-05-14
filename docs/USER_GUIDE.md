# Code-Brain User Guide

**Complete guide to using code-brain - a deterministic codebase intelligence system**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Core Commands](#core-commands)
5. [Advanced Features](#advanced-features)
6. [Configuration](#configuration)
7. [Export Formats](#export-formats)
8. [Query System](#query-system)
9. [Analytics & Insights](#analytics--insights)
10. [MCP Server](#mcp-server)
11. [UI Visualization](#ui-visualization)
12. [Troubleshooting](#troubleshooting)
13. [Best Practices](#best-practices)

---

## Introduction

Code-brain is a multi-language codebase intelligence system that:

- **Parses** your code using AST-based parsers (tree-sitter)
- **Builds** a knowledge graph of symbols and relationships
- **Stores** everything in SQLite with full provenance tracking
- **Exports** AI-ready context bundles for LLMs
- **Visualizes** your codebase as an interactive graph
- **Tracks** changes incrementally for fast updates

### Supported Languages

| Language | Parser | Features |
|----------|--------|----------|
| TypeScript | TS Compiler API | Full AST, types, decorators |
| JavaScript | TS Compiler API | Full AST, JSX support |
| Java | Tree-sitter | Classes, methods, annotations |
| Python | Tree-sitter | Functions, classes, decorators |
| Go | Tree-sitter | Functions, methods, structs |
| Rust | Tree-sitter | Functions, structs, traits |
| C# | Tree-sitter | Classes, methods, properties |
| C/C++ | Tree-sitter | Functions, structs, classes |
| Ruby | Tree-sitter | Classes, methods, modules |
| PHP | Tree-sitter | Classes, functions, traits |
| Kotlin | Tree-sitter | Classes, functions, objects |
| Scala | Tree-sitter | Classes, objects, traits |
| Elixir | Tree-sitter | Functions, modules |
| Haskell | Tree-sitter | Functions, types |

---

## Installation

### Prerequisites

- **Node.js** 18.0.0 or higher
- **Python 3.8+** (optional, for analytics)
- **Git** (optional, for git integration)

### Install Dependencies

```bash
# Clone or download the repository
cd code-brain

# Install Node.js dependencies
npm install

# Install Python dependencies (optional, for analytics)
python3 -m pip install -r python/requirements.txt

# Build the project
npm run build
```

### Global Installation (Optional)

```bash
# Link globally to use 'code-brain' command anywhere
npm link

# Verify installation
code-brain --version
```

---

## Quick Start

### 1. Initialize a Project

```bash
# Initialize in current directory
code-brain init

# Initialize specific project
code-brain init --path /path/to/your/project

# Use custom database location (useful for network drives)
code-brain init --path /path/to/project --db-path /custom/location/graph.db
```

**What it creates:**
- `.codebrain/graph.db` - SQLite database
- `.codebrainrc.json` - Configuration file

### 2. Index Your Codebase

```bash
# Index current directory
code-brain index

# Index specific project
code-brain index --path /path/to/project

# Index with git metadata
code-brain index --path /path/to/project --git-blame

# Index without documentation
code-brain index --path /path/to/project --no-docs

# Index without API schemas
code-brain index --path /path/to/project --no-api
```

**Progress indicators show:**
- Parsing files (X/Y %)
- Building import relationships
- Building dependency edges
- Connecting symbol relationships

### 3. View the Graph

```bash
# Start visualization server (default port 3000)
code-brain graph

# Use custom port
code-brain graph --port 4000

# Auto-assign available port
code-brain graph --port 0
```

Open `http://localhost:3000` in your browser to explore the interactive graph.

### 4. Export for Analysis

```bash
# Export as JSON
code-brain export --format json > graph.json

# Export as YAML
code-brain export --format yaml > graph.yaml

# Export for AI (optimized for LLMs)
code-brain export --format ai > ai-context.json

# Export with token limit
code-brain export --format ai --max-tokens 4000 > compact.json

# Export top 50 most important nodes
code-brain export --format ai --top 50 > top-nodes.json
```

---

## Core Commands

### `init` - Initialize Project

Creates database and configuration files.

```bash
code-brain init [options]

Options:
  -p, --path <path>        Project root path (default: current directory)
  --db-path <dbPath>       Custom database location
```

**Examples:**
```bash
# Initialize current directory
code-brain init

# Initialize with custom DB path
code-brain init --path . --db-path C:/Users/username/.codebrain/myproject/graph.db
```

### `index` - Build Knowledge Graph

Scans repository, parses files, builds graph.

```bash
code-brain index [options]

Options:
  -p, --path <path>        Project root path (default: current directory)
  --git-blame              Enrich with git metadata (author, last modified)
  --no-docs                Skip documentation ingestion
  --no-api                 Skip API schema ingestion
```

**Examples:**
```bash
# Basic indexing
code-brain index

# With git metadata
code-brain index --git-blame

# Skip docs and API schemas
code-brain index --no-docs --no-api
```

**What it extracts:**
- Files and project structure
- Imports and exports
- Functions, classes, methods, interfaces
- Call relationships
- Inheritance and implementations
- Route definitions (Express, etc.)
- Config references (process.env, etc.)
- Test definitions
- Documentation references
- Entry points

### `update` - Incremental Update

Updates graph with only changed files (fast).

```bash
code-brain update [options]

Options:
  -p, --path <path>        Project root path (default: current directory)
```

**Examples:**
```bash
# Update current project
code-brain update

# Update specific project
code-brain update --path /path/to/project
```

**How it works:**
- Compares file hashes
- Re-indexes only changed files
- Updates affected relationships
- Much faster than full re-index

### `watch` - Real-Time Updates

Watches for file changes and auto-updates graph.

```bash
code-brain watch [options]

Options:
  -p, --path <path>        Project root path (default: current directory)
  --interval <ms>          Polling interval in milliseconds (default: 1000)
```

**Examples:**
```bash
# Watch current directory
code-brain watch

# Watch with custom interval
code-brain watch --interval 2000
```

**Features:**
- Real-time file change detection
- Automatic graph updates
- WebSocket broadcasts to UI
- Debounced updates

### `graph` - Visualization Server

Starts interactive graph visualization server.

```bash
code-brain graph [options]

Options:
  -p, --path <path>        Project root path (default: current directory)
  --port <port>            Server port (default: 3000, use 0 for auto-assign)
```

**Examples:**
```bash
# Start on default port 3000
code-brain graph

# Use custom port
code-brain graph --port 4000

# Auto-assign available port
code-brain graph --port 0
```

**Port conflict resolution:**
```bash
# If port 3000 is in use:
code-brain graph --port 4001

# Or use auto-assign:
code-brain graph --port 0
```

### `export` - Export Graph

Exports graph in various formats.

```bash
code-brain export [options]

Options:
  -p, --path <path>        Project root path (default: current directory)
  --format <format>        Export format: json, yaml, ai (default: json)
  --focus <module>         Focus on specific module or symbol
  --max-tokens <number>    Maximum tokens for AI export
  --top <number>           Export only top N most important nodes
  --model <model>          Target AI model (gpt-4, claude-3-opus, etc.)
```

**Examples:**
```bash
# JSON export
code-brain export --format json > graph.json

# YAML export
code-brain export --format yaml > graph.yaml

# AI-optimized export
code-brain export --format ai > ai-context.json

# With token limit (for GPT-3.5)
code-brain export --format ai --max-tokens 2000 > compact.json

# Focus on specific module
code-brain export --format ai --focus src/auth > auth-context.json

# Top 50 most important nodes
code-brain export --format ai --top 50 > top-nodes.json

# Target specific AI model
code-brain export --format ai --model gpt-4 --max-tokens 8000 > gpt4-context.json
```

---

## Advanced Features

### Query System

Query the code graph with powerful analysis tools.

```bash
code-brain query [options]

Options:
  -p, --path <path>        Project root path
  --type <type>            Query type (see below)
  --text <text>            Search query text (for search type)
  --symbol <symbol>        Symbol name for callers/callees/impact
  --from <from>            Source node for path query
  --to <to>                Target node for path query
  --limit <limit>          Maximum results (default: 50)
```

**Query Types:**

#### 1. Search Symbols
```bash
# Search for symbols by name
code-brain query --type search --text "UserService"
```

#### 2. Find Callers
```bash
# Find all functions that call a specific function
code-brain query --type callers --symbol MyFunction

# Find callers of a method
code-brain query --type callers --symbol MyClass.method
```

#### 3. Find Callees
```bash
# Find all functions called by a specific function
code-brain query --type callees --symbol MyFunction
```

#### 4. Detect Circular Dependencies
```bash
# Find circular import/dependency cycles
code-brain query --type cycles
```

#### 5. Find Dead Exports
```bash
# Find unused exports (potential dead code)
code-brain query --type dead-exports
```

#### 6. Find Orphaned Files
```bash
# Find files not imported by anything
code-brain query --type orphans
```

#### 7. Impact Analysis
```bash
# Analyze impact of changing a symbol
code-brain query --type impact --symbol MyService
```

#### 8. Find Path Between Nodes
```bash
# Find dependency path between two nodes
code-brain query --type path --from NodeA --to NodeB
```

### Diff Command

Export only changes since last index.

```bash
code-brain diff [options]

Options:
  -p, --path <path>        Project root path
  --format <format>        Export format: json, yaml, ai (default: ai)
  --since <timestamp>      Compare against specific timestamp (milliseconds)
  --output <file>          Output file (default: stdout)
```

**Examples:**
```bash
# Export changes since last index
code-brain diff > changes.json

# Export changes since specific time
code-brain diff --since 1640000000000 > changes.json

# Save to file
code-brain diff --output changes.json
```

### Analyze Command

Generate comprehensive code quality reports.

```bash
code-brain analyze [options]

Options:
  -p, --path <path>        Project root path
  --git                    Include git statistics
  --format <format>        Output format: text or json (default: text)
```

**Examples:**
```bash
# Basic analysis
code-brain analyze

# With git statistics (hotspots, churn)
code-brain analyze --git

# JSON output
code-brain analyze --format json > analysis.json
```

**Report includes:**
- File count and symbol count
- Complexity metrics
- Dependency analysis
- Entry points
- Git statistics (if --git flag used):
  - File change frequency
  - Author statistics
  - Hotspot detection
  - Blame information

### Summarize Command

Generate LLM-powered summaries for modules.

```bash
code-brain summarize [options]

Options:
  --regenerate             Regenerate all summaries
  --stale <days>           Regenerate summaries older than N days (default: 7)
  --batch-size <size>      Number of summaries per batch (default: 50)
  --concurrency <n>        Number of concurrent API requests (default: 3)
```

**Requirements:**
- Set `ANTHROPIC_API_KEY` environment variable

**Examples:**
```bash
# Generate summaries for all modules
code-brain summarize

# Regenerate all summaries
code-brain summarize --regenerate

# Regenerate stale summaries (older than 14 days)
code-brain summarize --stale 14

# Use custom batch size and concurrency
code-brain summarize --batch-size 100 --concurrency 5
```

### Embeddings Command

Generate vector embeddings for semantic search.

```bash
code-brain embeddings [options]

Options:
  -p, --path <path>        Project root path
  --force                  Regenerate all embeddings
  --model <model>          Embedding model to use
  --provider <provider>    Embedding provider (openai, anthropic, local)
  --stats                  Show embedding statistics
  --clear                  Clear all embeddings
```

**Examples:**
```bash
# Generate embeddings
code-brain embeddings

# Force regenerate all
code-brain embeddings --force

# Use specific provider
code-brain embeddings --provider openai --model text-embedding-3-small

# Show statistics
code-brain embeddings --stats

# Clear all embeddings
code-brain embeddings --clear
```

---

## MCP Server

Start Model Context Protocol server for AI assistants (Claude, GPT-4, etc.).

```bash
code-brain mcp
```

**Available MCP Tools:**

1. **get_graph_export** - Export code graph in AI format
2. **search_symbols** - Search for symbols by name
3. **find_callers** - Find callers of a symbol
4. **find_callees** - Find callees from a symbol
5. **detect_cycles** - Detect circular dependencies
6. **find_dead_exports** - Find unused exports
7. **analyze_impact** - Analyze impact of changes

**Integration with AI Assistants:**

Configure your AI assistant to connect to the MCP server:

```json
{
  "mcpServers": {
    "code-brain": {
      "command": "code-brain",
      "args": ["mcp"]
    }
  }
}
```

---

## Configuration

### `.codebrainrc.json`

Create this file in your project root to customize behavior:

```json
{
  "include": ["src/**", "lib/**"],
  "exclude": ["node_modules", "dist", "build", "**/*.test.ts"],
  "languages": ["typescript", "javascript", "java", "python", "go"],
  "enableAnalytics": true
}
```

**Options:**

- **include** (array): Glob patterns for files to include
- **exclude** (array): Glob patterns for files to exclude
- **languages** (array): Languages to parse
- **enableAnalytics** (boolean): Enable Python analytics (default: true)

**Example configurations:**

```json
// TypeScript/JavaScript only
{
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"],
  "languages": ["typescript", "javascript"]
}

// Multi-language project
{
  "include": ["src/**", "backend/**", "frontend/**"],
  "exclude": ["node_modules", "dist", "build", "target"],
  "languages": ["typescript", "java", "python"]
}

// Disable analytics for faster indexing
{
  "include": ["**"],
  "exclude": ["node_modules"],
  "enableAnalytics": false
}
```

---

## Export Formats

### JSON Format

Standard JSON export with full graph data.

```bash
code-brain export --format json > graph.json
```

**Structure:**
```json
{
  "project": {
    "name": "my-project",
    "root": "/path/to/project",
    "language": "typescript",
    "fileCount": 150,
    "symbolCount": 1200,
    "edgeCount": 3500
  },
  "nodes": [
    {
      "id": "node-id",
      "name": "MyFunction",
      "type": "function",
      "semanticPath": "src/utils/helpers.ts::MyFunction",
      "location": {
        "file": "src/utils/helpers.ts",
        "start": { "line": 10, "column": 0 },
        "end": { "line": 20, "column": 1 }
      }
    }
  ],
  "edges": [
    {
      "from": "caller-id",
      "to": "callee-id",
      "type": "CALLS",
      "confidence": 1.0
    }
  ]
}
```

### YAML Format

Human-readable YAML export.

```bash
code-brain export --format yaml > graph.yaml
```

### AI Format

Optimized for LLM consumption with hierarchical structure.

```bash
code-brain export --format ai > ai-context.json
```

**Features:**
- Hierarchical organization (project → modules → symbols)
- Token budget management
- Importance-based ranking
- Explicit AI consumption rules
- Unresolved call tracking

**Structure:**
```json
{
  "project": { /* metadata */ },
  "modules": [
    {
      "path": "src/auth",
      "summary": "Authentication module",
      "topSymbols": [/* most important symbols */]
    }
  ],
  "symbols": [/* detailed symbol information */],
  "unresolvedCalls": [/* calls to external/unknown code */],
  "rules": [
    "Do not infer missing behavior",
    "Use only listed nodes and edges",
    "Preserve unknown relationships"
  ],
  "truncated": false,
  "tokenEstimate": 3500
}
```

**Token-Limited Exports:**

```bash
# For GPT-3.5 (2K context)
code-brain export --format ai --max-tokens 2000 > compact.json

# For GPT-4 (8K context)
code-brain export --format ai --max-tokens 8000 > medium.json

# For Claude Opus (100K context)
code-brain export --format ai --max-tokens 100000 > large.json
```

**Focused Exports:**

```bash
# Focus on authentication module
code-brain export --format ai --focus src/auth > auth-context.json

# Focus on specific file
code-brain export --format ai --focus src/api/handlers.ts > handlers-context.json

# Focus with token limit
code-brain export --format ai --focus src/auth --max-tokens 4000 > auth-compact.json
```

---

## UI Visualization

### Features

- **Interactive Graph**: Click, drag, zoom, pan
- **Level-of-Detail (LOD)**: 3-level system for scalability
  - Level 0: Cluster view (30-100 communities)
  - Level 1: File-level view (no methods)
  - Level 2: Full detail with focus expansion
- **Search**: Full-text search with FTS5
- **Filtering**: Filter by node type, file, module
- **Node Inspection**: Click nodes to see details
- **Relationship Visualization**: See connections between symbols
- **Real-Time Updates**: WebSocket-based live updates

### API Endpoints

The graph server exposes these endpoints:

```
GET  /api/graph?level=0              - Cluster view
GET  /api/graph?level=1              - File-level view
GET  /api/graph?level=2&focus=nodeId - Full detail with focus
GET  /api/graph?community=N          - Expand community
GET  /api/search?q=query             - Full-text search
GET  /api/node/:id                   - Get node details
GET  /api/analytics                  - Get analytics results
GET  /api/query/callers/:symbol      - Find callers
GET  /api/query/callees/:symbol      - Find callees
GET  /api/analyze/cycles             - Detect cycles
GET  /api/analyze/dead-exports       - Find dead exports
WebSocket /ws                        - Real-time updates
```

### Using the UI

1. **Start the server:**
   ```bash
   code-brain graph --port 3000
   ```

2. **Open in browser:**
   ```
   http://localhost:3000
   ```

3. **Navigate:**
   - **Zoom**: Mouse wheel or pinch
   - **Pan**: Click and drag background
   - **Select**: Click on nodes
   - **Search**: Use search bar at top
   - **Filter**: Use filter controls

4. **Keyboard shortcuts:**
   - `Ctrl+F` / `Cmd+F`: Focus search
   - `Escape`: Clear selection
   - `Space`: Reset view

---

## Troubleshooting

### Port Already in Use

**Problem:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solutions:**
```bash
# Use different port
code-brain graph --port 4000

# Use auto-assigned port
code-brain graph --port 0

# Kill process using port 3000 (Linux/Mac)
lsof -ti:3000 | xargs kill -9

# Kill process using port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Database Locked

**Problem:** `Error: database is locked`

**Solutions:**
```bash
# Close other processes accessing the database
# Or use custom database path
code-brain init --db-path /custom/path/graph.db
```

### Parse Errors

**Problem:** Some files fail to parse

**Solution:** Code-brain continues on parse errors with automatic fallback. Check logs for details:

```bash
# Enable verbose logging
DEBUG=code-brain:* code-brain index
```

### Python Analytics Fails

**Problem:** Analytics fails or times out

**Solutions:**
```bash
# Install Python dependencies
python3 -m pip install -r python/requirements.txt

# Disable analytics
# Edit .codebrainrc.json:
{
  "enableAnalytics": false
}
```

### Out of Memory

**Problem:** Node.js runs out of memory on large codebases

**Solution:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" code-brain index
```

### Slow Indexing

**Problem:** Indexing takes too long

**Solutions:**
```bash
# Exclude unnecessary directories
# Edit .codebrainrc.json:
{
  "exclude": ["node_modules", "dist", "build", "vendor", "target"]
}

# Disable git blame
code-brain index  # (don't use --git-blame)

# Disable analytics
{
  "enableAnalytics": false
}
```

---

## Best Practices

### 1. Incremental Updates

Use `update` instead of re-indexing:

```bash
# After making changes
code-brain update

# Much faster than:
code-brain index
```

### 2. Watch Mode for Development

Use watch mode during active development:

```bash
# Terminal 1: Watch for changes
code-brain watch

# Terminal 2: Run visualization
code-brain graph
```

### 3. Focused Exports

Export only what you need:

```bash
# Instead of full export:
code-brain export --format ai > huge.json

# Use focused export:
code-brain export --format ai --focus src/auth > auth.json
```

### 4. Token Budgets

Match token limits to your AI model:

```bash
# GPT-3.5 Turbo (4K context)
code-brain export --format ai --max-tokens 2000

# GPT-4 (8K context)
code-brain export --format ai --max-tokens 6000

# Claude Opus (100K context)
code-brain export --format ai --max-tokens 80000
```

### 5. Configuration

Create `.codebrainrc.json` to customize:

```json
{
  "include": ["src/**"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"],
  "languages": ["typescript", "javascript"]
}
```

### 6. Git Integration

Use git metadata for hotspot analysis:

```bash
code-brain index --git-blame
code-brain analyze --git
```

### 7. Regular Maintenance

```bash
# Rebuild index periodically
code-brain index

# Or use update for incremental changes
code-brain update
```

### 8. Database Maintenance

```bash
# Vacuum database (reclaim space)
sqlite3 .codebrain/graph.db "VACUUM;"

# Analyze database (optimize queries)
sqlite3 .codebrain/graph.db "ANALYZE;"
```

---

## Performance Tips

### Large Codebases (50K+ files)

1. **Exclude unnecessary files:**
   ```json
   {
     "exclude": ["node_modules", "dist", "build", "vendor", "target", "**/*.min.js"]
   }
   ```

2. **Disable analytics temporarily:**
   ```json
   {
     "enableAnalytics": false
   }
   ```

3. **Increase memory:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=8192" code-brain index
   ```

4. **Use incremental updates:**
   ```bash
   code-brain update  # instead of full re-index
   ```

### Typical Performance

**Medium Codebase (10K LOC):**
- Parse time: 1-2 seconds
- Graph construction: <1 second
- Database write: <1 second
- Total: ~2-4 seconds

**Large Codebase (50K LOC):**
- Parse time: 5-10 seconds
- Graph construction: 2-3 seconds
- Database write: 2-5 seconds
- Total: ~10-20 seconds

**Very Large Codebase (100K+ LOC):**
- Parse time: 20-40 seconds
- Graph construction: 5-10 seconds
- Database write: 5-10 seconds
- Total: ~30-60 seconds

---

## Example Workflows

### Workflow 1: First-Time Setup

```bash
# 1. Initialize
code-brain init --path /path/to/project

# 2. Index
code-brain index --path /path/to/project

# 3. View graph
code-brain graph --path /path/to/project

# 4. Export for analysis
code-brain export --format json > analysis.json
```

### Workflow 2: Daily Development

```bash
# Terminal 1: Watch for changes
code-brain watch

# Terminal 2: View graph
code-brain graph

# Make changes to code...
# Graph updates automatically!
```

### Workflow 3: AI Analysis

```bash
# 1. Export for AI
code-brain export --format ai --max-tokens 4000 > context.json

# 2. Feed to AI assistant
cat context.json | your-ai-tool

# 3. Get insights
```

### Workflow 4: Code Review

```bash
# 1. Analyze changes
code-brain diff > changes.json

# 2. Find impact
code-brain query --type impact --symbol ChangedFunction

# 3. Check for issues
code-brain query --type cycles
code-brain query --type dead-exports
```

### Workflow 5: Refactoring

```bash
# 1. Find all callers
code-brain query --type callers --symbol OldFunction

# 2. Analyze impact
code-brain query --type impact --symbol OldFunction

# 3. Make changes...

# 4. Update graph
code-brain update

# 5. Verify changes
code-brain query --type callers --symbol NewFunction
```

---

## Integration Examples

### Node.js Integration

```javascript
import { GraphBuilder } from 'code-brain';
import { SQLiteStorage } from 'code-brain/storage';
import { ExportEngine } from 'code-brain/retrieval';

async function analyzeProject(projectPath) {
  const builder = new GraphBuilder();
  const graph = await builder.buildFromRepository(projectPath);
  
  const storage = new SQLiteStorage(`${projectPath}/.codebrain/graph.db`);
  storage.replaceGraph(projectPath, graph);
  
  const exporter = new ExportEngine(graph);
  const json = exporter.exportAsJSON();
  
  return json;
}

const result = await analyzeProject('./my-project');
console.log(`Found ${result.nodes.length} nodes`);
```

### Python Integration

```python
import subprocess
import json

def analyze_codebase(project_path):
    result = subprocess.run(
        ['code-brain', 'export', '--path', project_path, '--format', 'json'],
        capture_output=True,
        text=True
    )
    
    graph_data = json.loads(result.stdout)
    return graph_data

data = analyze_codebase('./my-project')
print(f"Found {len(data['nodes'])} nodes")
```

### CI/CD Integration

**GitHub Actions:**

```yaml
name: Code Analysis

on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install code-brain
        run: npm install -g code-brain
      
      - name: Analyze codebase
        run: |
          code-brain init
          code-brain index
          code-brain export --format json > graph.json
      
      - name: Upload artifact
        uses: actions/upload-artifact@v2
        with:
          name: code-graph
          path: graph.json
```

---

## Support & Resources

### Documentation

- **README.md** - Project overview
- **QUICKSTART.md** - Quick start guide
- **COMMANDS.md** - Command reference
- **docs/ARCHITECTURE.md** - Architecture details
- **docs/API.md** - API documentation
- **docs/DEPLOYMENT.md** - Deployment guide

### Getting Help

1. Check this user guide
2. Review documentation files
3. Check GitHub issues
4. Enable debug logging: `DEBUG=code-brain:* code-brain <command>`

### Debug Logging

```bash
# Enable all debug logs
DEBUG=code-brain:* code-brain index

# Enable specific module logs
DEBUG=code-brain:parser code-brain index
DEBUG=code-brain:graph code-brain index
```

---

## License

MIT

---

**Last Updated:** May 2, 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅
