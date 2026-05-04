import React, { useState } from 'react';
import { X, ChevronRight, ExternalLink, Code2, GitBranch, AlertCircle, CheckCircle, ArrowRight, ArrowLeft, Search, Pin, Copy } from 'lucide-react';

interface NodeData {
    name: string;
    type: string;
    module: string;
    status: 'resolved' | 'unresolved';
    filePath: string;
    lineStart: number;
    lineEnd: number;
    totalLines: number;
}

interface Relationship {
    direction: 'calls' | 'calledBy' | 'imports' | 'importedBy';
    target: string;
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

export const LiveNodeInspector: React.FC<LiveNodeInspectorProps> = ({
    node,
    relationships,
    sourceCode,
    onClose,
    onNavigate,
    onOpenFile,
}) => {
    const [expandedSection, setExpandedSection] = useState<'relationships' | 'source' | null>('relationships');
    const [searchQuery, setSearchQuery] = useState('');
    const [isPinned, setIsPinned] = useState(false);

    const filteredRelationships = relationships.filter(rel =>
        rel.target.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getRelationshipIcon = (direction: Relationship['direction']) => {
        switch (direction) {
            case 'calls':
                return <ArrowRight className="w-4 h-4 text-blue-400" />;
            case 'calledBy':
                return <ArrowLeft className="w-4 h-4 text-purple-400" />;
            case 'imports':
                return <ArrowRight className="w-4 h-4 text-emerald-400" />;
            case 'importedBy':
                return <ArrowLeft className="w-4 h-4 text-amber-400" />;
        }
    };

    const getRelationshipLabel = (direction: Relationship['direction']) => {
        switch (direction) {
            case 'calls':
                return 'Calls';
            case 'calledBy':
                return 'Called by';
            case 'imports':
                return 'Imports';
            case 'importedBy':
                return 'Imported by';
        }
    };

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            method: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
            function: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
            class: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
            module: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
        };
        return colors[type] || 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-hidden">
            <div className="bg-[#0d1117] border border-gray-800 rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
                {/* Header - Fixed */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <div className="flex items-center gap-3 min-w-0">
                        <Code2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
                            <span className="flex-shrink-0">Node Inspector</span>
                            <ChevronRight className="w-4 h-4 flex-shrink-0" />
                            <span className="text-gray-300 truncate">{node.module}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={() => setIsPinned(!isPinned)}
                            className={`p-2 rounded-md transition-colors ${isPinned ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-800 text-gray-400'
                                }`}
                            title="Pin inspector"
                        >
                            <Pin className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-800 rounded-md transition-colors text-gray-400 hover:text-gray-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {/* Node Info Card */}
                    <div className="p-6 border-b border-gray-800">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                                <h2 className="text-2xl font-semibold text-gray-100 mb-2">{node.name}</h2>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getTypeColor(node.type)}`}>
                                        {node.type}
                                    </span>
                                    <span className="text-sm text-gray-500">in</span>
                                    <span className="text-sm text-gray-400 font-mono">{node.module}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {node.status === 'resolved' ? (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                                        <span className="text-sm font-medium text-emerald-400">Resolved</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                                        <AlertCircle className="w-4 h-4 text-amber-400" />
                                        <span className="text-sm font-medium text-amber-400">Unresolved</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-2 mt-4">
                            <button
                                onClick={() => onOpenFile?.(node.filePath)}
                                className="px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors flex items-center gap-2"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open in Editor
                            </button>
                            <button
                                className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors flex items-center gap-2"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                Copy Path
                            </button>
                            <button
                                className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors flex items-center gap-2"
                            >
                                <GitBranch className="w-3.5 h-3.5" />
                                View Graph
                            </button>
                        </div>
                    </div>

                    {/* Relationships Section */}
                    <div className="border-b border-gray-800">
                        <button
                            onClick={() => setExpandedSection(expandedSection === 'relationships' ? null : 'relationships')}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-900/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <GitBranch className="w-5 h-5 text-gray-400" />
                                <span className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Relationships</span>
                                <span className="px-2 py-0.5 text-xs font-medium text-gray-400 bg-gray-800 rounded">
                                    {relationships.length}
                                </span>
                            </div>
                            <ChevronRight
                                className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'relationships' ? 'rotate-90' : ''
                                    }`}
                            />
                        </button>

                        {expandedSection === 'relationships' && (
                            <div className="px-6 pb-6">
                                {/* Search */}
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input
                                        type="text"
                                        placeholder="Filter relationships..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-md text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                                    />
                                </div>

                                {/* Relationships List */}
                                {filteredRelationships.length > 0 ? (
                                    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                                        {filteredRelationships.map((rel, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => onNavigate?.(rel.target)}
                                                className="w-full px-4 py-3 bg-gray-900/50 hover:bg-gray-800/50 border border-gray-800 rounded-md transition-all group"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        {getRelationshipIcon(rel.direction)}
                                                        <div className="text-left">
                                                            <div className="text-sm font-medium text-gray-300 group-hover:text-gray-100">
                                                                {rel.target}
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-0.5">
                                                                {getRelationshipLabel(rel.direction)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getTypeColor(rel.type)}`}>
                                                        {rel.type}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        {searchQuery ? 'No matching relationships found' : 'No relationships to display'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Source Code Section */}
                    <div>
                        <button
                            onClick={() => setExpandedSection(expandedSection === 'source' ? null : 'source')}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-900/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Code2 className="w-5 h-5 text-gray-400" />
                                <span className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Source Code</span>
                                <span className="px-2 py-0.5 text-xs font-medium text-gray-400 bg-gray-800 rounded">
                                    {node.totalLines} lines
                                </span>
                            </div>
                            <ChevronRight
                                className={`w-5 h-5 text-gray-400 transition-transform ${expandedSection === 'source' ? 'rotate-90' : ''
                                    }`}
                            />
                        </button>

                        {expandedSection === 'source' && (
                            <div className="px-6 pb-6">
                                {/* File Path */}
                                <div className="flex items-center justify-between mb-4 p-3 bg-gray-900/50 border border-gray-800 rounded-md">
                                    <div className="flex items-center gap-2 text-sm font-mono text-gray-400 overflow-hidden">
                                        <Code2 className="w-4 h-4 flex-shrink-0" />
                                        <span className="truncate">{node.filePath}</span>
                                    </div>
                                    <span className="text-xs text-gray-500 flex-shrink-0 ml-4">
                                        Lines {node.lineStart}–{node.lineEnd}
                                    </span>
                                </div>

                                {/* Code Preview */}
                                <div className="bg-[#0d1117] border border-gray-800 rounded-md overflow-hidden max-h-96">
                                    <pre className="p-4 text-sm font-mono text-gray-300 overflow-auto max-h-96">
                                        <code>{sourceCode}</code>
                                    </pre>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-4">
                                    <button
                                        onClick={() => onOpenFile?.(node.filePath)}
                                        className="px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors flex items-center gap-2"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        Open Full File
                                    </button>
                                    <button
                                        className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors flex items-center gap-2"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy Code
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiveNodeInspector;
