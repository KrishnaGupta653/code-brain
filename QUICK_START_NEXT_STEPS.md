# Quick Start: Next Steps for Code-Brain God-Level Improvements

## What Just Happened

✅ **STEP 1 is COMPLETE** - Schema migrations + semantic field persistence

You now have:
- Proper versioned migration system (migrations 5-9)
- Semantic fields persisted in SQLite (semantic_path, namespace, hierarchy_label, etc.)
- FTS5 full-text search infrastructure ready
- Analytics cache table ready
- Clusters table ready for UI LOD
- Git metadata columns ready
- All changes backward-compatible

## Test Your Changes

```bash
# Build the project
npm run build

# Test on a sample repo
node dist/index.js init --path /path/to/test/repo
node dist/index.js index --path /path/to/test/repo

# Check that migrations ran
# You should see: "Migration v5 applied: Add semantic fields to nodes table"
# through "Migration v9 applied: Add git metadata to files table"

# Start the graph server
node dist/index.js graph --path /path/to/test/repo

# Open http://localhost:3000 and verify it works
```

## What to Do Next

### Option 1: Quick Wins (2-4 hours)
Implement STEP 2-4 for immediate performance gains:

1. **STEP 2: FTS5 Search** (1-2 hours)
   - Update `src/retrieval/query.ts` → `findByName()` to call `storage.searchNodes()`
   - Update `src/server/app.ts` → `/api/search` endpoint
   - Test: Search should be 100x faster

2. **STEP 3: Python Analytics Fix** (2-3 hours)
   - Edit `python/analytics/graph.py` → add size detection
   - For n > 10K: use degree_centrality instead of betweenness
   - For n > 5K: use label_propagation instead of greedy_modularity
   - Test: Should work on 36K+ node graphs without timeout

3. **STEP 4: Analytics Cache** (2-3 hours)
   - Edit `src/python/bridge.ts` → check cache before spawning Python
   - Compute graph fingerprint (hash of node/edge IDs)
   - Store/retrieve from analytics_cache table
   - Test: Second run should be instant (1ms vs 30s)

**Total Time**: 5-8 hours  
**Impact**: Massive performance gains, no UI changes needed

---

### Option 2: Fix Critical Bug (4-6 hours)
Implement STEP 5 to fix call resolution:

1. **STEP 5: Call Graph Resolution** (4-6 hours)
   - Edit `src/graph/builder.ts` → `buildRelationshipEdges()`
   - Build importResolverMap before processing calls
   - Map local aliases to resolved exports
   - Update `addCallEdge()` to use import resolution
   - Test: 60-80% of CALLS_UNRESOLVED should become CALLS

**Total Time**: 4-6 hours  
**Impact**: Dramatically improves graph accuracy

---

### Option 3: Fix UI Scalability (12-16 hours)
Implement STEP 8-9 to make UI work at any scale:

1. **STEP 8: Server-Side LOD** (6-8 hours)
   - Edit `src/server/app.ts` → add `?level=0/1/2` to `/api/graph`
   - Edit `src/cli/commands/index.ts` → compute clusters after indexing
   - Store clusters in database
   - Return 30-100 cluster nodes for level=0

2. **STEP 9: Client-Side LOD** (6-8 hours)
   - Edit `ui/src/main.tsx` → fetch level=0 on load
   - Render cluster nodes
   - On click: fetch community and expand
   - Add viewport culling

**Total Time**: 12-16 hours  
**Impact**: Fixes the most visible bug (UI freeze on large graphs)

---

### Option 4: Improve AI Export (9-12 hours)
Implement STEP 6-7 for better AI consumption:

1. **STEP 6: Hierarchical Export** (6-8 hours)
   - Edit `src/retrieval/export.ts` → complete rewrite
   - Generate module summaries
   - Create 3-level structure (project/module/symbol)
   - Implement semantic compression

2. **STEP 7: Model-Specific Budgets** (3-4 hours)
   - Add model definitions (GPT-4, Claude, Gemini)
   - Implement proper tokenization
   - Add --model flag to export command

**Total Time**: 9-12 hours  
**Impact**: 60-80% token reduction, better AI understanding

---

## Recommended Path

### Week 1: Performance + Accuracy
- Day 1: STEP 2 (FTS5 search) ✅
- Day 2: STEP 3 (Python analytics fix) ✅
- Day 3: STEP 4 (Analytics cache) ✅
- Day 4: STEP 5 (Call resolution) ✅
- Day 5: Testing + bug fixes

