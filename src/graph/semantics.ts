/**
 * Semantic analyzer for code structure.
 * Infers namespaces, roles, and hierarchical naming for nodes.
 */

import path from "path";
import { GraphNode } from "../types/models.js";
import { GraphModel } from "./model.js";

export interface SemanticMetadata {
  semanticPath: string;
  namespace: string;
  hierarchyLabel: string;
  semanticRole: string;
  moduleContext: string;
}

export class SemanticAnalyzer {
  private graph: GraphModel;
  private projectRoot: string;

  constructor(graph: GraphModel, projectRoot: string) {
    this.graph = graph;
    this.projectRoot = projectRoot;
  }

  /**
   * Analyze all nodes and enhance with semantic information.
   */
  analyzeAllNodes(): void {
    const nodes = this.graph.getNodes();

    for (const node of nodes) {
      const semantic = this.analyzeNode(node);
      if (semantic) {
        node.semanticPath = semantic.semanticPath;
        node.namespace = semantic.namespace;
        node.hierarchyLabel = semantic.hierarchyLabel;
        node.semanticRole = semantic.semanticRole;
        node.moduleContext = semantic.moduleContext;
      }
    }
  }

  /**
   * Analyze a single node to infer semantic information.
   */
  private analyzeNode(node: GraphNode): SemanticMetadata | null {
    // Skip project nodes
    if (node.type === "project") {
      return null;
    }

    // For file nodes, derive from path
    if (node.type === "file") {
      return this.analyzeFileNode(node);
    }

    // For symbol nodes, derive from owner file + type
    return this.analyzeSymbolNode(node);
  }

  /**
   * Analyze a file node to infer namespace and hierarchy.
   */
  private analyzeFileNode(node: GraphNode): SemanticMetadata {
    const filePath = node.fullName || node.location?.file || "";
    const relativePath = path.relative(this.projectRoot, filePath);
    const dirParts = path
      .dirname(relativePath)
      .split(path.sep)
      .filter((p) => p && p !== ".");

    // Build namespace from directory structure
    const namespace = dirParts.join(".");
    const fileName = path.basename(filePath, path.extname(filePath));

    // Semantic path includes filename
    const semanticPath = namespace ? `${namespace}.${fileName}` : fileName;

    // Hierarchy label for human-readable display
    const hierarchyLabel =
      dirParts.length > 0
        ? [...dirParts, fileName].map((p) => this.capitalize(p)).join(" > ")
        : this.capitalize(fileName);

    // Infer module role from directory
    const moduleRole = this.inferModuleRole(dirParts, fileName);

    return {
      semanticPath,
      namespace,
      hierarchyLabel,
      semanticRole: moduleRole,
      moduleContext: this.inferModuleContext(dirParts),
    };
  }

  /**
   * Analyze a symbol node to infer role and namespace.
   */
  private analyzeSymbolNode(node: GraphNode): SemanticMetadata {
    const filePath = node.location?.file || "";
    const relativePath = path.relative(this.projectRoot, filePath);
    const dirParts = path
      .dirname(relativePath)
      .split(path.sep)
      .filter((p) => p && p !== ".");

    const fileNamespace = dirParts.join(".");
    const fileName = path.basename(filePath, path.extname(filePath));

    // Namespace includes file name
    const namespace = fileNamespace ? `${fileNamespace}.${fileName}` : fileName;

    // Semantic path includes both
    const semanticPath = `${namespace}.${node.name}`;

    // Build hierarchy label
    const pathParts = [...dirParts, fileName, node.name].map((p) =>
      this.capitalize(p),
    );
    const hierarchyLabel = pathParts.join(" > ");

    // Infer semantic role from type + naming patterns
    const semanticRole = this.inferSymbolRole(
      node.type,
      node.name,
      node.summary,
      dirParts,
    );

    // Infer module context
    const moduleContext = this.inferModuleContext(dirParts);

    return {
      semanticPath,
      namespace,
      hierarchyLabel,
      semanticRole,
      moduleContext,
    };
  }

