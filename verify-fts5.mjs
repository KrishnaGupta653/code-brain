/**
 * Quick verification script for FTS5 functionality
 * Tests that FTS5 triggers work correctly on incremental updates
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create temp database
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fts5-test-'));
const dbPath = path.join(testDir, 'test.db');

console.log('🧪 Testing FTS5 Incremental Updates...\n');

try {
  const db = new Database(dbPath);
  
  // Set up database
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  // Create tables
  db.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      full_name TEXT,
      summary TEXT,
      file_path TEXT,
      type TEXT NOT NULL
    );
    
    CREATE VIRTUAL TABLE nodes_fts USING fts5(
      node_id UNINDEXED,
      name,
      full_name,
      summary,
      file_path,
      tokenize='porter unicode61'
    );
    
    -- Create triggers
    CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
      INSERT INTO nodes_fts(node_id, name, full_name, summary, file_path)
      VALUES (new.id, new.name, 
              COALESCE(new.full_name, ''), 
              COALESCE(new.summary, ''), 
              COALESCE(new.file_path, ''));
    END;
    
    CREATE TRIGGER nodes_fts_delete AFTER DELETE ON nodes BEGIN
      DELETE FROM nodes_fts WHERE node_id = old.id;
    END;
    
    CREATE TRIGGER nodes_fts_update AFTER UPDATE ON nodes BEGIN
      DELETE FROM nodes_fts WHERE node_id = old.id;
      INSERT INTO nodes_fts(node_id, name, full_name, summary, file_path)
      VALUES (new.id, new.name, 
              COALESCE(new.full_name, ''), 
              COALESCE(new.summary, ''), 
              COALESCE(new.file_path, ''));
    END;
  `);
  
  console.log('✅ Database and triggers created');
  
  // Test 1: INSERT trigger
  console.log('\n📝 Test 1: INSERT trigger');
  db.prepare(`
    INSERT INTO nodes (id, name, full_name, summary, file_path, type)
    VALUES ('node1', 'getUserData', 'getUserData', 'Fetches user data', 'user.ts', 'function')
  `).run();
  
  let result = db.prepare(`
    SELECT node_id FROM nodes_fts WHERE name MATCH 'getUserData'
  `).all();
  
  if (result.length > 0 && result[0].node_id === 'node1') {
    console.log('✅ INSERT trigger works - node found in FTS5');
  } else {
    console.log('❌ INSERT trigger failed - node not found in FTS5');
    console.log('   Result:', result);
    process.exit(1);
  }
  
  // Test 2: UPDATE trigger
  console.log('\n📝 Test 2: UPDATE trigger');
  db.prepare(`
    UPDATE nodes SET name = 'fetchUserData' WHERE id = 'node1'
  `).run();
  
  result = db.prepare(`
    SELECT node_id FROM nodes_fts WHERE name MATCH 'fetchUserData'
  `).all();
  
  if (result.length > 0) {
    console.log('✅ UPDATE trigger works - updated name found');
  } else {
    console.log('❌ UPDATE trigger failed - updated name not found');
    process.exit(1);
  }
  
  // Verify old name is gone
  result = db.prepare(`
    SELECT node_id FROM nodes_fts WHERE name MATCH 'getUserData'
  `).all();
  
  if (result.length === 0) {
    console.log('✅ Old name removed from FTS5');
  } else {
    console.log('❌ Old name still in FTS5');
    process.exit(1);
  }
  
  // Test 3: DELETE trigger
  console.log('\n📝 Test 3: DELETE trigger');
  db.prepare(`
    DELETE FROM nodes WHERE id = 'node1'
  `).run();
  
  result = db.prepare(`
    SELECT node_id FROM nodes_fts WHERE name MATCH 'fetchUserData'
  `).all();
  
  if (result.length === 0) {
    console.log('✅ DELETE trigger works - node removed from FTS5');
  } else {
    console.log('❌ DELETE trigger failed - node still in FTS5');
    process.exit(1);
  }
  
  // Test 4: Multiple nodes and search
  console.log('\n📝 Test 4: Multiple nodes and search');
  db.prepare(`
    INSERT INTO nodes (id, name, full_name, summary, file_path, type)
    VALUES 
      ('n1', 'getUserData', 'getUserData', 'Get user data', 'user.ts', 'function'),
      ('n2', 'getUserProfile', 'getUserProfile', 'Get user profile', 'user.ts', 'function'),
      ('n3', 'deleteUser', 'deleteUser', 'Delete user', 'user.ts', 'function'),
      ('n4', 'validateEmail', 'validateEmail', 'Validate email', 'validation.ts', 'function')
  `).run();
  
  // Prefix search
  result = db.prepare(`
    SELECT node_id FROM nodes_fts WHERE name MATCH 'getUser*'
  `).all();
  
  if (result.length === 2) {
    console.log('✅ Prefix search works - found 2 matches');
  } else {
    console.log(`❌ Prefix search failed - found ${result.length} matches, expected 2`);
    process.exit(1);
  }
  
  // BM25 ranking
  result = db.prepare(`
    SELECT node_id, bm25(nodes_fts) as score
    FROM nodes_fts 
    WHERE nodes_fts MATCH 'user'
    ORDER BY bm25(nodes_fts)
    LIMIT 5
  `).all();
  
  if (result.length > 0) {
    console.log(`✅ BM25 ranking works - found ${result.length} results`);
    console.log('   Top result:', result[0].node_id, 'score:', result[0].score.toFixed(2));
  } else {
    console.log('❌ BM25 ranking failed');
    process.exit(1);
  }
  
  // Test 5: Search across fields
  console.log('\n📝 Test 5: Search across fields');
  
  // Search by summary
  result = db.prepare(`
    SELECT node_id FROM nodes_fts WHERE summary MATCH 'profile'
  `).all();
  
  if (result.length > 0 && result[0].node_id === 'n2') {
    console.log('✅ Search by summary works');
  } else {
    console.log('❌ Search by summary failed');
    process.exit(1);
  }
  
  // Search by file path
  result = db.prepare(`
    SELECT node_id FROM nodes_fts WHERE file_path MATCH 'validation'
  `).all();
  
  if (result.length > 0 && result[0].node_id === 'n4') {
    console.log('✅ Search by file path works');
  } else {
    console.log('❌ Search by file path failed');
    process.exit(1);
  }
  
  db.close();
  
  console.log('\n🎉 All FTS5 tests passed!');
  console.log('\n✅ Task 1b Complete: FTS5 incremental update verified');
  console.log('   - INSERT trigger: ✅');
  console.log('   - UPDATE trigger: ✅');
  console.log('   - DELETE trigger: ✅');
  console.log('   - Prefix search: ✅');
  console.log('   - BM25 ranking: ✅');
  console.log('   - Multi-field search: ✅');
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  // Cleanup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}
