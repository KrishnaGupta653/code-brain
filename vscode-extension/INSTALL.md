# Installing the code-brain VSCode Extension

## Method 1: Install from .vsix file (Recommended)

### Step 1: Build the extension
```bash
cd vscode-extension
npm install
npm run build
npm run package
```

This creates `code-brain-vscode-1.0.0.vsix`

### Step 2: Install in VSCode
1. Open VSCode
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Extensions: Install from VSIX"
4. Select the `.vsix` file
5. Reload VSCode

## Method 2: Install from source (Development)

### Step 1: Link the extension
```bash
cd vscode-extension
npm install
npm run build
```

### Step 2: Open in VSCode
1. Open the `vscode-extension` folder in VSCode
2. Press `F5` to launch Extension Development Host
3. A new VSCode window opens with the extension loaded

## Method 3: Publish to Marketplace (Future)

Once ready for public release:
```bash
cd vscode-extension
npm run package
vsce publish
```

## Verify Installation

1. Open Command Palette (`Cmd+Shift+P`)
2. Type "code-brain"
3. You should see 6 commands:
   - code-brain: Analyze Impact of This Symbol
   - code-brain: Find All Callers
   - code-brain: Show Dead Code in File
   - code-brain: Run Pattern Query...
   - code-brain: Check Architecture Invariants
   - code-brain: Open Graph Dashboard

4. Check status bar (bottom right) for `code-brain` indicator

## Configuration

Open VSCode Settings (`Cmd+,`) and search for "code-brain":

```json
{
  "codeBrain.serverUrl": "http://localhost:3000",
  "codeBrain.showImportanceLens": true,
  "codeBrain.highlightDeadCode": true,
  "codeBrain.showBridgeWarnings": true,
  "codeBrain.autoStartServer": false
}
```

## First Use

1. **Index your project:**
   ```bash
   cd your-project
   code-brain index
   ```

2. **Start the server:**
   ```bash
   code-brain serve
   ```

3. **Open a file in VSCode**
   - Code lens appears above functions
   - Hover over symbols for impact analysis
   - Dead code is dimmed automatically

## Troubleshooting

### Extension not loading
- Check VSCode Developer Tools: `Help > Toggle Developer Tools`
- Look for errors in Console tab
- Verify extension is enabled: `Extensions` sidebar

### Code lens not showing
- Ensure `codeBrain.showImportanceLens` is `true`
- Verify server is running: `curl http://localhost:3000/api/stats`
- Check file is indexed: `code-brain query "filename"`

### Server connection failed
- Start server: `code-brain serve`
- Check URL in settings matches server port
- Verify firewall allows localhost:3000

### Performance issues
- Disable features you don't need in settings
- Increase timeout in extension settings (future feature)
- Use smaller projects for testing

## Uninstall

1. Open Extensions sidebar (`Cmd+Shift+X`)
2. Find "code-brain"
3. Click gear icon → Uninstall
4. Reload VSCode

## Development

### Watch mode
```bash
cd vscode-extension
npm run watch
```

### Debug
1. Open `vscode-extension` in VSCode
2. Press `F5`
3. Set breakpoints in `src/extension.ts`
4. Use Extension Development Host to trigger breakpoints

### Logs
- Extension Host logs: `Help > Toggle Developer Tools > Console`
- Output panel: `View > Output > code-brain`

## Support

- Issues: https://github.com/code-brain/code-brain/issues
- Docs: https://github.com/code-brain/code-brain#readme
- Discord: (coming soon)
