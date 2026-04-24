# Example Usage Scenarios

## Scenario 1: Onboarding a New Developer

A new team member joins and needs to understand a large codebase.

```bash
# Step 1: Initialize and index
cd /path/to/project
code-brain init
code-brain index
# → Builds graph in ~5-10 seconds

# Step 2: Explore visually
code-brain graph
# → Opens http://localhost:3000
# → Shows interactive force-directed graph
# → Search for "UserService" to find key classes
# → Click on nodes to see relationships

# Step 3: Get AI summary
code-brain export --format ai --focus src/api > api-structure.json

# Feed to ChatGPT:
# "Based on this code structure, explain the API layer design"
```

## Scenario 2: Refactoring Decision Support

Team needs to understand impact before refactoring a module.

```bash
# Export the module and everything that depends on it
code-brain export --format ai --focus src/database > db-context.json

# Query AI model:
# "What would break if we change the database connection pooling?"
# [Include context.json]

# Response uses provenance to reference exact files/functions affected
```

## Scenario 3: Code Review Preparation

Reviewer wants to quickly understand PR impact.

```bash
# From PR branch:
git checkout pr/feature-x
code-brain index

# Export changed modules
code-brain export --format ai --focus src/newFeature > feature-context.json

# Review with full context of:
# - New symbols introduced
# - Modified imports
# - Affected dependents
# - Entry points changed
```

## Scenario 4: Security Audit

Security team needs to map data flow through authentication layer.

```bash
# Export auth-related modules
code-brain export --format ai --focus src/auth > auth-flow.json

# Use AI to analyze:
# "Trace the data flow from login to protected endpoints.
#  What validation happens at each step?"

# Export includes:
# - Auth module structure
# - All incoming dependencies (who calls auth)
# - All outgoing dependencies (what auth calls)
# - Source locations for verification
```

## Scenario 5: Performance Optimization

Performance profiler identified hotspot; need to understand call graph.

```bash
# Export around the hot function
code-brain export --format ai --focus src/dataProcessing > processing-context.json

# AI analysis with context:
# "Process is slow. Show me all functions this calls,
#  their dependencies, and potential optimizations."

# Can verify AI recommendations against actual code via provenance
```

## Scenario 6: Documentation Generation

Generate architecture documentation from current codebase.

```bash
# Export full structure with rankings
code-brain export --format json > full-structure.json

# Use to generate docs:
python3 <<'EOF'
import json

with open('full-structure.json', 'r') as f:
    graph = json.load(f)

print(f"# {graph['project']['name']} Architecture")
print(f"- Files: {graph['project']['fileCount']}")
print(f"- Symbols: {graph['project']['symbolCount']}")
print(f"- Edges: {graph['project']['edgeCount']}")

for node in graph['nodes']:
    if node['type'] == 'class':
        print(f"## {node['name']}")
        print(f"File: {node['fullName']}")
EOF
```

## Scenario 7: Dependency Analysis

Check for circular dependencies or unexpected imports.

```bash
# Export full graph
code-brain export --format json > graph.json

# Analyze with Python + NetworkX
python3 <<'EOF'
import json
import networkx as nx

with open('graph.json', 'r') as f:
    graph_data = json.load(f)

# Build directed graph
G = nx.DiGraph()
for edge in graph_data['edges']:
    if edge['type'] in ['IMPORTS', 'CALLS']:
        G.add_edge(edge['from'], edge['to'])

# Find cycles
try:
    cycles = list(nx.simple_cycles(G))
    if cycles:
        print(f"Found {len(cycles)} circular dependencies:")
        for cycle in cycles[:5]:
            print(" -> ".join(cycle) + f" -> {cycle[0]}")
except:
    print("No cycles found (good!)")

# Calculate density
density = nx.density(G)
print(f"Graph density: {density:.2%}")
EOF
```

## Scenario 8: Migration Planning

Planning to migrate from one framework to another.

```bash
# Export modules using old framework
code-brain export --format ai --focus src/oldFramework > old-fw-context.json

# AI can help:
# 1. Identify all usages of old framework
# 2. Understand dependencies between modules
# 3. Plan migration order (start with leaves)
# 4. Identify what can be parallelized

# All recommendations can be verified against actual source via provenance
```

## Scenario 9: Testing Strategy

Determine which tests cover critical paths.

```bash
# Export tests and their targets
code-brain export --format json | jq '.edges[] | select(.type == "TESTS")'

# Identify critical symbols (high centrality)
code-brain export --format ai | jq '.ranking[] | select(.score > 0.8)'

# Cross-reference:
# Which high-importance symbols lack test coverage?
```

## Scenario 10: Monorepo Navigation

In monorepo, quickly understand module boundaries.

```bash
# Search for specific module
code-brain export --format ai --focus packages/auth > auth-context.json

# Provides:
# - Module entry points
# - Public API (exported symbols)
# - Internal dependencies
# - Users of this module
# - Clear boundaries for developers

# Multiple teams can work with isolated module contexts
```

## Integration: IDE Plugin

```javascript
// In VS Code extension
const { exec } = require('child_process');

function generateContextForSymbol(symbolName) {
  return new Promise((resolve, reject) => {
    exec(
      `code-brain export --format ai --focus ${symbolName}`,
      (error, stdout, stderr) => {
        if (error) reject(error);
        resolve(JSON.parse(stdout));
      }
    );
  });
}

// Right-click "Generate AI Context" in editor
const context = await generateContextForSymbol('MyClass');
// Open in new panel with visualization and copy-to-clipboard
```

## Integration: CI/CD Pipeline

```yaml
# .github/workflows/architecture-check.yml
name: Architecture Validation

on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run build
      - run: |
          npm install -g code-brain
          code-brain init
          code-brain index
          code-brain export --format json > graph.json
          python3 check-architecture.py graph.json
      - name: Comment on PR
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '⚠️ Architecture constraints violated. See logs.'
            })
```

## Integration: Documentation Site

```javascript
// Generate docs/ARCHITECTURE.md automatically
const { exec } = require('child_process');

exec('code-brain export --format json', (error, stdout) => {
  const graph = JSON.parse(stdout);

  let md = `# Architecture\n\nAuto-generated from code-brain\n\n`;

  md += `## Overview\n`;
  md += `- ${graph.project.fileCount} files\n`;
  md += `- ${graph.project.symbolCount} symbols\n`;
  md += `- ${graph.project.edgeCount} relationships\n\n`;

  md += `## Entry Points\n`;
  graph.nodes
    .filter(n => n.metadata?.exported && n.type === 'function')
    .forEach(n => {
      md += `- \`${n.name}\` (${n.location.file})\n`;
    });

  writeFileSync('docs/ARCHITECTURE.md', md);
});
```

## Integration: Slack Notifications

```python
import subprocess
import json
import requests

# Get graph
result = subprocess.run(['code-brain', 'export', '--format', 'json'], 
                       capture_output=True, text=True)
graph = json.loads(result.stdout)

# Find problematic patterns
high_coupling_modules = [
  n for n in graph['nodes'] 
  if n['type'] == 'module' 
  and len([e for e in graph['edges'] if e['from'] == n['id']]) > 10
]

if high_coupling_modules:
  message = f"⚠️ High coupling detected in:\n"
  for m in high_coupling_modules:
    message += f"  - {m['name']}\n"
  
  requests.post(SLACK_WEBHOOK, json={"text": message})
```

---

These examples show code-brain integrating into real workflows, making codebase knowledge explicit and actionable.
