# code-brain VSCode Extension

Bring codebase intelligence directly into your editor with real-time importance scores, impact analysis, dead code detection, and architecture invariants.

## Features

### 🎯 Code Lens: Importance Scores
See importance scores and caller counts above every function:
```typescript
⚡ importance: 87% · 23 callers
function handleUserRequest() { ... }
```

### 💥 Impact Analysis on Hover
Hover over any symbol to see:
- Blast radius (% of codebase affected)
- Direct and transitive dependents
- Affected tests
- Risk assessment

### 🪦 Dead Code Detection
Automatically dims unused code in your editor with inline annotations:
```typescript
function unusedHelper() { ... }  ← dead code
```

### ⚠️ Bridge Node Warnings
Highlights critical architectural points (bridge nodes) that connect major components.

### 🔍 Commands
- **Analyze Impact**: See full impact analysis for any symbol
- **Find Callers**: Jump to all callers of a function
- **Show Dead Code**: List all dead code in the project
- **Pattern Query**: Run structural queries (e.g., "untested routes")
- **Check Invariants**: Verify architecture rules

## Requirements

1. **code-brain CLI** must be installed:
   ```bash
   npm install -g code-brain
   ```

2. **Index your project**:
   ```bash
   cd your-project
   code-brain index
   ```

3. **Start the server** (optional - extension can auto-start):
   ```bash
   code-brain serve
   ```

## Extension Settings

- `codeBrain.serverUrl`: code-brain server URL (default: `http://localhost:3000`)
- `codeBrain.showImportanceLens`: Show importance scores above functions (default: `true`)
- `codeBrain.highlightDeadCode`: Dim dead code in editor (default: `true`)
- `codeBrain.showBridgeWarnings`: Show warnings for bridge nodes (default: `true`)
- `codeBrain.autoStartServer`: Auto-start server when VSCode opens (default: `false`)

## Usage

### Quick Start
1. Install the extension
2. Open a project indexed with code-brain
3. Code lens and hover tooltips appear automatically
4. Use Command Palette (`Cmd+Shift+P`) → "code-brain" to see all commands

### Keyboard Shortcuts
- No default shortcuts (customize in VSCode settings)

### Status Bar
Click the `code-brain` status bar item to open the graph dashboard in your browser.

## Examples

### Find Untested Routes
1. Open Command Palette
2. Run "code-brain: Run Pattern Query"
3. Enter: `type:route no-edge:TESTS:incoming`
4. See all routes without tests

### Analyze Refactoring Impact
1. Hover over a function name
2. See blast radius and affected tests
3. Click "Analyze Full Impact" for details

### Clean Up Dead Code
1. Run "code-brain: Show Dead Code"
2. Browse the list
3. Jump to each dead function
4. Delete safely

## Troubleshooting

### "code-brain server not running"
- Run `code-brain serve` in your project directory
- Or enable `codeBrain.autoStartServer` in settings

### Code lens not showing
- Ensure project is indexed: `code-brain index`
- Check server is running: `curl http://localhost:3000/api/stats`
- Verify `codeBrain.showImportanceLens` is enabled

### Hover tooltips not working
- Server must be running
- Symbol must exist in the graph
- Try re-indexing: `code-brain index --force`

## Architecture

The extension communicates with the code-brain server via REST API:
- `/api/search` - Find nodes by name
- `/api/query/impact-full` - Impact analysis
- `/api/analyze/dead-code` - Dead code detection
- `/api/analyze/invariants` - Architecture rules
- `/api/query/pattern` - Pattern queries

## Performance

- Code lens: Cached, updates on file save
- Hover: 1.5s timeout, non-blocking
- Decorations: 2s timeout, background refresh
- No impact on editor responsiveness

## Privacy

All analysis happens locally. No data is sent to external servers.

## Contributing

Issues and PRs welcome at: https://github.com/code-brain/code-brain

## License

MIT
