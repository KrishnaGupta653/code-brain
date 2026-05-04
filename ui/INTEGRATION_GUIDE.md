# Live Node Inspector - Integration Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install lucide-react
# or
yarn add lucide-react
```

### 2. Import the Component

```tsx
import LiveNodeInspector from './components/LiveNodeInspector';
```

### 3. Basic Usage

```tsx
import { useState } from 'react';
import LiveNodeInspector from './components/LiveNodeInspector';

function MyApp() {
  const [selectedNode, setSelectedNode] = useState(null);

  return (
    <>
      {/* Your existing UI */}
      <button onClick={() => setSelectedNode(someNode)}>
        Inspect Node
      </button>

      {/* Node Inspector Modal */}
      {selectedNode && (
        <LiveNodeInspector
          node={selectedNode}
          relationships={selectedNode.relationships}
          sourceCode={selectedNode.sourceCode}
          onClose={() => setSelectedNode(null)}
          onNavigate={(target) => {
            // Navigate to another node
            const nextNode = findNodeByName(target);
            setSelectedNode(nextNode);
          }}
          onOpenFile={(path) => {
            // Open file in editor
            window.open(`vscode://file/${path}`);
          }}
        />
      )}
    </>
  );
}
```

## Integration with Existing CodeBrain Components

### Connecting to Graph Visualization

```tsx
// In your GraphVisualization component
import LiveNodeInspector from './components/LiveNodeInspector';

function GraphVisualization() {
  const [selectedNode, setSelectedNode] = useState(null);

  const handleNodeClick = (node) => {
    // Transform your graph node data to inspector format
    const inspectorNode = {
      name: node.name,
      type: node.type,
      module: node.module,
      status: node.resolved ? 'resolved' : 'unresolved',
      filePath: node.location?.file || '',
      lineStart: node.location?.start || 0,
      lineEnd: node.location?.end || 0,
      totalLines: node.location?.totalLines || 0,
    };

    setSelectedNode(inspectorNode);
  };

  return (
    <>
      <Graph onNodeClick={handleNodeClick} />
      
      {selectedNode && (
        <LiveNodeInspector
          node={selectedNode}
          relationships={getRelationships(selectedNode)}
          sourceCode={getSourceCode(selectedNode)}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
}
```

### Connecting to Search Results

```tsx
// In your SearchResults component
function SearchResults({ results }) {
  const [inspectedNode, setInspectedNode] = useState(null);

  return (
    <>
      <div className="search-results">
        {results.map(result => (
          <div key={result.id} className="result-item">
            <span>{result.name}</span>
            <button onClick={() => setInspectedNode(result)}>
              Inspect
            </button>
          </div>
        ))}
      </div>

      {inspectedNode && (
        <LiveNodeInspector
          node={transformToInspectorFormat(inspectedNode)}
          relationships={inspectedNode.relationships}
          sourceCode={inspectedNode.sourceCode}
          onClose={() => setInspectedNode(null)}
        />
      )}
    </>
  );
}
```

## Data Transformation

### From CodeBrain Graph Node

```tsx
function transformGraphNodeToInspector(graphNode) {
  return {
    node: {
      name: graphNode.name,
      type: graphNode.type,
      module: graphNode.module || 'unknown',
      status: graphNode.resolved ? 'resolved' : 'unresolved',
      filePath: graphNode.location?.file || '',
      lineStart: graphNode.location?.start || 0,
      lineEnd: graphNode.location?.end || 0,
      totalLines: graphNode.location?.totalLines || 0,
    },
    relationships: graphNode.edges.map(edge => ({
      direction: edge.type, // 'calls', 'imports', etc.
      target: edge.target.name,
      type: edge.target.type,
    })),
    sourceCode: graphNode.sourceCode || '',
  };
}
```

### From AST Node

```tsx
function transformASTNodeToInspector(astNode, sourceFile) {
  return {
    node: {
      name: astNode.name,
      type: astNode.kind, // 'FunctionDeclaration', etc.
      module: sourceFile.fileName,
      status: 'resolved',
      filePath: sourceFile.fileName,
      lineStart: astNode.getStart(),
      lineEnd: astNode.getEnd(),
      totalLines: sourceFile.getLineAndCharacterOfPosition(sourceFile.end).line,
    },
    relationships: extractRelationships(astNode),
    sourceCode: astNode.getText(),
  };
}
```

## API Integration

### Fetching Node Data

```tsx
async function fetchNodeData(nodeId: string) {
  const response = await fetch(`/api/nodes/${nodeId}`);
  const data = await response.json();
  
  return {
    node: {
      name: data.name,
      type: data.type,
      module: data.module,
      status: data.status,
      filePath: data.file_path,
      lineStart: data.line_start,
      lineEnd: data.line_end,
      totalLines: data.total_lines,
    },
    relationships: data.relationships.map(rel => ({
      direction: rel.direction,
      target: rel.target_name,
      type: rel.target_type,
    })),
    sourceCode: data.source_code,
  };
}

// Usage
function InspectorWithAPI({ nodeId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNodeData(nodeId).then(data => {
      setData(data);
      setLoading(false);
    });
  }, [nodeId]);

  if (loading) return <div>Loading...</div>;
  if (!data) return null;

  return (
    <LiveNodeInspector
      {...data}
      onClose={() => {/* handle close */}}
    />
  );
}
```

## Keyboard Shortcuts

### Adding Global Shortcuts

```tsx
import { useEffect } from 'react';

function useInspectorShortcuts(onOpen) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + I to open inspector
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        onOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpen]);
}

