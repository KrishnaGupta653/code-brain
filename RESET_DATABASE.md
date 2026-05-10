# Reset Code-Brain Database

This project includes cross-platform database reset utilities for macOS, Linux, and Windows.

## Quick Start

### Option 1: Automatic (Recommended)

Automatically detects your OS and runs the appropriate script:

```bash
# macOS / Linux
node reset-codebrain-db.mjs

# Windows (PowerShell)
node reset-codebrain-db.mjs
```

With optional project path:

```bash
node reset-codebrain-db.mjs /path/to/project
```

---

### Option 2: Manual by OS

#### macOS & Linux (Bash)

```bash
./reset-codebrain-db.sh
# or with project path
./reset-codebrain-db.sh /path/to/project
```

#### Windows (PowerShell)

```powershell
.\reset-codebrain-db.ps1
# or with project path
.\reset-codebrain-db.ps1 -ProjectPath "C:\path\to\project"
```

#### Windows (Git Bash / WSL)

```bash
bash reset-codebrain-db.sh
# or with project path
bash reset-codebrain-db.sh /path/to/project
```

---

## What These Scripts Do

1. **Backup** - Creates a timestamped backup of the existing `.codebrain` directory
2. **Remove** - Deletes the old database
3. **Initialize** - Creates a fresh `.codebrain` database
4. **Re-index** - Parses and indexes all source files

## Features

✓ Cross-platform support (macOS, Linux, Windows)  
✓ Automatic backup creation with timestamps  
✓ Error handling and recovery  
✓ Progress indicators  
✓ Clear status messages

## When to Use

Use the reset scripts when:

- You have database corruption or constraint errors
- You want to rebuild the index from scratch
- You've made significant code changes and want a clean index
- The `.codebrain` directory is in an inconsistent state

## Next Steps After Reset

Once reset completes successfully:

```bash
# View the graph visualization
code-brain graph --port 4010

# Export data in various formats
code-brain export --format json
code-brain export --format csv
```

## Requirements

- Node.js installed and in PATH
- Write permissions to the project directory
- For Windows: PowerShell 5.0+ or Git Bash/WSL
- For macOS/Linux: Bash

## Troubleshooting

**Script not found error:**

- Ensure you're in the project root directory
- Check that the script file exists

**Permission denied (macOS/Linux):**

```bash
chmod +x reset-codebrain-db.sh
./reset-codebrain-db.sh
```

**PowerShell execution policy (Windows):**

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\reset-codebrain-db.ps1
```

Or use the Node.js wrapper which bypasses this:

```bash
node reset-codebrain-db.mjs
```
