# sqlite-vec Setup Guide

## Overview

code-brain supports the `sqlite-vec` extension for fast vector similarity search. When available, it provides **O(log n)** search complexity using HNSW (Hierarchical Navigable Small World) indexing, compared to **O(n)** full scan without it.

### Performance Impact

| Database Size | Without sqlite-vec | With sqlite-vec | Speedup |
|--------------|-------------------|-----------------|---------|
| 1,000 nodes  | ~10ms            | ~1ms            | 10×     |
| 10,000 nodes | ~100ms           | ~2ms            | 50×     |
| 100,000 nodes| ~1,000ms         | ~3ms            | 333×    |

## Installation

### macOS (Homebrew)

```bash
# Install sqlite-vec extension
brew install sqlite-vec

# Verify installation
sqlite3 :memory: "SELECT load_extension('vec0');"
```

### Linux (Ubuntu/Debian)

```bash
# Download and compile sqlite-vec
git clone https://github.com/asg017/sqlite-vec.git
cd sqlite-vec
make
sudo make install

# Verify installation
sqlite3 :memory: "SELECT load_extension('vec0');"
```

### Linux (Other Distributions)

```bash
# Install build dependencies
# For Fedora/RHEL:
sudo dnf install gcc make sqlite-devel

# For Arch:
sudo pacman -S gcc make sqlite

# Download and compile
git clone https://github.com/asg017/sqlite-vec.git
cd sqlite-vec
make
sudo make install
```

### Windows

```powershell
# Download pre-built binaries from GitHub releases
# https://github.com/asg017/sqlite-vec/releases

# Extract to a directory in your PATH
# Or place in the same directory as your code-brain installation
```

### Node.js Integration

If you're using `better-sqlite3` (which code-brain uses), you need to ensure the extension is loadable:

```bash
# Set environment variable to extension path (if not in default location)
export SQLITE_VEC_PATH=/path/to/vec0.so  # Linux/macOS
# or
set SQLITE_VEC_PATH=C:\path\to\vec0.dll  # Windows
```

## Verification

After installation, code-brain will automatically detect and use sqlite-vec:

```bash
# Run code-brain - it will log whether sqlite-vec is available
node dist/index.js index --path /path/to/project

# Look for this log message:
# [INFO] sqlite-vec extension detected - using HNSW index for O(log n) search

# Or this warning if not available:
# [WARN] sqlite-vec extension not available - falling back to O(n) scan
```

## Usage

No code changes required! code-brain automatically:
1. Detects if sqlite-vec is available
2. Creates `embeddings_vec` virtual table using `vec0` module
3. Syncs embeddings to the HNSW index
4. Uses fast O(log n) search when available
5. Falls back to O(n) scan if sqlite-vec is not available

### Check Status

```bash
# Get vector search statistics
node dist/index.js query --path /path/to/project --query "authentication" --stats

# Output will show:
# - usingSqliteVec: true/false
# - searchComplexity: "O(log n) with HNSW" or "O(n) full scan"
```

## Troubleshooting

### Extension Not Loading

**Problem**: sqlite-vec installed but not detected

**Solution**:
```bash
# Check if extension is in the right location
find /usr -name "vec0.so" 2>/dev/null  # Linux
find /usr/local -name "vec0.dylib" 2>/dev/null  # macOS

# Set explicit path
export SQLITE_VEC_PATH=/path/to/vec0.so
```

### Permission Denied

**Problem**: Cannot load extension due to permissions

**Solution**:
```bash
# Make extension executable
chmod +x /path/to/vec0.so

# Or run with elevated permissions
sudo node dist/index.js index --path /path/to/project
```

### Version Mismatch

**Problem**: sqlite-vec version incompatible with SQLite version

**Solution**:
```bash
# Check SQLite version
sqlite3 --version

# Rebuild sqlite-vec against your SQLite version
cd sqlite-vec
make clean
make
sudo make install
```

## Performance Tuning

### HNSW Parameters

The HNSW index has two key parameters:
- **M**: Number of connections per node (default: 16)
- **ef_construction**: Size of dynamic candidate list (default: 200)

Higher values = better accuracy but slower indexing.

### Batch Indexing

For large codebases, sync embeddings in batches:

```typescript
// In your code
const vectorSearch = new VectorSearchEngine(storage, provider, projectRoot);

// After generating embeddings
vectorSearch.syncToVecTable();  // Syncs all embeddings to HNSW index
```

## References

- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
- [better-sqlite3 Extensions](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#loadextensionpath-entrypoint---this)

## FAQ

**Q: Is sqlite-vec required?**  
A: No, code-brain works without it. It just uses slower O(n) search.

**Q: How much faster is sqlite-vec?**  
A: 10-333× faster depending on database size. See performance table above.

**Q: Does it work on all platforms?**  
A: Yes, but installation varies. See platform-specific instructions above.

**Q: Can I use other vector databases?**  
A: Currently only sqlite-vec is supported. Other backends (Pinecone, Weaviate, etc.) may be added in the future.

**Q: What if I have an existing database?**  
A: Run `vectorSearch.syncToVecTable()` to populate the HNSW index from existing embeddings.