// Usage
function App() {
  const [inspectorOpen, setInspectorOpen] = useState(false);
  
  useInspectorShortcuts(() => setInspectorOpen(true));
  
  // ... rest of component
}
```

## State Management

### With Redux

```tsx
// actions.ts
export const openInspector = (node) => ({
  type: 'OPEN_INSPECTOR',
  payload: node,
});

export const closeInspector = () => ({
  type: 'CLOSE_INSPECTOR',
});

// reducer.ts
const initialState = {
  selectedNode: null,
  isOpen: false,
};

export function inspectorReducer(state = initialState, action) {
  switch (action.type) {
    case 'OPEN_INSPECTOR':
      return {
        selectedNode: action.payload,
        isOpen: true,
      };
    case 'CLOSE_INSPECTOR':
      return {
        selectedNode: null,
        isOpen: false,
      };
    default:
      return state;
  }
}

// Component
function InspectorContainer() {
  const { selectedNode, isOpen } = useSelector(state => state.inspector);
  const dispatch = useDispatch();

  if (!isOpen || !selectedNode) return null;

  return (
    <LiveNodeInspector
      node={selectedNode}
      relationships={selectedNode.relationships}
      sourceCode={selectedNode.sourceCode}
      onClose={() => dispatch(closeInspector())}
    />
  );
}
```

### With Context API

```tsx
// InspectorContext.tsx
const InspectorContext = createContext(null);

export function InspectorProvider({ children }) {
  const [selectedNode, setSelectedNode] = useState(null);

  const openInspector = (node) => setSelectedNode(node);
  const closeInspector = () => setSelectedNode(null);

  return (
    <InspectorContext.Provider value={{ selectedNode, openInspector, closeInspector }}>
      {children}
      {selectedNode && (
        <LiveNodeInspector
          node={selectedNode}
          relationships={selectedNode.relationships}
          sourceCode={selectedNode.sourceCode}
          onClose={closeInspector}
        />
      )}
    </InspectorContext.Provider>
  );
}

export const useInspector = () => useContext(InspectorContext);

// Usage
function MyComponent() {
  const { openInspector } = useInspector();
  
  return (
    <button onClick={() => openInspector(someNode)}>
      Inspect
    </button>
  );
}
```

## Customization

### Custom Theme

```tsx
// Create a custom theme wrapper
function ThemedInspector(props) {
  return (
    <div className="custom-theme">
      <LiveNodeInspector {...props} />
    </div>
  );
}

// Custom CSS
.custom-theme {
  --inspector-bg: #1a1a1a;
  --inspector-border: #333;
  --inspector-text: #fff;
}
```

### Custom Actions

```tsx
function InspectorWithCustomActions(props) {
  const handleCustomAction = () => {
    // Your custom logic
    console.log('Custom action triggered');
  };

  return (
    <LiveNodeInspector
      {...props}
      onOpenFile={(path) => {
        // Custom file opening logic
        window.electronAPI.openFile(path);
      }}
      onNavigate={(target) => {
        // Custom navigation logic
        router.push(`/node/${target}`);
      }}
    />
  );
}
```

## Testing

### Unit Tests

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import LiveNodeInspector from './LiveNodeInspector';

describe('LiveNodeInspector', () => {
  const mockNode = {
    name: 'testFunction',
    type: 'function',
    module: 'test/module',
    status: 'resolved',
    filePath: 'src/test.ts',
    lineStart: 1,
    lineEnd: 10,
    totalLines: 100,
  };

  const mockRelationships = [
    { direction: 'calls', target: 'helper', type: 'function' },
  ];

  it('renders node information', () => {
    render(
      <LiveNodeInspector
        node={mockNode}
        relationships={mockRelationships}
        sourceCode="function test() {}"
        onClose={() => {}}
      />
    );

    expect(screen.getByText('testFunction')).toBeInTheDocument();
    expect(screen.getByText('function')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <LiveNodeInspector
        node={mockNode}
        relationships={mockRelationships}
        sourceCode="function test() {}"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

## Performance Optimization

### Lazy Loading

```tsx
import { lazy, Suspense } from 'react';

const LiveNodeInspector = lazy(() => import('./components/LiveNodeInspector'));

function App() {
  return (
    <Suspense fallback={<div>Loading inspector...</div>}>
      <LiveNodeInspector {...props} />
    </Suspense>
  );
}
```

### Memoization

```tsx
import { memo } from 'react';

const MemoizedInspector = memo(LiveNodeInspector, (prevProps, nextProps) => {
  return (
    prevProps.node.name === nextProps.node.name &&
    prevProps.relationships.length === nextProps.relationships.length
  );
});
```

## Troubleshooting

### Common Issues

1. **Icons not showing**: Make sure `lucide-react` is installed
2. **Styles not applied**: Ensure Tailwind CSS is configured
3. **Modal not appearing**: Check z-index conflicts
4. **Slow performance**: Use memoization and lazy loading

### Debug Mode

```tsx
function DebugInspector(props) {
  useEffect(() => {
    console.log('Inspector props:', props);
  }, [props]);

  return <LiveNodeInspector {...props} />;
}
```

## Next Steps

1. **Integrate with your graph visualization**
2. **Connect to your API endpoints**
3. **Add custom actions and shortcuts**
4. **Customize theme to match your brand**
5. **Add analytics tracking**
6. **Implement syntax highlighting**

## Support

For issues or questions:
- Check the README.md for detailed documentation
- Review the Storybook stories for examples
- See the TypeScript types for API reference
