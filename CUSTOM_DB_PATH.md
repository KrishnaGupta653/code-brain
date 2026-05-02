# Custom Database Path Feature

## Overview

The `--db-path` option allows you to store the code-brain database (`.codebrain/graph.db`) in a different location than your project directory. This is useful when:

1. **Network drives or external drives** - Your project is on a drive with I/O restrictions
2. **Permission issues** - The project directory is read-only or has write restrictions
3. **Antivirus interference** - Security software blocks database operations in certain locations
4. **Performance** - You want to store the database on a faster drive (e.g., SSD)
5. **Disk space** - The project drive is low on space

## Usage

### Initialize with Custom Database Path

```bash
node dist/index.js init --path <project-path> --db-path <custom-db-path>
```

### Example: Project on D: drive, Database on C: drive

```bash
# Initialize
node dist/index.js init --path D:\PROJECTS\tuberculosis --db-path C:\Users\kg060\.codebrain\tuberculosis\graph.db

# Index the project
node dist/index.js index --path D:\PROJECTS\tuberculosis

# Start the graph visualization
node dist/index.js graph --path D:\PROJECTS\tuberculosis
```

## How It Works

1. **Configuration Storage**:
   - First tries to save config to `<project>/.codebrainrc.json`
   - If project directory is not writable, saves to `<db-directory>/config.json`

2. **Database Location**:
   - Database is created at the specified `--db-path` location
   - All subsequent commands automatically use this location

3. **Automatic Detection**:
   - Once initialized, you don't need to specify `--db-path` again
   - The system reads the config and uses the custom path automatically

## Configuration File

The custom database path is stored in `.codebrainrc.json`:

```json
{
  "include": ["**"],
  "exclude": ["node_modules", "dist", "build", ".git", ...],
  "languages": ["typescript", "javascript", "java", "python", ...],
  "enableAnalytics": false,
  "maxTokensExport": 8000,
  "parserPlugins": [],
  "dbPath": "C:\\Users\\kg060\\.codebrain\\tuberculosis\\graph.db"
}
```

## Fallback Behavior

If the project directory is not writable (common with network drives), the config is saved to:
```
<db-directory>/config.json
```

This ensures the system can still function even when the project directory has restrictions.

## Benefits

### Before (Default Behavior)
```
D:\PROJECTS\tuberculosis\
├── .codebrain\
│   └── graph.db          ← Fails if D: drive has I/O issues
├── src\
└── ...
```

### After (Custom Database Path)
```
D:\PROJECTS\tuberculosis\  ← Project stays on D: drive (read-only is OK)
├── src\
└── ...

C:\Users\kg060\.codebrain\tuberculosis\
├── graph.db              ← Database on C: drive (writable)
└── config.json           ← Config fallback location
```

## Troubleshooting

### Error: "Cannot write to directory"
This means the specified database path is also not writable. Try:
1. Use a different location (e.g., your user directory on C:)
2. Check permissions on the target directory
3. Ensure the drive is not full

### Error: "disk I/O error"
This indicates the drive itself has issues. Solutions:
1. Use `--db-path` to specify a different drive
2. Check drive health with `chkdsk`
3. Temporarily disable antivirus

### Commands Still Fail After Init
Make sure you're using the same `--path` value for all commands:
```bash
# ✓ Correct
node dist/index.js init --path D:\PROJECTS\tuberculosis --db-path C:\...
node dist/index.js index --path D:\PROJECTS\tuberculosis

# ✗ Wrong
node dist/index.js init --path D:\PROJECTS\tuberculosis --db-path C:\...
node dist/index.js index --path D:/PROJECTS/tuberculosis  # Different path format
```

## Testing

Run the test script:
```powershell
.\test-custom-db-path.ps1
```

This will:
1. Initialize code-brain with custom database path
2. Verify the setup
3. Show next steps

## Related Issues

- **Disk I/O Error**: Fixed by storing database on a different drive
- **Permission Denied**: Bypassed by using writable location
- **Network Drive Restrictions**: Avoided by using local drive for database
