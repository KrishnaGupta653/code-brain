# How to Fix the Blank Screen

## The Problem
The graph UI is showing a blank screen because the server needs to be restarted to pick up the latest changes.

## Solution: Restart the Server

### Step 1: Stop the Current Server
In the terminal where the server is running, press:
```
Ctrl+C
```

### Step 2: Restart the Server
```bash
node dist/index.js graph --path /Users/krishnagupta/traffic-analytics-engine --port 4005
```

### Step 3: Hard Refresh the Browser
In your browser at `http://localhost:4005`:
- **Mac:** Cmd + Shift + R
- **Windows/Linux:** Ctrl + Shift + R

Or close the browser tab and open a new one.

## If Still Blank

### Check Browser Console
1. Open DevTools: **F12** or **Cmd+Option+I** (Mac) or **Ctrl+Shift+I** (Windows/Linux)
2. Click the **Console** tab
3. Look for any red error messages
4. Share the error message if you see one

### Common Errors and Fixes

**Error: "Failed to fetch"**
- The server isn't running
- Solution: Make sure the server is running on port 4005

**Error: "Unexpected token"**
- JavaScript syntax error
- Solution: Rebuild with `npm run build`

**Error: "Cannot read property of undefined"**
- Data structure issue
- Solution: Re-index the project

## Alternative: Use a Different Port

If port 4005 has issues, try a different port:

```bash
# Stop the server (Ctrl+C)

# Start on a different port
node dist/index.js graph --path /Users/krishnagupta/traffic-analytics-engine --port 4010

# Open in browser
open http://localhost:4010
```

## Verify Server is Working

Run this command to test:
```bash
curl http://localhost:4005/api/graph?level=0 | head -c 200
```

You should see JSON data starting with `{"nodes":[...`

If you see nothing or an error, the server isn't running properly.

## Nuclear Option: Clean Rebuild

If nothing works, do a complete rebuild:

```bash
# Stop the server (Ctrl+C)

# Clean everything
npm run clean

# Rebuild everything
npm run build

# Re-index
node dist/index.js index --path /Users/krishnagupta/traffic-analytics-engine

# Start server
node dist/index.js graph --path /Users/krishnagupta/traffic-analytics-engine --port 4005

# Open browser
open http://localhost:4005
```

## What to Expect

When working correctly, you should see:
- A dark-themed graph visualization
- Nodes representing your code files and functions
- A search bar at the top
- Sidebar panels on the left and right
- Zoom controls in the bottom right

## Still Having Issues?

Check the browser console (F12 → Console tab) and share any error messages you see.
