# Export Format Specification

## Overview

code-brain supports three export formats, each optimized for different use cases.

## JSON Format

**Use Case:** Complete data export, archival, integration with other tools

**Structure:**
```json
{
  "project": { ... },
  "nodes": [ ... ],
  "edges": [ ... ],
  "summary": { ... },
  "exportedAt": 1234567890,
  "exportFormat": "json"
}
```

**Properties:**
- `project` - Project metadata (name, file count, etc.)
- `nodes` - Array of all nodes in exported subgraph
- `edges` - Array of all edges in exported subgraph
- `summary` - High-level summary (top modules, entry points)
- `exportedAt` - Unix timestamp of export
- `exportFormat` - Always "json"

**Node Example:**
```json
{
  "id": "func_handleRequest_1",
  "type": "function",
  "name": "handleRequest",
  "fullName": "src/api.ts::handleRequest",
  "location": {
    "file": "src/api.ts",
    "startLine": 42,
    "endLine": 65,
    "startCol": 0,
    "endCol": 1
  },
  "summary": "Handles incoming API requests",
  "metadata": {
    "exported": true,
    "async": true
  },
  "provenance": {
    "nodeId": "func_handleRequest_1",
    "type": "parser",
    "source": [
      {
        "file": "src/api.ts",
        "startLine": 42,
        "endLine": 42,
        "startCol": 0,
        "endCol": 30,
        "text": "export async function handleRequest"
      }
    ],
    "confidence": 1.0,
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

**Edge Example:**
```json
{
  "id": "edge_import_1",
  "type": "IMPORTS",
  "from": "file_src_api_ts",
  "to": "file_src_utils_ts",
  "resolved": true,
  "sourceLocation": [
    {
      "file": "src/api.ts",
      "startLine": 1,
      "endLine": 1,
      "startCol": 0,
      "endCol": 40,
      "text": "import { logger } from './utils.ts';"
    }
  ],
  "metadata": {
    "destructured": true,
    "imported": ["logger"]
  },
  "provenance": {
    "nodeId": "edge_import_1",
    "type": "parser",
    "source": [...],
    "confidence": 1.0,
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

## YAML Format

**Use Case:** Configuration, documentation, human readability

**Structure:** Same as JSON, represented in YAML

**Example:**
```yaml
project:
  name: my-app
  root: /path/to/my-app
  language: typescript
  fileCount: 45
  symbolCount: 320

nodes:
  - id: func_1
    type: function
    name: handleRequest
    fullName: src/api.ts::handleRequest
    location:
      file: src/api.ts
      startLine: 42
      endLine: 65

edges:
  - id: edge_1
    type: IMPORTS
    from: file_1
    to: file_2
    resolved: true
```

## AI Export Format

**Use Case:** Feeding to language models with explicit rules and confidence

**Structure:**
```json
{
  "project": { ... },
  "nodes": [ ... ],
  "edges": [ ... ],
  "summary": {
    "topModules": [...],
    "entryPoints": [...],
    "keySymbols": [...]
  },
  "ranking": [
    {
      "nodeId": "...",
      "score": 0.95,
      "algorithm": "betweenness_centrality",
      "components": { ... }
    }
  ],
  "focus": "src/api",
  "rules": [ ... ],
  "exportedAt": 1234567890,
  "exportFormat": "ai"
}
```

**Additional Properties:**

### ranking
Array of scored nodes, sorted by importance.

```json
{
  "nodeId": "func_1",
  "score": 0.95,
  "algorithm": "betweenness_centrality",
  "components": {
    "centrality": 0.95,
    "pagerank": 0.92,
    "in_degree": 5,
    "out_degree": 8
  }
}
```

**Algorithms:**
- `betweenness_centrality` - How often node appears in shortest paths
- `pagerank` - Node importance based on incoming connections
- `eigenvector_centrality` - Importance among important nodes
- `closeness_centrality` - Average distance to all other nodes

### rules
Explicit constraints for consuming AI model.

```json
[
  "Do not infer missing behavior from this export.",
  "Use only explicitly listed nodes and edges.",
  "Preserve unknown relationships as 'unresolved'.",
  "Do not fabricate connections not present in source.",
  "If a relationship is not listed, it does not exist.",
  "Refer to source locations for ground truth.",
  "Follow the provenance records for confidence levels.",
  "All facts are derived deterministically from source code.",
  "This export is complete for the queried scope.",
  "Do not extend beyond the provided nodes and edges."
]
```

### summary
High-level information about exported graph.

```json
{
  "topModules": [
    "src/api",
    "src/core",
    "src/ui",
    "src/utils",
    "src/config"
  ],
  "entryPoints": [
    "main",
    "initApp",
    "createServer",
    "handleRequest",
    "parseQuery"
  ],
  "keySymbols": [
    "ApiHandler",
    "UserService",
    "Config",
    "Logger",
    "RequestValidator"
  ]
}
```

### focus
If export was focused on specific area, includes the focus query.

```json
{
  "focus": "src/api"
}
```

Null if full export.

## Provenance Structure

All nodes and edges include `provenance` records for traceability.

```json
{
  "nodeId": "sym_xyz",
  "type": "parser",
  "source": [
    {
      "file": "src/main.ts",
      "startLine": 10,
      "endLine": 20,
      "startCol": 2,
      "endCol": 25,
      "text": "export function myFunc() { }"
    }
  ],
  "confidence": 1.0,
  "createdAt": 1670000000000,
  "updatedAt": 1670000000000
}
```

**Fields:**
- `nodeId` - What this provenance describes
- `type` - How we know (`parser`, `inference`, `config`)
- `source` - Array of source locations
- `confidence` - 0.0 to 1.0 confidence score
- `createdAt` - When first discovered
- `updatedAt` - When last verified

**Confidence Interpretation:**
- `1.0` - Directly parsed, 100% certain
- `0.8-0.9` - Inferred but highly probable
- `0.5-0.7` - Speculative, use with caution
- `< 0.5` - Uncertain, verify separately

## Size Optimization

### Default Behavior
- Includes all reachable nodes within focus depth
- Can be large for modules with many dependencies

### Token Limiting
Use `maxTokensExport` config to limit output:

```json
{
  "maxTokensExport": 4000
}
```

Results will:
1. Sort nodes by importance
2. Include top N nodes by rank
3. Mark as truncated if more exist

### Focus Parameter
Reduce size by focusing on specific area:

```bash
code-brain export --format ai --focus src/api
```

Returns only:
- Specified module/symbol
- Direct dependencies
- Direct dependents
- One level of connections

## Encoding

All exports use UTF-8 encoding.

**JSON:** Standard JSON encoding (RFC 8259)
**YAML:** Standard YAML encoding (YAML 1.2)

## Usage with AI Models

### OpenAI API

```javascript
const fs = require('fs');

const context = fs.readFileSync('context.json', 'utf-8');
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    {
      role: 'user',
      content: `Based on this code structure, what are the main components?\n\n${context}`
    }
  ]
});
```

### Claude API

```python
import anthropic
import json

with open('context.json', 'r') as f:
    context = json.load(f)

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": f"Analyze this code:\n{json.dumps(context)}"}
    ]
)
```

### Ollama (Local)

```bash
code-brain export --format ai | ollama run llama2 "Summarize this code structure"
```

## Validation

Validate exports using schema:

```javascript
const Ajv = require('ajv');
const schema = require('./export-schema.json');

const ajv = new Ajv();
const validate = ajv.compile(schema);

const data = JSON.parse(exportedJson);
if (!validate(data)) {
  console.error('Invalid export:', validate.errors);
}
```

## Examples

### Complete Project Export

```bash
code-brain export --format json > full-project.json
# 320 nodes, 1200 edges, ~2.5 MB
```

### Module-Focused Export

```bash
code-brain export --format ai --focus src/api > api-context.json
# 42 nodes, 85 edges, ~150 KB
```

### AI-Ready with Ranking

```bash
code-brain export --format ai > ranked-context.json
# Includes importance scores and rules
# Ready for feeding to GPT-4/Claude
```

## Backward Compatibility

- JSON format: Stable, additive changes only
- YAML format: Stable, additive changes only
- AI format: Stable, new fields added as needed
- Existing fields never removed or renamed

Breaking changes require major version bump and migration period.
