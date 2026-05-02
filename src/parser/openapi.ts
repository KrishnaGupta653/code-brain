/**
 * OpenAPI / Swagger Parser
 * 
 * Parses OpenAPI 3.x and Swagger 2.0 specifications
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import YAML from 'yaml';
import { logger } from '../utils/logger.js';

export interface ParsedOpenAPI {
  path: string;
  hash: string;
  version: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers: Array<{
    url: string;
    description?: string;
  }>;
  paths: ParsedPath[];
  components?: {
    schemas?: Record<string, ParsedSchema>;
    securitySchemes?: Record<string, any>;
  };
}

export interface ParsedPath {
  path: string;
  operations: ParsedOperation[];
}

export interface ParsedOperation {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: Record<string, ParsedResponse>;
  security?: any[];
  location: {
    startLine: number;
    endLine: number;
  };
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: any;
  description?: string;
}

export interface ParsedRequestBody {
  required: boolean;
  content: Record<string, { schema: any }>;
  description?: string;
}

export interface ParsedResponse {
  description: string;
  content?: Record<string, { schema: any }>;
  headers?: Record<string, any>;
}

export interface ParsedSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  description?: string;
  items?: any;
  enum?: any[];
  allOf?: any[];
  oneOf?: any[];
  anyOf?: any[];
}

export class OpenAPIParser {
  /**
   * Parse an OpenAPI/Swagger file
   */
  static parseFile(filePath: string): ParsedOpenAPI {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    // Parse YAML or JSON
    const spec = this.parseContent(content, filePath);

    // Determine version
    const version = spec.openapi || spec.swagger || 'unknown';

    // Extract info
    const info = {
      title: spec.info?.title || 'Untitled API',
      version: spec.info?.version || '1.0.0',
      description: spec.info?.description,
    };

    // Extract servers (OpenAPI 3.x) or host/basePath (Swagger 2.0)
    const servers = this.extractServers(spec);

    // Extract paths
    const paths = this.extractPaths(spec, content);

    // Extract components/definitions
    const components = this.extractComponents(spec);

    return {
      path: filePath,
      hash,
      version,
      info,
      servers,
      paths,
      components,
    };
  }

  /**
   * Check if a file is an OpenAPI/Swagger file
   */
  static isOpenAPIFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    // Check by extension
    if (!['.yaml', '.yml', '.json'].includes(ext)) {
      return false;
    }

    // Check by filename
    const apiFileNames = [
      'openapi',
      'swagger',
      'api-spec',
      'api',
    ];

    return apiFileNames.some(name => basename.startsWith(name));
  }

  /**
   * Parse YAML or JSON content
   */
  private static parseContent(content: string, filePath: string): any {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.json') {
        return JSON.parse(content);
      } else {
        return YAML.parse(content);
      }
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error}`);
    }
  }

  /**
   * Extract servers from spec
   */
  private static extractServers(spec: any): Array<{ url: string; description?: string }> {
    // OpenAPI 3.x
    if (spec.servers && Array.isArray(spec.servers)) {
      return spec.servers.map((server: any) => ({
        url: server.url,
        description: server.description,
      }));
    }

    // Swagger 2.0
    if (spec.host || spec.basePath) {
      const scheme = spec.schemes?.[0] || 'https';
      const host = spec.host || 'localhost';
      const basePath = spec.basePath || '';
      return [{
        url: `${scheme}://${host}${basePath}`,
      }];
    }

    return [];
  }

  /**
   * Extract paths from spec
   */
  private static extractPaths(spec: any, content: string): ParsedPath[] {
    if (!spec.paths) {
      return [];
    }

    const paths: ParsedPath[] = [];
    const lines = content.split('\n');

    for (const [pathPattern, pathItem] of Object.entries(spec.paths as Record<string, any>)) {
      const operations: ParsedOperation[] = [];

      // Find line number for this path
      const pathLineIndex = lines.findIndex(line => 
        line.trim().startsWith(`${pathPattern}:`) || 
        line.trim().startsWith(`"${pathPattern}":`)
      );
      const pathStartLine = pathLineIndex >= 0 ? pathLineIndex + 1 : 1;

      // Extract operations (get, post, put, delete, etc.)
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
      
      for (const method of methods) {
        if (pathItem[method]) {
          const operation = this.extractOperation(
            pathPattern,
            method.toUpperCase() as any,
            pathItem[method],
            pathStartLine,
            lines
          );
          operations.push(operation);
        }
      }

      if (operations.length > 0) {
        paths.push({
          path: pathPattern,
          operations,
        });
      }
    }

    return paths;
  }

  /**
   * Extract a single operation
   */
  private static extractOperation(
    pathPattern: string,
    method: ParsedOperation['method'],
    operation: any,
    pathStartLine: number,
    lines: string[]
  ): ParsedOperation {
    // Find line number for this operation
    const methodLower = method.toLowerCase();
    const operationLineIndex = lines.findIndex((line, index) => 
      index >= pathStartLine - 1 && 
      (line.trim().startsWith(`${methodLower}:`) || line.trim() === methodLower)
    );
    const startLine = operationLineIndex >= 0 ? operationLineIndex + 1 : pathStartLine;

    // Estimate end line (rough approximation)
    const endLine = startLine + 20;

    return {
      method,
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags,
      parameters: this.extractParameters(operation.parameters),
      requestBody: operation.requestBody ? {
        required: operation.requestBody.required || false,
        content: operation.requestBody.content || {},
        description: operation.requestBody.description,
      } : undefined,
      responses: operation.responses || {},
      security: operation.security,
      location: {
        startLine,
        endLine,
      },
    };
  }

  /**
   * Extract parameters
   */
  private static extractParameters(parameters: any[]): ParsedParameter[] | undefined {
    if (!parameters || !Array.isArray(parameters)) {
      return undefined;
    }

    return parameters.map(param => ({
      name: param.name,
      in: param.in,
      required: param.required || false,
      schema: param.schema || param.type,
      description: param.description,
    }));
  }

  /**
   * Extract components (OpenAPI 3.x) or definitions (Swagger 2.0)
   */
  private static extractComponents(spec: any): ParsedOpenAPI['components'] {
    const schemas: Record<string, ParsedSchema> = {};

    // OpenAPI 3.x
    if (spec.components?.schemas) {
      Object.assign(schemas, spec.components.schemas);
    }

    // Swagger 2.0
    if (spec.definitions) {
      Object.assign(schemas, spec.definitions);
    }

    const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions;

    return {
      schemas: Object.keys(schemas).length > 0 ? schemas : undefined,
      securitySchemes,
    };
  }

  /**
   * Get a summary of the API
   */
  static getSummary(parsed: ParsedOpenAPI): {
    endpointCount: number;
    schemaCount: number;
    methods: Record<string, number>;
    tags: string[];
  } {
    const methods: Record<string, number> = {};
    const tags = new Set<string>();

    for (const path of parsed.paths) {
      for (const operation of path.operations) {
        methods[operation.method] = (methods[operation.method] || 0) + 1;
        
        if (operation.tags) {
          operation.tags.forEach(tag => tags.add(tag));
        }
      }
    }

    return {
      endpointCount: parsed.paths.reduce((sum, p) => sum + p.operations.length, 0),
      schemaCount: Object.keys(parsed.components?.schemas || {}).length,
      methods,
      tags: Array.from(tags),
    };
  }
}
