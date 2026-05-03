# 🏆 code-brain vs Competitors

**TL;DR:** code-brain excels at **interactive development** with real-time updates, chat interface, and query-based compression (up to 3,600×). Graphify excels at **batch analysis** with multi-modal content and full corpus compression (71.5×).

---

## Quick Comparison

| Feature | code-brain | Graphify | Sourcegraph | GitHub Copilot |
|---------|-----------|----------|-------------|----------------|
| **Token Reduction** | 48-3,600× | 71.5× | N/A | N/A |
| **Real-Time Updates** | ✅ | ❌ | ✅ | ❌ |
| **Chat Interface** | ✅ | ❌ | ❌ | ✅ |
| **Languages** | 15 | 11 | 40+ | All |
| **Git Integration** | ✅ | ❌ | ✅ | ✅ |
| **Local/Offline** | ✅ | ✅ | ❌ | ❌ |
| **Multi-Modal** | PDF | PDF+Images+Video | ❌ | ❌ |
| **Query System** | 8 types | BFS subgraph | Advanced | N/A |
| **Open Source** | ✅ MIT | ✅ MIT | ❌ | ❌ |
| **Price** | Free | Free | Enterprise | $10-19/mo |

---

## vs Graphify (Detailed)

### What Graphify Does Better ✅

1. **Full Corpus Compression** - 71.5× vs code-brain's 48×
2. **Multi-Modal Content** - PDFs, images, videos, diagrams (code-brain: PDF only)
3. **Vision Models** - Can read diagrams and screenshots
4. **Marketing** - 22K+ GitHub stars, strong community

### What code-brain Does Better ✅

1. **Real-Time Updates** - WebSocket-based live updates (Graphify requires full rebuild)
2. **Chat Interface** - Natural language queries with multi-provider AI
3. **Query-Based Compression** - Up to 3,600× on specific queries
4. **Incremental Updates** - Hash-based change detection (Graphify rebuilds everything)
5. **More Languages** - 15 vs 11
6. **Git Integration** - Blame, hotspots, churn analysis
7. **Hybrid Search** - BM25 + vector similarity
8. **API Key Authentication** - Optional security for teams
9. **Production Maturity** - More testing, fault-tolerant

### Use Case Comparison

| Use Case | Best Tool | Why |
|----------|-----------|-----|
| **Active development** | code-brain | Real-time updates, incremental |
| **Research projects** | Graphify | Multi-modal (papers + code) |
| **Code review** | code-brain | Query system, impact analysis |
| **AI training** | Graphify | Full corpus compression |
| **Team collaboration** | code-brain | API auth, real-time |
| **Batch analysis** | Graphify | Better full export compression |

### Token Reduction Comparison

| Scenario | code-brain | Graphify | Winner |
|----------|-----------|----------|--------|
| **Full export** | 48× | 71.5× | Graphify |
| **Focused export** | 22.5× | N/A | code-brain |
| **Query: find callers** | 3,600× | N/A | code-brain |
| **Token-limited** | 312-625× | N/A | code-brain |
| **Delta/incremental** | Near-zero | N/A | code-brain |

**Verdict:** Different strengths for different workflows.

---

## vs Sourcegraph

### What Sourcegraph Does Better ✅

1. **Language Support** - 40+ languages
2. **Enterprise Features** - RBAC, SSO, audit logs
3. **Code Search** - Advanced search with regex, structural
4. **Batch Changes** - Automated refactoring across repos
5. **Code Insights** - Analytics dashboards

### What code-brain Does Better ✅

1. **Local/Offline** - No server required
2. **Token Reduction** - 48-3,600× compression for AI
3. **Open Source** - MIT license, free
4. **Chat Interface** - Natural language queries
5. **Real-Time Graph** - Visual exploration
6. **AI Integration** - MCP server, embeddings

### Use Case Comparison

| Use Case | Best Tool | Why |
|----------|-----------|-----|
| **Enterprise search** | Sourcegraph | Advanced features, scale |
| **AI-assisted dev** | code-brain | Token reduction, chat |
| **Local development** | code-brain | Offline, free |
| **Multi-repo** | Sourcegraph | Cross-repo search |
| **Visual exploration** | code-brain | Interactive graph UI |

**Verdict:** Sourcegraph for enterprise search, code-brain for AI integration.

---

## vs GitHub Copilot

### What GitHub Copilot Does Better ✅

1. **Code Completion** - Real-time suggestions
2. **IDE Integration** - Native VS Code, JetBrains
3. **All Languages** - Universal support
4. **Chat in IDE** - Contextual assistance
5. **GitHub Integration** - Pull requests, issues

