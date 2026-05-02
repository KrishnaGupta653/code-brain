# code-brain UI Features Guide

## 🎨 Modern Design

### Glassmorphism UI
The interface uses modern glassmorphism design with:
- Semi-transparent panels with backdrop blur
- Layered depth with shadows and glows
- Smooth animations and transitions
- Gradient accents (cyan → purple → amber)

### 3D Graph Visualization
- **Sphere Layout**: Nodes arranged in 3D space with community clustering
- **Interactive Rotation**: Shift+Drag or Alt+Drag to rotate the sphere
- **Level of Detail (LOD)**: Automatic clustering for large graphs (>100 nodes)
- **Depth Perception**: Z-axis positioning with size and opacity scaling

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Focus search input |
| `Ctrl/Cmd + /` | Toggle shortcuts panel |
| `Esc` | Clear selection / Close panels |
| `Enter` | Execute search |
| `Shift + Drag` | Rotate 3D sphere |
| `Alt + Drag` | Rotate 3D sphere |

**Tip**: Click the keyboard icon (bottom-right) to see all shortcuts!

## 🔍 Search & Filter

### Full-Text Search
- Search by symbol name, file path, or type
- Real-time results as you type
- Press `Enter` or click the search button
- Results show node type and location

### Node Type Filters
Toggle visibility by node type:
- 📁 Files
- 📦 Modules
- 🎯 Classes
- ⚡ Functions
- 🔧 Methods
- 🛣️ Routes
- ⚙️ Config
- 🧪 Tests
- 📝 Documentation

## 📊 Graph Metrics

### Statistics Dashboard
- **Nodes**: Total number of code entities
- **Edges**: Total number of relationships
- **Unresolved**: Unresolved imports/calls
- **Clusters**: Community detection count

### Signal Hubs
Top 5 most connected nodes:
- Highest degree (incoming + outgoing edges)
- Click to inspect
- Shows node type and degree count

## 🔬 Node Inspector

### Node Details
When you select a node, you'll see:
- **Name**: Symbol or file name
- **Type**: Node classification
- **Path**: Full file path
- **Summary**: AI-generated description
- **Metrics**: Degree, incoming, outgoing, PageRank score

### Relationships Panel
- **Outgoing**: What this node depends on
- **Incoming**: What depends on this node
- **Edge Types**: IMPORTS, CALLS, EXTENDS, IMPLEMENTS, etc.
- **Color-coded**: Each relationship type has a unique color

### Source Code Viewer
- **Context View**: Shows the node with surrounding code
- **Full File**: Click "Full File" to see the entire file
- **Syntax Highlighting**: Basic keyword detection
- **Line Numbers**: Easy reference
- **Hotspot Indicator**: Shows high-churn lines
- **VSCode Link**: Open in your editor

## 🔄 Real-Time Updates

### Live Graph Sync
- WebSocket connection to server
- Automatic updates when graph changes
- Visual notification on update
- Smooth data refresh
- Auto-reconnect on disconnect

### Update Notifications
Green banner appears when:
- New files are indexed
- Graph structure changes
- Analysis completes

## 🎯 Graph Interactions

### Node Selection
- **Click**: Select a node
- **Hover**: Preview connections
- **Neighbors**: Highlighted when node is selected
- **Zoom**: Automatic camera focus on selection

### Graph Controls
- **Zoom In**: `+` button or scroll up
- **Zoom Out**: `-` button or scroll down
- **Reset Sphere**: Return to default rotation
- **Reset Camera**: Return to default zoom

### Cluster Expansion
- Click cluster nodes to expand
- Shows detailed community structure
- Merges into main graph
- Preserves layout

## 🎨 Visual Legend

### Node Colors
Each node type has a distinct color:
- **Project**: Yellow (`#f5c542`)
- **File**: Cyan (`#4cc9f0`)
- **Class**: Orange (`#ff9f1c`)
- **Function**: Green (`#4ade80`)
- **Method**: Purple (`#a78bfa`)
- **Route**: Pink (`#fb7185`)
- **Test**: Magenta (`#f472b6`)

