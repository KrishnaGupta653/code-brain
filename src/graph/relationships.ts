/**
 * Relationship analyzer for understanding why edges exist.
 * Generates explanations for relationships and semantic reasons.
 * Includes cross-language edge detection for FFI calls.
 */

import { GraphEdge, GraphNode } from "../types/models.js";
import { GraphModel } from "./model.js";

export interface RelationshipExplanation {
  explanation: string;
  relationshipReason: string;
  callPattern?: string;
  parameterFlow?: {
    from: string[];
    to: string[];
    type: string;
  };
}

export interface CrossLanguageCall {
  from: GraphNode;
  to: string; // Target function/module name
  language: string; // Target language
  mechanism: string; // How the call is made (subprocess, exec, JNI, etc.)
  location: {
    file: string;
    line: number;
  };
}

export class RelationshipAnalyzer {
  private graph: GraphModel;

  constructor(graph: GraphModel) {
    this.graph = graph;
  }

  /**
   * Detect cross-language calls in the codebase.
   * Returns edges that represent calls between different languages.
   * 
   * TODO: Re-enable when parsers capture bodyText in ParsedSymbol.
   * Currently all calls return empty because location.text is declaration-only.
   */
  detectCrossLanguageCalls(): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    const nodes = this.graph.getNodes();

    for (const node of nodes) {
      // Skip non-code nodes
      if (!['function', 'method', 'file'].includes(node.type)) {
        continue;
      }

      const language = this.detectLanguage(node);
      if (!language) continue;

      // Check for cross-language patterns in the node
      const crossCalls = this.detectCrossLanguageInNode(node, language);
      calls.push(...crossCalls);
    }

