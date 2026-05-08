# Quick Start: code-brain + VSCode

Get code-brain intelligence in your editor in 5 minutes.

---

## Step 1: Install code-brain CLI

```bash
npm install -g code-brain
```

---

## Step 2: Index Your Project

```bash
cd your-project
code-brain index
```

**What this does:**
- Parses all source files
- Builds knowledge graph
- Calculates importance scores
- Detects dead code and bridges

**Time:** 10-60 seconds depending on project size

---

## Step 3: Start the Server

```bash
code-brain serve
```

**What this does:**
- Starts HTTP server on localhost:3000
- Serves graph visualization UI
- Provides REST API for VSCode extension

**Keep this running** in a terminal tab.

---

## Step 4: Install VSCode Extension

### Option A: From .vsix file
```bash
cd vscode-extension
npm install
npm run build
npm run package
```

Then in VSCode:
1. `Cmd+Shift+P` → "Extensions: Install from VSIX"
2. Select `code-brain-vscode-1.0.0.vsix`
3. Reload VSCode

### Option B: Development mode
```bash
cd vscode-extension
npm install
npm run build
```

Then in VSCode:
1. Open `vscode-extension` folder
2. Press `F5` to launch Extension Development Host

---

## Step 5: See It in Action

### Open any source file
You'll immediately see:

**1. Code Lens (above functions):**
```typescript
⚡ importance: 87% · 23 callers
function handleUserRequest() { ... }
```

**2. Dead Code (dimmed):**
```typescript
function unusedHelper() { ... }  ← dead code
```

**3. Hover Tooltips:**
Hover over any symbol to see:
- Blast radius
- Affected nodes
- Test coverage

---

## Step 6: Try Commands

Open Command Palette (`Cmd+Shift+P`) and try:

### Analyze Impact
1. Type: "code-brain: Analyze Impact"
2. Enter a function name
3. See blast radius and affected files

### Find Dead Code
1. Type: "code-brain: Show Dead Code"
2. Browse the list
3. Jump to dead functions

### Pattern Query
1. Type: "code-brain: Run Pattern Query"
2. Enter: `type:route no-edge:TESTS:incoming`
3. See all untested routes

### Check Invariants
1. Type: "code-brain: Check Architecture Invariants"
2. See violations (if any)

---

## Configuration

Open VSCode Settings (`Cmd+,`) and search for "code-brain":

```json
{
  "codeBrain.serverUrl": "http://localhost:3000",
  "codeBrain.showImportanceLens": true,
  "codeBrain.highlightDeadCode": true,
  "codeBrain.showBridgeWarnings": true
}
```

---

## Troubleshooting

### "code-brain server not running"
**Fix:** Run `code-brain serve` in your project directory

### Code lens not showing
**Fix:** 
1. Ensure project is indexed: `code-brain index`
2. Restart VSCode
3. Check server is running: `curl http://localhost:3000/api/stats`

### Extension not loading
**Fix:**
1. Check Extensions sidebar (`Cmd+Shift+X`)
2. Verify "code-brain" is enabled
3. Check Developer Tools: `Help > Toggle Developer Tools`

---

## What You Get

### Real-Time Feedback
- **Importance scores** above every function
- **Dead code** automatically dimmed
- **Bridge warnings** for critical nodes
- **Impact analysis** on hover

### Commands
- Analyze impact of any symbol
- Find all callers
- Show dead code
- Run pattern queries
- Check architecture invariants
- Open graph dashboard

### Status Bar
- Shows node count
- Health indicator
- Click to open dashboard

---

## Example Workflow

### 1. Refactoring
```
1. Hover over function → see blast radius
2. If low impact → safe to refactor
3. If high impact → check affected tests first
```

### 2. Code Review
```
1. Open PR files
2. See importance scores
3. Focus on high-importance changes
4. Check for new dead code
```

### 3. Cleanup
```
1. Run "Show Dead Code"
2. Review each dead function
3. Delete safely (0 callers)
4. Re-index to update
```

### 4. Architecture
```
1. Run "Check Invariants"
2. Fix violations
3. Run pattern queries to find issues
4. Open dashboard for full view
```

---

## Tips & Tricks

### Keyboard Shortcuts
Add your own in VSCode settings:
```json
{
  "key": "cmd+shift+i",
  "command": "codeBrain.analyzeImpact"
}
```

### Disable Features
Turn off what you don't need:
```json
{
  "codeBrain.showImportanceLens": false,
  "codeBrain.highlightDeadCode": false
}
```

### Multiple Projects
Switch projects:
```bash
cd project-a
code-brain serve --port 3000

cd project-b
code-brain serve --port 3001
```

Update VSCode settings per workspace.

---

## Next Steps

### Learn More
- Read: `vscode-extension/README.md`
- Docs: https://github.com/code-brain/code-brain
- Examples: `USER_GUIDE.md`

### Advanced Features
- Pattern queries: `COMMANDS.md`
- Architecture invariants: `USER_GUIDE.md`
- MCP integration: `README.md`

### Get Help
- Issues: https://github.com/code-brain/code-brain/issues
- Discussions: GitHub Discussions (coming soon)

---

## Summary

**5 minutes to:**
- ✅ Install CLI
- ✅ Index project
- ✅ Start server
- ✅ Install extension
- ✅ See intelligence in editor

**You now have:**
- Real-time importance scores
- Dead code detection
- Impact analysis
- Architecture insights
- Pattern queries

**All running locally, offline, for free.**

Enjoy! 🎉
