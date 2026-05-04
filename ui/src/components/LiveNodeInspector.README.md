# Live Node Inspector - Design Documentation

## Overview

A modern, production-grade developer tool interface for inspecting code nodes, their relationships, and source code. Designed with clarity, hierarchy, and interaction depth in mind.

## Design Principles

### 1. Visual Hierarchy
- **Typography-driven hierarchy**: Uses font size, weight, and color to establish importance
- **Consistent spacing**: Built on an 8px grid system for visual rhythm
- **Subtle elevation**: Uses borders and background colors instead of heavy shadows

### 2. Clarity Over Decoration
- **Minimal color palette**: Dark theme with intentional accent colors (blue, purple, emerald, amber)
- **No heavy gradients**: Replaced with subtle background variations
- **Clear status indicators**: Icon + label combinations for immediate understanding

### 3. Interaction Depth
- **Progressive disclosure**: Collapsible sections to reduce cognitive load
- **Hover states**: Clear feedback on interactive elements
- **Contextual actions**: Quick actions appear where they're needed

## Component Structure

```
LiveNodeInspector
├── Header
│   ├── Breadcrumb navigation
│   ├── Pin button
│   └── Close button
├── Node Info Card
│   ├── Name (primary)
│   ├── Type badge
│   ├── Module path
│   ├── Status indicator
│   └── Quick actions
├── Relationships Section (collapsible)
│   ├── Search/filter
│   └── Interactive relationship list
└── Source Code Section (collapsible)
    ├── File path with line numbers
    ├── Code preview
    └── Action buttons
```

## Key Features

### Status Indicators
- **Resolved**: Green badge with checkmark icon
- **Unresolved**: Amber badge with alert icon
- Clear visual distinction without relying solely on color

### Relationship Types
Each relationship has:
- **Directional icon**: Arrow indicating flow direction
- **Color coding**: 
  - Blue: Calls (outgoing)
  - Purple: Called by (incoming)
  - Emerald: Imports (outgoing)
  - Amber: Imported by (incoming)
- **Type badge**: Method, function, class, or module

### Interactive Elements
- **Search**: Filter relationships in real-time
- **Pin**: Keep inspector open while navigating
- **Collapsible sections**: Show/hide relationships and source code
- **Quick actions**: Copy path, open in editor, view graph

## Usage

### Basic Example

```tsx
import LiveNodeInspector from './components/LiveNodeInspector';

function MyComponent() {
  const [selectedNode, setSelectedNode] = useState(null);

  return (
    <>
      {selectedNode && (
        <LiveNodeInspector
          node={{
            name: 'Array.from',
            type: 'method',
            module: 'unresolved:Array.from',
            status: 'unresolved',
            filePath: 'src/utils/array.ts',
            lineStart: 10,
            lineEnd: 20,
            totalLines: 150,
          }}
          relationships={[
            {
              direction: 'calls',
              target: 'map',
              type: 'method',
            },
          ]}
          sourceCode="const result = Array.from(items);"
          onClose={() => setSelectedNode(null)}
          onNavigate={(target) => console.log('Navigate to:', target)}
          onOpenFile={(path) => console.log('Open:', path)}
        />
      )}
    </>
  );
}
```

### Props Interface

```typescript
interface NodeData {
  name: string;              // Node name (e.g., "Array.from")
  type: string;              // Type (e.g., "method", "function", "class")
  module: string;            // Module path
  status: 'resolved' | 'unresolved';
  filePath: string;          // Full file path
  lineStart: number;         // Starting line number
  lineEnd: number;           // Ending line number
  totalLines: number;        // Total lines in file
}

interface Relationship {
  direction: 'calls' | 'calledBy' | 'imports' | 'importedBy';
  target: string;            // Target node name
  type: 'method' | 'function' | 'class' | 'module';
}

interface LiveNodeInspectorProps {
  node: NodeData;
  relationships: Relationship[];
  sourceCode: string;
  onClose: () => void;
  onNavigate?: (target: string) => void;
  onOpenFile?: (path: string) => void;
}
```

## Design Decisions

### Color Palette
- **Background**: `#0d1117` (GitHub dark theme)
- **Borders**: `gray-800` for subtle separation
- **Text**: 
  - Primary: `gray-100`
  - Secondary: `gray-400`
  - Tertiary: `gray-500`
- **Accents**:
  - Blue: Actions and calls
  - Purple: Incoming relationships
  - Emerald: Success states and imports
  - Amber: Warnings and imported-by

### Typography Scale
- **Title**: 2xl (24px) - Node name
- **Body**: sm (14px) - Most content
- **Labels**: xs (12px) - Badges and metadata
- **Code**: sm mono (14px) - Source code

### Spacing System
- **Base unit**: 8px
- **Component padding**: 24px (6 units)
- **Element gaps**: 8px, 12px, 16px
- **Section spacing**: 16px between major sections

### Interaction States
- **Hover**: Subtle background change (`bg-gray-800/50`)
- **Active**: Stronger background (`bg-gray-700`)
- **Focus**: Blue ring (`ring-blue-500/50`)
- **Disabled**: Reduced opacity (`opacity-50`)

## Accessibility

- **Keyboard navigation**: All interactive elements are keyboard accessible
- **Focus indicators**: Clear focus rings on all focusable elements
- **ARIA labels**: Buttons have descriptive labels
- **Color contrast**: Meets WCAG AA standards
- **Screen reader support**: Semantic HTML structure

## Performance Considerations

- **Lazy rendering**: Collapsed sections don't render content
- **Search optimization**: Filters relationships client-side
- **Minimal re-renders**: Uses React best practices
- **Smooth animations**: CSS transitions for 60fps performance

## Future Enhancements

### Planned Features
1. **Mini dependency graph**: Visual representation of relationships
2. **Performance metrics**: Show usage statistics and performance data
3. **Compare mode**: Side-by-side comparison of multiple nodes
4. **History**: Track recently inspected nodes
5. **Syntax highlighting**: Full code highlighting in source preview
6. **Export**: Export node data as JSON or markdown

### Advanced Interactions
1. **Drag to reorder**: Customize relationship display order
2. **Inline editing**: Edit node metadata directly
3. **Annotations**: Add notes to specific nodes
4. **Bookmarks**: Save frequently accessed nodes

## Integration Guide

### With Existing Codebase

1. **Install dependencies**:
```bash
npm install lucide-react
```

2. **Ensure Tailwind CSS is configured** with these colors:
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        gray: {
          950: '#0a0e14',
        },
      },
    },
  },
};
```

3. **Import and use**:
```tsx
import LiveNodeInspector from './components/LiveNodeInspector';
```

### Customization

The component uses Tailwind classes, making it easy to customize:

- **Colors**: Modify color classes (e.g., `text-blue-400` → `text-indigo-400`)
- **Spacing**: Adjust padding/margin values
- **Typography**: Change font sizes and weights
- **Borders**: Modify border radius and width

## Comparison: Before vs After

### Before
- Heavy gradients and glows
- Unclear hierarchy
- Vague status indicators ("unresolved" text)
- Cluttered layout
- Limited interactivity

### After
- Clean, minimal design with subtle elevation
- Clear typography-driven hierarchy
- Explicit status badges with icons
- Organized, scannable layout
- Rich interactions (search, collapse, pin)
- Professional, trustworthy aesthetic

## Inspiration

Design influenced by:
- **Linear**: Clean hierarchy, subtle interactions
- **Vercel**: Minimal aesthetic, clear typography
- **Raycast**: Keyboard-first, progressive disclosure
- **Chrome DevTools**: Information density, technical precision

## License

Part of the CodeBrain project.