### What code-brain Does Better ✅

1. **Full Codebase Context** - Entire project graph
2. **Token Reduction** - 48-3,600× compression
3. **Offline** - No internet required
4. **Query System** - Find callers, cycles, dead code
5. **Visual Exploration** - Interactive graph
6. **Open Source** - MIT license, free
7. **Git Analysis** - Blame, hotspots, churn

### Use Case Comparison

| Use Case | Best Tool | Why |
|----------|-----------|-----|
| **Code completion** | Copilot | Real-time, IDE-native |
| **Architecture questions** | code-brain | Full graph context |
| **Refactoring** | code-brain | Impact analysis, callers |
| **Learning codebase** | code-brain | Visual exploration |
| **Quick fixes** | Copilot | Fast, contextual |
| **Code quality** | code-brain | Cycles, dead code, orphans |

**Verdict:** Copilot for coding, code-brain for understanding.

---

## Feature Matrix

### Core Capabilities

| Feature | code-brain | Graphify | Sourcegraph | Copilot |
|---------|-----------|----------|-------------|---------|
| **AST Parsing** | ✅ | ✅ | ✅ | ✅ |
| **Graph Building** | ✅ | ✅ | ✅ | ❌ |
| **Symbol Search** | ✅ | ✅ | ✅ | ✅ |
| **Call Graph** | ✅ | ✅ | ✅ | ❌ |
| **Dependency Graph** | ✅ | ✅ | ✅ | ❌ |

### AI Integration

| Feature | code-brain | Graphify | Sourcegraph | Copilot |
|---------|-----------|----------|-------------|---------|
| **Token Reduction** | ✅ 48-3,600× | ✅ 71.5× | ❌ | ❌ |
| **Chat Interface** | ✅ | ❌ | ❌ | ✅ |
| **MCP Server** | ✅ | ❌ | ❌ | ❌ |
| **Embeddings** | ✅ | ❌ | ❌ | ✅ |
| **Multi-Provider** | ✅ | ❌ | ❌ | ❌ |

### Real-Time Features

| Feature | code-brain | Graphify | Sourcegraph | Copilot |
|---------|-----------|----------|-------------|---------|
| **Live Updates** | ✅ WebSocket | ❌ | ✅ | ✅ |
| **Incremental** | ✅ Hash-based | ❌ | ✅ | ✅ |
| **Watch Mode** | ✅ | ❌ | ❌ | ❌ |
| **Delta Exports** | ⏳ Coming | ❌ | ❌ | ❌ |

### Multi-Modal

| Feature | code-brain | Graphify | Sourcegraph | Copilot |
|---------|-----------|----------|-------------|---------|
| **PDF** | ✅ Phase 1 | ✅ Full | ❌ | ❌ |
| **Images** | ⏳ Coming | ✅ OCR | ❌ | ❌ |
| **Videos** | ⏳ Coming | ✅ Transcripts | ❌ | ❌ |
| **Diagrams** | ⏳ Coming | ✅ Vision | ❌ | ❌ |

### Query & Analysis

| Feature | code-brain | Graphify | Sourcegraph | Copilot |
|---------|-----------|----------|-------------|---------|
| **Find Callers** | ✅ | ✅ | ✅ | ❌ |
| **Find Callees** | ✅ | ✅ | ✅ | ❌ |
| **Detect Cycles** | ✅ | ❌ | ✅ | ❌ |
| **Dead Code** | ✅ | ❌ | ✅ | ❌ |
| **Impact Analysis** | ✅ | ❌ | ✅ | ❌ |
| **Git Integration** | ✅ | ❌ | ✅ | ✅ |

### Security

| Feature | code-brain | Graphify | Sourcegraph | Copilot |
|---------|-----------|----------|-------------|---------|
| **Helmet** | ✅ | ✅ | ✅ | N/A |
| **Rate Limiting** | ✅ | ✅ | ✅ | N/A |
| **SSRF Protection** | ✅ | ✅ | ✅ | N/A |
| **API Key Auth** | ✅ | ❌ | ✅ | ✅ |
| **RBAC** | ❌ | ❌ | ✅ | ✅ |

### Deployment

| Feature | code-brain | Graphify | Sourcegraph | Copilot |
|---------|-----------|----------|-------------|---------|
| **Local** | ✅ | ✅ | ✅ | ❌ |
| **Self-Hosted** | ✅ | ✅ | ✅ | ❌ |
| **Cloud** | ❌ | ❌ | ✅ | ✅ |
| **Offline** | ✅ | ✅ | ❌ | ❌ |

