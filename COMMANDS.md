# CODE-BRAIN: MASTER COMMAND REFERENCE

Master reference for all commands to run, execute, and manage the code-brain tool.

---

## 🚀 QUICK START

### 1. Initialize Project

```bash
code-brain init --path /path/to/project
```

### 2. Index Repository

```bash
code-brain index --path /path/to/project
```

### 3. Export Graph

```bash
# JSON format (default)
code-brain export --path /path/to/project --format json

# YAML format
code-brain export --path /path/to/project --format yaml

# AI format (optimized for LLM)
code-brain export --path /path/to/project --format ai --max-tokens 2000

# Top-N AI export for constrained context windows
code-brain export --path /path/to/project --format ai --top 50
```

### 4. Watch For Changes

```bash
code-brain watch --path /path/to/project
```

### 5. View Graph Visualization

```bash
code-brain graph --path /path/to/project
```

---

## 🛠️ DEVELOPMENT COMMANDS

### Setup

```bash
npm install
npm run build
```

### Build

```bash
# Build server (TypeScript)
npm run build:server

# Build UI (Vite)
npm run build:ui

# Full build
npm run build
```

### Development Server

```bash
# Start dev server
npm run dev

# UI development
npm run dev:ui

# Server development
npm run dev:server
```

### Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test parser.test.ts
npm test integration.test.ts

# Run with watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

### Linting & Formatting

```bash
# Type check
npm run typecheck

# Check TypeScript types
npm run typecheck:ui

# Lint code (eslint)
npm run lint
```

---

## 📦 PRODUCTION COMMANDS

### Build for Production

```bash
npm run build
```

### Start Server

```bash
npm run start
```

### Export Project Graph

```bash
# Full JSON export
code-brain export --format json > graph.json

# Export specific module with focus
code-brain export --format json --focus src/api > api-graph.json

# AI-optimized export (for LLMs)
code-brain export --format ai --max-tokens 4096 > ai-analysis.json

# YAML export
code-brain export --format yaml > graph.yaml
```

### Analyze Changes

```bash
# Re-index project (detects changes)
code-brain index --path /path/to/project

# Keep graph updated as files change
code-brain watch --path /path/to/project

# Export incremental changes
code-brain export --format json > updated-graph.json
```

---

## 📊 CLI COMMAND REFERENCE

### `init` - Initialize project

```bash
code-brain init --path <repository-path>
```

### `index` - Index repository

```bash
code-brain index --path <repository-path>
```

### `export` - Export graph

```bash
code-brain export [options]
  --path <path>              Repository path
  --format <format>          json|yaml|ai (default: json)
  --focus <target>           Focus on specific file/symbol (optional)
  --max-tokens <number>      Token budget for AI export (optional)
  --top <number>             Limit AI export to top N important nodes
```

### `graph` - View graph

```bash
code-brain graph [options]
  --path <path>              Repository path
  --port <port>              Server port (default: 3000)
```

### `update` - Update graph

```bash
code-brain update [options]
  --path <path>              Repository path
```

### `watch` - Auto-update graph

```bash
code-brain watch [options]
  --path <path>              Repository path
  --interval <ms>            Polling interval (default: 1000)
```

---

## 🔍 EXAMPLE WORKFLOWS

### Workflow 1: First Time Analysis

```bash
# 1. Initialize
code-brain init --path .

# 2. Index the codebase
code-brain index --path .

# 3. View in UI
code-brain graph --path . --port 3000
# Open http://localhost:3000

# 4. Export for analysis
code-brain export --format json > codebase-analysis.json
```

### Workflow 2: AI Model Analysis

```bash
# 1. Generate AI-optimized export
code-brain export --format ai --max-tokens 2000 > ai-input.json

# 2. Feed to Claude/GPT-4
cat ai-input.json | your-ai-integration.py

# 3. Get analysis results
python analyze-codebase.py < ai-input.json
```

### Workflow 3: Focus on Module

```bash
# Export only authentication module
code-brain export --format json --focus src/auth > auth-module.json

# Export API layer
code-brain export --format json --focus src/api > api-layer.json

# Export specific file
code-brain export --format json --focus src/api/handlers.ts > handlers.json
```

### Workflow 4: Detect Changes

