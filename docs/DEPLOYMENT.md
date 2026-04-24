# Deployment and Maintenance Guide

## Development Setup

### Prerequisites
- Node.js v18+
- npm v9+
- Python 3.8+
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/code-brain.git
cd code-brain

# Install dependencies
npm install

# Install Python dependencies
python3 -m pip install -r python/requirements.txt
```

### Build

```bash
# Compile TypeScript
npm run build

# Output goes to dist/ directory
```

### Development

```bash
# Watch mode (recompile on changes)
npm run watch

# Run linter
npm run lint

# Format code
npm run format
```

## Testing

### Unit Tests
```bash
npm test

# With coverage
npm test -- --coverage
```

### Integration Tests
```bash
npm test -- integration.test.ts
```

### Manual Testing
```bash
# Build first
npm run build

# Initialize test repo
mkdir /tmp/test-repo
cd /tmp/test-repo
node ../../dist/src/cli/index.js init
node ../../dist/src/cli/index.js index
node ../../dist/src/cli/index.js export --format json
```

## Production Deployment

### NPM Package

```bash
# Update version in package.json
npm version patch  # or minor, major

# Build
npm run build

# Publish to npm
npm publish
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY python ./python

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Install Python runtime
RUN apk add --no-cache python3

ENTRYPOINT ["node", "dist/src/cli/index.js"]
```

Build and run:
```bash
docker build -t code-brain:1.0.0 .
docker run -v /path/to/repo:/workspace code-brain:1.0.0 index -p /workspace
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

## Monitoring and Maintenance

### Database Maintenance

Check database integrity:
```bash
sqlite3 .codebrain/graph.db "PRAGMA integrity_check;"
```

Vacuum and optimize:
```bash
sqlite3 .codebrain/graph.db "VACUUM;"
sqlite3 .codebrain/graph.db "ANALYZE;"
```

### Performance Monitoring

Track indexing performance:
```bash
time code-brain index
# Measure parse time, graph time, storage time
```

Monitor database size:
```bash
du -h .codebrain/graph.db
sqlite3 .codebrain/graph.db "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();"
```

### Logging

Enable verbose logging:
```bash
DEBUG=code-brain:* code-brain index
```

Log levels (in code):
- `error` - Critical failures
- `warn` - Deprecations, potential issues
- `info` - Progress, milestones
- `debug` - Detailed execution

### Health Checks

Automated health check:
```bash
code-brain init && \
code-brain index && \
code-brain export --format json | jq '.project' && \
echo "✓ System healthy"
```

## Upgrades

### Database Schema Migrations

When schema changes in new versions:

```javascript
// src/storage/migrations/001-initial.ts
export const migration001 = {
  up: (db) => {
    db.exec(`
      ALTER TABLE symbols ADD COLUMN language TEXT DEFAULT 'typescript';
    `);
  },
  down: (db) => {
    // Reverse migration
  }
};
```

Run migrations on startup.

### Dependency Updates

```bash
# Check for updates
npm outdated

# Update patch and minor versions
npm update

# Update major versions (be careful)
npm install packagename@latest

# Run tests after updates
npm test
```

## Troubleshooting

### Database Corruption

```bash
# Backup
cp .codebrain/graph.db .codebrain/graph.db.backup

# Clear and rebuild
rm .codebrain/graph.db*
code-brain init
code-brain index
```

### Memory Issues (Large Repositories)

Reduce scope:
```bash
# Only index src/
echo '{"include": ["src"]}' > .codebrainrc.json
code-brain index
```

Or use incremental updates:
```bash
code-brain update  # Faster than full index
```

### Python Bridge Issues

Verify Python setup:
```bash
python3 -c "import networkx; print(networkx.__version__)"
```

Set Python path explicitly:
```bash
export PYTHON_PATH=/usr/bin/python3
code-brain export --format ai
```

### Port Conflicts

If port 3000 is in use:
```bash
code-brain graph --port 3001
```

Or find what's using it:
```bash
lsof -i :3000
kill -9 <PID>
```

## Performance Optimization

### Indexing Large Repositories

1. **Exclude unnecessary patterns:**
```json
{
  "exclude": [
    "node_modules",
    "dist",
    "build",
    ".git",
    "coverage",
    "**/*.test.ts",
    "**/*.spec.ts"
  ]
}
```

2. **Use focused exports:**
```bash
code-brain export --focus src/api > api-context.json
# ~100KB instead of ~2MB for full export
```

3. **Enable analytics selectively:**
```json
{
  "enableAnalytics": false
}
```

4. **Incremental updates:**
```bash
code-brain update  # Only changed files
```

### Query Performance

Optimize graph traversal:
```javascript
// Avoid deep searches on huge graphs
queryEngine.findRelated(nodeId, depth=2)  // Not depth=10

// Use type filtering
queryEngine.findByType('function', limit=100)
```

## Scaling Considerations

### Single Machine (Current)
- Repositories: up to ~50K files
- Indexing time: ~5-30 seconds
- Memory: <1GB
- Query latency: <100ms

### Future Scaling
- **Distributed indexing:** Parse files in parallel
- **Caching layer:** Redis for frequent queries
- **Graph database:** Migrate to Neo4j for massive graphs
- **Sharding:** Split large graphs by module

## Backup and Recovery

### Automated Backups

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups/code-brain"
mkdir -p "$BACKUP_DIR"

# Backup database
cp .codebrain/graph.db "$BACKUP_DIR/graph-$(date +%Y%m%d-%H%M%S).db"

# Keep only last 7 days
find "$BACKUP_DIR" -mtime +7 -delete
```

### Recovery

```bash
# Restore from backup
cp /backups/code-brain/graph-20240101-120000.db .codebrain/graph.db

# Verify integrity
code-brain export --format json | head -20
```

## Version Management

### Release Process

1. **Bump version:**
```bash
npm version patch
# Updates package.json, creates git tag
```

2. **Build:**
```bash
npm run build
```

3. **Test:**
```bash
npm test
```

4. **Publish:**
```bash
npm publish
git push origin main --tags
```

### Changelog

Keep CHANGELOG.md updated:
```markdown
# Changelog

## [1.0.1] - 2024-01-05
### Fixed
- Fix parser crash on invalid TypeScript syntax

### Added
- Support for TypeScript 5.3

## [1.0.0] - 2024-01-01
### Added
- Initial release
```

## Support and Issues

### Common Issues

1. **"Python process error: ENOENT"**
   - Set PYTHON_PATH environment variable
   - Check Python 3 is installed

2. **"database is locked"**
   - Kill other code-brain processes
   - Remove .codebrain/graph.db-wal and .db-shm files

3. **"Out of memory"**
   - Exclude more patterns
   - Use focused exports
   - Use incremental updates

### Getting Help

- Check documentation in `docs/`
- Enable debug logging: `DEBUG=code-brain:*`
- Check error logs in `.codebrain/logs/`
- File issues on GitHub

## Security Considerations

### Data Privacy

- Code is stored locally in `.codebrain/`
- No data sent to external services
- Safe to run on proprietary codebases
- Delete `.codebrain/` to completely remove all data

### Access Control

Ensure proper file permissions:
```bash
# Only owner can read database
chmod 600 .codebrain/graph.db
chmod 700 .codebrain/
```

### Dependency Security

Regularly update dependencies:
```bash
npm audit
npm audit fix
```

Check for vulnerabilities:
```bash
npm install -g snyk
snyk test
```

## Support and Contribution

See CONTRIBUTING.md for guidelines on:
- Code style
- Pull request process
- Test coverage expectations
- Documentation standards

---

For questions or issues, please open an issue on GitHub or contact the maintainers.