---

## Pricing Comparison

| Tool | Price | Model |
|------|-------|-------|
| **code-brain** | Free | Open source (MIT) |
| **Graphify** | Free | Open source (MIT) |
| **Sourcegraph** | $99-499/user/mo | Enterprise SaaS |
| **GitHub Copilot** | $10-19/mo | Subscription |

---

## When to Use Each Tool

### Use code-brain When:
- ✅ You need **real-time updates** during development
- ✅ You want **natural language queries** (chat interface)
- ✅ You need **query-based compression** (3,600× on specific queries)
- ✅ You want **git integration** (blame, hotspots, churn)
- ✅ You need **incremental updates** (fast, hash-based)
- ✅ You want **local/offline** operation
- ✅ You need **API key authentication** for teams
- ✅ You want **open source** with MIT license

### Use Graphify When:
- ✅ You need **maximum compression** on full exports (71.5×)
- ✅ You have **multi-modal content** (PDFs, images, videos)
- ✅ You work with **research projects** (papers + code)
- ✅ You need **vision models** for diagrams
- ✅ You want **batch analysis** workflows
- ✅ You want **strong community** (22K+ stars)

### Use Sourcegraph When:
- ✅ You need **enterprise features** (RBAC, SSO, audit)
- ✅ You have **40+ languages**
- ✅ You need **cross-repo search**
- ✅ You want **batch changes** (automated refactoring)
- ✅ You need **code insights** dashboards
- ✅ You have **budget** for enterprise tools

### Use GitHub Copilot When:
- ✅ You need **code completion** in real-time
- ✅ You want **IDE integration** (VS Code, JetBrains)
- ✅ You need **all languages** supported
- ✅ You want **GitHub integration**
- ✅ You're willing to **pay subscription**

---

## Hybrid Approach (Recommended)

**Best of all worlds:**

1. **code-brain** for:
   - Daily development (real-time updates)
   - Code review (impact analysis)
   - Refactoring (find callers, cycles)
   - Architecture questions (chat interface)

2. **GitHub Copilot** for:
   - Code completion
   - Quick fixes
   - Boilerplate generation

3. **Graphify** for:
   - Research projects (papers + code)
   - Multi-modal analysis
   - Batch processing

**Result:** Complete coverage of all development workflows! 🎯

---

## Migration Guide

### From Graphify to code-brain

```bash
# 1. Install code-brain
npm install -g code-brain

# 2. Index your repository
code-brain init
code-brain index

# 3. Use similar commands
# Graphify: /graphify query "find callers"
# code-brain: code-brain query --type callers --symbol MyFunction

# 4. Export for AI
# Graphify: /graphify export
# code-brain: code-brain export --format ai
```

### From Sourcegraph to code-brain

```bash
# 1. Install code-brain
npm install -g code-brain

# 2. Index your repository
code-brain init
code-brain index

# 3. Use similar searches
# Sourcegraph: search UI
# code-brain: code-brain query --type search --text "pattern"

# 4. Visual exploration
code-brain graph
```

### From GitHub Copilot to code-brain

**Note:** These tools complement each other!

```bash
# Use Copilot for: Code completion
# Use code-brain for: Architecture understanding

# Install code-brain alongside Copilot
npm install -g code-brain

# Index your repository
code-brain init
code-brain index

# Ask architecture questions
code-brain chat "how does authentication work?"

# Continue using Copilot for code completion
```

---

## Conclusion

### code-brain's Unique Value

**What makes code-brain special:**

1. **Real-Time Development** - Live updates, incremental changes
2. **Query-Based Compression** - Up to 3,600× on specific queries
3. **Chat Interface** - Natural language understanding
4. **Git Integration** - Blame, hotspots, churn
5. **Production Ready** - Tested, fault-tolerant, secure

**Best for:**
- Interactive development workflows
- AI-assisted coding
- Code review and refactoring
- Architecture exploration
- Team collaboration

**Not best for:**
- Multi-modal content (use Graphify)
- Enterprise search (use Sourcegraph)
- Code completion (use Copilot)

### Final Recommendation

**Use code-brain if you want:**
- ✅ Real-time updates during development
- ✅ Natural language queries
- ✅ Query-based extreme compression
- ✅ Git integration
- ✅ Open source, free, local

**Use Graphify if you want:**
- ✅ Maximum full export compression
- ✅ Multi-modal content support
- ✅ Batch analysis workflows

**Use both if you want:**
- ✅ Best of both worlds! 🎉

---

**Last Updated:** May 3, 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅

