/**
 * GraphQL Schema Parser
 * 
 * Parses GraphQL SDL (Schema Definition Language) files
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  parse,
  buildSchema,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLInputObjectType,
  GraphQLEnumType,
  GraphQLUnionType,
  GraphQLScalarType,
  GraphQLField,
  GraphQLInputField,
  GraphQLArgument,
  isObjectType,
  isInterfaceType,
  isInputObjectType,
  isEnumType,
  isUnionType,
  isScalarType,
} from 'graphql';
import { logger } from '../utils/logger.js';

export interface ParsedGraphQL {
  path: string;
  hash: string;
  types: ParsedGraphQLType[];
  queries: ParsedGraphQLOperation[];
  mutations: ParsedGraphQLOperation[];
  subscriptions: ParsedGraphQLOperation[];
  directives: ParsedGraphQLDirective[];
}

export interface ParsedGraphQLType {
  name: string;
  kind: 'object' | 'input' | 'enum' | 'interface' | 'union' | 'scalar';
  description?: string;
  fields?: ParsedGraphQLField[];
  values?: string[];  // For enums
  types?: string[];   // For unions
  location: {
    startLine: number;
    endLine: number;
  };
}

export interface ParsedGraphQLField {
  name: string;
  type: string;
  args?: ParsedGraphQLArgument[];
  description?: string;
  deprecated?: boolean;
  deprecationReason?: string;
}

export interface ParsedGraphQLArgument {
  name: string;
  type: string;
  defaultValue?: any;
  description?: string;
}

export interface ParsedGraphQLOperation {
  name: string;
  type: 'query' | 'mutation' | 'subscription';
  returnType: string;
  args?: ParsedGraphQLArgument[];
  description?: string;
  deprecated?: boolean;
  location: {
    startLine: number;
    endLine: number;
  };
}

export interface ParsedGraphQLDirective {
  name: string;
  locations: string[];
  args?: ParsedGraphQLArgument[];
  description?: string;
}

export class GraphQLSchemaParser {
  /**
   * Parse a GraphQL schema file
   */
  static parseFile(filePath: string): ParsedGraphQL {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    try {
      // Parse SDL
      const documentAST = parse(content);
      
      // Build schema
      const schema = buildSchema(content);

      // Extract types
      const types = this.extractTypes(schema, content);

      // Extract operations
      const { queries, mutations, subscriptions } = this.extractOperations(schema, content);

      // Extract directives
      const directives = this.extractDirectives(schema);

      return {
        path: filePath,
        hash,
        types,
        queries,
        mutations,
        subscriptions,
        directives,
      };
    } catch (error) {
      throw new Error(`Failed to parse GraphQL schema ${filePath}: ${error}`);
    }
  }

  /**
   * Check if a file is a GraphQL schema file
   */
  static isGraphQLFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    // Check by extension
    if (!['.graphql', '.gql', '.graphqls'].includes(ext)) {
      return false;
    }

    // Exclude test files
    if (basename.includes('.test.') || basename.includes('.spec.')) {
      return false;
    }

    return true;
  }

  /**
   * Extract types from schema
   */
  private static extractTypes(schema: GraphQLSchema, content: string): ParsedGraphQLType[] {
    const types: ParsedGraphQLType[] = [];
    const typeMap = schema.getTypeMap();
    const lines = content.split('\n');

    for (const [typeName, type] of Object.entries(typeMap)) {
      // Skip built-in types
      if (typeName.startsWith('__')) {
        continue;
      }

      // Skip Query, Mutation, Subscription (handled separately)
      if (['Query', 'Mutation', 'Subscription'].includes(typeName)) {
        continue;
      }

      // Find line number
      const location = this.findTypeLocation(typeName, lines);

      if (isObjectType(type)) {
        types.push(this.extractObjectType(type, location));
      } else if (isInterfaceType(type)) {
        types.push(this.extractInterfaceType(type, location));
      } else if (isInputObjectType(type)) {
        types.push(this.extractInputObjectType(type, location));
      } else if (isEnumType(type)) {
        types.push(this.extractEnumType(type, location));
      } else if (isUnionType(type)) {
        types.push(this.extractUnionType(type, location));
      } else if (isScalarType(type) && !this.isBuiltInScalar(typeName)) {
        types.push(this.extractScalarType(type, location));
      }
    }

    return types;
  }

  /**
   * Extract object type
   */
  private static extractObjectType(
    type: GraphQLObjectType,
    location: { startLine: number; endLine: number }
  ): ParsedGraphQLType {
    const fields = Object.values(type.getFields()).map(field => 
      this.extractField(field)
    );

    return {
      name: type.name,
      kind: 'object',
      description: type.description || undefined,
      fields,
      location,
    };
  }

  /**
   * Extract interface type
   */
  private static extractInterfaceType(
    type: GraphQLInterfaceType,
    location: { startLine: number; endLine: number }
  ): ParsedGraphQLType {
    const fields = Object.values(type.getFields()).map(field => 
      this.extractField(field)
    );

    return {
      name: type.name,
      kind: 'interface',
      description: type.description || undefined,
      fields,
      location,
    };
  }

  /**
   * Extract input object type
   */
  private static extractInputObjectType(
    type: GraphQLInputObjectType,
    location: { startLine: number; endLine: number }
  ): ParsedGraphQLType {
    const fields = Object.values(type.getFields()).map(field => 
      this.extractInputField(field)
    );

    return {
      name: type.name,
      kind: 'input',
      description: type.description || undefined,
      fields,
      location,
    };
  }

  /**
   * Extract enum type
   */
  private static extractEnumType(
    type: GraphQLEnumType,
    location: { startLine: number; endLine: number }
  ): ParsedGraphQLType {
    const values = type.getValues().map(value => value.name);

    return {
      name: type.name,
      kind: 'enum',
      description: type.description || undefined,
      values,
      location,
    };
  }

  /**
   * Extract union type
   */
  private static extractUnionType(
    type: GraphQLUnionType,
    location: { startLine: number; endLine: number }
  ): ParsedGraphQLType {
    const types = type.getTypes().map(t => t.name);

    return {
      name: type.name,
      kind: 'union',
      description: type.description || undefined,
      types,
      location,
    };
  }

  /**
   * Extract scalar type
   */
  private static extractScalarType(
    type: GraphQLScalarType,
    location: { startLine: number; endLine: number }
  ): ParsedGraphQLType {
    return {
      name: type.name,
      kind: 'scalar',
      description: type.description || undefined,
      location,
    };
  }

  /**
   * Extract field
   */
  private static extractField(field: GraphQLField<any, any>): ParsedGraphQLField {
    const args = field.args.map(arg => this.extractArgument(arg));

    return {
      name: field.name,
      type: field.type.toString(),
      args: args.length > 0 ? args : undefined,
      description: field.description || undefined,
      deprecated: field.deprecationReason !== undefined,
      deprecationReason: field.deprecationReason || undefined,
    };
  }

  /**
   * Extract input field
   */
  private static extractInputField(field: GraphQLInputField): ParsedGraphQLField {
    return {
      name: field.name,
      type: field.type.toString(),
      description: field.description || undefined,
    };
  }

  /**
   * Extract argument
   */
  private static extractArgument(arg: GraphQLArgument): ParsedGraphQLArgument {
    return {
      name: arg.name,
      type: arg.type.toString(),
      defaultValue: arg.defaultValue,
      description: arg.description || undefined,
    };
  }

  /**
   * Extract operations (queries, mutations, subscriptions)
   */
  private static extractOperations(
    schema: GraphQLSchema,
    content: string
  ): {
    queries: ParsedGraphQLOperation[];
    mutations: ParsedGraphQLOperation[];
    subscriptions: ParsedGraphQLOperation[];
  } {
    const lines = content.split('\n');
    const queries: ParsedGraphQLOperation[] = [];
    const mutations: ParsedGraphQLOperation[] = [];
    const subscriptions: ParsedGraphQLOperation[] = [];

    // Extract queries
    const queryType = schema.getQueryType();
    if (queryType) {
      const queryFields = Object.values(queryType.getFields());
      for (const field of queryFields) {
        const location = this.findFieldLocation('Query', field.name, lines);
        queries.push(this.extractOperation(field, 'query', location));
      }
    }

    // Extract mutations
    const mutationType = schema.getMutationType();
    if (mutationType) {
      const mutationFields = Object.values(mutationType.getFields());
      for (const field of mutationFields) {
        const location = this.findFieldLocation('Mutation', field.name, lines);
        mutations.push(this.extractOperation(field, 'mutation', location));
      }
    }

    // Extract subscriptions
    const subscriptionType = schema.getSubscriptionType();
    if (subscriptionType) {
      const subscriptionFields = Object.values(subscriptionType.getFields());
      for (const field of subscriptionFields) {
        const location = this.findFieldLocation('Subscription', field.name, lines);
        subscriptions.push(this.extractOperation(field, 'subscription', location));
      }
    }

    return { queries, mutations, subscriptions };
  }

  /**
   * Extract operation
   */
  private static extractOperation(
    field: GraphQLField<any, any>,
    type: 'query' | 'mutation' | 'subscription',
    location: { startLine: number; endLine: number }
  ): ParsedGraphQLOperation {
    const args = field.args.map(arg => this.extractArgument(arg));

    return {
      name: field.name,
      type,
      returnType: field.type.toString(),
      args: args.length > 0 ? args : undefined,
      description: field.description || undefined,
      deprecated: field.deprecationReason !== undefined,
      location,
    };
  }

  /**
   * Extract directives
   */
  private static extractDirectives(schema: GraphQLSchema): ParsedGraphQLDirective[] {
    const directives: ParsedGraphQLDirective[] = [];

    for (const directive of schema.getDirectives()) {
      // Skip built-in directives
      if (['skip', 'include', 'deprecated', 'specifiedBy'].includes(directive.name)) {
        continue;
      }

      const args = directive.args.map(arg => this.extractArgument(arg));

      directives.push({
        name: directive.name,
        locations: directive.locations.map(loc => loc.toString()),
        args: args.length > 0 ? args : undefined,
        description: directive.description || undefined,
      });
    }

    return directives;
  }

  /**
   * Find type location in source
   */
  private static findTypeLocation(
    typeName: string,
    lines: string[]
  ): { startLine: number; endLine: number } {
    const typeRegex = new RegExp(`^\\s*(type|interface|input|enum|union|scalar)\\s+${typeName}\\b`);
    
    const startLineIndex = lines.findIndex(line => typeRegex.test(line));
    if (startLineIndex === -1) {
      return { startLine: 1, endLine: 1 };
    }

    // Find closing brace
    let endLineIndex = startLineIndex;
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = startLineIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('{')) {
        braceCount++;
        foundOpenBrace = true;
      }
      if (line.includes('}')) {
        braceCount--;
      }
      if (foundOpenBrace && braceCount === 0) {
        endLineIndex = i;
        break;
      }
    }

    return {
      startLine: startLineIndex + 1,
      endLine: endLineIndex + 1,
    };
  }

  /**
   * Find field location in source
   */
  private static findFieldLocation(
    typeName: string,
    fieldName: string,
    lines: string[]
  ): { startLine: number; endLine: number } {
    const typeLocation = this.findTypeLocation(typeName, lines);
    const fieldRegex = new RegExp(`^\\s*${fieldName}\\s*[:(]`);

    for (let i = typeLocation.startLine - 1; i < typeLocation.endLine; i++) {
      if (fieldRegex.test(lines[i])) {
        return {
          startLine: i + 1,
          endLine: i + 1,
        };
      }
    }

    return typeLocation;
  }

  /**
   * Check if scalar is built-in
   */
  private static isBuiltInScalar(name: string): boolean {
    return ['String', 'Int', 'Float', 'Boolean', 'ID'].includes(name);
  }

  /**
   * Get a summary of the schema
   */
  static getSummary(parsed: ParsedGraphQL): {
    typeCount: number;
    queryCount: number;
    mutationCount: number;
    subscriptionCount: number;
    directiveCount: number;
  } {
    return {
      typeCount: parsed.types.length,
      queryCount: parsed.queries.length,
      mutationCount: parsed.mutations.length,
      subscriptionCount: parsed.subscriptions.length,
      directiveCount: parsed.directives.length,
    };
  }
}
