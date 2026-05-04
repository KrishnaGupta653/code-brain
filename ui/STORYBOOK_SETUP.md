# Storybook Setup (Optional)

The LiveNodeInspector component can be used with Storybook for isolated component development and documentation. However, Storybook is **not required** for the component to work.

## Why Storybook?

Storybook provides:
- Isolated component development
- Interactive documentation
- Visual testing
- Multiple scenario examples
- Easy sharing with team members

## Installation

If you want to use Storybook with the LiveNodeInspector:

### 1. Install Storybook

```bash
npx storybook@latest init
```

### 2. Install Required Dependencies

```bash
npm install --save-dev @storybook/react @storybook/addon-essentials
```

### 3. Create Stories File

Create `ui/src/components/LiveNodeInspector.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import LiveNodeInspector from './LiveNodeInspector';

const meta: Meta<typeof LiveNodeInspector> = {
  title: 'Components/LiveNodeInspector',
  component: LiveNodeInspector,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0a0e14' },
      ],
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof LiveNodeInspector>;

const sampleSourceCode = \`export function transformData(items: any[]) {
  const result = Array.from(items, (item) => {
    return {
      id: item.id,
      name: item.name,
      timestamp: Date.now(),
    };
  });
  
  return result;
}\`;

export const UnresolvedMethod: Story = {
  args: {
    node: {
      name: 'Array.from',
      type: 'method',
      module: 'unresolved:Array.from',
      status: 'unresolved',
      filePath: 'packages/client-sdk/src/services/api.ts',
      lineStart: 67,
      lineEnd: 73,
      totalLines: 41,
    },
    relationships: [
      {
        direction: 'calls',
        target: 'publish',
        type: 'method',
      },
      {
        direction: 'calledBy',
        target: 'EventEmitter.emit',
        type: 'method',
      },
    ],
    sourceCode: sampleSourceCode,
    onClose: () => console.log('Close clicked'),
    onNavigate: (target: string) => console.log('Navigate to:', target),
    onOpenFile: (path: string) => console.log('Open file:', path),
  },
};

export const ResolvedFunction: Story = {
  args: {
    node: {
      name: 'validateInput',
      type: 'function',
      module: 'utils/validators',
      status: 'resolved',
      filePath: 'src/utils/validators.ts',
      lineStart: 15,
      lineEnd: 28,
      totalLines: 150,
    },
    relationships: [
      {
        direction: 'calledBy',
        target: 'DataProcessor.process',
        type: 'method',
      },
    ],
    sourceCode: \`export function validateInput(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  return isValidEmail(data.email) && isValidPhone(data.phone);
}\`,
    onClose: () => console.log('Close clicked'),
    onNavigate: (target: string) => console.log('Navigate to:', target),
    onOpenFile: (path: string) => console.log('Open file:', path),
  },
};
```

### 4. Run Storybook

```bash
npm run storybook
```

## Without Storybook

You can still develop and test the component without Storybook by:

1. **Using the Demo Component**: `LiveNodeInspectorDemo.tsx` provides a working example
2. **Direct Integration**: Integrate directly into your app and test there
3. **Unit Tests**: Write tests using React Testing Library

## Recommendation

- **Small teams / Quick projects**: Skip Storybook, use the demo component
- **Large teams / Design systems**: Install Storybook for better collaboration
- **Component libraries**: Storybook is highly recommended

The LiveNodeInspector works perfectly fine without Storybook!
