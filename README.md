# code-brain

`code-brain` is a deterministic codebase intelligence system for TypeScript and JavaScript repositories.

It scans a repository, parses source with the TypeScript compiler API, builds a provenance-aware graph, stores the graph in SQLite, exposes a searchable visual graph, and exports compact AI-ready context bundles without dumping raw files or inventing structure.

## Architecture

The runtime is split into a Node product layer and a Python analytics layer.

- `src/cli`
  Handles `init`, `index`, `update`, `graph`, and `export`.
- `src/parser`
  Deterministic TS/JS parsing using the TypeScript AST.
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

For TS/JS repositories, `code-brain` deterministically extracts:

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
code-brain graph
code-brain export --format ai
code-brain export --format json
code-brain export --format yaml
code-brain export --format ai --focus src/parser/typescript.ts
code-brain export --format ai --max-tokens 2000
code-brain export --format ai --focus src/auth --max-tokens 4000
```

### `code-brain init`

Creates:

- `.codebrain/graph.db`
- `.codebrainrc.json`

### `code-brain index`

Scans the repository, parses supported files, builds the graph, and stores it in SQLite.

### `code-brain update`

Detects changed files using stored hashes and re-indexes changed files plus direct import/test dependents.

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

## How To Run

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install Python analytics dependencies

```bash
python3 -m pip install -r python/requirements.txt
```

If you skip the Python step, indexing and exports still work, but analytics ranking falls back gracefully.

### 3. Build

```bash
npm run build
```

### 4. Run against the current repository

```bash
node dist/index.js init --path .
node dist/index.js index --path .
node dist/index.js export --format ai --path .
node dist/index.js graph --path . --port 3000
```

### 5. Optional global CLI

```bash
npm link
code-brain init --path /absolute/path/to/your/repo
```

## Example Workflow

```bash
code-brain init --path /repo
code-brain index --path /repo
code-brain graph --path /repo
code-brain export --format ai --path /repo > context.json
code-brain update --path /repo
```

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

## Notes

- Parsing is deterministic and compiler-AST based.
- The parser is the source of truth for structure.
- Python analytics never invent structure or override parser truth.
- External modules and unresolved call targets are preserved explicitly instead of guessed.
