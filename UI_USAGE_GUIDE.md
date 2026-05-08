# UI Usage Guide

**Quick reference for using the code-brain graph UI**

---

## 🎯 Node Selection & Relations

### Click a Node
When you click on any node:
- **Selected node** → Becomes 30% larger and bright
- **Related nodes** → Stay visible and slightly larger (5%)
- **Unrelated nodes** → Become 85% transparent (almost invisible)
- **Related edges** → Shown clearly with increased thickness
- **Unrelated edges** → Hidden completely

**Result:** You see ONLY the selected node and its direct connections.

### Clear Selection
- Click on empty space (background)
- All nodes return to normal visibility
- All edges return to normal

---

## 🔍 Navigation

### Pan (Move Around)
- **Click and drag** on empty space
- Graph moves smoothly without flashing

### Zoom
- **Zoom in:** Click the `+` button or scroll up
- **Zoom out:** Click the `-` button or scroll down
- No screen refresh, instant response

### Rotate Sphere (3D View)
- **Hold Shift + drag** to rotate the graph in 3D
- **Hold Alt + drag** alternative rotation
- **Middle mouse button + drag** also works
- Smooth rotation without lag

### Reset View
- Click the **maximize** button (⛶) to reset sphere rotation
- Camera returns to default position

---

## 🎨 View Modes

Switch between different visualization modes using the top bar:

### By Type (Default)
- Nodes colored by their type
- Files, classes, functions, etc. have different colors
- Best for understanding code structure

### ⚡ Heatmap (Importance)
- Nodes colored by importance score
- **Green** → Low importance
- **Amber** → Medium importance  
- **Red** → High importance
- Best for finding critical code

### 🪦 Dead (Dead Code)
- **Red nodes** → Dead code (unused)
- **Gray nodes** → Active code
- Best for cleanup tasks

### 🌉 Bridges (Critical Points)
- **Amber nodes** → Bridge nodes (critical architectural points)
- **Gray nodes** → Regular nodes
- Best for identifying refactoring risks

---

## 🔒 Camera Lock

### Lock Camera
- Click the **pin** button (📍)
- Prevents auto-focus when selecting nodes
- Useful when exploring multiple nodes

### Unlock Camera
- Click the **locate** button (🎯)
- Allows auto-focus on selected nodes
- Camera moves to selected node automatically

---

## 🔎 Search

### Search Nodes
1. Type in the search box (top left)
2. Matching nodes stay bright
3. Non-matching nodes become dim
4. Real-time filtering as you type

### Clear Search
- Clear the search box
- All nodes return to normal

---

## 📊 Node Types & Colors

| Type | Color | Icon | Description |
|------|-------|------|-------------|
| **Project** | Yellow | ⚫ | Root project node |
| **File** | Cyan | 📄 | Source code files |
| **Module** | Light Blue | 📦 | Modules/packages |
| **Class** | Orange | ▢ | Classes |
| **Function** | Green | { } | Functions |
| **Method** | Purple | { } | Class methods |
| **Route** | Pink | 🛣️ | API routes |
| **Config** | Amber | ⚙️ | Configuration |
| **Test** | Pink | ✓ | Test files |
| **Interface** | Purple | ◇ | Interfaces |
| **Type** | Sky Blue | T | Type definitions |

---

## 🔗 Edge Types & Colors

| Type | Color | Description |
|------|-------|-------------|
| **IMPORTS** | Sky Blue | Import statements |
| **EXPORTS** | Pink | Export statements |
| **CALLS** | Green | Function calls |
| **CALLS_UNRESOLVED** | Amber | Unresolved calls |
| **OWNS** | Gray | Ownership |
| **DEFINES** | Blue | Definitions |
| **USES** | Purple | Usage |
| **DEPENDS_ON** | Red | Dependencies |
| **TESTS** | Pink | Test relationships |
| **IMPLEMENTS** | Teal | Interface implementation |
| **EXTENDS** | Orange | Class extension |

---

## ⌨️ Keyboard Shortcuts

### Navigation
- **Shift + Drag** → Rotate sphere
- **Alt + Drag** → Rotate sphere (alternative)
- **Scroll** → Zoom in/out

### Selection
- **Click node** → Select and focus
- **Click background** → Clear selection

### View
- **Escape** → Clear selection
- **Space** → Reset camera (if implemented)

---

## 💡 Tips & Tricks

### Finding Important Code
1. Switch to **⚡ Heatmap** mode
2. Look for **red nodes** (high importance)
3. Click to see their connections

### Finding Dead Code
1. Switch to **🪦 Dead** mode
2. Look for **red nodes** (dead code)
3. Click to see details

### Understanding Dependencies
1. Click on a node
2. See all connected nodes (dependencies)
3. Related edges show the relationship type

### Exploring Large Graphs
1. Use **search** to find specific nodes
2. Click to focus on that node
3. Use **camera lock** to prevent auto-focus
4. Manually explore related nodes

### Performance Tips
- Use **zoom** instead of panning for large distances
- Use **search** to quickly find nodes
- Use **view modes** to filter by importance
- **Lock camera** when exploring multiple nodes

---

## 🐛 Troubleshooting

### Graph is Flashing
- **Fixed!** The UI now uses batched rendering
- Should be smooth and flicker-free

### Zoom Causes Refresh
- **Fixed!** Zoom no longer recalculates layout
- Should be instant and smooth

### Can't See Node Relations
- **Fixed!** Unrelated nodes are now 85% transparent
- Related nodes and edges are clearly visible

### Graph is Laggy
- Try reducing the number of visible nodes with search
- Use view modes to filter nodes
- Close other browser tabs

### Can't Find a Node
- Use the search box (top left)
- Type part of the node name
- Matching nodes will stay bright

---

## 🎓 Best Practices

### Code Review
1. Search for the file/function you're reviewing
2. Click to see all dependencies
3. Check incoming and outgoing connections
4. Use **⚡ Heatmap** to see importance

### Refactoring
1. Click on the node you want to refactor
2. See all connected nodes (impact)
3. Check for **🌉 Bridge** nodes (critical points)
4. Plan refactoring to minimize impact

### Architecture Analysis
1. Use **By Type** mode to see structure
2. Look for clusters (modules/packages)
3. Check for circular dependencies
4. Identify architectural layers

### Dead Code Cleanup
1. Switch to **🪦 Dead** mode
2. Find red nodes (dead code)
3. Click to see details
4. Verify before deleting

---

## 📈 Understanding the Graph

### Node Size
- **Larger nodes** → More connections or higher importance
- **Smaller nodes** → Fewer connections or lower importance

### Node Position
- **Clustered nodes** → Related code (same module/package)
- **Isolated nodes** → Independent code
- **Central nodes** → Hub nodes (many connections)

### Edge Thickness
- **Thicker edges** → Stronger relationships
- **Thinner edges** → Weaker relationships

### Edge Direction
- **Arrow points to** → Dependency direction
- **From A to B** → A depends on B

---

## 🚀 Quick Start

1. **Open the UI** → `http://localhost:3000`
2. **Pan around** → Click and drag
3. **Zoom** → Scroll or use +/- buttons
4. **Click a node** → See its connections
5. **Search** → Find specific nodes
6. **Switch view modes** → Explore different perspectives

---

**Enjoy exploring your codebase!** 🎉

