/**
 * Type definitions for Live Node Inspector
 * 
 * Comprehensive type safety for the node inspector component
 */

/**
 * Status of a code node
 */
export type NodeStatus = 'resolved' | 'unresolved';

/**
 * Type of code entity
 */
export type NodeType = 
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

/**
 * Direction of a relationship between nodes
 */
export type RelationshipDirection = 
  | 'calls'        // This node calls the target
  | 'calledBy'     // This node is called by the target
  | 'imports'      // This node imports the target
  | 'importedBy'   // This node is imported by the target
  | 'extends'      // This node extends the target
  | 'extendedBy'   // This node is extended by the target
  | 'implements'   // This node implements the target
  | 'implementedBy'; // This node is implemented by the target

/**
 * Core data about a code node
 */
export interface NodeData {
  /** Display name of the node (e.g., "Array.from") */
  name: string;
  
  /** Type of the node */
  type: NodeType;
  
  /** Module or package path */
  module: string;
  
  /** Resolution status */
  status: NodeStatus;
  
  /** Full file path */
  filePath: string;
  
  /** Starting line number in the file */
  lineStart: number;
  
  /** Ending line number in the file */
  lineEnd: number;
  
  /** Total lines in the file */
  totalLines: number;
  
  /** Optional description or documentation */
  description?: string;
  
  /** Optional tags or labels */
  tags?: string[];
  
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Relationship between two nodes
 */
export interface Relationship {
  /** Direction of the relationship */
  direction: RelationshipDirection;
  
  /** Target node name */
  target: string;
  
  /** Type of the target node */
  type: NodeType;
  
  /** Optional file path of the target */
  filePath?: string;
  
  /** Optional line number of the target */
  lineNumber?: number;
  
  /** Optional relationship metadata */
  metadata?: Record<string, any>;
}

/**
 * Source code information
 */
export interface SourceCodeInfo {
  /** The actual source code */
  code: string;
  
  /** Programming language */
  language?: string;
  
  /** Whether syntax highlighting is available */
  highlighted?: boolean;
  
  /** Line numbers to highlight */
  highlightLines?: number[];
}

/**
 * Props for the LiveNodeInspector component
 */
export interface LiveNodeInspectorProps {
  /** Node data to display */
  node: NodeData;
  
  /** Relationships to other nodes */
  relationships: Relationship[];
  
  /** Source code to display */
  sourceCode: string | SourceCodeInfo;
  
  /** Callback when the inspector is closed */
  onClose: () => void;
  
  /** Optional callback when navigating to another node */
  onNavigate?: (target: string) => void;
  
  /** Optional callback when opening a file */
  onOpenFile?: (path: string, lineNumber?: number) => void;
  
  /** Optional callback when copying content */
  onCopy?: (content: string, type: 'path' | 'code') => void;
  
  /** Optional callback when viewing the graph */
  onViewGraph?: (nodeId: string) => void;
  
  /** Optional initial expanded section */
  initialExpandedSection?: 'relationships' | 'source' | null;
  
  /** Optional initial pinned state */
  initialPinned?: boolean;
  
  /** Optional custom class name */
  className?: string;
  
  /** Optional theme override */
  theme?: 'dark' | 'light';
}

/**
 * Internal state for the component
 */
export interface LiveNodeInspectorState {
  /** Currently expanded section */
  expandedSection: 'relationships' | 'source' | null;
  
  /** Search query for filtering relationships */
  searchQuery: string;
  
  /** Whether the inspector is pinned */
  isPinned: boolean;
  
  /** Selected relationship index */
  selectedRelationshipIndex: number | null;
}

/**
 * Configuration for relationship display
 */
export interface RelationshipConfig {
  /** Icon to display */
  icon: React.ComponentType<{ className?: string }>;
  
  /** Label text */
  label: string;
  
  /** Color class for the icon */
  iconColor: string;
  
  /** Background color class */
  bgColor: string;
  
  /** Border color class */
  borderColor: string;
}

/**
 * Configuration for node type display
 */
export interface NodeTypeConfig {
  /** Icon to display */
  icon?: React.ComponentType<{ className?: string }>;
  
  /** Text color class */
  textColor: string;
  
  /** Background color class */
  bgColor: string;
  
  /** Border color class */
  borderColor: string;
}

/**
 * Action button configuration
 */
export interface ActionButton {
  /** Button label */
  label: string;
  
  /** Icon component */
  icon: React.ComponentType<{ className?: string }>;
  
  /** Click handler */
  onClick: () => void;
  
  /** Optional variant */
  variant?: 'primary' | 'secondary' | 'ghost';
  
  /** Optional disabled state */
  disabled?: boolean;
  
  /** Optional tooltip */
  tooltip?: string;
}

/**
 * Search/filter options
 */
export interface FilterOptions {
  /** Search query */
  query: string;
  
  /** Filter by relationship direction */
  directions?: RelationshipDirection[];
  
  /** Filter by node type */
  types?: NodeType[];
  
  /** Sort order */
  sortBy?: 'name' | 'type' | 'direction';
  
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Performance metrics (for future use)
 */
export interface NodeMetrics {
  /** Number of times this node is called */
  callCount?: number;
  
  /** Average execution time in ms */
  avgExecutionTime?: number;
  
  /** Number of dependencies */
  dependencyCount?: number;
  
  /** Number of dependents */
  dependentCount?: number;
  
  /** Code complexity score */
  complexityScore?: number;
  
  /** Test coverage percentage */
  testCoverage?: number;
}

/**
 * Extended node data with metrics
 */
export interface NodeDataWithMetrics extends NodeData {
  /** Performance and usage metrics */
  metrics?: NodeMetrics;
}

/**
 * Event handlers
 */
export interface LiveNodeInspectorEvents {
  /** Fired when a section is expanded/collapsed */
  onSectionToggle?: (section: 'relationships' | 'source', expanded: boolean) => void;
  
  /** Fired when search query changes */
  onSearchChange?: (query: string) => void;
  
  /** Fired when pin state changes */
  onPinToggle?: (pinned: boolean) => void;
  
  /** Fired when a relationship is clicked */
  onRelationshipClick?: (relationship: Relationship) => void;
  
  /** Fired when an action button is clicked */
  onActionClick?: (action: string) => void;
}

/**
 * Utility type for relationship grouping
 */
export type GroupedRelationships = {
  [K in RelationshipDirection]?: Relationship[];
};

/**
 * Utility type for filtered relationships
 */
export interface FilteredRelationshipsResult {
  /** Filtered relationships */
  relationships: Relationship[];
  
  /** Total count before filtering */
  totalCount: number;
  
  /** Count after filtering */
  filteredCount: number;
}

// Types are already exported above with their definitions
