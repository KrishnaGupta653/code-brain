#!/usr/bin/env node

/**
 * Verify code-brain is ready for npm publishing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔍 Verifying code-brain is ready for npm publishing...\n');

let allGood = true;

// Check 1: package.json exists and is valid
console.log('1️⃣  Checking package.json...');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  
  // Check required fields
  const required = ['name', 'version', 'description', 'main', 'bin', 'license'];
  const missing = required.filter(field => !pkg[field]);
  
  if (missing.length > 0) {
    console.log('   ❌ Missing required fields:', missing.join(', '));
    allGood = false;
  } else {
    console.log('   ✅ All required fields present');
  }
  
  // Check if author is customized
  if (!pkg.author || pkg.author === '') {
    console.log('   ⚠️  Author field is empty - you should add your name and email');
    console.log('      Example: "Your Name <your.email@example.com>"');
  } else {
    console.log('   ✅ Author field set:', pkg.author);
  }
  
  // Check if repository is customized
  if (!pkg.repository || pkg.repository.url.includes('yourusername')) {
    console.log('   ⚠️  Repository URL contains placeholder "yourusername"');
    console.log('      Update to your actual GitHub username');
  } else {
    console.log('   ✅ Repository URL set:', pkg.repository.url);
  }
  
  // Check version
  console.log('   ✅ Version:', pkg.version);
  
  // Check bin
  if (pkg.bin && pkg.bin['code-brain']) {
    console.log('   ✅ CLI command: code-brain →', pkg.bin['code-brain']);
  }
  
} catch (error) {
  console.log('   ❌ Error reading package.json:', error.message);
  allGood = false;
}

console.log();

// Check 2: Build artifacts exist
console.log('2️⃣  Checking build artifacts...');

const requiredFiles = [
  'dist/cli/cli.js',
  'dist/index.js',
  'ui/dist/index.html',
];

for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    const size = (stats.size / 1024).toFixed(2);
    console.log(`   ✅ ${file} (${size} KB)`);
  } else {
    console.log(`   ❌ ${file} - MISSING! Run: npm run build`);
    allGood = false;
  }
}

console.log();

// Check 3: Documentation files exist
console.log('3️⃣  Checking documentation...');

const docs = [
  'README.md',
  'LICENSE',
  'QUICK_SETUP.md',
  'USER_GUIDE.md',
  'COMMANDS.md',
  'BENCHMARKS.md',
  'COMPARISON.md',
  'SECURITY.md',
];

for (const doc of docs) {
  if (fs.existsSync(doc)) {
    console.log(`   ✅ ${doc}`);
  } else {
    console.log(`   ⚠️  ${doc} - missing (optional)`);
  }
}

console.log();

// Check 4: Files configuration
console.log('4️⃣  Checking files configuration...');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  
  if (pkg.files && Array.isArray(pkg.files)) {
    console.log('   ✅ Files field configured');
    console.log('   📦 Will publish:', pkg.files.join(', '));
  } else {
    console.log('   ⚠️  No files field - will publish everything (not recommended)');
  }
} catch (error) {
  console.log('   ❌ Error checking files:', error.message);
}

console.log();

// Check 5: .npmignore or .gitignore
console.log('5️⃣  Checking ignore files...');

if (fs.existsSync('.npmignore')) {
  console.log('   ✅ .npmignore exists');
} else if (fs.existsSync('.gitignore')) {
  console.log('   ✅ .gitignore exists (npm will use this)');
} else {
  console.log('   ⚠️  No ignore files found');
}

console.log();

// Check 6: License file
console.log('6️⃣  Checking license...');

if (fs.existsSync('LICENSE')) {
  const license = fs.readFileSync('LICENSE', 'utf-8');
  if (license.includes('MIT')) {
    console.log('   ✅ MIT License found');
  } else {
    console.log('   ✅ License file exists');
  }
} else {
  console.log('   ⚠️  LICENSE file missing - should add one');
}

console.log();

// Check 7: Estimate package size
console.log('7️⃣  Estimating package size...');

function getDirectorySize(dir) {
  let size = 0;
  if (!fs.existsSync(dir)) return 0;
  
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += fs.statSync(filePath).size;
    }
  }
  return size;
}

const distSize = getDirectorySize('dist');
const uiSize = getDirectorySize('ui/dist');
const pythonSize = getDirectorySize('python');

const totalSize = distSize + uiSize + pythonSize;
const totalMB = (totalSize / 1024 / 1024).toFixed(2);

console.log(`   📦 dist/: ${(distSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`   📦 ui/dist/: ${(uiSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`   📦 python/: ${(pythonSize / 1024).toFixed(2)} KB`);
console.log(`   📦 Total: ~${totalMB} MB`);

if (totalSize > 10 * 1024 * 1024) {
  console.log('   ⚠️  Package is large (>10MB) - consider optimizing');
} else {
  console.log('   ✅ Package size is reasonable');
}

console.log();

// Final summary
console.log('━'.repeat(60));
console.log();

if (allGood) {
  console.log('✅ All checks passed! Ready to publish to npm! 🚀\n');
  console.log('Next steps:');
  console.log('1. Update package.json author and repository fields');
  console.log('2. Run: npm login');
  console.log('3. Run: npm publish --access public');
  console.log('4. Verify: https://www.npmjs.com/package/code-brain');
  console.log();
  console.log('See PUBLISH_CHECKLIST.md for detailed steps.');
} else {
  console.log('❌ Some issues found. Please fix them before publishing.\n');
  console.log('Common fixes:');
  console.log('• Run: npm run build');
  console.log('• Update package.json fields');
  console.log('• Add missing documentation');
  console.log();
  console.log('See PUBLISHING.md for troubleshooting.');
}

console.log();
