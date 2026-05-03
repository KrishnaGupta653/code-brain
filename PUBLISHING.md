# 📦 Publishing code-brain to npm

## Prerequisites

1. **npm account** - Create one at https://www.npmjs.com/signup
2. **npm CLI logged in** - Run `npm login`
3. **Build completed** - Run `npm run build`

## Pre-Publish Checklist

### 1. Update package.json

**Required fields to customize:**
```json
{
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/code-brain.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/code-brain/issues"
  },
  "homepage": "https://github.com/yourusername/code-brain#readme"
}
```

**Replace:**
- `Your Name <your.email@example.com>` with your actual name and email
- `yourusername` with your GitHub username

### 2. Verify Build

```bash
# Clean previous builds
npm run clean

# Build everything
npm run build

# Verify dist folder exists
ls dist/cli/cli.js  # Should exist
ls ui/dist/index.html  # Should exist
```

### 3. Test Locally

```bash
# Link locally to test
npm link

# Test the CLI
code-brain --version
code-brain init --path .
code-brain index --path .

# Unlink when done testing
npm unlink -g code-brain
```

### 4. Check Package Contents

```bash
# See what will be published
npm pack --dry-run

# This should show:
# - dist/ (compiled TypeScript)
# - python/ (analytics scripts)
# - ui/dist/ (built UI)
# - README.md, LICENSE, docs
```

## Publishing Steps

### First Time Setup

```bash
# 1. Login to npm (if not already)
npm login

# Enter your npm credentials:
# - Username
# - Password
# - Email
# - One-time password (if 2FA enabled)
```

### Publish to npm

```bash
# 1. Final build
npm run build

# 2. Publish (public package)
npm publish --access public

# 3. Verify on npm
# Visit: https://www.npmjs.com/package/code-brain
```

### If Package Name is Taken

If `code-brain` is already taken on npm, you have options:

**Option 1: Use a scoped package**
```json
{
  "name": "@yourusername/code-brain"
}
```

Then publish:
```bash
npm publish --access public
```

Users install with:
```bash
npm install -g @yourusername/code-brain
```

**Option 2: Use a different name**
```json
{
  "name": "codebrain-ai"
}
```

**Option 3: Request the name**
- If the existing package is abandoned, you can request it
- See: https://www.npmjs.com/policies/disputes

## Post-Publish

### 1. Verify Installation

```bash
# Install globally from npm
npm install -g code-brain

# Test it works
code-brain --version
code-brain init --path /tmp/test-repo
```

### 2. Create GitHub Release

```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0: Production ready with 100× token reduction"
git push origin v1.0.0
```

On GitHub:
1. Go to Releases
2. Click "Draft a new release"
3. Select tag `v1.0.0`
4. Title: "v1.0.0 - Production Release"
5. Description: Copy from release notes below
6. Publish release

### 3. Update README Badge

Add npm badge to README.md:
```markdown
[![npm version](https://badge.fury.io/js/code-brain.svg)](https://www.npmjs.com/package/code-brain)
[![npm downloads](https://img.shields.io/npm/dm/code-brain.svg)](https://www.npmjs.com/package/code-brain)
```

## Release Notes Template

```markdown
# v1.0.0 - Production Release 🚀

## 🎉 First Stable Release

code-brain is now production-ready! Give AI full codebase context with 100× token reduction.

## ✨ Key Features

### Core Capabilities
- **15 Languages**: TypeScript, JavaScript, Java, Python, Go, Rust, C#, C/C++, Ruby, PHP, Kotlin, Scala, Elixir, Haskell, PDF
- **Token Reduction**: 48× on full exports, up to 3,600× on queries
- **Real-Time Updates**: WebSocket-based live graph updates
- **Chat Interface**: Natural language queries with multi-provider AI
- **Git Integration**: Blame, hotspots, churn analysis

### AI Integration
- **Multi-Provider Chat**: Anthropic Claude, OpenAI GPT-4, Ollama (local)
- **MCP Server**: Model Context Protocol for AI assistants
- **Embeddings**: OpenAI, Anthropic/Voyage, Ollama support
- **Hybrid Search**: BM25 + vector similarity

### Security & Production
- **Enterprise Security**: Helmet, rate limiting, SSRF protection
- **API Key Auth**: Optional authentication for teams
- **Fault Tolerant**: Continues on parse errors with fallback
- **Scalable**: Handles 100K+ node graphs with LOD rendering

## 📊 Benchmarks

| Scenario | Raw Tokens | code-brain | Reduction |
|----------|------------|------------|-----------|
| Full codebase | 540,000 | 11,250 | **48×** |
| Focused subsystem | 45,000 | 2,000 | **22.5×** |
| Query: "find callers" | 540,000 | 150 | **3,600×** |

See [BENCHMARKS.md](BENCHMARKS.md) for detailed analysis.

## 🚀 Quick Start

```bash
# Install
npm install -g code-brain