**Result**: Fast, accurate, production-ready core

### Week 2: UI Scalability
- Day 1-2: STEP 8 (Server-side LOD) ✅
- Day 3-4: STEP 9 (Client-side LOD) ✅
- Day 5: STEP 10 (WebSocket updates) ✅

**Result**: UI works at any scale, live updates

### Week 3: AI Export Quality
- Day 1-2: STEP 6 (Hierarchical export) ✅
- Day 3: STEP 7 (Model-specific budgets) ✅
- Day 4-5: STEP 11 (Tree-sitter Java parser) ✅

**Result**: Best-in-class AI context generation

---

## Files You'll Be Editing

### High-Touch Files (Edit Often)
- `src/storage/sqlite.ts` - Database operations
- `src/server/app.ts` - API endpoints
- `src/graph/builder.ts` - Graph construction
- `src/retrieval/export.ts` - AI export logic
- `ui/src/main.tsx` - UI rendering

### Medium-Touch Files (Edit Sometimes)
- `src/python/bridge.ts` - Python integration
- `python/analytics/graph.py` - Analytics algorithms
- `src/cli/commands/*.ts` - CLI commands
- `src/retrieval/query.ts` - Graph queries

### Low-Touch Files (Rarely Edit)
- `src/parser/*.ts` - Parsers (only for STEP 11-13)
- `src/storage/schema.ts` - Schema (only for new tables)
- `src/storage/migrations.ts` - Migrations (only for schema changes)

---

## Testing Strategy

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
# Test on small repo (< 100 files)
node dist/index.js index --path ./tests/fixtures/small-repo

# Test on medium repo (100-1000 files)
node dist/index.js index --path ./tests/fixtures/medium-repo

# Test on large repo (1000+ files)
node dist/index.js index --path /path/to/large/repo
```

### Performance Tests
```bash
# Measure indexing time
time node dist/index.js index --path /path/to/repo

# Measure export time
time node dist/index.js export --format ai --path /path/to/repo > export.json

# Measure search time (in UI)
# Open http://localhost:3000, search for "function", measure response time
```

---

## Common Issues

### Issue: Migration fails with "column already exists"
**Solution**: This is safe to ignore. The migration uses TRY/CATCH to handle existing columns.

### Issue: FTS5 not available
**Solution**: SQLite must be compiled with FTS5 support. The code falls back to LIKE search automatically.

### Issue: Python analytics still timeout
**Solution**: Implement STEP 3 to add size-aware algorithms.

### Issue: UI still freezes on large graphs
**Solution**: Implement STEP 8-9 for LOD rendering.

---

## Getting Help

### Documentation
- `IMPLEMENTATION_PLAN.md` - Full 20-step plan
- `GOD_LEVEL_IMPROVEMENTS_STATUS.md` - Current status
- `STEP1_COMPLETED.md` - What was done in STEP 1
- Original audit document (your prompt) - Detailed analysis

### Code Comments
All new code includes comments explaining:
- Why the change was made
- What problem it solves
- How it works
- Performance implications

### Testing
Each step includes test instructions in the implementation plan.

---

## Success Criteria

### STEP 2-4 Complete
- [ ] Search returns results in < 50ms
- [ ] Analytics complete in < 5s (no timeout)
- [ ] Second analytics run is instant (< 10ms)

### STEP 5 Complete
- [ ] 80%+ of calls are resolved (not CALLS_UNRESOLVED)
- [ ] Cross-file calls work correctly
- [ ] Import resolution handles aliases

### STEP 8-9 Complete
- [ ] UI loads in < 500ms for any graph size
- [ ] No browser freeze
- [ ] Cluster view shows 30-100 nodes
- [ ] Click to expand works

### STEP 6-7 Complete
- [ ] Export is 60-80% smaller (tokens)
- [ ] Module summaries included
- [ ] Model-specific budgets work
- [ ] AI can understand the export

---

## Final Notes

**You've completed the hardest part** - the foundation is solid.

All subsequent steps build on STEP 1. The migration system ensures safe evolution, and the semantic fields enable advanced features.

**Recommended approach**: 
1. Do STEP 2-4 first (quick wins)
2. Then STEP 5 (accuracy)
3. Then STEP 8-9 (UI)
4. Then STEP 6-7 (AI export)
5. Then STEP 11+ (nice-to-haves)

**Estimated time to production-ready**: 2-3 weeks of focused work.

Good luck! 🚀
