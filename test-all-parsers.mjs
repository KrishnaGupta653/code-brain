import { Parser } from './dist/parser/index.js';
import fs from 'fs';
import path from 'path';

const testFiles = [
  { file: 'test-languages/test.rs', language: 'Rust' },
  { file: 'test-languages/Test.cs', language: 'C#' },
  { file: 'test-languages/test.rb', language: 'Ruby' },
  { file: 'test-languages/test.php', language: 'PHP' },
  { file: 'test-languages/Test.kt', language: 'Kotlin' },
  { file: 'test-languages/Test.scala', language: 'Scala' },
  { file: 'test-languages/test.ex', language: 'Elixir' },
  { file: 'test-languages/Test.hs', language: 'Haskell' },
];

console.log('=== Testing All Language Parsers ===\n');

let totalPassed = 0;
let totalFailed = 0;

for (const { file, language } of testFiles) {
  try {
    if (!fs.existsSync(file)) {
      console.log(`⚠ ${language}: File not found - ${file}`);
      totalFailed++;
      continue;
    }

    const parsed = Parser.parseFile(file);
    
    console.log(`✓ ${language} (${path.basename(file)})`);
    console.log(`  Language: ${parsed.language}`);
    console.log(`  Symbols: ${parsed.symbols.length}`);
    console.log(`  Imports: ${parsed.imports.length}`);
    console.log(`  Exports: ${parsed.exports.length}`);
    
    if (parsed.symbols.length > 0) {
      console.log(`  Sample symbols:`);
      parsed.symbols.slice(0, 5).forEach(sym => {
        console.log(`    - ${sym.type}: ${sym.name}${sym.owner ? ` (in ${sym.owner})` : ''}`);
      });
    }
    
    console.log('');
    totalPassed++;
  } catch (error) {
    console.error(`✗ ${language}: ${error.message}`);
    console.error(`  File: ${file}`);
    console.error('');
    totalFailed++;
  }
}

console.log('=== Summary ===');
console.log(`Total: ${testFiles.length}`);
console.log(`Passed: ${totalPassed}`);
console.log(`Failed: ${totalFailed}`);
console.log(`Success Rate: ${((totalPassed / testFiles.length) * 100).toFixed(1)}%`);

if (totalFailed === 0) {
  console.log('\n🎉 All parsers working correctly!');
} else {
  console.log(`\n⚠ ${totalFailed} parser(s) need attention`);
  process.exit(1);
}
