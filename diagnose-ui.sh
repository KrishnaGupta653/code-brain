#!/bin/bash

echo "🔍 Diagnosing code-brain UI issue..."
echo ""

# Check if server is running
if lsof -Pi :4005 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✓ Server is running on port 4005"
else
    echo "✗ Server is NOT running on port 4005"
    echo "  Start it with: node dist/index.js graph --path /path/to/project --port 4005"
    exit 1
fi

# Check if UI files exist
if [ -f "ui/dist/index.html" ]; then
    echo "✓ UI files exist"
else
    echo "✗ UI files missing"
    echo "  Build them with: npm run build:ui"
    exit 1
fi

# Test API endpoint
echo ""
echo "Testing API endpoints..."

# Test /api/graph
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4005/api/graph?level=0)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ /api/graph endpoint responding (HTTP $HTTP_CODE)"
    
    # Check if it returns data
    RESPONSE=$(curl -s http://localhost:4005/api/graph?level=0)
    NODE_COUNT=$(echo "$RESPONSE" | grep -o '"nodes":\[' | wc -l)
    
    if [ "$NODE_COUNT" -gt 0 ]; then
        echo "✓ Graph data is being returned"
    else
        echo "⚠️  Graph endpoint returns empty data"
        echo "   This might mean the database is empty or not loaded"
    fi
else
    echo "✗ /api/graph endpoint error (HTTP $HTTP_CODE)"
fi

# Test static files
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4005/)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Static files being served (HTTP $HTTP_CODE)"
else
    echo "✗ Static files not being served (HTTP $HTTP_CODE)"
fi

echo ""
echo "📊 Next steps:"
echo "1. Open http://localhost:4005 in your browser"
echo "2. Open browser DevTools (F12 or Cmd+Option+I)"
echo "3. Check the Console tab for JavaScript errors"
echo "4. Check the Network tab to see if API calls are failing"
echo ""
echo "Common issues:"
echo "- If you see CORS errors: The server needs to allow your origin"
echo "- If you see 404 errors: The API endpoints might not be registered"
echo "- If you see blank screen with no errors: The graph data might be empty"
echo "- If JavaScript fails to load: Try rebuilding with 'npm run build'"
