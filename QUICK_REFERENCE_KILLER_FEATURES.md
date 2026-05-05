# Quick Reference: Four Killer Features

## 1. Impact Analysis (ImpactTracer)

**Purpose:** Understand the blast radius of changing a symbol

### MCP Usage
```json
{
  "tool": "analyze_impact",
  "arguments": {
    "project_path": "/path/to/project",
    "symbol": "processPayment"
  }
}
```

### REST API Usage
```bash
curl "http://localhost:3000/api/query/impact-full?target=processPayment&depth=5"
```

### Response
```json
{
  "target": { "id": "...", "name": "processPayment", "type": "function" },
  "blastRadius": 0.45,
  "explanation": "Risk level: MEDIUM (blast radius: 45.0%). 3 direct dependents. 12 total affected nodes...",
  "directImpact": [...],
  "transitiveImpact": [...],
  "affectedTests": [...],
  "affectedFiles": ["src/payment.ts", "src/checkout.ts"],
  "totalAffected": 12
}
```

---

## 2. Pattern Queries (PatternQueryEngine)

**Purpose:** Find nodes matching structural patterns

### Common Patterns

#### Find untested routes
```bash
curl "http://localhost:3000/api/query/pattern?types=route&not_edge=TESTS&not_edge_dir=incoming"
```

#### Find dead code
```bash
curl "http://localhost:3000/api/query/pattern?is_dead=true"
```

#### Find bridge nodes (critical architecture points)
```bash
curl "http://localhost:3000/api/query/pattern?is_bridge=true"
```

#### Find high-importance functions
```bash
curl "http://localhost:3000/api/query/pattern?types=function&min_importance=0.7"
```

#### Find functions calling X without error handling
```bash
curl "http://localhost:3000/api/query/pattern?types=function&has_edge=CALLS&has_edge_dir=outgoing&name=apiCall"
```

### MCP Usage
```json
{
  "tool": "query_pattern",
  "arguments": {
    "project_path": "/path/to/project",
    "node_types": ["route"],
    "not_edge_type": "TESTS",
    "not_edge_direction": "incoming",
    "limit": 20
  }
}
```

---

## 3. Architecture Invariants (InvariantDetector)

**Purpose:** Detect architectural violations and enforce rules

### REST API Usage
```bash
curl "http://localhost:3000/api/analyze/invariants"
```

### MCP Usage
```json
{
  "tool": "check_invariants",
  "arguments": {
    "project_path": "/path/to/project"
  }
}
```

### Response
```json
{
  "totalViolations": 5,
  "healthScore": 87.5,
  "errors": [
    {
      "ruleId": "test-isolation",
      "severity": "error",
      "nodeId": "...",
      "nodeName": "ProductService",
      "message": "Production code \"ProductService\" imports test file \"test-utils.ts\""
    }
  ],
  "warnings": [...],
  "info": [...]
}
```

### Built-in Rules
1. **test-isolation** - Test files must not be imported by production code
2. **no-circular-deps** - Circular dependencies are forbidden
3. **no-dead-code** - Dead code should be removed
4. **no-internal-exposure** - Public API must not expose internal types
5. **layer-dependency** - UI layer must not import from data layer
6. **naming-convention** - Classes use PascalCase, functions use camelCase
7. **max-complexity** - Functions should not have >15 callees

---

## 4. Smart Context Assembly (ContextAssembler)

**Purpose:** Intelligently select relevant code for a task

### MCP Usage (AI Agents Only)
```json
{
  "tool": "assemble_context",
  "arguments": {
    "project_path": "/path/to/project",
    "task": "fix authentication bug in login flow",
    "focus": ["src/auth/login.ts", "UserService"],
    "max_tokens": 8000,
    "task_type": "bug_fix"
  }
}
```

### Task Types
- `bug_fix` - Includes callers, callees, tests (depth 2)
- `feature_add` - Includes callees, broader expansion (depth 3)
- `refactor` - Includes callers, callees, tests (depth 1, narrow)
- `understand` - Includes callers, callees, tests (depth 2)
- `test` - Includes callees, existing tests (depth 1)

### Response
```json
{
  "strategy": "Task type: bug_fix. Started with 2 seed nodes. Expanded to 15 nodes (depth 2). Included callers. Included callees. Included tests.",
  "estimatedTokens": 7850,
  "nodeCount": 15,
  "nodes": [
    {
      "id": "...",
      "name": "login",
      "type": "function",
      "file": "src/auth/login.ts",
      "lines": [10, 45],
      "importance": 0.85,
      "summary": "Handles user login with JWT token generation",
      "relevanceScore": 1.0
    },
    ...
  ],
  "edges": [...]
}
```

---

## Additional Endpoints

### Dead Code Detection
```bash
curl "http://localhost:3000/api/analyze/dead-code"
```

### Bridge Nodes Detection
```bash
curl "http://localhost:3000/api/analyze/bridges"
```

---

## Integration Examples

### Example 1: Pre-Refactoring Safety Check
```bash
# 1. Check impact
curl "http://localhost:3000/api/query/impact-full?target=UserService&depth=5"

# 2. Check invariants
curl "http://localhost:3000/api/analyze/invariants"

# 3. Find affected tests
# (included in impact response)
```

### Example 2: Code Quality Audit
```bash
# 1. Find dead code
curl "http://localhost:3000/api/analyze/dead-code"

# 2. Find untested routes
curl "http://localhost:3000/api/query/pattern?types=route&not_edge=TESTS&not_edge_dir=incoming"

# 3. Check architecture violations
curl "http://localhost:3000/api/analyze/invariants"

# 4. Find circular dependencies
# (included in invariants response)
```

### Example 3: AI Agent Context Assembly
```json
// MCP call from AI agent
{
  "tool": "assemble_context",
  "arguments": {
    "project_path": "/workspace/myproject",
    "task": "add rate limiting to API endpoints",
    "focus": ["src/api/routes.ts"],
    "max_tokens": 10000,
    "task_type": "feature_add"
  }
}
```

---

## Tips

1. **Pattern Queries** - Combine multiple filters for precise results
2. **Impact Analysis** - Use `depth` parameter to control analysis scope
3. **Invariants** - Run regularly in CI/CD to catch violations early
4. **Context Assembly** - Provide good `focus` hints for better results

---

## Troubleshooting

### "Symbol not found"
- Check symbol name spelling
- Try partial name match with pattern query first

### "No results"
- Verify project is indexed: `code-brain analyze /path/to/project`
- Check if graph is loaded: `curl http://localhost:3000/api/stats`

### "Too many results"
- Use `limit` parameter to cap results
- Add more filters (types, importance, etc.)

---

## Performance Notes

- Pattern queries: O(n) where n = number of nodes
- Impact analysis: O(d × e) where d = depth, e = edges per node
- Invariants: O(n × r) where n = nodes, r = rules
- Context assembly: O(n × log n) for sorting + selection

For large codebases (>50K nodes), consider:
- Limiting depth in impact analysis
- Using focused pattern queries
- Running invariants asynchronously
