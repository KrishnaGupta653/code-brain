# Changelog

## [2.0.0] - 2026-05-06

### Major Enhancements

#### Performance
- **10,000× faster BFS** - Fixed O(n²) algorithm to O(n)
- **10-333× faster vector search** - Added sqlite-vec support with HNSW indexing
- **10× token efficiency** - New CBv2 export format with compact tuples
- **~500 tokens saved** - Removed getAIRules from exports

#### Intelligence
- **PageRank importance scoring** - Graph-based importance calculation
- **Recency-weighted importance** - Boosts recently modified code
- **Dead code detection** - Finds unreachable symbols
- **Cycle detection** - Tarjan's SCC algorithm
- **Bridge node detection** - Betweenness centrality
- **Call count metrics** - In/out degree tracking
- **Topological sort** - Build order analysis

#### New Features
- **Smart Context Assembler** - Task-aware code selection (bug_fix, feature_add, refactor, understand, test)
- **Pattern Query Engine** - Structural pattern matching (functions without error handling, classes without tests, etc.)
- **Causal Impact Tracer** - Blast radius calculation and refactoring effort estimation
- **Architecture Invariant Detector** - Enforce architectural rules with health scoring
- **CBv2 Export Format** - Compact tuple-based format for 10× token efficiency

### Bug Fixes
- Fixed Levenshtein clustering causing silent data corruption
- Fixed MCP cache invalidation (now uses lastIndexedAt)
- Fixed ProvenanceTracker memory leak
- Fixed token budget estimation (now accurate within 20%)
- Fixed cross-language detection
- Removed duplicate importance field
- Fixed migration v13 to handle importance_score → importance rename

### Breaking Changes
- Removed MODEL_CONTEXT_WINDOWS - now requires explicit maxTokens parameter
- Schema upgraded to v13 - automatic migration on first run

### Documentation
- Added comprehensive sqlite-vec setup guide
- Added AGENT_SYSTEM_PROMPT.md with AI rules
- Added verification script with 46 checks
- Updated all MCP tool descriptions

### Technical Details
- Schema version: 13
- New columns: importance, is_entry_point, is_dead, is_bridge, call_count_in, call_count_out
- New indexes for efficient queries
- sqlite-vec support with automatic detection and graceful fallback

## [1.0.0] - Previous Release

Initial release with basic code indexing and graph building.
