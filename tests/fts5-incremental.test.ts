/**
 * Test FTS5 incremental update functionality
 * Verifies that the nodes_fts virtual table is properly populated
 * on INSERT, UPDATE, and DELETE operations via triggers.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SQLiteStorage } from '../src/storage/sqlite.js';
import { GraphModel } from '../src/graph/index.js';
import { createGraphNode } from '../src/graph/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FTS5 Incremental Update', () => {
  let storage: SQLiteStorage;
  let testDir: string;
  let dbPath: string;
  const projectRoot = '/test/project';

  beforeEach(() => {
    // Create temporary directory for test database
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebrain-fts5-test-'));
    dbPath = path.join(testDir, 'test.db');
    storage = new SQLiteStorage(dbPath);

    // Initialize project
    storage.saveProject({
      name: 'test-project',
      root: projectRoot,
      language: 'typescript',
      version: '1.0.0',
      entryPoints: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    storage.close();
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should populate FTS5 table on initial graph save', () => {
    const graph = new GraphModel();
    
    // Add test nodes
    const node1 = createGraphNode(
      'node1',
      'function',
      'getUserData',
      { file: 'test.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'getUserData',
      'Fetches user data from database',
      {}
    );
    
    const node2 = createGraphNode(
      'node2',
      'function',
      'validateUser',
      { file: 'test.ts', startLine: 12, endLine: 20, startCol: 0, endCol: 0 },
      'validateUser',
      'Validates user credentials',
      {}
    );
    
    graph.addNode(node1);
    graph.addNode(node2);
    
    // Save graph
    storage.replaceGraph(projectRoot, graph);
    
    // Search using FTS5
    const results = storage.searchNodes(projectRoot, 'getUserData', 10);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nodeId).toBe('node1');
  });

  it('should update FTS5 table on incremental node addition', () => {
    // Initial graph
    const graph1 = new GraphModel();
    const node1 = createGraphNode(
      'node1',
      'function',
      'initialFunction',
      { file: 'test.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'initialFunction',
      'Initial function',
      {}
    );
    graph1.addNode(node1);
    storage.replaceGraph(projectRoot, graph1);
    
    // Add new node
    const graph2 = new GraphModel();
    graph2.addNode(node1);
    const node2 = createGraphNode(
      'node2',
      'function',
      'newFunction',
      { file: 'test.ts', startLine: 12, endLine: 20, startCol: 0, endCol: 0 },
      'newFunction',
      'Newly added function',
      {}
    );
    graph2.addNode(node2);
    storage.replaceGraph(projectRoot, graph2);
    
    // Search for new node
    const results = storage.searchNodes(projectRoot, 'newFunction', 10);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nodeId).toBe('node2');
  });

  it('should remove from FTS5 table when node is deleted', () => {
    // Initial graph with two nodes
    const graph1 = new GraphModel();
    const node1 = createGraphNode(
      'node1',
      'function',
      'keepFunction',
      { file: 'test.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'keepFunction',
      'Function to keep',
      {}
    );
    const node2 = createGraphNode(
      'node2',
      'function',
      'deleteFunction',
      { file: 'test.ts', startLine: 12, endLine: 20, startCol: 0, endCol: 0 },
      'deleteFunction',
      'Function to delete',
      {}
    );
    graph1.addNode(node1);
    graph1.addNode(node2);
    storage.replaceGraph(projectRoot, graph1);
    
    // Verify both are searchable
    let results = storage.searchNodes(projectRoot, 'deleteFunction', 10);
    expect(results.length).toBeGreaterThan(0);
    
    // Remove node2
    const graph2 = new GraphModel();
    graph2.addNode(node1);
    storage.replaceGraph(projectRoot, graph2);
    
    // Verify node2 is no longer searchable
    results = storage.searchNodes(projectRoot, 'deleteFunction', 10);
    expect(results.length).toBe(0);
    
    // Verify node1 is still searchable
    results = storage.searchNodes(projectRoot, 'keepFunction', 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should update FTS5 table when node is modified', () => {
    // Initial graph
    const graph1 = new GraphModel();
    const node1 = createGraphNode(
      'node1',
      'function',
      'originalName',
      { file: 'test.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'originalName',
      'Original summary',
      {}
    );
    graph1.addNode(node1);
    storage.replaceGraph(projectRoot, graph1);
    
    // Verify original is searchable
    let results = storage.searchNodes(projectRoot, 'originalName', 10);
    expect(results.length).toBeGreaterThan(0);
    
    // Update node
    const graph2 = new GraphModel();
    const node2 = createGraphNode(
      'node1', // Same ID
      'function',
      'updatedName',
      { file: 'test.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'updatedName',
      'Updated summary',
      {}
    );
    graph2.addNode(node2);
    storage.replaceGraph(projectRoot, graph2);
    
    // Verify old name is not searchable
    results = storage.searchNodes(projectRoot, 'originalName', 10);
    expect(results.length).toBe(0);
    
    // Verify new name is searchable
    results = storage.searchNodes(projectRoot, 'updatedName', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nodeId).toBe('node1');
  });

  it('should support FTS5 query syntax', () => {
    const graph = new GraphModel();
    
    // Add multiple nodes
    const nodes = [
      createGraphNode('n1', 'function', 'getUserData', 
        { file: 'user.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
        'getUserData', 'Get user data', {}),
      createGraphNode('n2', 'function', 'getUserProfile', 
        { file: 'user.ts', startLine: 12, endLine: 20, startCol: 0, endCol: 0 },
        'getUserProfile', 'Get user profile', {}),
      createGraphNode('n3', 'function', 'deleteUser', 
        { file: 'user.ts', startLine: 22, endLine: 30, startCol: 0, endCol: 0 },
        'deleteUser', 'Delete user', {}),
      createGraphNode('n4', 'function', 'validateEmail', 
        { file: 'validation.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
        'validateEmail', 'Validate email address', {}),
    ];
    
    nodes.forEach(n => graph.addNode(n));
    storage.replaceGraph(projectRoot, graph);
    
    // Test prefix search
    let results = storage.searchNodes(projectRoot, 'getUser*', 10);
    expect(results.length).toBe(2);
    
    // Test AND operator
    results = storage.searchNodes(projectRoot, 'user AND data', 10);
    expect(results.length).toBeGreaterThan(0);
    
    // Test OR operator
    results = storage.searchNodes(projectRoot, 'delete OR validate', 10);
    expect(results.length).toBe(2);
    
    // Test phrase search
    results = storage.searchNodes(projectRoot, '"user profile"', 10);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should rank results by relevance using BM25', () => {
    const graph = new GraphModel();
    
    // Add nodes with varying relevance
    const nodes = [
      createGraphNode('n1', 'function', 'authenticate', 
        { file: 'auth.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
        'authenticate', 'Authenticate user credentials', {}),
      createGraphNode('n2', 'function', 'authenticateUser', 
        { file: 'auth.ts', startLine: 12, endLine: 20, startCol: 0, endCol: 0 },
        'authenticateUser', 'User authentication function', {}),
      createGraphNode('n3', 'function', 'checkAuth', 
        { file: 'auth.ts', startLine: 22, endLine: 30, startCol: 0, endCol: 0 },
        'checkAuth', 'Check authentication status', {}),
    ];
    
    nodes.forEach(n => graph.addNode(n));
    storage.replaceGraph(projectRoot, graph);
    
    // Search for "authenticate"
    const results = storage.searchNodes(projectRoot, 'authenticate', 10);
    
    expect(results.length).toBeGreaterThan(0);
    // Results should be ranked by relevance
    expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
  });

  it('should handle special characters in search queries', () => {
    const graph = new GraphModel();
    
    const node = createGraphNode(
      'node1',
      'function',
      'get_user_data',
      { file: 'test.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'get_user_data',
      'Get user data with underscore',
      {}
    );
    
    graph.addNode(node);
    storage.replaceGraph(projectRoot, graph);
    
    // Search with underscore
    const results = storage.searchNodes(projectRoot, 'get_user_data', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].nodeId).toBe('node1');
  });

  it('should return empty results for non-existent queries', () => {
    const graph = new GraphModel();
    
    const node = createGraphNode(
      'node1',
      'function',
      'existingFunction',
      { file: 'test.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'existingFunction',
      'Existing function',
      {}
    );
    
    graph.addNode(node);
    storage.replaceGraph(projectRoot, graph);
    
    // Search for non-existent term
    const results = storage.searchNodes(projectRoot, 'nonExistentFunction', 10);
    expect(results.length).toBe(0);
  });

  it('should search across multiple fields (name, full_name, summary, file_path)', () => {
    const graph = new GraphModel();
    
    const node = createGraphNode(
      'node1',
      'function',
      'myFunction',
      { file: 'src/utils/helper.ts', startLine: 1, endLine: 10, startCol: 0, endCol: 0 },
      'myFunction',
      'Helper function for data processing',
      {}
    );
    
    graph.addNode(node);
    storage.replaceGraph(projectRoot, graph);
    
    // Search by name
    let results = storage.searchNodes(projectRoot, 'myFunction', 10);
    expect(results.length).toBeGreaterThan(0);
    
    // Search by summary content
    results = storage.searchNodes(projectRoot, 'processing', 10);
    expect(results.length).toBeGreaterThan(0);
    
    // Search by file path
    results = storage.searchNodes(projectRoot, 'helper', 10);
    expect(results.length).toBeGreaterThan(0);
  });
});
