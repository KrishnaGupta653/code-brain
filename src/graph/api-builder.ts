/**
 * API Builder
 * 
 * Adds API schemas (OpenAPI/GraphQL) to the knowledge graph and links them to code
 */

import { GraphModel, createGraphNode, createGraphEdge } from './model.js';
import { OpenAPIParser, ParsedOpenAPI, ParsedOperation } from '../parser/openapi.js';
import { GraphQLSchemaParser, ParsedGraphQL, ParsedGraphQLOperation } from '../parser/graphql-schema.js';
import { GraphNode } from '../types/models.js';
import { logger, stableId } from '../utils/index.js';
import path from 'path';

export interface APIStats {
  totalSchemas: number;
  totalEndpoints: number;
  totalOperations: number;
  totalTypes: number;
  linkedHandlers: number;
  coverage: number;
}

export class APIBuilder {
  private graph: GraphModel;
  private projectRoot: string;
  private routeIndex: Map<string, string>; // route pattern -> handler node id
  private resolverIndex: Map<string, string>; // resolver name -> resolver node id

  constructor(graph: GraphModel, projectRoot: string) {
    this.graph = graph;
    this.projectRoot = projectRoot;
    this.routeIndex = new Map();
    this.resolverIndex = new Map();
    this.buildRouteIndex();
    this.buildResolverIndex();
  }

  /**
   * Build an index of route handlers for fast lookup
   */
  private buildRouteIndex(): void {
    const nodes = this.graph.getNodes();
    
    for (const node of nodes) {
      // Look for route nodes (Express, Fastify, etc.)
      if (node.type === 'route' && node.metadata?.path) {
        const routePattern = `${node.metadata.method || 'GET'} ${node.metadata.path}`;
        this.routeIndex.set(routePattern, node.id);
      }
      
      // Look for functions with route-like names
      if (node.type === 'function' || node.type === 'method') {
        const name = node.name.toLowerCase();
        // Match patterns like: getUser, getUserById, listUsers, createUser, etc.
        if (name.match(/^(get|post|put|delete|patch|list|create|update|remove)/)) {
          this.routeIndex.set(node.name, node.id);
        }
      }
    }
    
    logger.debug(`Built route index with ${this.routeIndex.size} entries`);
  }

  /**
   * Build an index of GraphQL resolvers for fast lookup
   */
  private buildResolverIndex(): void {
    const nodes = this.graph.getNodes();
    
    for (const node of nodes) {
      // Look for resolver functions
      if (node.type === 'function' || node.type === 'method') {
        // GraphQL resolvers are often in a resolvers object
        if (node.metadata?.owner === 'Query' || 
            node.metadata?.owner === 'Mutation' || 
            node.metadata?.owner === 'Subscription') {
          const resolverName = `${node.metadata.owner}.${node.name}`;
          this.resolverIndex.set(resolverName, node.id);
        }
        
        // Also index by simple name
        this.resolverIndex.set(node.name, node.id);
      }
    }
    
    logger.debug(`Built resolver index with ${this.resolverIndex.size} entries`);
  }

  /**
   * Add API schemas to the graph
   */
  addAPISchemas(
    schemaFiles: string[],
    onProgress?: (current: number, total: number) => void
  ): void {
    logger.info(`Processing ${schemaFiles.length} API schema files...`);
    
    let processed = 0;
    
    for (const schemaFile of schemaFiles) {
      try {
        if (OpenAPIParser.isOpenAPIFile(schemaFile)) {
          this.addOpenAPISchema(schemaFile);
        } else if (GraphQLSchemaParser.isGraphQLFile(schemaFile)) {
          this.addGraphQLSchema(schemaFile);
        }
        
        processed++;
        
        if (onProgress) {
          onProgress(processed, schemaFiles.length);
        }
      } catch (error) {
        logger.warn(`Failed to process API schema file: ${schemaFile}`, error);
      }
    }
    
    logger.success(`Processed ${processed} API schema files`);
  }

