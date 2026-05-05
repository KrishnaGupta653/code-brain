#!/bin/bash

# Verification script for the four killer features implementation

echo "=== VERIFICATION CHECKLIST FOR KILLER FEATURES ==="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((pass_count++))
  else
    echo -e "${RED}✗${NC} $1"
    ((fail_count++))
  fi
}

# 1. Check schema has no importance_score duplicate
echo "1. Checking schema for importance_score duplicate..."
! grep -q "importance_score REAL DEFAULT 0" src/storage/schema.ts
check "Schema does not have importance_score duplicate column"

# 2. Check sqlite.ts uses importance not importance_score
echo "2. Checking sqlite.ts uses importance..."
grep -q "importance: number" src/storage/sqlite.ts && ! grep -q "importance_score: number" src/storage/sqlite.ts
check "sqlite.ts uses importance field"

# 3. Check MCP server imports all four killer features
echo "3. Checking MCP server imports..."
grep -q "import { ImpactTracer }" src/mcp/server.ts
check "MCP server imports ImpactTracer"

grep -q "import { PatternQueryEngine }" src/mcp/server.ts
check "MCP server imports PatternQueryEngine"

grep -q "import { InvariantDetector }" src/mcp/server.ts
check "MCP server imports InvariantDetector"

grep -q "import { ContextAssembler }" src/mcp/server.ts
check "MCP server imports ContextAssembler"

# 4. Check MCP server has tool definitions
echo "4. Checking MCP tool definitions..."
grep -q "name: 'query_pattern'" src/mcp/server.ts
check "MCP has query_pattern tool"

grep -q "name: 'check_invariants'" src/mcp/server.ts
check "MCP has check_invariants tool"

grep -q "name: 'assemble_context'" src/mcp/server.ts
check "MCP has assemble_context tool"

# 5. Check MCP server has handlers
echo "5. Checking MCP handlers..."
grep -q "handleQueryPattern" src/mcp/server.ts
check "MCP has handleQueryPattern method"

grep -q "handleCheckInvariants" src/mcp/server.ts
check "MCP has handleCheckInvariants method"

grep -q "handleAssembleContext" src/mcp/server.ts
check "MCP has handleAssembleContext method"

grep -q "new ImpactTracer(graph)" src/mcp/server.ts
check "MCP uses ImpactTracer in analyze_impact"

# 6. Check REST API imports
echo "6. Checking REST API imports..."
grep -q "import { ImpactTracer }" src/server/app.ts
check "REST API imports ImpactTracer"

grep -q "import { PatternQueryEngine }" src/server/app.ts
check "REST API imports PatternQueryEngine"

grep -q "import { InvariantDetector }" src/server/app.ts
check "REST API imports InvariantDetector"

# 7. Check REST API endpoints
echo "7. Checking REST API endpoints..."
grep -q "/api/query/pattern" src/server/app.ts
check "REST API has /api/query/pattern endpoint"

grep -q "/api/analyze/invariants" src/server/app.ts
check "REST API has /api/analyze/invariants endpoint"

grep -q "/api/analyze/dead-code" src/server/app.ts
check "REST API has /api/analyze/dead-code endpoint"

grep -q "/api/analyze/bridges" src/server/app.ts
check "REST API has /api/analyze/bridges endpoint"

grep -q "/api/query/impact-full" src/server/app.ts
check "REST API has /api/query/impact-full endpoint"

# 8. Check TypeScript build
echo "8. Checking TypeScript build..."
npm run build:server > /dev/null 2>&1
check "TypeScript compiles without errors"

# 9. Check killer feature files exist
echo "9. Checking killer feature files exist..."
[ -f "src/retrieval/impact-tracer.ts" ]
check "impact-tracer.ts exists"

[ -f "src/retrieval/context-assembler.ts" ]
check "context-assembler.ts exists"

[ -f "src/retrieval/pattern-query.ts" ]
check "pattern-query.ts exists"

[ -f "src/graph/invariants.ts" ]
check "invariants.ts exists"

# Summary
echo ""
echo "=== SUMMARY ==="
echo -e "${GREEN}Passed: $pass_count${NC}"
echo -e "${RED}Failed: $fail_count${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}✓ ALL CHECKS PASSED!${NC}"
  echo "The four killer features are fully wired and ready to use."
  exit 0
else
  echo -e "${RED}✗ SOME CHECKS FAILED${NC}"
  echo "Please review the failures above."
  exit 1
fi
