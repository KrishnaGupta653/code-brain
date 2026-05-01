# Code-Brain Quick Start Guide

**Version:** 1.0.0  
**Status:** Production Ready ✅  
**Completion:** 91% (20/22 tasks)  

---

## 🚀 Quick Start

### Installation
```bash
npm install
npm run build:server
```

### Basic Usage
```bash
# Initialize code-brain in your project
code-brain init

# Index your codebase
code-brain update

# Start the graph UI
code-brain graph

# Export for AI
code-brain export --format ai --max-tokens 50000

# Search for symbols
code-brain query "UserService"

# Export only changes
code-brain diff --format json
```

---

## 🎨 Graph UI Features

### Navigation
- **Pan:** Click and drag background
- **Zoom:** Mouse wheel or zoom buttons
- **Search:** Type symbol name and press Enter
- **Reset:** Click "Reset" button

### New Features (Just Added!)

#### 1. Filter Panel
```
✅ Filter by node types (Files, Classes, Functions, etc.)
✅ Filter by edge types (Imports, Calls, Extends)
✅ Click "Apply Filters" to update view
```

#### 2. Minimap
```
✅ Overview of entire graph
✅ Blue rectangle shows current viewport
✅ Click to pan main view
```

#### 3. Path Highlighting
```
✅ Shift+click first node (source)
✅ Shift+click second node (target)
✅ Path highlighted in orange
✅ Click "Clear Path" to reset
```

#### 4. Live Updates
```
✅ WebSocket connection for real-time updates
✅ Graph updates automatically when code changes
✅ No page refresh needed
```

---

## 📊 Export Formats

### JSON Export
```bash
code-brain export --format json --output graph.json
```

### YAML Export
```bash
code-brain export --format yaml --output graph.yaml
```

### AI Export (Natural Language)
```bash
code-brain export --format ai --max-tokens 50000 --output context.txt
```

### Incremental Export (Diff)
```bash
# Export changes from last 24 hours
code-brain diff --format ai

# Export changes since specific time
code-brain diff --since 1704067200000 --output changes.json
```

---

## 🔍 Query Examples

### Find by Name
```bash
code-brain query "UserController"
```

### Find Entry Points
```bash
code-brain query --entry-points
```

### Find Cycles
```bash
code-brain query --cycles
```

### Find Dead Exports
```bash
code-brain query --dead-exports
```

---

## 🌐 API Endpoints

### Graph Data
```
GET /api/graph                    # Full graph
GET /api/graph?level=0            # Cluster view
GET /api/graph?level=1            # File-level view
GET /api/graph?communityId=5      # Expand cluster
GET /api/graph?level=2&focus=id   # Detail around node
```

### Node Details
```
GET /api/node/:id                 # Node with relationships
```

### Search
```
GET /api/search?q=UserService     # Search by name
```

### Path Finding
```
GET /api/path?from=id1&to=id2     # Shortest path
```

### Analytics
```
GET /api/analytics                # Graph analytics
GET /api/stats                    # Graph statistics
GET /api/entry-points             # Entry point nodes
```

### Analysis
```
GET /api/analyze/cycles           # Find cycles
GET /api/analyze/dead-exports     # Find dead exports
GET /api/analyze/orphans          # Find orphaned files
```

### Query
```
GET /api/query/callers?symbol=X   # Find callers
GET /api/query/callees?symbol=X   # Find callees
GET /api/query/impact?target=X    # Impact analysis
```

---

## 🎯 Common Workflows

### 1. Initial Setup
```bash
# Install and build
npm install
npm run build:server

# Initialize in your project
cd /path/to/your/project
code-brain init

# Index codebase
code-brain update
```

### 2. Explore Graph
```bash
# Start UI
code-brain graph

# Open browser to http://localhost:3000
# Use filters to focus on specific areas
# Use minimap for navigation
# Shift+click nodes to find paths
```

### 3. AI Context Export
```bash
# Export full context
code-brain export --format ai --max-tokens 100000 --output context.txt

# Export only recent changes
code-brain diff --format ai --output changes.txt

# Use context.txt with your AI assistant
```

### 4. Code Analysis
```bash
# Find cycles
code-brain query --cycles

# Find dead exports
code-brain query --dead-exports

# Find entry points
code-brain query --entry-points

# Analyze impact of changes
curl "http://localhost:3000/api/query/impact?target=UserService"
```

### 5. Continuous Integration
```bash
# In CI pipeline
code-brain update
code-brain diff --format json --output changes.json

# Check for cycles
code-brain query --cycles > cycles.txt
if [ -s cycles.txt ]; then
  echo "Cycles detected!"
  exit 1
fi
```

