#!/bin/bash

# Database Diagnostic and Repair Script
# This script helps diagnose and fix database initialization issues

set -e

DB_PATH="$1"

if [ -z "$DB_PATH" ]; then
  echo "Usage: ./diagnose-db.sh <path-to-project>"
  echo "Example: ./diagnose-db.sh /Users/krishnagupta/rtdd/pg-rtdd-consume-prod"
  exit 1
fi

CODEBRAIN_DIR="$DB_PATH/.codebrain"
DB_FILE="$CODEBRAIN_DIR/graph.db"

echo "========================================="
echo "Code-Brain Database Diagnostic Tool"
echo "========================================="
echo ""
echo "Project path: $DB_PATH"
echo "Database path: $DB_FILE"
echo ""

# Check if .codebrain directory exists
if [ ! -d "$CODEBRAIN_DIR" ]; then
  echo "✓ No .codebrain directory found (clean state)"
  echo ""
  echo "You can now run: node dist/index.js index --path \"$DB_PATH\""
  exit 0
fi

echo "Found .codebrain directory"
echo ""

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
  echo "✓ No database file found (clean state)"
  echo ""
  echo "You can now run: node dist/index.js index --path \"$DB_PATH\""
  exit 0
fi

echo "Found database file: $DB_FILE"
echo "Size: $(du -h "$DB_FILE" | cut -f1)"
echo ""

# Check if database is locked
if lsof "$DB_FILE" 2>/dev/null | grep -q "$DB_FILE"; then
  echo "⚠️  WARNING: Database is currently locked by another process:"
  lsof "$DB_FILE" 2>/dev/null
  echo ""
  echo "SOLUTION: Close any running code-brain processes and try again"
  exit 1
fi

echo "✓ Database is not locked"
echo ""

# Try to open database with sqlite3
if command -v sqlite3 &> /dev/null; then
  echo "Testing database integrity with sqlite3..."
  if sqlite3 "$DB_FILE" "PRAGMA integrity_check;" 2>&1 | grep -q "ok"; then
    echo "✓ Database integrity check passed"
    echo ""
    
    # Check schema version
    SCHEMA_VERSION=$(sqlite3 "$DB_FILE" "SELECT MAX(version) FROM schema_version;" 2>/dev/null || echo "0")
    echo "Current schema version: $SCHEMA_VERSION"
    echo "Expected schema version: 13"
    echo ""
    
    if [ "$SCHEMA_VERSION" -lt 13 ]; then
      echo "⚠️  Database needs migration from v$SCHEMA_VERSION to v13"
      echo ""
      echo "SOLUTION: Run the index command to trigger migration:"
      echo "  node dist/index.js index --path \"$DB_PATH\""
      echo ""
      echo "If migration fails, backup and reset:"
      echo "  cp -r \"$CODEBRAIN_DIR\" \"${CODEBRAIN_DIR}.backup\""
      echo "  rm -rf \"$CODEBRAIN_DIR\""
      echo "  node dist/index.js index --path \"$DB_PATH\""
    else
      echo "✓ Database is at correct schema version"
      echo ""
      echo "If you're still getting errors, the database may be corrupted."
      echo "SOLUTION: Backup and reset:"
      echo "  cp -r \"$CODEBRAIN_DIR\" \"${CODEBRAIN_DIR}.backup\""
      echo "  rm -rf \"$CODEBRAIN_DIR\""
      echo "  node dist/index.js index --path \"$DB_PATH\""
    fi
  else
    echo "✗ Database integrity check FAILED"
    echo ""
    echo "The database is corrupted and needs to be reset."
    echo ""
    echo "SOLUTION: Backup and reset:"
    echo "  cp -r \"$CODEBRAIN_DIR\" \"${CODEBRAIN_DIR}.backup\""
    echo "  rm -rf \"$CODEBRAIN_DIR\""
    echo "  node dist/index.js index --path \"$DB_PATH\""
  fi
else
  echo "⚠️  sqlite3 command not found, skipping integrity check"
  echo ""
  echo "If you're getting initialization errors, try resetting:"
  echo "  cp -r \"$CODEBRAIN_DIR\" \"${CODEBRAIN_DIR}.backup\""
  echo "  rm -rf \"$CODEBRAIN_DIR\""
  echo "  node dist/index.js index --path \"$DB_PATH\""
fi

echo ""
echo "========================================="
echo "Diagnostic complete"
echo "========================================="