```bash
# Make changes to your code
# ... (edit files)

# Re-index to detect changes
code-brain index --path .

# Export updated graph
code-brain export --format json > updated-analysis.json

# Compare before/after
diff codebase-analysis.json updated-analysis.json
```

---

## 📝 SCRIPT EXAMPLES

### Node.js Integration

```javascript
import { GraphBuilder } from "code-brain";
import { SQLiteStorage } from "code-brain/storage";
import { ExportEngine } from "code-brain/retrieval";

async function analyzeProject(projectPath) {
  // Build graph
  const builder = new GraphBuilder();
  const graph = builder.buildFromRepository(projectPath);

  // Store
  const storage = new SQLiteStorage(`${projectPath}/.codebrain/graph.db`);

  // Export
  const exporter = new ExportEngine(graph);
  const json = exporter.exportAsJSON();

  return json;
}

const result = await analyzeProject("./my-project");
console.log(result);
```

### Python Integration

```python
import subprocess
import json

def analyze_codebase(project_path):
    # Run code-brain
    result = subprocess.run(
        ['code-brain', 'export', '--path', project_path, '--format', 'json'],
        capture_output=True,
        text=True
    )

    # Parse JSON
    graph_data = json.loads(result.stdout)

    # Analyze
    nodes = graph_data['nodes']
    edges = graph_data['edges']

    return graph_data

data = analyze_codebase('./my-project')
print(f"Found {len(data['nodes'])} nodes")
```

### Bash Automation

```bash
#!/bin/bash

PROJECT_PATH="./my-project"
EXPORT_PATH="./exports"

# Create export directory
mkdir -p $EXPORT_PATH

# Initialize
code-brain init --path $PROJECT_PATH

# Index
code-brain index --path $PROJECT_PATH

# Export all formats
code-brain export --path $PROJECT_PATH --format json > $EXPORT_PATH/graph.json
code-brain export --path $PROJECT_PATH --format yaml > $EXPORT_PATH/graph.yaml
code-brain export --path $PROJECT_PATH --format ai > $EXPORT_PATH/ai-analysis.json

echo "Exports complete in $EXPORT_PATH"
```

---

## 🔧 DOCKER COMMANDS

### Build Docker Image

```bash
docker build -t code-brain:latest .
```

### Run in Docker

```bash
docker run -v /path/to/project:/project code-brain:latest \
  code-brain index --path /project

docker run -v /path/to/project:/project code-brain:latest \
  code-brain export --path /project --format json
```

### Docker Compose

```yaml
version: "3"
services:
  code-brain:
    build: .
    volumes:
      - /path/to/project:/project
    command: code-brain index --path /project
```

---

## 🚦 CI/CD INTEGRATION

### GitHub Actions

```yaml
name: Code Brain Analysis

on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install Node.js
        uses: actions/setup-node@v2
        with:
          node-version: "18"

      - name: Install code-brain
        run: npm install code-brain

      - name: Analyze codebase
        run: npx code-brain export --format json > graph.json

      - name: Upload artifact
        uses: actions/upload-artifact@v2
        with:
          name: codebase-graph
          path: graph.json
```

### GitLab CI

```yaml
analyze_code:
  image: node:18
  script:
    - npm install code-brain
    - npx code-brain export --format json > graph.json
  artifacts:
    paths:
      - graph.json
```

---

## 📈 PERFORMANCE COMMANDS

### Benchmark Indexing

```bash
time code-brain index --path /path/to/large/project
```

### Profile Memory

```bash
node --prof $(which code-brain) index --path /path/to/project
node --prof-process isolate-*.log > profile.txt
```

### Export with Statistics

```bash
# Export and count nodes/edges
code-brain export --format json | jq '{
  nodes: (.nodes | length),
  edges: (.edges | length),
  symbols: (.nodes[] | select(.type != "file") | .id) | length
}'
```

---

## 🐛 DEBUGGING COMMANDS

### Enable Verbose Logging

```bash
DEBUG=code-brain:* code-brain index --path /path/to/project
```

### Run Tests with Debug

```bash
DEBUG=* npm test integration.test.ts
```

### Check Graph Database

```bash
# SQLite query
sqlite3 .codebrain/graph.db
> SELECT COUNT(*) FROM nodes;
> SELECT COUNT(*) FROM edges;
> SELECT * FROM nodes LIMIT 10;
```

### Validate Export

