#!/bin/bash

# Verification script for all fixes
# Tests both the ES module fix and port handling improvements

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Code-Brain Fixes Verification Script              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test 1: ES Module Fix - Indexing
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: ES Module Fix - Indexing Command"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if node dist/index.js index --path . 2>&1 | grep -q "Indexing complete"; then
    echo -e "${GREEN}✓ PASSED${NC} - Indexing works without 'require is not defined' error"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Indexing failed"
    ((FAILED++))
fi
echo ""

# Test 2: Port Handling - Normal Startup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Port Handling - Normal Server Startup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start server in background
node dist/index.js graph --path . --port 5555 > /tmp/codebrain-test.log 2>&1 &
SERVER_PID=$!
sleep 3

if ps -p $SERVER_PID > /dev/null; then
    echo -e "${GREEN}✓ PASSED${NC} - Server started successfully on port 5555"
    ((PASSED++))
    
    # Test 3: Port Conflict Detection
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test 3: Port Handling - Conflict Detection"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Try to start another server on same port
    if node dist/index.js graph --path . --port 5555 2>&1 | grep -q "Port 5555 is already in use"; then
        echo -e "${GREEN}✓ PASSED${NC} - Port conflict detected with helpful error message"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC} - Port conflict not detected properly"
        ((FAILED++))
    fi
    
    # Cleanup
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
else
    echo -e "${RED}✗ FAILED${NC} - Server failed to start"
    ((FAILED++))
fi
echo ""

# Test 4: Auto-Port Assignment
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 4: Port Handling - Auto-Assignment (port 0)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node dist/index.js graph --path . --port 0 > /tmp/codebrain-auto.log 2>&1 &
AUTO_PID=$!
sleep 3

if ps -p $AUTO_PID > /dev/null && grep -q "Auto-assigned port:" /tmp/codebrain-auto.log; then
    ASSIGNED_PORT=$(grep "Auto-assigned port:" /tmp/codebrain-auto.log | grep -o '[0-9]\+')
    echo -e "${GREEN}✓ PASSED${NC} - Auto-port assignment works (assigned port: $ASSIGNED_PORT)"
    ((PASSED++))
    kill $AUTO_PID 2>/dev/null
    wait $AUTO_PID 2>/dev/null
else
    echo -e "${RED}✗ FAILED${NC} - Auto-port assignment failed"
    ((FAILED++))
    kill $AUTO_PID 2>/dev/null
fi
echo ""

# Test 5: Build Status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 5: Build Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "dist/graph/builder.js" ] && grep -q "import os from" dist/graph/builder.js; then
    echo -e "${GREEN}✓ PASSED${NC} - ES module import correctly compiled"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Build verification failed"
    ((FAILED++))
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Test Summary                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              ✓ ALL TESTS PASSED!                           ║${NC}"
    echo -e "${GREEN}║  Both fixes are working correctly and verified.           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              ✗ SOME TESTS FAILED                           ║${NC}"
    echo -e "${RED}║  Please review the output above for details.              ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
