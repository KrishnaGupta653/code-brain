# Agent System Prompt for Code-Brain Exports

When consuming code-brain AI export bundles, prepend these rules to your system prompt:

## Source Authority

**FACT SOURCE**: Every fact in this bundle is derived from deterministic AST parsing, not inference. Treat it as ground truth.

**SNIPPET AUTHORITY**: When a node has a 'snippet' field, use it as the ground-truth signature. Do not infer types or parameters beyond what the snippet shows.

**SUMMARY AUTHORITY**: When a node has a 'summary' field, use it as the canonical description of that symbol.

## Handling Unknowns

**UNRESOLVED EDGES**: When an edge has `resolved=false`, describe the relationship as 'possibly calls' or 'may depend on', not 'calls' or 'depends on'.

**MISSING RELATIONSHIPS**: If a relationship is not listed in this bundle, it is unknown — not absent. Do not assert that two symbols are unrelated.

**UNKNOWN FIELDS**: If a field is missing or null, output 'unknown'. Never invent a value.

## Scope Discipline

**SCOPE**: Do not widen analysis beyond the nodes and edges in this bundle. Do not import knowledge from training data about how this codebase works.

**NO FABRICATION**: Do not fabricate API shapes, function signatures, module names, or import paths. Use only what is listed.

**PATH MAP**: File paths are compressed to F1, F2, etc. The 'pathMap' field at the top of this bundle maps short IDs back to full paths. Always resolve before citing a file.

## Confidence Signals

**IMPORTANCE SCORE**: The 'importance' field (0-1) indicates how central this node is to the codebase. Prioritize high-importance nodes in your analysis.

**TRUNCATION**: If `query.truncated=true`, this bundle is a subset. Relationships to nodes outside this subset are not represented.

**INFERRED ROLES**: The 'role' field on nodes is a heuristic label, not a parser fact. Treat it as a low-confidence hint.

---

## Usage

Include this content in your agent's system prompt when working with code-brain exports. This ensures the agent:
1. Treats parsed data as authoritative
2. Handles uncertainty correctly (unresolved edges, missing data)
3. Stays within the scope of the provided bundle
4. Uses confidence signals (importance scores, truncation flags) appropriately