  /**
   * Add an OpenAPI schema to the graph
   */
  private addOpenAPISchema(filePath: string): void {
    // Parse OpenAPI file
    const parsed = OpenAPIParser.parseFile(filePath);
    
    // Create schema file node
    const schemaId = this.createOpenAPISchemaNode(parsed);
    
    // Create endpoint nodes
    for (const pathItem of parsed.paths) {
      for (const operation of pathItem.operations) {
        const endpointId = this.createEndpointNode(operation, pathItem.path, parsed.path, schemaId);
        
        // Try to link to handler
        this.linkEndpointToHandler(endpointId, operation, pathItem.path);
      }
    }
    
    // Create type nodes
    if (parsed.components?.schemas) {
      for (const [typeName, schema] of Object.entries(parsed.components.schemas)) {
        this.createAPITypeNode(typeName, schema, parsed.path, schemaId);
      }
    }
  }

  /**
   * Add a GraphQL schema to the graph
   */
  private addGraphQLSchema(filePath: string): void {
    // Parse GraphQL file
    const parsed = GraphQLSchemaParser.parseFile(filePath);
    
    // Create schema file node
    const schemaId = this.createGraphQLSchemaNode(parsed);
    
    // Create operation nodes for queries
    for (const query of parsed.queries) {
      const operationId = this.createOperationNode(query, 'query', parsed.path, schemaId);
      this.linkOperationToResolver(operationId, query);
    }
    
    // Create operation nodes for mutations
    for (const mutation of parsed.mutations) {
      const operationId = this.createOperationNode(mutation, 'mutation', parsed.path, schemaId);
      this.linkOperationToResolver(operationId, mutation);
    }
    
    // Create operation nodes for subscriptions
    for (const subscription of parsed.subscriptions) {
      const operationId = this.createOperationNode(subscription, 'subscription', parsed.path, schemaId);
      this.linkOperationToResolver(operationId, subscription);
    }
    
    // Create type nodes
    for (const type of parsed.types) {
      this.createGraphQLTypeNode(type, parsed.path, schemaId);
    }
  }

