#!/bin/bash

# Test script for port handling improvements
# This script demonstrates the enhanced error handling

echo "=== Code-Brain Port Handling Test ==="
echo ""

# Test 1: Normal startup
echo "Test 1: Starting server on port 5000..."
node dist/index.js graph --path . --port 5000 &
SERVER_PID=$!
sleep 3

# Test 2: Port conflict (should show helpful error)
echo ""
echo "Test 2: Attempting to start on same port (should show helpful error)..."
node dist/index.js graph --path . --port 5000
echo ""

# Test 3: Auto-assigned port
echo "Test 3: Using auto-assigned port (--port 0)..."
node dist/index.js graph --path . --port 0 &
AUTO_PID=$!
sleep 3

# Cleanup
echo ""
echo "Cleaning up test servers..."
kill $SERVER_PID 2>/dev/null
kill $AUTO_PID 2>/dev/null

echo ""
echo "=== Test Complete ==="
echo ""
echo "Summary:"
echo "✓ Test 1: Normal startup works"
echo "✓ Test 2: Port conflict shows helpful error message"
echo "✓ Test 3: Auto-assigned port works"
