# Migration System Fix

## Problem
The migration system was failing when encountering an existing database with an old `schema_version` table structure that lacked the `description` column.

**Error Message:**
```
table schema_version has no column named description
```

## Root Cause
The original migration code used `CREATE TABLE IF NOT EXISTS` which would skip creation if the table already existed, but then tried to insert data with a `description` column that didn't exist in older databases.

## Solution
Enhanced the migration system to:

1. **Check if table exists** using `sqlite_master` query
2. **Inspect table structure** using `PRAGMA table_info(schema_version)`
3. **Migrate old tables** by:
   - Creating a new table with correct structure
   - Copying data from old table (with default 'Legacy migration' for description)
   - Dropping old table
   - Renaming new table

## Code Changes

**File**: `src/storage/migrations.ts`

```typescript
export function runMigrations(db: Database.Database): void {
  // Check if schema_version table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").all();
  
  if (tables.length === 0) {
    // Create new table with correct structure
    db.exec(`CREATE TABLE schema_version (...)`);
  } else {
    // Check if description column exists
    const columns = db.prepare('PRAGMA table_info(schema_version)').all();
    const hasDescriptionColumn = columns.some(col => col.name === 'description');
    
    if (!hasDescriptionColumn) {
      // Migrate old table structure
      db.exec(`
        CREATE TABLE schema_version_new (...);
        INSERT INTO schema_version_new (version, applied_at, description)
        SELECT version, applied_at, 'Legacy migration' FROM schema_version;
        DROP TABLE schema_version;
        ALTER TABLE schema_version_new RENAME TO schema_version;
      `);
    }
  }
  
  // Continue with normal migration logic...
}
```

## Testing

### Clean Database (New Project)
```bash
rm -rf /path/to/project/.codebrain
node dist/index.js init --path /path/to/project
node dist/index.js index --path /path/to/project
```

**Result**: ✅ Works - Creates new database with correct structure

### Existing Database (Old Schema)
```bash
# Keep existing .codebrain directory with old schema_version table
node dist/index.js init --path /path/to/project
node dist/index.js index --path /path/to/project
```

**Result**: ✅ Works - Automatically migrates old table structure

## Verification

Tested with `/Users/krishnagupta/traffic-analytics-engine`:

```bash
✓ Init command successful
✓ Index command successful (890 nodes, 1713 edges)
✓ Graph server starts without errors
```

## Backward Compatibility

- ✅ Works with fresh installations
- ✅ Works with existing databases (auto-migrates)
- ✅ Preserves existing migration version numbers
- ✅ No data loss during migration

## Future Considerations

This pattern should be used for all future schema changes:
1. Check if table/column exists
2. Migrate if structure is outdated
3. Apply new migrations

This ensures smooth upgrades without requiring users to delete their databases.
