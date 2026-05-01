# Port Handling Improvements

## Summary

Enhanced the `graph` command to provide better error handling and user guidance when port conflicts occur.

## Changes Made

### 1. Enhanced Error Handling (`src/cli/commands/graph.ts`)

**Before:**
- Generic error message when port was in use
- No guidance on how to resolve the issue
- Users had to figure out solutions on their own

**After:**
- Specific detection of `EADDRINUSE` errors
- Clear, actionable error messages with 3 solutions:
  1. Try a different port with suggested port number
  2. Command to kill the process using the port
  3. Option to use auto-assigned port (port 0)

**Example Output:**
```
[ERROR] Port 4011 is already in use

To fix this, you can:
  1. Try a different port: --port 4012
  2. Find and stop the process using port 4011:
     lsof -ti:4011 | xargs kill -9
  3. Or use a random available port: --port 0
```

### 2. Auto-Port Assignment (`src/server/app.ts`)

**New Feature:**
- Support for `--port 0` which automatically finds an available port
- Server reports the actual assigned port when using auto-assignment

**Example:**
```bash
code-brain graph --path /path/to/project --port 0
```

Output:
```
[INFO] Starting graph visualization server on port 0
✓ Graph server running on http://localhost:45123
[INFO] Auto-assigned port: 45123
```

### 3. Updated Documentation (`COMMANDS.md`)

Added clear documentation about:
- Port conflict resolution strategies
- How to use auto-assigned ports
- Commands to kill processes using specific ports

## Usage Examples

### Scenario 1: Port Already in Use

```bash
# First attempt
$ code-brain graph --path . --port 3000
[ERROR] Port 3000 is already in use

# Solution 1: Try different port
$ code-brain graph --path . --port 3001
✓ Graph server running on http://localhost:3001

# Solution 2: Kill existing process
$ lsof -ti:3000 | xargs kill -9
$ code-brain graph --path . --port 3000
✓ Graph server running on http://localhost:3000

# Solution 3: Use auto-assigned port
$ code-brain graph --path . --port 0
✓ Graph server running on http://localhost:45123
[INFO] Auto-assigned port: 45123
```

### Scenario 2: Running Multiple Instances

```bash
# Terminal 1
$ code-brain graph --path /project1 --port 3000

# Terminal 2 - automatically finds available port
$ code-brain graph --path /project2 --port 0
✓ Graph server running on http://localhost:45123
```

## Technical Details

### Error Detection
```typescript
catch (error: any) {
  if (error?.code === 'EADDRINUSE') {
    // Provide helpful guidance
  }
}
```

### Port Resolution
```typescript
const server = app.listen(port, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null 
    ? address.port 
    : port;
  // Report actual port
});
```

## Benefits

1. **Better User Experience**: Clear error messages with actionable solutions
2. **Reduced Friction**: Users don't need to search for solutions
3. **Flexibility**: Multiple ways to resolve port conflicts
4. **Automation-Friendly**: Port 0 enables running multiple instances without manual port management
5. **Developer-Friendly**: Follows common patterns from other CLI tools

## Testing

To test the improvements:

```bash
# Build the changes
npm run build:server

# Test port conflict
# Terminal 1:
node dist/index.js graph --path . --port 4000

# Terminal 2 (should show helpful error):
node dist/index.js graph --path . --port 4000

# Test auto-assignment:
node dist/index.js graph --path . --port 0
```

## Related Files

- `src/cli/commands/graph.ts` - Command handler with error handling
- `src/server/app.ts` - Server creation with port resolution
- `COMMANDS.md` - Updated documentation
- `dist/cli/commands/graph.js` - Compiled output
- `dist/server/app.js` - Compiled output

## Future Enhancements

Potential improvements for future versions:

1. **Port Range**: Allow specifying a range (e.g., `--port 3000-3010`)
2. **Port File**: Save the assigned port to a file for other tools to read
3. **Health Check**: Verify if existing process is actually a code-brain server
4. **Auto-Increment**: Automatically try next port if current is in use
5. **Port Discovery**: Show all running code-brain servers and their ports

## Compatibility

- **Node.js**: Compatible with all supported versions
- **Operating Systems**: Works on macOS, Linux, and Windows
- **Breaking Changes**: None - fully backward compatible

## Status

✅ **Implemented and Tested**
- Error detection working
- Helpful messages displaying correctly
- Auto-port assignment functional
- Documentation updated