  /**
   * Infer the semantic role of a symbol.
   */
  private inferSymbolRole(
    type: string,
    name: string,
    summary: string | undefined,
    dirParts: string[],
  ): string {
    const nameLower = name.toLowerCase();
    const summaryLower = (summary || "").toLowerCase();

    // Pattern-based role inference
    if (type === "class") {
      if (nameLower.includes("service")) return "service_class";
      if (nameLower.includes("controller")) return "controller_class";
      if (nameLower.includes("handler")) return "handler_class";
      if (nameLower.includes("provider")) return "provider_class";
      if (nameLower.includes("middleware")) return "middleware_class";
      if (nameLower.includes("repository")) return "repository_class";
      if (nameLower.includes("factory")) return "factory_class";
      if (nameLower.includes("model") || nameLower.includes("entity"))
        return "model_class";
      return "general_class";
    }

    if (type === "function" || type === "method") {
      if (
        nameLower.startsWith("test") ||
        nameLower.startsWith("describe") ||
        nameLower.includes("spec")
      )
        return "test_function";
      if (
        nameLower.startsWith("get") ||
        nameLower.startsWith("fetch") ||
        nameLower.startsWith("query")
      )
        return "query_function";
      if (
        nameLower.startsWith("set") ||
        nameLower.startsWith("update") ||
        nameLower.startsWith("create") ||
        nameLower.startsWith("delete")
      )
        return "mutation_function";
      if (
        nameLower.startsWith("validate") ||
        nameLower.includes("check") ||
        nameLower.includes("verify")
      )
        return "validation_function";
      if (
        nameLower.startsWith("format") ||
        nameLower.startsWith("transform") ||
        nameLower.startsWith("parse")
      )
        return "transformation_function";
      if (nameLower.startsWith("handle") || nameLower.startsWith("process"))
        return "handler_function";
      if (nameLower.startsWith("init") || nameLower.startsWith("setup"))
        return "initialization_function";
      if (nameLower.startsWith("log") || nameLower.includes("debug"))
        return "logging_function";
      return "general_function";
    }

    if (type === "interface" || type === "type") {
      return "type_definition";
    }

    if (type === "enum") {
      return "enum_definition";
    }

    if (type === "constant" || type === "variable") {
      if (nameLower.includes("config")) return "configuration";
      if (nameLower.includes("error")) return "error_definition";
      if (nameLower.includes("default")) return "default_value";
      return "data_definition";
    }

    if (type === "route") {
      if (summaryLower.includes("get")) return "get_route";
      if (summaryLower.includes("post")) return "post_route";
      if (summaryLower.includes("put")) return "put_route";
      if (summaryLower.includes("delete")) return "delete_route";
      if (summaryLower.includes("patch")) return "patch_route";
      return "api_route";
    }

    return "unknown";
  }

  /**
   * Infer module role from directory structure.
   */
  private inferModuleRole(dirParts: string[], fileName: string): string {
    const dirStr = [...dirParts, fileName].join(".").toLowerCase();

    if (dirStr.includes("service")) return "service_layer";
    if (dirStr.includes("controller")) return "controller_layer";
    if (dirStr.includes("handler")) return "handler_layer";
    if (dirStr.includes("middleware")) return "middleware_layer";
    if (dirStr.includes("route")) return "routing_layer";
    if (dirStr.includes("api")) return "api_layer";
    if (dirStr.includes("model") || dirStr.includes("entity"))
      return "model_layer";
    if (dirStr.includes("database") || dirStr.includes("db"))
      return "data_layer";
    if (dirStr.includes("util") || dirStr.includes("helper"))
      return "utility_layer";
    if (dirStr.includes("config")) return "configuration_layer";
    if (dirStr.includes("test")) return "test_layer";
    if (dirStr.includes("type") || dirStr.includes("schema"))
      return "type_layer";
    if (dirStr.includes("auth")) return "authentication_layer";

    return "application_layer";
  }

  /**
   * Infer module context from directory structure.
   */
  private inferModuleContext(dirParts: string[]): string {
    // Top-level directory defines module
    if (dirParts.length > 0) {
      const topLevel = dirParts[0];
      const contextKeywords: Record<string, string> = {
        api: "api_module",
        auth: "authentication_module",
        core: "core_module",
        common: "shared_utilities_module",
        config: "configuration_module",
        database: "database_module",
        db: "database_module",
        server: "server_module",
        client: "client_module",
        utils: "utilities_module",
        helpers: "helpers_module",
        middleware: "middleware_module",
        routes: "routing_module",
        services: "services_module",
        models: "models_module",
        types: "types_module",
        tests: "testing_module",
        e2e: "end_to_end_testing_module",
        unit: "unit_testing_module",
      };

      return (
        contextKeywords[topLevel.toLowerCase()] ||
        `${topLevel.toLowerCase()}_module`
      );
    }

    return "root_module";
  }

  /**
   * Capitalize first letter.
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