  /**
   * Create an OpenAPI schema file node
   */
  private createOpenAPISchemaNode(parsed: ParsedOpenAPI): string {
    const relativePath = path.relative(this.projectRoot, parsed.path);
    const schemaId = stableId('api-schema', parsed.path);
    
    const summary = OpenAPIParser.getSummary(parsed);
    
    const node = createGraphNode(
      schemaId,
      'api-schema',
      parsed.info.title,
      {
        file: parsed.path,
        startLine: 1,
        endLine: 1,
        startCol: 1,
        endCol: 1,
      },
      relativePath,
      parsed.info.description || `OpenAPI ${parsed.version} specification`,
      {
        schemaType: 'openapi',
        version: parsed.version,
        title: parsed.info.title,
        apiVersion: parsed.info.version,
        baseUrl: parsed.servers[0]?.url,
        endpointCount: summary.endpointCount,
        schemaCount: summary.schemaCount,
        hash: parsed.hash,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to project
    const projectNodes = this.graph.getNodes().filter(n => n.type === 'project');
    if (projectNodes.length > 0) {
      const projectId = projectNodes[0].id;
      this.graph.addEdge(
        createGraphEdge(
          stableId('edge', 'OWNS', projectId, schemaId),
          'OWNS',
          projectId,
          schemaId,
          true,
          [node.location!]
        )
      );
    }
    
    return schemaId;
  }

  /**
   * Create a GraphQL schema file node
   */
  private createGraphQLSchemaNode(parsed: ParsedGraphQL): string {
    const relativePath = path.relative(this.projectRoot, parsed.path);
    const schemaId = stableId('api-schema', parsed.path);
    
    const summary = GraphQLSchemaParser.getSummary(parsed);
    
    const node = createGraphNode(
      schemaId,
      'api-schema',
      'GraphQL Schema',
      {
        file: parsed.path,
        startLine: 1,
        endLine: 1,
        startCol: 1,
        endCol: 1,
      },
      relativePath,
      'GraphQL schema definition',
      {
        schemaType: 'graphql',
        typeCount: summary.typeCount,
        queryCount: summary.queryCount,
        mutationCount: summary.mutationCount,
        subscriptionCount: summary.subscriptionCount,
        hash: parsed.hash,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to project
    const projectNodes = this.graph.getNodes().filter(n => n.type === 'project');
    if (projectNodes.length > 0) {
      const projectId = projectNodes[0].id;
      this.graph.addEdge(
        createGraphEdge(
          stableId('edge', 'OWNS', projectId, schemaId),
          'OWNS',
          projectId,
          schemaId,
          true,
          [node.location!]
        )
      );
    }
    
    return schemaId;
  }

  /**
   * Create an API endpoint node (REST)
   */
  private createEndpointNode(
    operation: ParsedOperation,
    pathPattern: string,
    schemaPath: string,
    schemaId: string
  ): string {
    const endpointId = stableId('api-endpoint', schemaPath, operation.method, pathPattern);
    
    const name = `${operation.method} ${pathPattern}`;
    const fullName = `${path.relative(this.projectRoot, schemaPath)}#${name}`;
    
    const node = createGraphNode(
      endpointId,
      'api-endpoint',
      name,
      {
        file: schemaPath,
        startLine: operation.location.startLine,
        endLine: operation.location.endLine,
        startCol: 1,
        endCol: 1,
      },
      fullName,
      operation.summary || operation.description || `${operation.method} endpoint`,
      {
        method: operation.method,
        path: pathPattern,
        operationId: operation.operationId,
        tags: operation.tags,
        parameters: operation.parameters,
        requestBody: operation.requestBody,
        responses: operation.responses,
        security: operation.security,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to schema
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'DEFINES_API', schemaId, endpointId),
        'DEFINES_API',
        schemaId,
        endpointId,
        true,
        [node.location!]
      )
    );
    
    return endpointId;
  }

  /**
   * Create an API operation node (GraphQL)
   */
  private createOperationNode(
    operation: ParsedGraphQLOperation,
    operationType: string,
    schemaPath: string,
    schemaId: string
  ): string {
    const operationId = stableId('api-operation', schemaPath, operationType, operation.name);
    
    const fullName = `${path.relative(this.projectRoot, schemaPath)}#${operationType}.${operation.name}`;
    
    const node = createGraphNode(
      operationId,
      'api-operation',
      operation.name,
      {
        file: schemaPath,
        startLine: operation.location.startLine,
        endLine: operation.location.endLine,
        startCol: 1,
        endCol: 1,
      },
      fullName,
      operation.description || `${operationType} operation`,
      {
        operationType: operation.type,
        returnType: operation.returnType,
        arguments: operation.args,
        deprecated: operation.deprecated,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to schema
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'DEFINES_API', schemaId, operationId),
        'DEFINES_API',
        schemaId,
        operationId,
        true,
        [node.location!]
      )
    );
    
    return operationId;
  }

  /**
   * Create an API type node (OpenAPI)
   */
  private createAPITypeNode(
    typeName: string,
    schema: any,
    schemaPath: string,
    schemaId: string
  ): string {
    const typeId = stableId('api-type', schemaPath, typeName);
    
    const fullName = `${path.relative(this.projectRoot, schemaPath)}#${typeName}`;
    
    const node = createGraphNode(
      typeId,
      'api-type',
      typeName,
      {
        file: schemaPath,
        startLine: 1,
        endLine: 1,
        startCol: 1,
        endCol: 1,
      },
      fullName,
      schema.description || `API type definition`,
      {
        schemaType: 'openapi',
        type: schema.type,
        properties: schema.properties,
        required: schema.required,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to schema
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'DEFINES_API', schemaId, typeId),
        'DEFINES_API',
        schemaId,
        typeId,
        true,
        [node.location!]
      )
    );
    
    return typeId;
  }

  /**
   * Create a GraphQL type node
   */
  private createGraphQLTypeNode(
    type: any,
    schemaPath: string,
    schemaId: string
  ): string {
    const typeId = stableId('api-type', schemaPath, type.name);
    
    const fullName = `${path.relative(this.projectRoot, schemaPath)}#${type.name}`;
    
    const node = createGraphNode(
      typeId,
      'api-type',
      type.name,
      {
        file: schemaPath,
        startLine: type.location.startLine,
        endLine: type.location.endLine,
        startCol: 1,
        endCol: 1,
      },
      fullName,
      type.description || `GraphQL ${type.kind} type`,
      {
        schemaType: 'graphql',
        kind: type.kind,
        fields: type.fields,
        values: type.values,
        types: type.types,
      }
    );
    
    this.graph.addNode(node);
    
    // Link to schema
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'DEFINES_API', schemaId, typeId),
        'DEFINES_API',
        schemaId,
        typeId,
        true,
        [node.location!]
      )
    );
    
    return typeId;
  }

  /**
   * Link an endpoint to its handler implementation
   */
  private linkEndpointToHandler(
    endpointId: string,
    operation: ParsedOperation,
    pathPattern: string
  ): void {
    // Try to find handler by operation ID
    if (operation.operationId) {
      const handlerId = this.routeIndex.get(operation.operationId);
      if (handlerId) {
        this.createImplementsEdge(handlerId, endpointId);
        return;
      }
    }
    
    // Try to find handler by route pattern
    const routePattern = `${operation.method} ${pathPattern}`;
    const handlerId = this.routeIndex.get(routePattern);
    if (handlerId) {
      this.createImplementsEdge(handlerId, endpointId);
      return;
    }
    
    // Try to find handler by method + path-based name
    // e.g., GET /users/:id -> getUser or getUserById
    const pathParts = pathPattern.split('/').filter(p => p && !p.startsWith(':'));
    const resource = pathParts[pathParts.length - 1] || pathParts[0];
    if (resource) {
      const methodName = operation.method.toLowerCase();
      const possibleNames = [
        `${methodName}${this.capitalize(resource)}`,
        `${methodName}${this.capitalize(this.singularize(resource))}`,
      ];
      
      for (const name of possibleNames) {
        const handlerId = this.routeIndex.get(name);
        if (handlerId) {
          this.createImplementsEdge(handlerId, endpointId);
          return;
        }
      }
    }
  }

  /**
   * Link an operation to its resolver implementation
   */
  private linkOperationToResolver(
    operationId: string,
    operation: ParsedGraphQLOperation
  ): void {
    // Try to find resolver by qualified name (Query.getUser)
    const qualifiedName = `${this.capitalize(operation.type)}.${operation.name}`;
    let resolverId = this.resolverIndex.get(qualifiedName);
    
    // Try to find resolver by simple name
    if (!resolverId) {
      resolverId = this.resolverIndex.get(operation.name);
    }
    
    if (resolverId) {
      this.createResolvesEdge(resolverId, operationId);
    }
  }

  /**
   * Create an IMPLEMENTS edge
   */
  private createImplementsEdge(handlerId: string, endpointId: string): void {
    const handler = this.graph.getNode(handlerId);
    if (!handler) return;
    
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'IMPLEMENTS', handlerId, endpointId),
        'IMPLEMENTS',
        handlerId,
        endpointId,
        true,
        [handler.location!]
      )
    );
  }

  /**
   * Create a RESOLVES edge
   */
  private createResolvesEdge(resolverId: string, operationId: string): void {
    const resolver = this.graph.getNode(resolverId);
    if (!resolver) return;
    
    this.graph.addEdge(
      createGraphEdge(
        stableId('edge', 'RESOLVES', resolverId, operationId),
        'RESOLVES',
        resolverId,
        operationId,
        true,
        [resolver.location!]
      )
    );
  }

  /**
   * Get API statistics
   */
  getStats(): APIStats {
    const allNodes = this.graph.getNodes();
    const schemaNodes = allNodes.filter(n => n.type === 'api-schema');
    const endpointNodes = allNodes.filter(n => n.type === 'api-endpoint');
    const operationNodes = allNodes.filter(n => n.type === 'api-operation');
    const typeNodes = allNodes.filter(n => n.type === 'api-type');
    
    // Count linked handlers
    const implementsEdges = this.graph.getEdgesByType('IMPLEMENTS');
    const resolvesEdges = this.graph.getEdgesByType('RESOLVES');
    const linkedHandlers = implementsEdges.length + resolvesEdges.length;
    
    const totalAPIs = endpointNodes.length + operationNodes.length;
    const coverage = totalAPIs > 0 ? (linkedHandlers / totalAPIs) * 100 : 0;
    
    return {
      totalSchemas: schemaNodes.length,
      totalEndpoints: endpointNodes.length,
      totalOperations: operationNodes.length,
      totalTypes: typeNodes.length,
      linkedHandlers,
      coverage,
    };
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Simple singularize (remove trailing 's')
   */
  private singularize(str: string): string {
    if (str.endsWith('s')) {
      return str.slice(0, -1);
    }
    return str;
  }
}
