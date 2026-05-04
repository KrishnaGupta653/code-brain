import React, { useState } from 'react';
import LiveNodeInspector from './LiveNodeInspector';

/**
 * Demo component showing how to use the LiveNodeInspector
 */
export const LiveNodeInspectorDemo: React.FC = () => {
    const [isOpen, setIsOpen] = useState(true);

    // Sample data matching the original screenshot
    const sampleNode = {
        name: 'Array.from',
        type: 'method',
        module: 'unresolved:Array.from',
        status: 'unresolved' as const,
        filePath: 'packages/client-sdk/src/services/api.ts',
        lineStart: 67,
        lineEnd: 73,
        totalLines: 41,
    };

    const sampleRelationships = [
        {
            direction: 'calls' as const,
            target: 'publish',
            type: 'method' as const,
        },
        {
            direction: 'calledBy' as const,
            target: 'EventEmitter.emit',
            type: 'method' as const,
        },
        {
            direction: 'imports' as const,
            target: 'lodash.map',
            type: 'function' as const,
        },
        {
            direction: 'calls' as const,
            target: 'validateInput',
            type: 'function' as const,
        },
        {
            direction: 'importedBy' as const,
            target: 'UserService',
            type: 'class' as const,
        },
    ];

    const sampleSourceCode = `export function transformData(items: any[]) {
  const result = Array.from(items, (item) => {
    return {
      id: item.id,
      name: item.name,
      timestamp: Date.now(),
    };
  });
  
  return result;
}`;

    return (
        <div className="min-h-screen bg-gray-950 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-100 mb-4">Live Node Inspector Demo</h1>
                <p className="text-gray-400 mb-8">
                    A modern, production-grade developer tool interface for inspecting code nodes and their relationships.
                </p>

                <button
                    onClick={() => setIsOpen(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                    Open Inspector
                </button>

                {isOpen && (
                    <LiveNodeInspector
                        node={sampleNode}
                        relationships={sampleRelationships}
                        sourceCode={sampleSourceCode}
                        onClose={() => setIsOpen(false)}
                        onNavigate={(target) => {
                            console.log('Navigate to:', target);
                            alert(`Navigate to: ${target}`);
                        }}
                        onOpenFile={(path) => {
                            console.log('Open file:', path);
                            alert(`Open file: ${path}`);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default LiveNodeInspectorDemo;
