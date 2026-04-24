# Architecture Overview

## Core Components

### Parser Layer (`src/parser/`)

Deterministically extracts code structure from TypeScript/JavaScript files.

**Responsibilities:**
- Parse source files with regex-based deterministic extraction
- Extract symbols: functions, classes, interfaces, types, variables
- Track imports and exports
- Record source locations for all symbols
- Calculate file hashes for change detection

**Key Classes:**
- `Parser` - Main entry point supporting multiple languages
- `TypeScriptParser` - TS/JS specific parser using regex patterns

**Important:** No LLMs, no inference, only what's in the source.

### Graph Model (`src/graph/`)

In-memory directed graph representation of the codebase.

**Responsibilities:**
- Store nodes (symbols) with metadata
- Store edges (relationships) with types
- Track provenance for all nodes and edges
- Provide graph traversal operations
- Compute statistics

**Key Classes:**
- `GraphModel` - Core graph with nodes and edges
- `GraphBuilder` - Constructs graph from parsed repository
- `createGraphNode()` - Factory for verified nodes
- `createGraphEdge()` - Factory for verified edges

**Guarantees:**
- All nodes have source locations
- All edges have confidence and resolved status
- Every fact includes provenance

### Storage Layer (`src/storage/`)

SQLite persistence for graph data.

**Responsibilities:**
- Create and maintain database schema
- Persist nodes, edges, metadata
- Track project metadata and index state
- Support fast queries and updates
- Enable incremental indexing

**Tables:**
- `projects` - Project metadata
- `files` - Source files with hashes
- `symbols` - Code symbols and metadata
- `edges` - Relationships between symbols
- `provenance` - Provenance records
- `index_state` - Indexing progress tracking
- `ranking_scores` - Computed importance scores

### Retrieval Engine (`src/retrieval/`)

Query and context extraction from the graph.

**Responsibilities:**
- Find nodes by various criteria
- Build subgraphs for focused exports
- Rank nodes by importance
- Format results for consumption
- Manage token budgets for AI exports

**Key Classes:**
- `QueryEngine` - Query and traversal operations
- `ExportEngine` - Format conversion and export generation

### Python Analytics (`python/analytics/`)

Graph analysis using NetworkX.

**Responsibilities:**
- Compute centrality scores
- Detect communities/clusters
- Find shortest paths
- Rank by importance (PageRank)
- Analyze graph statistics

**Modules:**
- `graph.py` - NetworkX wrapper and graph operations
- `analysis.py` - Dependency and importance analysis
- `ranking.py` - Node ranking algorithms
- `main.py` - CLI entry point

**Execution:** Spawned as child process, receives graph via stdin, outputs JSON.

### CLI (`src/cli/`)

Command-line interface for all operations.

**Commands:**
- `init` - Initialize repository
- `index` - Build graph
- `update` - Incremental update
- `graph` - Start visualization server
- `export` - Generate exports

**Key Classes:**
- `setupCLI()` - Commander.js CLI setup
- Individual command modules in `commands/`

### Visualization Server (`src/server/`)

Express.js server for interactive graph exploration.

**Responsibilities:**
- Serve graph data via REST API
- Host interactive UI
- Provide search and filtering
- Enable real-time graph updates

**Endpoints:**
- `GET /api/graph` - Full graph data
- `GET /api/node/:id` - Single node details
- `GET /api/search?q=pattern` - Search results
- `GET /api/related/:id` - Related nodes

### Visualization UI (`ui/`)

Canvas-based 2D graph visualization.

**Features:**
- Force-directed layout algorithm
- Click to inspect nodes
- Search and filter
- Zoom and pan controls
- Type-based node coloring
- Relationship visualization

**Technology:** HTML5 Canvas with vanilla JavaScript.

## Data Flow

```
Repository
    ↓
  Parser
    ↓
  GraphBuilder
    ↓
  GraphModel (in-memory)
    ↓
  SQLiteStorage
    ↓
  Database
    ↓
QueryEngine → ExportEngine → AI Bundle
    ↓
PythonBridge → Analytics → Ranking
```

## Provenance Tracking

Every claim includes provenance:

```typescript
interface ProvenanceRecord {
  nodeId: string;           // What this is about
  type: 'parser' | 'inference' | 'config';  // How we know this
  source: SourceSpan[];     // Where in source code
  confidence: number;        // 0.0 to 1.0
  createdAt: number;        // When discovered
  updatedAt: number;        // When last verified
}
```

**Confidence Levels:**
- `1.0` - Directly from parser, 100% certain
- `0.7-0.9` - Inferred but likely correct
- `< 0.7` - Speculative, may be wrong

## Concurrency and Incremental Updates

**Single-Threaded Parsing:**
- Each file parsed sequentially
- No race conditions in graph construction
- Deterministic output

**Incremental Indexing:**
- Track file hashes
- Only reparse changed files
- Update affected edges
- Preserve unchanged provenance

**Database Transactions:**
- Write-Ahead Logging (WAL) for durability
- Atomic updates to maintain consistency

## Performance Characteristics

**Typical Large Codebase (50K LOC):**
- Parse time: 2-5 seconds
- Graph construction: 1-2 seconds
- Database write: 1-3 seconds
- Total index: ~5-10 seconds
- Memory: <500MB
- Query time: <100ms
- Export generation: <200ms

**Scaling:**
- Linear with file count
- Quadratic with node connections (mitigated by spatial partitioning)
- Practical limit: ~100K source files (not tested)

## Extension Points

Future enhancements without breaking changes:

1. **New Languages**: Add parser modules, extend GraphBuilder
2. **New Analyses**: Add Python modules, call PythonBridge with new parameters
3. **New Export Formats**: Add to ExportEngine
4. **New Visualizations**: Add to UI module
5. **IDE Integration**: Create language server client wrapper

## Error Handling

**Philosophy:** Fail safe, not silently.

- Parse errors logged but don't crash indexing
- Unresolved imports marked as such, not discarded
- Type mismatches caught at compile time
- Invalid data rejected with clear errors

## Dependencies

### Runtime
- `better-sqlite3` - SQLite with Node bindings
- `express` - Web framework
- `commander` - CLI parsing
- `chalk` - Terminal colors
- `lodash` - Utility functions

### Development
- `typescript` - Language
- `jest` - Testing
- `ts-jest` - TypeScript + Jest
- `eslint` - Linting
- `prettier` - Formatting

### Python
- `networkx>=3.0` - Graph algorithms

## Version Management

**Current:** 1.0.0

**API Stability:**
- Node/Edge types: Stable
- Export formats: Stable (additive only)
- Database schema: Versioned (migrations supported)
- CLI commands: Stable

**Breaking Changes Policy:**
- Major version bump only
- At least 2 releases notice
- Migration tools provided
