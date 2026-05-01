#!/bin/bash

# Script to safely reset code-brain database
# Usage: ./reset-codebrain-db.sh [project-path]

PROJECT_PATH="${1:-.}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Code-Brain Database Reset Utility                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Project: $PROJECT_PATH"
echo ""

# Check if .codebrain exists
if [ ! -d "$PROJECT_PATH/.codebrain" ]; then
    echo "ℹ️  No .codebrain directory found. Nothing to reset."
    echo ""
    echo "Run: code-brain init --path $PROJECT_PATH"
    exit 0
fi

# Backup if exists
echo "📦 Creating backup..."
BACKUP_NAME=".codebrain.backup.$(date +%Y%m%d_%H%M%S)"
if cp -r "$PROJECT_PATH/.codebrain" "$PROJECT_PATH/$BACKUP_NAME" 2>/dev/null; then
    echo "✓ Backup created: $BACKUP_NAME"
else
    echo "⚠️  Warning: Could not create backup"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Remove old database
echo ""
echo "🗑️  Removing old database..."
if rm -rf "$PROJECT_PATH/.codebrain"; then
    echo "✓ Database removed"
else
    echo "✗ Failed to remove database"
    exit 1
fi

# Re-initialize
echo ""
echo "🔧 Re-initializing..."
if node dist/index.js init --path "$PROJECT_PATH" > /dev/null 2>&1; then
    echo "✓ Initialized"
else
    echo "✗ Initialization failed"
    exit 1
fi

# Re-index
echo ""
echo "📊 Re-indexing (this may take a moment)..."
if node dist/index.js index --path "$PROJECT_PATH"; then
    echo ""
    echo "✓ Indexing complete"
else
    echo ""
    echo "✗ Indexing failed"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              ✅ Database Reset Complete!                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Your project has been successfully re-indexed."
echo "Backup saved to: $BACKUP_NAME"
echo ""
echo "Next steps:"
echo "  • View graph: code-brain graph --path $PROJECT_PATH --port 4010"
echo "  • Export data: code-brain export --path $PROJECT_PATH --format json"
echo ""
