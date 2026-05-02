import { OpenAPIParser } from './dist/parser/openapi.js';
import { GraphQLSchemaParser } from './dist/parser/graphql-schema.js';

console.log('=== Testing OpenAPI Parser ===\n');

try {
  const openapi = OpenAPIParser.parseFile('test-api/openapi.yaml');
  console.log('✓ Parsed OpenAPI file successfully');
  console.log(`  Version: ${openapi.version}`);
  console.log(`  Title: ${openapi.info.title}`);
  console.log(`  Servers: ${openapi.servers.length}`);
  console.log(`  Paths: ${openapi.paths.length}`);
  
  const summary = OpenAPIParser.getSummary(openapi);
  console.log(`  Endpoints: ${summary.endpointCount}`);
  console.log(`  Schemas: ${summary.schemaCount}`);
  console.log(`  Methods:`, summary.methods);
  console.log(`  Tags:`, summary.tags);
  
  console.log('\n  Endpoints:');
  for (const path of openapi.paths) {
    for (const op of path.operations) {
      console.log(`    ${op.method} ${path.path} (${op.operationId})`);
    }
  }
  
  console.log('\n  Schemas:');
  if (openapi.components?.schemas) {
    for (const schemaName of Object.keys(openapi.components.schemas)) {
      console.log(`    ${schemaName}`);
    }
  }
} catch (error) {
  console.error('✗ Failed to parse OpenAPI:', error.message);
}

console.log('\n=== Testing GraphQL Parser ===\n');

try {
  const graphql = GraphQLSchemaParser.parseFile('test-api/schema.graphql');
  console.log('✓ Parsed GraphQL schema successfully');
  
  const summary = GraphQLSchemaParser.getSummary(graphql);
  console.log(`  Types: ${summary.typeCount}`);
  console.log(`  Queries: ${summary.queryCount}`);
  console.log(`  Mutations: ${summary.mutationCount}`);
  console.log(`  Subscriptions: ${summary.subscriptionCount}`);
  
  console.log('\n  Types:');
  for (const type of graphql.types) {
    console.log(`    ${type.name} (${type.kind})`);
  }
  
  console.log('\n  Queries:');
  for (const query of graphql.queries) {
    const args = query.args ? `(${query.args.map(a => `${a.name}: ${a.type}`).join(', ')})` : '';
    console.log(`    ${query.name}${args}: ${query.returnType}`);
  }
  
  console.log('\n  Mutations:');
  for (const mutation of graphql.mutations) {
    const args = mutation.args ? `(${mutation.args.map(a => `${a.name}: ${a.type}`).join(', ')})` : '';
    console.log(`    ${mutation.name}${args}: ${mutation.returnType}`);
  }
  
  console.log('\n  Subscriptions:');
  for (const subscription of graphql.subscriptions) {
    const args = subscription.args ? `(${subscription.args.map(a => `${a.name}: ${a.type}`).join(', ')})` : '';
    console.log(`    ${subscription.name}${args}: ${subscription.returnType}`);
  }
} catch (error) {
  console.error('✗ Failed to parse GraphQL:', error.message);
}

console.log('\n=== All Tests Complete ===');
