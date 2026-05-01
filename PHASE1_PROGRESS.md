# Code-Brain Improvements - Phase 1 Progress

## Completed Tasks

### ✅ TASK 1.1 — Fix force-directed graph layout
**Status:** COMPLETE

**Changes:**
- Added D3.js v7.9.0 CDN script to `ui/public/index.html`
- Replaced dead grid initialization with random positions near center
- Implemented D3 force simulation with:
  - `forceLink` with distance=80, strength=0.3
  - `forceManyBody` with strength=-200
  - `forceCenter` with strength=0.05
  - `forceCollide` with radius=28
  - `alphaDecay` of 0.028
- Pre-run 150 ticks before first render for stable initial layout
- Fixed node dragging to use `fx`/`fy` for position fixing
- Added "Reset layout" button that restarts simulation with alpha=1
- Removed old manual force calculation code

**Files Modified:**
- `ui/public/index.html` - Added D3 script, added Reset layout button
- `ui/public/graph.js` - Complete force-directed layout implementation

---

### ✅ TASK 1.2 — Fix token estimation
**Status:** COMPLETE

**Changes:**
- Replaced single `TOKENS_PER_CHAR = 0.25` constant with context-aware function
- Added `estimateTextTokens()` method with four content types:
  - `identifier`: ~3 chars/token (camelCase/PascalCase)
  - `json`: ~2 chars/token (JSON structure overhead)
  - `prose`: ~4 chars/token (English text)
  - `code`: ~3.5 chars/token (mixed code)
- Updated `estimateNodeTokens()` to use appropriate content types:
  - `node.name` → identifier
  - `node.fullName` → identifier
  - `node.summary` → prose
  - `JSON.stringify(node.metadata)` → json
  - `span.file` → identifier
  - `span.text` → code
- Updated `estimateEdgeTokens()` similarly
- Moved `TOKEN_SAFETY_MARGIN` to local const in `pruneByTokenBudget()`

**Files Modified:**
- `src/retrieval/export.ts` - Token estimation improvements

---

### ✅ TASK 1.3 — Fix cycle detection
**Status:** COMPLETE

**Changes:**
- Replaced hand-rolled DFS with Tarjan's Strongly Connected Components (SCC) algorithm
- Added guard against stack overflow for graphs >5000 nodes (logs debug message and returns empty array)
- Proper cycle detection that:
  - Only considers cycle-relevant edge types: IMPORTS, DEPENDS_ON, EXTENDS, IMPLEMENTS
  - Only considers resolved edges
  - Uses Tarjan SCC to find all strongly connected components
  - Filters to only multi-node SCCs (actual cycles)
  - Deduplicates by sorted canonical names
- Imported `logger` utility for debug logging

**Files Modified:**
- `src/retrieval/export.ts` - Tarjan SCC cycle detection

---

### ✅ TASK 1.5 — Fix module grouping path comparison
**Status:** COMPLETE

**Changes:**
- Imported Node.js `path` module
- Replaced string manipulation (`filePath.substring(0, filePath.lastIndexOf('/'))`) with `path.dirname()`
- Fixed incorrect grouping where `src/api-utils/foo.ts` was grouped into `src/api` module
- Updated all directory comparisons in `generateModuleSummaries()` to use `path.dirname()`
- Consistent path handling for:
  - File grouping by directory
  - Symbol filtering by directory
  - Import/dependency target directory comparison

**Files Modified:**
- `src/retrieval/export.ts` - Path-based module grouping

---

### ✅ TASK 2.5 — Fix AI rules to be operational
**Status:** COMPLETE

**Changes:**
- Completely rewrote `getAIRules()` method with operational, actionable rules
- Organized into 4 categories:
  1. **Source authority** - Ground truth from AST parsing, snippet/summary authority
  2. **Handling unknowns** - Unresolved edges, missing relationships, unknown fields
  3. **Scope discipline** - No widening, no fabrication, path map resolution
  4. **Confidence signals** - Importance scores, truncation, inferred roles
- Rules are now specific, testable, and directly actionable by LLMs
- Removed vague rules like "Do not infer behavior"
- Added concrete instructions like "When an edge has resolved=false, describe as 'possibly calls'"

**Files Modified:**
- `src/retrieval/export.ts` - AI rules rewrite

---

## Build Status

✅ **Server build:** PASSING (`npm run build:server`)
⚠️ **UI build:** Pre-existing TypeScript errors in `ui/src/main.tsx` (not related to our changes)

---

## Next Steps

### Remaining Phase 1 Tasks:
- **TASK 1.4** — Fix Python bridge (persistent process)

### Phase 2 Tasks (AI Export Quality):
- TASK 2.1 — Add signature snippet windows
- TASK 2.2 — Add code-brain diff command
- TASK 2.3 — Add FTS5 semantic search
- TASK 2.4 — LLM-generated persistent summaries

### Phase 3 Tasks (Parser Improvements):
- TASK 3.1 — Fix call resolution false positives
- TASK 3.2 — Add git-blame provenance
- TASK 3.3 — Add parameter and return type extraction
- TASK 3.4 — Decorator-to-framework semantic role mapping

### Phase 4 Tasks (Graph UI Overhaul):
- TASK 4.1 — Add module cluster view toggle
- TASK 4.2 — Path highlighting (Find Path)
- TASK 4.3 — Minimap
- TASK 4.4 — Filter panel

### Phase 5 Tasks (Production Hardening):
- TASK 5.1 — WebSocket live graph updates
- TASK 5.2 — Cross-language edge detection
- TASK 5.3 — Export benchmark test

---

## Testing Recommendations

1. **Force-directed layout:** Start the UI server and verify nodes spread naturally, dragging works, and "Reset layout" button restarts the simulation
2. **Token estimation:** Run export with `--format ai` and verify token counts are more accurate for identifiers vs prose
3. **Cycle detection:** Test on a codebase with known circular dependencies
4. **Module grouping:** Verify `src/api-utils/` is not grouped with `src/api/`
5. **AI rules:** Export with `--format ai` and verify rules array contains the new operational rules
