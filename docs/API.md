# API Reference

## CLI Commands

### code-brain init

Initialize code-brain for a repository.

```bash
code-brain init [options]
```

**Options:**
- `-p, --path <path>` - Project root (default: cwd)

**Creates:**
- `.codebrain/` - Data directory
- `.codebrainrc.json` - Configuration
- `graph.db` - SQLite database

**Example:**
```bash
code-brain init -p /path/to/my-project
```

---

### code-brain index

Parse and build the knowledge graph.

```bash
code-brain index [options]
```

**Options:**
- `-p, --path <path>` - Project root (default: cwd)

**Output:**
- Prints statistics: nodes, edges, file count
- Updates SQLite database
- Creates/updates `.codebrain/index-state.json`

**Example:**
```bash
code-brain index
# Indexing repository: /Users/dev/my-app
# Found 47 source files
# ✓ Indexing complete. 450 nodes, 2300 edges
```

---

### code-brain update

Incrementally update the graph.

```bash
code-brain update [options]
```

**Options:**
- `-p, --path <path>` - Project root (default: cwd)

**Behavior:**
- Detects changed files via hash
- Reparses only changed files
- Updates affected edges
- Preserves cache for unchanged files

---

### code-brain graph

Start interactive visualization server.

```bash
code-brain graph [options]
```

**Options:**
- `-p, --path <path>` - Project root (default: cwd)
- `--port <port>` - Server port (default: 3000)

**Opens:**
- Browser to `http://localhost:PORT`
- Interactive canvas graph
- Node search and inspection
- Real-time statistics

**Endpoints:**
- `GET /api/graph` - Full graph JSON
- `GET /api/node/:id` - Node details
- `GET /api/search?q=...` - Search results
- `GET /api/related/:id` - Related nodes

---

### code-brain export

Export graph in various formats.

```bash
code-brain export [options]
```

**Options:**
- `-p, --path <path>` - Project root (default: cwd)
- `--format <format>` - Format: json, yaml, ai (default: json)
- `--focus <module>` - Focus on specific module/symbol

**Output:** Prints to stdout (redirect to file as needed)

**Formats:**

#### JSON
Complete graph export with all data.

```bash
code-brain export --format json > graph.json
```

#### YAML
Same data in YAML format.

```bash
code-brain export --format yaml > graph.yaml
```

#### AI
Compact AI-ready format with rules and confidence.

```bash
code-brain export --format ai > context.json
code-brain export --format ai --focus src/api > api-context.json
```

---

## Node Types

Represent code entities in the graph.

| Type | Example | Extracted From |
|------|---------|-----------------|
| `file` | `src/index.ts` | Filesystem |
| `module` | `src/api` | Directory structure |
| `class` | `ApiHandler` | `class` keyword |
| `function` | `handleRequest` | `function` / arrow function |
| `method` | `init` | Method in class body |
| `interface` | `IHandler` | `interface` keyword |
| `type` | `RequestType` | `type` keyword |
| `variable` | `config` | `const`, `let`, `var` |
| `constant` | `MAX_SIZE` | Uppercase variables |
| `route` | `GET /api/users` | Route decorators (future) |
| `config` | `tsconfig.json` | Config files (future) |
| `test` | `handler.test.ts` | Test files |
| `doc` | `README.md` | Documentation files |

---

## Edge Types

Represent relationships between nodes.

| Type | From | To | Example |
|------|------|-----|---------|
| `IMPORTS` | File/Symbol | File/Symbol | `import { X } from 'module'` |
| `EXPORTS` | File | Symbol | `export function X` |
| `CALLS` | Function | Function | Verified function call |
| `CALLS_UNRESOLVED` | Function | Symbol | Dynamic/unresolved call |
| `OWNS` | Class | Method | Method in class |
| `DEFINES` | File | Symbol | Symbol defined in file |
| `USES` | Symbol | Symbol | Symbol uses another |
| `DEPENDS_ON` | Module | Module | Module dependency |
| `TESTS` | Test | Symbol | Test file tests symbol |
| `DOCUMENTS` | Doc | Symbol | Docs reference code |
| `IMPLEMENTS` | Class | Interface | Class implements interface |
| `EXTENDS` | Class | Class | Class extends parent |
| `REFERENCES` | Symbol | Symbol | Generic reference |

---

## Export Bundle Structure

### JSON/YAML Export