    return calls;
  }

  /**
   * Detect language from node metadata or file extension.
   */
  private detectLanguage(node: GraphNode): string | null {
    const file = node.location?.file;
    if (!file) return null;

    if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      return 'typescript';
    } else if (file.endsWith('.py')) {
      return 'python';
    } else if (file.endsWith('.java')) {
      return 'java';
    } else if (file.endsWith('.go')) {
      return 'go';
    }

    return null;
  }

  /**
   * Detect cross-language calls within a node.
   * 
   * NOTE: Currently disabled because node.location.text only contains the declaration
   * signature, not the function body where subprocess calls appear. This method returns
   * zero results for every codebase until parsers capture bodyText in ParsedSymbol.
   */
  private detectCrossLanguageInNode(node: GraphNode, sourceLanguage: string): CrossLanguageCall[] {
    // location.text is only the declaration signature, not the body.
    // Body text is not currently captured by parsers.
    // Cross-language detection requires body text — skip until parsers capture it.
    return [];
  }

  /**
   * Detect TypeScript calling Python via subprocess/exec.
   */
  private detectTypeScriptToPython(node: GraphNode, sourceText: string): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    
    // Patterns: spawn('python', ...), exec('python ...'), execSync('python ...')
    const patterns = [
      /spawn\s*\(\s*['"]python3?['"]/g,
      /exec\s*\(\s*['"]python3?\s+([^'"]+)['"]/g,
      /execSync\s*\(\s*['"]python3?\s+([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
      const matches = sourceText.matchAll(pattern);
      for (const match of matches) {
        const target = match[1] || 'python_script';
        calls.push({
          from: node,
          to: target,
          language: 'python',
          mechanism: 'subprocess',
          location: {
            file: node.location?.file || '',
            line: node.location?.startLine || 0,
          },
        });
      }
    }

    return calls;
  }

  /**
   * Detect TypeScript calling Java.
   */
  private detectTypeScriptToJava(node: GraphNode, sourceText: string): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    
    // Patterns: spawn('java', ...), exec('java ...')
    const patterns = [
      /spawn\s*\(\s*['"]java['"]/g,
      /exec\s*\(\s*['"]java\s+([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
      const matches = sourceText.matchAll(pattern);
      for (const match of matches) {
        const target = match[1] || 'java_class';
        calls.push({
          from: node,
          to: target,
          language: 'java',
          mechanism: 'subprocess',
          location: {
            file: node.location?.file || '',
            line: node.location?.startLine || 0,
          },
        });
      }
    }

    return calls;
  }

  /**
   * Detect TypeScript calling Go.
   */
  private detectTypeScriptToGo(node: GraphNode, sourceText: string): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    
    // Patterns: spawn('./binary', ...), exec('./go-binary')
    const patterns = [
      /spawn\s*\(\s*['"]\.\/[^'"]*['"]/g,
      /exec\s*\(\s*['"]\.\/[^'"]+['"]/g,
    ];

    for (const pattern of patterns) {
      const matches = sourceText.matchAll(pattern);
      for (const match of matches) {
        calls.push({
          from: node,
          to: 'go_binary',
          language: 'go',
          mechanism: 'subprocess',
          location: {
            file: node.location?.file || '',
            line: node.location?.startLine || 0,
          },
        });
      }
    }

    return calls;
  }

  /**
   * Detect Python calling TypeScript/Node.
   */
  private detectPythonToTypeScript(node: GraphNode, sourceText: string): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    
    // Patterns: subprocess.run(['node', ...]), subprocess.Popen(['node', ...])
    const patterns = [
      /subprocess\.(?:run|Popen|call)\s*\(\s*\[\s*['"]node['"]/g,
      /subprocess\.(?:run|Popen|call)\s*\(\s*['"]node\s+([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
      const matches = sourceText.matchAll(pattern);
      for (const match of matches) {
        const target = match[1] || 'node_script';
        calls.push({
          from: node,
          to: target,
          language: 'typescript',
          mechanism: 'subprocess',
          location: {
            file: node.location?.file || '',
            line: node.location?.startLine || 0,
          },
        });
      }
    }

    return calls;
  }

  /**
   * Detect Python calling Java.
   */
  private detectPythonToJava(node: GraphNode, sourceText: string): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    
    // Patterns: subprocess.run(['java', ...]), JPype
    const patterns = [
      /subprocess\.(?:run|Popen|call)\s*\(\s*\[\s*['"]java['"]/g,
      /jpype\.JClass\s*\(\s*['"]([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
      const matches = sourceText.matchAll(pattern);
      for (const match of matches) {
        const target = match[1] || 'java_class';
        const mechanism = pattern.source.includes('jpype') ? 'jpype' : 'subprocess';
        calls.push({
          from: node,
          to: target,
          language: 'java',
          mechanism,
          location: {
            file: node.location?.file || '',
            line: node.location?.startLine || 0,
          },
        });
      }
    }

    return calls;
  }

  /**
   * Detect Python calling Go.
   */
  private detectPythonToGo(node: GraphNode, sourceText: string): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    
    // Patterns: subprocess.run(['./binary', ...])
    const patterns = [
      /subprocess\.(?:run|Popen|call)\s*\(\s*\[\s*['"]\.\/[^'"]+['"]/g,
    ];

    for (const pattern of patterns) {
      const matches = sourceText.matchAll(pattern);
      for (const match of matches) {
        calls.push({
          from: node,
          to: 'go_binary',
          language: 'go',
          mechanism: 'subprocess',
          location: {
            file: node.location?.file || '',
            line: node.location?.startLine || 0,
          },
        });
      }
    }

    return calls;
  }

  /**
   * Detect Java JNI calls to native code.
   */
  private detectJavaJNI(node: GraphNode, sourceText: string): CrossLanguageCall[] {
    const calls: CrossLanguageCall[] = [];
    
    // Patterns: native keyword, System.loadLibrary
    const patterns = [
      /native\s+\w+\s+(\w+)\s*\(/g,
      /System\.loadLibrary\s*\(\s*['"]([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
      const matches = sourceText.matchAll(pattern);
      for (const match of matches) {
        const target = match[1] || 'native_library';
        calls.push({
          from: node,
          to: target,
          language: 'native',
          mechanism: 'jni',
          location: {
            file: node.location?.file || '',
            line: node.location?.startLine || 0,
          },
        });
      }
    }

    return calls;
  }

  /**
   * Analyze all edges and enhance with relationship explanations.
   */
  analyzeAllEdges(): void {
    const edges = this.graph.getEdges();

    for (const edge of edges) {
      const explanation = this.analyzeEdge(edge);
      if (explanation) {
        edge.explanation = explanation.explanation;
        edge.relationshipReason = explanation.relationshipReason;
        edge.callPattern = explanation.callPattern;
        edge.parameterFlow = explanation.parameterFlow;
      }
    }
  }

  /**
   * Analyze a single edge to generate explanation.
   */
  private analyzeEdge(edge: GraphEdge): RelationshipExplanation | null {
    const fromNode = this.graph.getNode(edge.from);
    const toNode = this.graph.getNode(edge.to);

    if (!fromNode || !toNode) {
      return null;
    }

    switch (edge.type) {
      case "IMPORTS":
        return this.analyzeImportRelationship(edge, fromNode, toNode);
      case "EXPORTS":
        return this.analyzeExportRelationship(edge, fromNode, toNode);
      case "CALLS":
        return this.analyzeCallRelationship(edge, fromNode, toNode);
      case "CALLS_UNRESOLVED":
        return this.analyzeUnresolvedCallRelationship(edge, fromNode, toNode);
      case "DEFINES":
        return this.analyzeDefinesRelationship(edge, fromNode, toNode);
      case "DEPENDS_ON":
        return this.analyzeDependencyRelationship(edge, fromNode, toNode);
      case "IMPLEMENTS":
        return this.analyzeImplementsRelationship(edge, fromNode, toNode);
      case "EXTENDS":
        return this.analyzeExtendsRelationship(edge, fromNode, toNode);
      case "DECORATES":
        return this.analyzeDecoratesRelationship(edge, fromNode, toNode);
      case "TESTS":
        return this.analyzeTestsRelationship(edge, fromNode, toNode);
      case "USES":
        return this.analyzeUsesRelationship(edge, fromNode, toNode);
      case "DOCUMENTS":
        return this.analyzeDocumentsRelationship(edge, fromNode, toNode);
      case "REFERENCES":
        return this.analyzeReferencesRelationship(edge, fromNode, toNode);
      case "OWNS":
        return this.analyzeOwnsRelationship(edge, fromNode, toNode);
      case "ENTRY_POINT":
        return this.analyzeEntryPointRelationship(edge, fromNode, toNode);
      default:
        return null;
    }
  }

  private analyzeImportRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    const imported = this.getImportedItems(edge);
    const itemList = imported.length > 0 ? ` (${imported.join(", ")})` : "";

    return {
      explanation: `${fromNode.name} imports from ${toNode.name}${itemList}`,
      relationshipReason: "module_dependency",
    };
  }

  private analyzeExportRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    const reexported = edge.metadata?.reexported === true;
    const reason = reexported ? "re-export of" : "export from";

    return {
      explanation: `${fromNode.name} ${reason} ${toNode.name}`,
      relationshipReason: reexported ? "reexport" : "export",
    };
  }

  private analyzeCallRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    const isAsync = edge.metadata?.async === true;
    const pattern = isAsync ? "async_await" : "direct_call";

    // Infer parameter flow from node types and names
    const parameterFlow = this.inferParameterFlow(fromNode, toNode, edge);

    // Generate explanation based on function roles
    const reason = this.inferCallReason(fromNode, toNode);

    return {
      explanation: `${fromNode.name} calls ${toNode.name} ${reason}`,
      relationshipReason: reason,
      callPattern: pattern,
      parameterFlow,
    };
  }

  private analyzeUnresolvedCallRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} possibly calls ${toNode.name} (unresolved)`,
      relationshipReason: "unresolved_call",
      callPattern: "unresolved",
    };
  }

  private analyzeDefinesRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} defines ${toNode.name}`,
      relationshipReason: "definition",
    };
  }

  private analyzeDependencyRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    const reason = this.inferDependencyReason(fromNode, toNode);
    return {
      explanation: `${fromNode.name} depends on ${toNode.name} ${reason}`,
      relationshipReason: "dependency",
    };
  }

  private analyzeImplementsRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} implements interface ${toNode.name}`,
      relationshipReason: "interface_implementation",
    };
  }

  private analyzeExtendsRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} extends ${toNode.name}`,
      relationshipReason: "inheritance",
    };
  }

  private analyzeDecoratesRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `@${fromNode.name} decorator applied to ${toNode.name}`,
      relationshipReason: "decorator_application",
    };
  }

  private analyzeTestsRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} tests ${toNode.name}`,
      relationshipReason: "test_coverage",
    };
  }

  private analyzeUsesRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} uses ${toNode.name}`,
      relationshipReason: "usage",
    };
  }

  private analyzeDocumentsRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} documents ${toNode.name}`,
      relationshipReason: "documentation",
    };
  }

  private analyzeReferencesRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} references ${toNode.name}`,
      relationshipReason: "reference",
    };
  }

  private analyzeOwnsRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${fromNode.name} owns ${toNode.name}`,
      relationshipReason: "ownership",
    };
  }

  private analyzeEntryPointRelationship(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
  ): RelationshipExplanation {
    return {
      explanation: `${toNode.name} is an entry point of ${fromNode.name}`,
      relationshipReason: "entry_point",
    };
  }

  /**
   * Extract imported items from metadata.
   */
  private getImportedItems(edge: GraphEdge): string[] {
    const imported = edge.metadata?.imported as string[] | undefined;
    return imported ? imported.slice(0, 3) : [];
  }

  /**
   * Infer the reason for a call relationship.
   */
  private inferCallReason(fromNode: GraphNode, toNode: GraphNode): string {
    const fromName = fromNode.name.toLowerCase();
    const toName = toNode.name.toLowerCase();

    // Validation patterns
    if (toName.includes("validate") || toName.includes("check")) {
      return "to validate input";
    }

    // Transformation patterns
    if (
      toName.includes("format") ||
      toName.includes("parse") ||
      toName.includes("transform")
    ) {
      return "to transform data";
    }

    // Query patterns
    if (toName.includes("query") || toName.includes("fetch")) {
      return "to retrieve data";
    }

    // Mutation patterns
    if (toName.includes("create") || toName.includes("update")) {
      return "to modify data";
    }

    // Orchestration patterns
    if (fromName.includes("handler") || fromName.includes("controller")) {
      if (toName.includes("service")) {
        return "to delegate business logic";
      }
    }

    return "for functionality";
  }

  /**
   * Infer the reason for a dependency relationship.
   */
  private inferDependencyReason(
    fromNode: GraphNode,
    toNode: GraphNode,
  ): string {
    const toName = toNode.name.toLowerCase();

    if (toName.includes("service")) {
      return "(service dependency)";
    }
    if (toNode.type === "interface") {
      return "(interface contract)";
    }
    if (toNode.type === "config") {
      return "(configuration)";
    }

    return "";
  }

  /**
   * Infer parameter flow for a call.
   */
  private inferParameterFlow(
    fromNode: GraphNode,
    toNode: GraphNode,
    edge: GraphEdge,
  ): { from: string[]; to: string[]; type: string } | undefined {
    const metadata = edge.metadata as Record<string, unknown> | undefined;
    const params = metadata?.parameters as string[] | undefined;

    if (!params || params.length === 0) {
      return undefined;
    }

    return {
      from: [fromNode.name],
      to: [toNode.name],
      type: "parameter_passing",
    };
  }
}