```bash
# Validate JSON schema
code-brain export --format json | jq '.nodes[0]'

# Check for required fields
code-brain export --format json | jq '.nodes[] | {name, type, semanticPath, namespace}'
```

---

## 🔐 SECURITY COMMANDS

### Audit Dependencies

```bash
npm audit
npm audit fix
```

### Check for Vulnerabilities

```bash
npm audit --production
```

### Update Dependencies

```bash
npm update
npm install -g npm-check-updates
ncu -u
npm install
```

---

## 📋 MAINTENANCE COMMANDS

### Clean Cache

```bash
rm -rf .codebrain/graph.db
code-brain index --path .
```

### Reset Project

```bash
rm -rf .codebrain/
code-brain init --path .
code-brain index --path .
```

### Database Maintenance

```bash
# Rebuild index
sqlite3 .codebrain/graph.db "VACUUM;"
sqlite3 .codebrain/graph.db "ANALYZE;"
```

### View Statistics

```bash
sqlite3 .codebrain/graph.db "SELECT 'Files' as type, COUNT(*) as count FROM files UNION SELECT 'Nodes', COUNT(*) FROM nodes UNION SELECT 'Edges', COUNT(*) FROM edges;"
```

---

## 🚀 DEPLOYMENT COMMANDS

### Build for Production

```bash
npm run build
npm run build:server
npm run build:ui
```

### Create Distribution

```bash
# Create tarball
npm pack

# Create release
npm version major/minor/patch
npm publish
```

### Deploy to NPM

```bash
npm login
npm publish
```

---

## 📚 DOCUMENTATION COMMANDS

### Generate API Docs

```bash
npm run docs
```

### View README

```bash
cat README.md
```

### List Available Commands

```bash
code-brain --help
code-brain export --help
```

---

## ✅ VERIFICATION COMMANDS

### Run Full Test Suite

```bash
npm test
```

### Check Build

```bash
npm run build 2>&1 | tail -20
```

### Verify All Systems

```bash
# 1. Tests pass
npm test

# 2. Builds succeed
npm run build

# 3. Can initialize
code-brain init --path .

# 4. Can index
code-brain index --path .

# 5. Can export
code-brain export --format json > /dev/null

echo "✅ All systems verified"
```

---

## 🎯 COMMON TASKS

### Task: Analyze My Project

```bash
code-brain init --path .
code-brain index --path .
code-brain export --format json > analysis.json
cat analysis.json | jq '.nodes | length'  # Count nodes
```

### Task: Find All Handlers

```bash
code-brain export --format json | jq '.nodes[] | select(.semanticRole == "handler_function") | {name, file: .location.file}'
```

### Task: Find All Service Classes

```bash
code-brain export --format json | jq '.nodes[] | select(.semanticRole == "service_class") | {name, namespace: .namespace}'
```

### Task: Find All Calls to Function

```bash
code-brain export --format json | jq '.edges[] | select(.to | contains("functionName")) | {from: .from, to: .to, explanation: .explanation}'
```

### Task: Export for AI Analysis

```bash
code-brain export --format ai --max-tokens 4000 > ai-input.json
cat ai-input.json | python analyze.py
```

### Task: Compare Two Versions

```bash
# Export v1
git checkout v1
code-brain index --path .
code-brain export --format json > v1-graph.json

# Export v2
git checkout v2
code-brain index --path .
code-brain export --format json > v2-graph.json

# Compare
diff v1-graph.json v2-graph.json
```

---

## 📞 REFERENCE

**Type System:** `src/types/models.ts`  
**Graph Builders:** `src/graph/builder.ts`  
**Semantic Analyzer:** `src/graph/semantics.ts`  
**Relationship Analyzer:** `src/graph/relationships.ts`  
**Parser:** `src/parser/typescript.ts`  
**Export:** `src/retrieval/export.ts`  
**CLI:** `src/cli/commands/`

**Database:** `.codebrain/graph.db` (SQLite)  
**Config:** `.codebrainrc.json`  
**UI:** `http://localhost:3000` (when running `code-brain graph`)

---

## 🎓 LEARNING RESOURCES

- **README.md** - Project overview
- **QUICKSTART.md** - Quick start guide
- **AUDIT_REPORT.md** - Code quality audit
- **IMPROVEMENTS.md** - Enhancement suggestions

---

**Last Updated:** 2026-04-26  
**Status:** Production Ready ✅
