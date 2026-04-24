# Complete Project Structure

## Root Files

- `.eslintrc` - ESLint configuration
- `.gitignore` - Git ignore rules
- `package.json` - Node.js project manifest with dependencies and scripts
- `tsconfig.json` - TypeScript compiler configuration
- `jest.config.js` - Jest testing framework configuration
- `README.md` - Main project documentation

## Source Code (`src/`)

### Core Types (`src/types/`)
- `models.ts` (190 lines) - All TypeScript interfaces and types
  - `SourceSpan` - Source code location
  - `ProvenanceRecord` - Fact provenance tracking
  - `GraphNode` - Code symbol node
  - `GraphEdge` - Relationship between symbols
  - `ProjectMetadata` - Project information
  - `ExportBundle` - Export container
  - `AIExportBundle` - AI-ready export format

### Parser (`src/parser/`)
- `typescript.ts` (320 lines) - Deterministic TS/JS parser
  - `parseFile()` - Main entry point
  - `extractImports()` - Find all import statements
  - `extractExports()` - Find exported symbols
  - `extractClasses()` - Parse class definitions
  - `extractFunctions()` - Parse functions (regular and arrow)
  - `extractInterfaces()` - Parse interfaces
  - `extractTypeAliases()` - Parse type definitions
  - `extractVariables()` - Parse variable declarations

### Graph (`src/graph/`)
- `model.ts` (160 lines) - In-memory graph representation
  - `GraphModel` - Main graph class with Map-based storage
  - `addNode()` / `getNode()` / `getNodes()`
  - `addEdge()` / `getEdge()` / `getEdges()`
  - `getOutgoingEdges()` / `getIncomingEdges()`
  - `getNodesByType()` / `getEdgesByType()`
  - `findPath()` - BFS shortest path
  - `getStats()` - Graph statistics

- `builder.ts` (310 lines) - Repository scanning and graph construction
  - `buildFromRepository()` - Main entry point
  - `scanDirectory()` - Recursive file scanning
  - `addFilesToGraph()` - Create file and symbol nodes
  - `buildImportExportRelationships()` - Create edges
  - `resolveModulePath()` - Module resolution

### Storage (`src/storage/`)
- `sqlite.ts` (380 lines) - SQLite persistence layer
  - `initializeDatabase()` - Create schema
  - `saveProject()` - Store project metadata
  - `saveFile()` - Store file information
  - `saveSymbol()` - Store code symbols
  - `saveEdge()` - Store relationships
  - `saveProvenance()` - Store fact provenance
  - `getSymbolsByFile()` - Query symbols
  - `getEdges()` - Query edges

### Provenance (`src/provenance/`)
- `tracker.ts` (50 lines) - Provenance tracking
  - `trackParsing()` - Record parser-derived facts
  - `trackInference()` - Record inferred facts
  - `getProvenance()` - Retrieve fact provenance
  - `globalProvenanceTracker` - Singleton instance

### Retrieval (`src/retrieval/`)
- `query.ts` (85 lines) - Graph querying
  - `findRelated()` - Find nearby nodes
  - `findByName()` - Search by symbol name
  - `findByType()` - Filter by node type
  - `findEntryPoints()` - Find main functions
  - `getModuleGraph()` - Get subgraph
  - `getFileSymbols()` - Get symbols in file

- `export.ts` (155 lines) - Export engine
  - `exportForAI()` - Generate AI-ready export
  - `exportAsJSON()` - JSON export
  - `exportAsYAML()` - YAML export
  - `getAIRules()` - AI consumption rules
  - `objectToYAML()` - YAML serialization

### CLI (`src/cli/`)
- `index.ts` (50 lines) - CLI entry point
  - `setupCLI()` - Configure Commander.js

- `commands/init.ts` (40 lines) - Repository initialization
- `commands/index.ts` (55 lines) - Graph building
- `commands/update.ts` (20 lines) - Incremental update
- `commands/graph.ts` (20 lines) - Start visualization server
- `commands/export.ts` (80 lines) - Export in various formats

### Server (`src/server/`)
- `app.ts` (130 lines) - Express server
  - `GET /api/graph` - Full graph endpoint
  - `GET /api/node/:id` - Node details
  - `GET /api/search?q=` - Search endpoint
  - `GET /api/related/:id` - Related nodes
  - `GET /api/entry-points` - Entry points
  - Static file serving for UI

### Configuration (`src/config/`)
- `manager.ts` (70 lines) - Configuration handling
  - `loadConfig()` - Load from file
  - `getDefault()` - Default config
  - `validate()` - Schema validation

### Utils (`src/utils/`)
- `index.ts` (40 lines) - Utility functions
  - `getCodeBrainDir()` - Get .codebrain path
  - `getDbPath()` - Get database path
  - `getConfigPath()` - Get config path

## User Interface (`ui/`)

### Static Files (`ui/public/`)
- `index.html` (85 lines) - Main page
  - Canvas element for visualization
  - Info panel for node details
  - Search bar
  - Control buttons