### Edge Colors
Relationship types are color-coded:
- **IMPORTS**: Sky blue
- **CALLS**: Green
- **EXTENDS**: Orange
- **IMPLEMENTS**: Teal
- **TESTS**: Magenta
- **UNRESOLVED**: Amber (warning)

## 📱 Responsive Design

### Desktop (> 1180px)
- Three-column layout
- Resizable panels (drag the separator)
- Full feature set

### Tablet (768px - 1180px)
- Two-column layout
- Floating right panel
- Touch-optimized controls

### Mobile (< 768px)
- Single-column stacked layout
- Simplified metrics
- Touch-friendly buttons (44x44px minimum)

## ♿ Accessibility

### Keyboard Navigation
- Full keyboard support
- Visible focus indicators
- Logical tab order
- Skip links for screen readers

### Visual Accessibility
- WCAG AA contrast ratios
- Reduced motion support
- High contrast mode support
- Scalable text (respects browser zoom)

### Screen Readers
- Semantic HTML structure
- ARIA labels on controls
- Descriptive button text
- Status announcements

## 🚀 Performance

### Optimizations
- **Lazy Loading**: Components load on demand
- **Memoization**: Expensive computations cached
- **Virtual Scrolling**: Large lists rendered efficiently
- **Hardware Acceleration**: GPU-accelerated animations

### Large Graphs
- **LOD Rendering**: Clusters for 100K+ nodes
- **Incremental Loading**: Load communities on demand
- **Efficient Layout**: ForceAtlas2 with Barnes-Hut optimization
- **WebGL Rendering**: Sigma.js uses WebGL for performance

## 🛠️ Advanced Features

### Panel Resizing
- Drag the vertical separators
- Resize left and right panels
- Sizes persist in localStorage
- Min/max width constraints

### 3D Sphere Rotation
- **Manual**: Shift+Drag or Alt+Drag
- **Automatic**: Depth-based positioning
- **Projection**: Orthographic projection with perspective scaling
- **Community Layout**: Nodes grouped by community

### Graph Layout
- **Community Detection**: Leiden algorithm
- **Importance Ranking**: PageRank scores
- **Force-Directed**: ForceAtlas2 for readability
- **3D Positioning**: Z-axis for depth

## 💡 Tips & Tricks

### Power User Tips
1. **Quick Search**: Press `Ctrl+K` from anywhere
2. **Clear Selection**: Press `Esc` to deselect
3. **Explore Hubs**: Click signal hubs to find central nodes
4. **Filter Noise**: Disable test/doc nodes for cleaner view
5. **Full Context**: Use "Full File" to see complete source

### Performance Tips
1. **Filter Types**: Hide unused node types
2. **Cluster View**: Use LOD for large graphs
3. **Selective Expansion**: Expand only needed communities
4. **Close Panels**: Hide inspector when not needed

### Workflow Tips
1. **Start with Search**: Find your entry point
2. **Follow Edges**: Click relationships to navigate
3. **Check Metrics**: Use degree to find important nodes
4. **Verify Source**: Always check the actual code
5. **Use Shortcuts**: Learn keyboard shortcuts for speed

## 🐛 Troubleshooting

### Graph Not Loading
- Check server is running (`npm run graph`)
- Verify port 3456 is available
- Check browser console for errors
- Try refreshing the page

### WebSocket Disconnected
- Server may have restarted
- Network connection lost
- Will auto-reconnect in 3 seconds
- Check server logs

### Performance Issues
- Reduce visible node types
- Use cluster view for large graphs
- Close unused browser tabs
- Update to latest browser version

### Visual Glitches
- Try resetting the camera
- Refresh the page
- Clear browser cache
- Check GPU acceleration is enabled

## 📚 Learn More

- [Architecture Documentation](../docs/ARCHITECTURE.md)
- [API Reference](../docs/API.md)
- [Export Format](../docs/EXPORT_FORMAT.md)
- [Graph Intelligence Strategy](../docs/GRAPH_INTELLIGENCE_STRATEGY.md)

## 🤝 Contributing

Found a bug or have a feature request?
1. Check existing issues
2. Create a new issue with details
3. Include screenshots if relevant
4. Describe expected vs actual behavior

---

**Enjoy exploring your codebase with code-brain!** 🧠✨