```json
{
  "project": {
    "name": "my-app",
    "root": "/path/to/my-app",
    "language": "typescript",
    "version": "1.0.0",
    "fileCount": 45,
    "symbolCount": 320,
    "edgeCount": 1200,
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  },
  "nodes": [
    {
      "id": "file_1",
      "type": "file",
      "name": "index.ts",
      "fullName": "src/index.ts",
      "location": {
        "file": "src/index.ts",
        "startLine": 1,
        "endLine": 150,
        "startCol": 0,
        "endCol": 0
      },
      "metadata": {},
      "provenance": {
        "nodeId": "file_1",
        "type": "parser",
        "source": [...],
        "confidence": 1.0,
        "createdAt": 1234567890,
        "updatedAt": 1234567890
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "type": "IMPORTS",
      "from": "file_1",
      "to": "file_2",
      "resolved": true,
      "metadata": {},
      "provenance": {...}
    }
  ],
  "exportedAt": 1234567890,
  "exportFormat": "json"
}
```

### AI Export

```json
{
  "project": {...},
  "nodes": [...],
  "edges": [...],
  "summary": {
    "topModules": ["src/api", "src/core", "src/ui"],
    "entryPoints": ["main", "initApp", "handleRequest"],
    "keySymbols": ["ApiHandler", "UserService", "Config"]
  },
  "ranking": [
    {
      "nodeId": "function_1",
      "score": 0.95,
      "algorithm": "betweenness_centrality",
      "components": {
        "centrality": 0.95,
        "pagerank": 0.92
      }
    }
  ],
  "focus": "src/api",
  "rules": [
    "Do not infer missing behavior from this export.",
    "Use only explicitly listed nodes and edges.",
    "Preserve unknown relationships as 'unresolved'.",
    ...
  ],
  "exportedAt": 1234567890,
  "exportFormat": "ai"
}
```

---

## Configuration

### .codebrainrc.json

```json
{
  "include": ["src", "lib"],
  "exclude": ["node_modules", "dist", "build", ".git", "**/*.test.ts"],
  "languages": ["typescript", "javascript"],
  "pythonPath": "/usr/bin/python3",
  "dbPath": ".codebrain/graph.db",
  "enableAnalytics": true,
  "maxTokensExport": 8000
}
```

**Options:**
- `include` (string[]) - Directories to scan
- `exclude` (string[]) - Glob patterns to skip
- `languages` (string[]) - Languages to parse
- `pythonPath` (string?) - Path to Python 3
- `dbPath` (string?) - Custom database path
- `enableAnalytics` (boolean) - Run Python analytics
- `maxTokensExport` (number) - Max tokens in AI export

---

## Python Analytics API

### HTTP Interface (Future)

```
POST /analyze
Content-Type: application/json

{
  "nodes": [...],
  "edges": [...]
}

→ Response:

{
  "centrality": {...},
  "communities": [[...]],
  "importance": {...},
  "graph_stats": {...}
}
```

### Command-Line Interface

```bash
python3 python/analytics/main.py < graph.json > analysis.json
```

**Input:** Graph JSON with nodes and edges array

**Output:** Analysis results (centrality, communities, importance)

---

## Error Handling

### Parser Errors

```
ParserError: Failed to parse file: src/complex.ts
  - Logged but doesn't stop indexing
  - File skipped
  - Warning printed to console
```

### Storage Errors

```
StorageError: Failed to save symbol: unknownFunction
  - Transaction rolled back
  - Index aborted with error
  - Exit code 1
```

### Query Errors

```
QueryError: Node not found: unknown_id
  - Returns empty results
  - No crash
  - Logged for debugging
```

---

## Performance Tips

1. **Exclude Unnecessarily**
   ```json
   "exclude": ["node_modules", "dist", "build", ".next", "coverage"]
   ```

2. **Reduce Scope with Focus**
   ```bash
   code-brain export --focus src/api
   ```

3. **Enable Analytics Selectively**
   ```json
   "enableAnalytics": false
   ```
   Then run Python separately when needed.

4. **Incremental Updates**
   ```bash
   code-brain update  # Faster than full index
   ```

5. **Limit Export Tokens**
   ```json
   "maxTokensExport": 4000
   ```

---

## Troubleshooting

### Database Locked

**Error:** `SQLITE_BUSY: database is locked`

**Solution:**
```bash
rm .codebrain/graph.db-wal
rm .codebrain/graph.db-shm
code-brain index
```

### Python Not Found

**Error:** `Python process error: ENOENT`

**Solution:**
```bash
which python3
export PYTHON_PATH=/usr/bin/python3
code-brain export --format ai
```

### Out of Memory

**Large Repositories (>100K files):**
- Reduce included paths
- Exclude more patterns
- Run on machine with more RAM

### Graph Server Port Conflict

**Error:** `listen EADDRINUSE :::3000`

**Solution:**
```bash
code-brain graph --port 3001
```