---

## 🔧 Configuration

### .codebrainrc.json
```json
{
  "include": ["src/**/*.ts", "src/**/*.py"],
  "exclude": ["node_modules/**", "dist/**"],
  "languages": ["typescript", "python", "java", "go"],
  "maxFileSize": 1048576,
  "followSymlinks": false
}
```

---

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Specific Tests
```bash
npm test -- parser.test.ts
npm test -- export-benchmark.test.ts
```

### Run Benchmarks
```bash
npm test -- export-benchmark.test.ts
```

---

## 📈 Performance Tips

### 1. Use Filters
- Filter out node types you don't need
- Reduces visual clutter
- Improves rendering performance

### 2. Use Cluster View
```
GET /api/graph?level=0
```
- Shows 30-100 clusters instead of thousands of nodes
- Much faster for large codebases

### 3. Use Incremental Exports
```bash
code-brain diff --format ai
```
- Only exports changed code
- Faster than full export
- Reduces token usage

### 4. Use Token Budgets
```bash
code-brain export --max-tokens 50000
```
- Limits export size
- Prioritizes important nodes
- Fits within AI context windows

---

## 🐛 Troubleshooting

### Build Errors
```bash
# Clean and rebuild
rm -rf dist
npm run build:server
```

### Database Issues
```bash
# Reset database
rm -rf .codebrain/graph.db
code-brain update
```

### UI Not Loading
```bash
# Check server is running
curl http://localhost:3000/api/stats

# Check WebSocket connection
# Open browser console, look for WebSocket errors
```

### Parser Errors
```bash
# Check logs
code-brain update --verbose

# Skip problematic files
# Add to exclude in .codebrainrc.json
```

---

## 📚 Documentation

### Full Documentation
- `docs/API.md` - API reference
- `docs/ARCHITECTURE.md` - System architecture
- `docs/DEPLOYMENT.md` - Deployment guide
- `docs/EXAMPLES.md` - Usage examples
- `docs/EXPORT_FORMAT.md` - Export format specs

### Status Reports
- `ALL_TASKS_STATUS.md` - Complete task status
- `FINAL_IMPLEMENTATION_REPORT.md` - Implementation details
- `SESSION_SUMMARY.md` - Latest session summary

---

## 🎓 Advanced Features

### Cross-Language Detection
```typescript
import { RelationshipAnalyzer } from './graph/relationships';

const analyzer = new RelationshipAnalyzer(graph);
const crossCalls = analyzer.detectCrossLanguageCalls();

// Returns FFI calls between languages
// TypeScript ↔ Python, Java, Go
// Python ↔ TypeScript, Java, Go
// Java ↔ Native (JNI)
```

### Custom Queries
```typescript
import { QueryEngine } from './retrieval/query';

const engine = new QueryEngine(graph, storage, projectRoot);

// Find callers
const callers = engine.findCallers('UserService.login');

// Find callees
const callees = engine.findCallees('UserService.login');

// Impact analysis
const impact = engine.findImpact('UserService');
```

### WebSocket Integration
```javascript
// Client-side
const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'node_added') {
    // Handle new node
  } else if (message.type === 'graph_updated') {
    // Reload graph
  }
};
```

---

## 🎉 What's New (Latest Session)

### UI Enhancements
- ✅ Filter panel for nodes and edges
- ✅ Minimap with viewport navigation
- ✅ Path highlighting between nodes
- ✅ Real-time WebSocket updates

### Backend Enhancements
- ✅ Cross-language call detection (FFI)
- ✅ Export performance benchmarks
- ✅ Comprehensive test coverage

### Completion Status
- **Phase 3:** 100% complete ✅
- **Phase 4:** 100% complete ✅
- **Phase 5:** 100% complete ✅
- **Overall:** 91% complete (20/22 tasks)

---

## 🚀 Production Checklist

- ✅ Build passing
- ✅ All tests passing
- ✅ Documentation complete
- ✅ API stable
- ✅ UI functional
- ✅ Performance validated
- ✅ Backward compatible

**Status:** PRODUCTION READY ✅

---

## 📞 Support

### Issues
- Check `docs/` for documentation
- Review `ALL_TASKS_STATUS.md` for known limitations
- Check GitHub issues

### Contributing
- Follow existing code style
- Add tests for new features
- Update documentation
- Maintain backward compatibility

---

**End of Quick Start Guide**

Generated: 2026-05-01  
Version: 1.0.0  
Status: Production Ready ✅
