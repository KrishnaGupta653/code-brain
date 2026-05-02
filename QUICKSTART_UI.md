# 🚀 Quick Start: Enhanced UI

## See the New UI in Action

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- A codebase to analyze (or use code-brain itself!)

### Step 1: Install Dependencies
```bash
# Install main dependencies
npm install

# Install UI dependencies
cd ui
npm install
cd ..
```

### Step 2: Initialize the Graph
```bash
# Index your codebase (or use code-brain's own code)
npx code-brain init
npx code-brain index
```

### Step 3: Start the Graph Server
```bash
# Start the server with the enhanced UI
npx code-brain graph

# Or specify a custom port
npx code-brain graph --port 3456
```

### Step 4: Open in Browser
```
🌐 Open: http://localhost:3456
```

## 🎯 First Steps in the UI

### 1. **Explore the Graph**
- The 3D sphere shows your codebase structure
- Nodes are colored by type (files, classes, functions, etc.)
- Edges show relationships (imports, calls, extends, etc.)

### 2. **Try Keyboard Shortcuts**
- Press `Ctrl+K` to focus search
- Press `Ctrl+/` to see all shortcuts
- Press `Esc` to clear selection

### 3. **Search for Something**
- Type a function name, file name, or symbol
- Press `Enter` or click the search button
- Click a result to inspect it

### 4. **Inspect a Node**
- Click any node in the graph
- See details in the right panel
- View relationships and source code
- Click "Full File" to see complete source

### 5. **Filter by Type**
- Toggle node types in the left panel
- Hide tests/docs for cleaner view
- See metrics update in real-time

### 6. **Rotate the 3D Sphere**
- Hold `Shift` and drag to rotate
- Or hold `Alt` and drag
- Click "Reset Sphere" to return to default

## 🎨 What's New?

### ✨ Modern Design
- Glassmorphism effects with backdrop blur
- Smooth animations and transitions
- Gradient accents (cyan → purple → amber)
- Floating brand icon with animation

### ⌨️ Keyboard Shortcuts
- `Ctrl+K` - Focus search
- `Ctrl+/` - Toggle shortcuts panel
- `Esc` - Clear selection / Close panels
- `Enter` - Execute search

### 🔄 Real-Time Updates
- WebSocket connection for live updates
- Visual notification when graph changes
- Automatic reconnection on disconnect
- Smooth data refresh

### ♿ Accessibility
- Full keyboard navigation
- Screen reader support
- Reduced motion support
- High contrast mode support

### 📱 Responsive Design
- Desktop: Three-column layout
- Tablet: Two-column with floating panel
- Mobile: Single-column stacked layout

## 🎓 Learn More

### Features
- [Complete Features Guide](ui/FEATURES.md)
- [Keyboard Shortcuts Reference](ui/FEATURES.md#keyboard-shortcuts)
- [Tips & Tricks](ui/FEATURES.md#tips--tricks)

### Technical Details
- [UI Improvements Documentation](docs/UI_IMPROVEMENTS.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)

### Visual Preview
- [UI Preview with ASCII Art](ui/UI_PREVIEW.md)
- [Color System](ui/UI_PREVIEW.md#color-palette)
- [Animation Examples](ui/UI_PREVIEW.md#animation-examples)

## 🐛 Troubleshooting

### Graph Not Loading?
```bash
# Check if server is running
curl http://localhost:3456/api/graph?level=0

# Check server logs
npx code-brain graph --verbose

# Try a different port
npx code-brain graph --port 3457
```

### WebSocket Not Connecting?
- Check firewall settings
- Verify port is not blocked
- Try refreshing the page
- Check browser console for errors

### Performance Issues?
- Filter out unused node types
- Use cluster view for large graphs
- Close unused browser tabs
- Update to latest browser version

### Visual Glitches?
- Try resetting the camera
- Refresh the page
- Clear browser cache
- Check GPU acceleration is enabled

## 💡 Pro Tips

### Power User Workflow
1. **Start with Search** (`Ctrl+K`)
   - Find your entry point quickly
   - Use partial names for fuzzy matching

2. **Follow the Edges**
   - Click relationships to navigate
   - Hover to preview connections

3. **Use Filters**
   - Hide test files for cleaner view
   - Focus on specific node types

4. **Inspect Source**
   - Always verify in actual code
   - Use "Full File" for context

5. **Learn Shortcuts**
   - Press `Ctrl+/` to see all shortcuts
   - Practice until they're muscle memory

### Performance Tips
1. **Filter Aggressively**
   - Hide unused node types
   - Focus on what matters

2. **Use Cluster View**
   - Automatic for large graphs
   - Expand communities as needed

3. **Close Panels**
   - Hide inspector when not needed
   - More space for graph

4. **Keyboard Over Mouse**
   - Faster navigation
   - Less hand movement

## 🎯 Example Workflows

### 1. Find a Function
```
1. Press Ctrl+K
2. Type function name
3. Press Enter
4. Click result
5. View source code
```

### 2. Explore Dependencies
```
1. Search for a file
2. Click to select
3. View relationships panel
4. Click IMPORTS edges
5. Follow the chain
```

### 3. Find High-Impact Code
```
1. Look at Signal Hubs panel
2. Click top hub
3. See degree count
4. Inspect relationships
5. Understand impact
```

### 4. Verify Test Coverage
```
1. Search for a function
2. Check relationships
3. Look for TESTS edges
4. Click test node
5. View test source
```

## 📊 Understanding the Metrics

### Node Metrics
- **Degree**: Total connections (in + out)
- **Incoming**: How many depend on this
- **Outgoing**: What this depends on
- **Rank**: PageRank importance score (0-1)

### Graph Metrics
- **Nodes**: Total code entities
- **Edges**: Total relationships
- **Unresolved**: Imports/calls not found
- **Clusters**: Community detection count

### Edge Types
- **IMPORTS**: Module imports
- **CALLS**: Function calls
- **EXTENDS**: Class inheritance
- **IMPLEMENTS**: Interface implementation
- **TESTS**: Test coverage
- **UNRESOLVED**: Not found (warning)

## 🎨 Customization

### Panel Sizes
- Drag the vertical separators
- Resize left and right panels
- Sizes persist in localStorage

### Node Visibility
- Toggle node types on/off
- Filter by type in left panel
- Changes apply immediately

### Graph View
- Zoom with mouse wheel
- Pan by dragging
- Rotate with Shift+Drag
- Reset with button

## 🚀 Next Steps

### Explore More
- Try different codebases
- Compare graph structures
- Find architectural patterns
- Identify refactoring opportunities

### Learn Advanced Features
- Read the full features guide
- Watch for real-time updates
- Experiment with filters
- Master keyboard shortcuts

### Contribute
- Report bugs or issues
- Suggest new features
- Improve documentation
- Submit pull requests

## 📞 Get Help

### Resources
- [GitHub Issues](https://github.com/yourusername/code-brain/issues)
- [Documentation](docs/)
- [Examples](docs/EXAMPLES.md)
- [FAQ](docs/FAQ.md)

### Community
- Discord: [Join our server](#)
- Twitter: [@codebrain](#)
- Blog: [blog.codebrain.dev](#)

---

**Enjoy exploring your codebase with the enhanced code-brain UI!** 🧠✨

**Pro Tip**: Press `Ctrl+/` right now to see all keyboard shortcuts!
