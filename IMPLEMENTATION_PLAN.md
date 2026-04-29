# Code-Brain God-Level Improvement Implementation Plan

## Overview
This document tracks the implementation of 20 major improvements to transform code-brain from prototype to production-grade system.

## Implementation Status

### STEP 1: Schema Migration + Semantic Fields Persistence ✅ NEXT
- Add columns: semantic_path, namespace, hierarchy_label, semantic_role, community_id, importance_score
- Update migrations.ts with proper versioned migration system
- Modify SQLiteStorage to persist/restore semantic fields

### STEP 2: FTS5 Search
- Add FTS5 virtual table for full-text search
- Implement searchNodes() with BM25 ranking
- Update API endpoints to use FTS5

### STEP 3: Python Analytics Fix for Large Graphs
- Auto-detect graph size and choose appropriate algorithms
- Implement approximate betweenness for 1K-10K nodes
- Use degree centrality for 10K+ nodes
- Switch to label_propagation for large community detection

### STEP 4: Analytics Cache in SQLite
- Create analytics_cache table
- Implement graph fingerprinting
- Cache/retrieve analytics results

### STEP 5: Fix Call Graph Resolution
- Build importResolverMap before processing calls
- Resolve calls using import information
- Convert CALLS_UNRESOLVED to real CALLS edges

### STEP 6: Hierarchical AI Export
- Generate module summaries
- Create 3-level export structure (project/module/symbol)
- Implement semantic compression with ID references

### STEP 7: Model-Specific Token Budgets
- Add model definitions with context windows
- Implement proper tokenization
- Support --model flag in export

### STEP 8: UI LOD System - Server Side
- Add level-based /api/graph endpoint
- Implement cluster computation
- Create clusters table

### STEP 9: UI LOD System - Browser Side
- Progressive loading in UI
- Viewport-based culling
- Cluster expansion on click

### STEP 10: WebSocket Live Updates
- Add WebSocket server
- Implement graph diff broadcasting
- Update UI to apply diffs

### STEP 11: Tree-Sitter Java Parser
- Replace regex parser with tree-sitter
- Extract classes, methods, imports, annotations
- Proper AST-based parsing

### STEP 12: Tree-Sitter TypeScript Parser
- Implement tree-sitter TS parser
- Benchmark against compiler API
- Use faster/more accurate option

### STEP 13: Python/Go Parsers
- Add tree-sitter-python parser
- Add tree-sitter-go parser
- Support polyglot repos

### STEP 14: Git Integration
- Detect git repos
- Get change frequency per file
- Implement git-aware incremental updates
- Store git metadata in SQLite

### STEP 15: Parallel Parsing
- Implement worker_threads for parsing
- Batch files across workers
- 4-8x speedup expected

### STEP 16: New CLI Commands
- code-brain query
- code-brain hotspots
- code-brain impact
- code-brain diff

### STEP 17: Cycle Detection + Dead Code
- Implement findCycles() using SCC
- Implement findDeadExports()
- Implement findOrphans()
- Add /api/analyze endpoints

### STEP 18: MCP Server
- Implement Model Context Protocol server
- Expose graph tools for AI assistants
- Support Claude Desktop, Cursor, Continue.dev

### STEP 19: Migration System
- Replace stub with versioned migrations
- Implement migration runner
- Add all schema migrations

### STEP 20: Config Schema Validation
- Add zod for config validation
- Validate .codebrainrc.json
- Provide helpful error messages

## Critical Bugs Fixed
- [ ] BUG 1: UI unusable at scale (LOD system)
- [ ] BUG 2: /api/graph no pagination
- [ ] BUG 3: Python analytics timeout on large graphs
- [ ] BUG 4: Call resolution broken for cross-file calls
- [ ] BUG 5: Java parser is regex-based
- [ ] BUG 6: Semantic fields not persisted
- [ ] BUG 7: Community detection not stored
- [ ] BUG 8: File scanner pattern matching broken
- [ ] BUG 9: Schema migration incomplete
- [ ] BUG 10: Watch command no WebSocket

## Dependencies to Install
```bash
npm install tree-sitter tree-sitter-java tree-sitter-python tree-sitter-go
npm install ws @types/ws
npm install zod
npm install simple-git
```

## Timeline Estimate
- Steps 1-7: Core fixes (3-5 days)
- Steps 8-10: UI scalability (2-3 days)
- Steps 11-13: Parser improvements (3-4 days)
- Steps 14-17: New features (3-4 days)
- Steps 18-20: Advanced features (2-3 days)

**Total: 13-19 days of focused work**
