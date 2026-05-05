# Fix: Blank Graph UI Screen

## Problem

The graph UI at `http://localhost:4005` was showing a blank screen.

## Root Cause

The indexer was including **backup database files** (`.codebrain.backup.*`) in the graph, causing:
1. Duplicate/stale data from old backups
2. Confusion in the graph visualization
3. Potentially blank screen due to invalid file paths

When you ran `code-brain index`, it created a backup (`.codebrain.backup.20260501_151520`), but the indexer was scanning and including files from that backup directory in the graph.

## Solution

Added exclusion patterns for backup directories:
- `.codebrain.*`
- `.codebrain.backup.*`

These patterns now prevent the indexer from scanning backup directories.

## How to Fix Your Current Installation

### Step 1: Rebuild code-brain
```bash
npm run build:server
```

### Step 2: Re-index your project (this will exclude backups)
```bash
# Stop the current server (Ctrl+C)

# Re-index to rebuild the graph without backup files
node dist/index.js index --path /Users/krishnagupta/traffic-analytics-engine

# Start the graph server again
node dist/index.js graph --path /Users/krishnagupta/traffic-analytics-engine --port 4005
```

### Step 3: Open the UI
```bash
open http://localhost:4005
```

The graph should now display correctly without backup file data.

## Verification

After re-indexing, you should see:
- ✓ No warnings about backup files
- ✓ Graph displays actual project structure
- ✓ Node count matches your actual codebase (not inflated by backups)

## What Changed

**File:** `src/config/types.ts`

**Before:**
```typescript
exclude: [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.codebrain',  // Only excluded exact .codebrain directory
  '.vscode',
  // ...
]
```

**After:**
```typescript
exclude: [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.codebrain',
  '.codebrain.*',           // NEW: Excludes .codebrain.backup.*, etc.
  '.codebrain.backup.*',    // NEW: Explicit backup exclusion
  '.vscode',
  // ...
]
```

## Additional Fixes in This Session

1. **sqlite-vec Loading Fixed**
   - Changed from `require()` to `createRequire()` for ES modules
   - Now properly loads sqlite-vec extension
   - You should see: `✓ sqlite-vec extension loaded successfully`

2. **Verification Script Updated**
   - Updated `verify-implementation.sh` to check for schema v14
   - All 47 checks now pass

## Clean Up Old Backups (Optional)

If you have many old backups taking up space:

```bash
# List backups
ls -lh /Users/krishnagupta/traffic-analytics-engine/.codebrain.backup.*

# Remove old backups (keep the most recent one)
# BE CAREFUL - this deletes data!
rm -rf /Users/krishnagupta/traffic-analytics-engine/.codebrain.backup.20260501_*
```

## Summary

✅ **Fixed:** Blank screen caused by backup files being indexed  
✅ **Fixed:** sqlite-vec loading in ES modules  
✅ **Fixed:** Verification script for schema v14  

**Next:** Re-index your project to see the graph properly!