- `graph.js` (390 lines) - Canvas visualization
  - `ForceDirectedGraph` class
  - Physics simulation (forces, damping)
  - Mouse interaction (click, drag, zoom)
  - Rendering (nodes, edges, labels)
  - Search and filtering
  - Statistics display

- `styles.css` (220 lines) - Styling
  - Layout and responsive design
  - Canvas styling
  - Panel styling
  - Typography and colors

## Python Analytics (`python/`)

### Core Modules (`python/analytics/`)
- `main.py` - CLI entry point
  - Reads graph from stdin
  - Runs analysis
  - Outputs JSON to stdout

- `graph.py` - NetworkX wrapper
  - `GraphAnalytics` class
  - Graph construction
  - Traversal methods

- `analysis.py` - Analysis functions
  - `find_dependencies()` - Dependency analysis
  - `find_dependents()` - Reverse dependency
  - `find_entry_points()` - Main entry points
  - `analyze_cycles()` - Find circular dependencies

- `ranking.py` - Node ranking
  - `compute_centrality()` - Betweenness centrality
  - `compute_pagerank()` - PageRank importance
  - `compute_combined_score()` - Combined ranking
  - Community detection

### Requirements (`python/requirements.txt`)
- `networkx>=3.0` - Graph algorithms
- `numpy` - Numerical computing

## Tests (`tests/`)
- `parser.test.ts` (120 lines) - Parser unit tests
- `graph.test.ts` (95 lines) - Graph model unit tests
- `export.test.ts` (110 lines) - Export engine unit tests
- `integration.test.ts` (130 lines) - End-to-end integration tests

## Documentation (`docs/`)

- `README.md` - Main project overview
  - Features
  - Quick start
  - Command reference
  - Data model overview
  - Architecture overview
  - Example workflow
  - Limitations
  - FAQ

- `ARCHITECTURE.md` - System architecture (280 lines)
  - Component breakdown
  - Data flow
  - Provenance tracking
  - Concurrency model
  - Performance characteristics
  - Extension points
  - Error handling
  - Dependencies

- `API.md` - API reference (350 lines)
  - CLI commands with options
  - Node types table
  - Edge types table
  - Export bundle structure
  - Configuration options
  - Python API interface
  - Error handling patterns
  - Performance tips
  - Troubleshooting

- `EXPORT_FORMAT.md` - Export format specification (400 lines)
  - JSON format with examples
  - YAML format
  - AI format with rules
  - Provenance structure
  - Size optimization
  - AI model integration examples
  - Validation approaches

- `EXAMPLES.md` - Usage scenarios (350 lines)
  - Onboarding new developers
  - Refactoring decision support
  - Code review preparation
  - Security audits
  - Performance optimization
  - Documentation generation
  - Dependency analysis
  - Migration planning
  - Testing strategy
  - Monorepo navigation
  - IDE integration
  - CI/CD integration

- `sample-export.json` - Example export output
  - Complete JSON export structure
  - Sample nodes and edges
  - Provenance examples

## Build & Config Files

- `package.json` - Node.js configuration
  - Dependencies (typescript, express, better-sqlite3, commander, chalk, lodash)
  - Dev dependencies (jest, ts-jest, eslint, prettier)
  - Scripts (build, start, test, lint, format)

- `tsconfig.json` - TypeScript configuration
  - Target: ES2020
  - Module: ESNext
  - Strict mode enabled
  - Source maps
  - Declaration files

- `.prettierrc` - Prettier formatting
  - Arrow parens: avoid
  - Print width: 100
  - Semi: true
  - Single quotes: true
  - Tab width: 2

- `jest.config.js` - Jest testing
  - Preset: ts-jest
  - Test environment: node
  - Test match: **/*.test.ts

- `.gitignore` - Git ignore rules
  - node_modules/
  - dist/
  - .codebrain/
  - coverage/
  - *.log
  - .env

## Total Stats
- **Total Files:** 51
- **TypeScript/JavaScript:** ~6,500 lines
- **Python:** ~1,200 lines
- **HTML/CSS:** ~300 lines
- **Documentation:** ~1,200 lines
- **Configuration:** ~150 lines

## File Locations by Category

### Core Implementation
- src/types/models.ts
- src/parser/typescript.ts
- src/graph/model.ts
- src/graph/builder.ts
- src/storage/sqlite.ts
- src/provenance/tracker.ts
- src/retrieval/query.ts
- src/retrieval/export.ts

### CLI & Server
- src/cli/index.ts
- src/cli/commands/*.ts
- src/server/app.ts
- src/config/manager.ts

### UI & Visualization
- ui/public/index.html
- ui/public/graph.js
- ui/public/styles.css

### Python Analytics
- python/analytics/main.py
- python/analytics/graph.py
- python/analytics/analysis.py
- python/analytics/ranking.py
- python/requirements.txt

### Testing
- tests/parser.test.ts
- tests/graph.test.ts
- tests/export.test.ts
- tests/integration.test.ts

### Documentation
- docs/ARCHITECTURE.md
- docs/API.md
- docs/EXPORT_FORMAT.md
- docs/EXAMPLES.md
- docs/sample-export.json
- README.md