# Index your repository
code-brain init
code-brain index

# Chat with your codebase
code-brain chat "how does authentication work?"

# Export for AI (48× reduction)
code-brain export --format ai > context.json

# Visual exploration
code-brain graph
```

## 📚 Documentation

- [QUICK_SETUP.md](QUICK_SETUP.md) - Get started in 2 minutes
- [BENCHMARKS.md](BENCHMARKS.md) - Token reduction benchmarks
- [COMPARISON.md](COMPARISON.md) - vs Graphify, Sourcegraph, Copilot
- [SECURITY.md](SECURITY.md) - Enterprise security features
- [USER_GUIDE.md](USER_GUIDE.md) - Complete user guide

## 🏆 Competitive Position

**vs Graphify:**
- ✅ Real-time updates (unique to code-brain)
- ✅ Chat interface (unique to code-brain)
- ✅ Query compression up to 3,600× (unique to code-brain)
- ✅ Git integration (unique to code-brain)
- ✅ 15 languages vs 11

**vs Sourcegraph:**
- ✅ Local/offline operation
- ✅ Token reduction for AI
- ✅ Open source (MIT)
- ✅ Free

**vs GitHub Copilot:**
- ✅ Full codebase context
- ✅ Query system (find callers, cycles, dead code)
- ✅ Visual exploration
- ✅ Open source (MIT)

## 🙏 Acknowledgments

Built with:
- Tree-sitter for AST parsing
- TypeScript Compiler API
- SQLite for storage
- NetworkX for analytics
- React + Sigma.js for visualization

## 📝 License

MIT - See [LICENSE](LICENSE) for details.

---

**Install now:** `npm install -g code-brain`

**Star on GitHub:** https://github.com/yourusername/code-brain
```

## Updating Versions

### Patch Release (1.0.0 → 1.0.1)
```bash
npm version patch
npm publish
git push --tags
```

### Minor Release (1.0.0 → 1.1.0)
```bash
npm version minor
npm publish
git push --tags
```

### Major Release (1.0.0 → 2.0.0)
```bash
npm version major
npm publish
git push --tags
```

## Troubleshooting

### "Package name already exists"

**Solution 1: Use scoped package**
```bash
# Update package.json name to @yourusername/code-brain
npm publish --access public
```

**Solution 2: Choose different name**
```bash
# Update package.json name to codebrain-ai or similar
npm publish --access public
```

### "You must be logged in"

```bash
npm login
# Enter credentials
npm publish --access public
```

### "Missing files in package"

```bash
# Verify build
npm run build
ls dist/cli/cli.js

# Check what will be published
npm pack --dry-run
```

### "Permission denied"

```bash
# Make sure you own the package name
npm owner ls code-brain

# Or use scoped package
npm publish --access public
```

## Best Practices

1. **Always build before publishing**
   ```bash
   npm run clean
   npm run build
   npm publish
   ```

2. **Test locally first**
   ```bash
   npm link
   code-brain --version
   npm unlink -g code-brain
   ```

3. **Use semantic versioning**
   - Patch (1.0.x): Bug fixes
   - Minor (1.x.0): New features, backward compatible
   - Major (x.0.0): Breaking changes

4. **Tag releases on GitHub**
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push --tags
   ```

5. **Update CHANGELOG.md**
   - Document all changes
   - Link to issues/PRs
   - Credit contributors

## npm Scripts Reference

```bash
# Build everything
npm run build

# Clean build artifacts
npm run clean

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Support

- **Issues**: https://github.com/yourusername/code-brain/issues
- **Discussions**: https://github.com/yourusername/code-brain/discussions
- **npm**: https://www.npmjs.com/package/code-brain

---

**Ready to publish?** Follow the steps above and you'll be live on npm in minutes! 🚀
