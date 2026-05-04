# Live Node Inspector - Quick Reference Card

## 🚀 Installation

```bash
npm install lucide-react
```

## 📦 Import

```tsx
import LiveNodeInspector from './components/LiveNodeInspector';
import type { NodeData, Relationship } from './components/LiveNodeInspector.types';
```

## 🎯 Basic Usage

```tsx
<LiveNodeInspector
  node={{
    name: 'functionName',
    type: 'function',
    module: 'utils/helpers',
    status: 'resolved',
    filePath: 'src/utils/helpers.ts',
    lineStart: 10,
    lineEnd: 20,
    totalLines: 100,
  }}
  relationships={[
    { direction: 'calls', target: 'helper', type: 'function' },
  ]}
  sourceCode="function example() { }"
  onClose={() => setOpen(false)}
/>
```

## 📋 Props Reference

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `node` | `NodeData` | ✅ | Node information |
| `relationships` | `Relationship[]` | ✅ | Node relationships |
| `sourceCode` | `string` | ✅ | Source code to display |
| `onClose` | `() => void` | ✅ | Close handler |
| `onNavigate` | `(target: string) => void` | ❌ | Navigate to another node |
| `onOpenFile` | `(path: string) => void` | ❌ | Open file in editor |

## 🏷️ Node Types

```typescript
type NodeType = 
  | 'method'
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'module'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'namespace';
```

## 🔗 Relationship Directions

```typescript
type RelationshipDirection = 
  | 'calls'        // → Outgoing call
  | 'calledBy'     // ← Incoming call
  | 'imports'      // → Outgoing import
  | 'importedBy'   // ← Incoming import
  | 'extends'      // → Inheritance
  | 'extendedBy'   // ← Inherited by
  | 'implements'   // → Implementation
  | 'implementedBy'; // ← Implemented by
```

## 🎨 Color Coding

| Color | Usage | Hex |
|-------|-------|-----|
| Blue | Actions, outgoing calls | `#3b82f6` |
| Purple | Incoming relationships | `#8b5cf6` |
| Emerald | Success, imports | `#10b981` |
| Amber | Warnings, unresolved | `#f59e0b` |

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Close inspector |
| `Tab` | Navigate between elements |
| `Enter` | Activate focused element |
| `Cmd/Ctrl + F` | Focus search (when implemented) |

## 🔧 Common Patterns

### With State Management

```tsx
const [selectedNode, setSelectedNode] = useState(null);

// Open inspector
setSelectedNode(nodeData);

// Close inspector
setSelectedNode(null);
```

### With Navigation

```tsx
const handleNavigate = (target: string) => {
  const nextNode = findNodeByName(target);
  setSelectedNode(nextNode);
};
```

### With File Opening

```tsx
const handleOpenFile = (path: string) => {
  window.open(`vscode://file/${path}`);
};
```

## 🎯 Data Transformation

### From Graph Node

```tsx
const inspectorData = {
  name: graphNode.name,
  type: graphNode.type,
  module: graphNode.module,
  status: graphNode.resolved ? 'resolved' : 'unresolved',
  filePath: graphNode.location.file,
  lineStart: graphNode.location.start,
  lineEnd: graphNode.location.end,
  totalLines: graphNode.location.totalLines,
};
```

### From API Response

```tsx
const inspectorData = {
  name: response.data.name,
  type: response.data.type,
  module: response.data.module,
  status: response.data.status,
  filePath: response.data.file_path,
  lineStart: response.data.line_start,
  lineEnd: response.data.line_end,
  totalLines: response.data.total_lines,
};
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Icons not showing | Install `lucide-react` |
| Styles not applied | Check Tailwind config |
| TypeScript errors | Import types from `.types.ts` |
| Modal not appearing | Check z-index conflicts |
| Slow performance | Enable lazy rendering |

## 📊 Type Definitions

### NodeData

```typescript
interface NodeData {
  name: string;
  type: NodeType;
  module: string;
  status: 'resolved' | 'unresolved';
  filePath: string;
  lineStart: number;
  lineEnd: number;
  totalLines: number;
}
```

### Relationship

```typescript
interface Relationship {
  direction: RelationshipDirection;
  target: string;
  type: NodeType;
}
```

## 🎨 Customization

### Custom Theme

```tsx
// Wrap with custom theme
<div className="custom-theme">
  <LiveNodeInspector {...props} />
</div>
```

### Custom Actions

```tsx
<LiveNodeInspector
  {...props}
  onOpenFile={(path) => {
    // Custom logic
    myCustomFileOpener(path);
  }}
/>
```

## 📱 Responsive Breakpoints

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Desktop | 1024px+ | Full modal |
| Tablet | 768px - 1023px | Adjusted modal |
| Mobile | < 768px | Full screen |

## ✅ Checklist

### Before Using
- [ ] Install `lucide-react`
- [ ] Configure Tailwind CSS
- [ ] Import component
- [ ] Prepare data transformation

### Integration
- [ ] Add to graph visualization
- [ ] Add to search results
- [ ] Add keyboard shortcuts
- [ ] Test with real data

### Testing
- [ ] Test all node types
- [ ] Test all relationship types
- [ ] Test edge cases
- [ ] Test accessibility

## 🔗 Quick Links

- **Full Documentation**: `LiveNodeInspector.README.md`
- **Integration Guide**: `INTEGRATION_GUIDE.md`
- **Design Documentation**: `LIVE_NODE_INSPECTOR_REDESIGN.md`
- **Implementation Checklist**: `IMPLEMENTATION_CHECKLIST.md`
- **Visual Comparison**: `VISUAL_COMPARISON.md`

## 💡 Tips

1. **Start Simple**: Use the demo component first
2. **Test Early**: Test with real data as soon as possible
3. **Iterate**: Gather feedback and improve
4. **Document**: Keep your integration documented
5. **Monitor**: Track usage and performance

## 🆘 Getting Help

1. Check the README.md for detailed docs
2. Review Storybook stories for examples
3. See TypeScript types for API reference
4. Read integration guide for patterns
5. Check design doc for principles

## 📝 Example: Complete Integration

```tsx
import { useState } from 'react';
import LiveNodeInspector from './components/LiveNodeInspector';

function MyApp() {
  const [selectedNode, setSelectedNode] = useState(null);

  const handleNodeClick = (graphNode) => {
    setSelectedNode({
      node: {
        name: graphNode.name,
        type: graphNode.type,
        module: graphNode.module,
        status: graphNode.resolved ? 'resolved' : 'unresolved',
        filePath: graphNode.location.file,
        lineStart: graphNode.location.start,
        lineEnd: graphNode.location.end,
        totalLines: graphNode.location.totalLines,
      },
      relationships: graphNode.edges.map(edge => ({
        direction: edge.type,
        target: edge.target.name,
        type: edge.target.type,
      })),
      sourceCode: graphNode.sourceCode,
    });
  };

  return (
    <>
      <Graph onNodeClick={handleNodeClick} />
      
      {selectedNode && (
        <LiveNodeInspector
          {...selectedNode}
          onClose={() => setSelectedNode(null)}
          onNavigate={(target) => {
            const nextNode = findNodeByName(target);
            handleNodeClick(nextNode);
          }}
          onOpenFile={(path) => {
            window.open(`vscode://file/${path}`);
          }}
        />
      )}
    </>
  );
}
```

---

**Keep this card handy for quick reference!** 📌

For detailed information, see the full documentation files.
