/**
 * AGENTS.md Generator
 * 
 * Generates model-agnostic agent instructions file.
 * Recognized by all major agent frameworks: OpenAI Codex, Claude Code,
 * Aider, Cursor, Cline, Continue, Copilot Workspace, and custom agents.
 */

import fs from 'fs';
import path from 'path';
import { SQLiteStorage } from '../storage/index.js';
import { GraphModel } from '../graph/index.js';
import { GitIntegration } from '../git/integration.js';

interface AgentsOptions {
  quiet?: boolean;
}

export class AgentsGenerator {
  constructor(
    private storage: SQLiteStorage,
    private projectRoot: string
  ) {}

  async generate(options: AgentsOptions = {}): Promise<string> {
    const graph = this.storage.loadGraph(this.projectRoot);
    const projectMeta = this.storage.getProject(this.projectRoot);
    
    if (!projectMeta) {
      throw new Error('Project not indexed. Run code-brain index first.');
    }

    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    
    // Detect conventions from graph
    const conventions = this.detectConventions(nodes, edges);
    
    // Get architecture from CODEMAP.md if it exists
    const architecture = this.readArchitectureFromCodemap();
    
    // Detect test commands
    const testCommands = this.detectTestCommands();
    
    // Get hotspots
    const hotspots = await this.getHotspots();
    
    // Build the markdown
    const markdown = this.buildMarkdown({
      projectMeta,
      conventions,
      architecture,
      testCommands,
      hotspots,
    });
    
    return markdown;
  }

  private detectConventions(nodes: any[], edges: any[]) {
    const conventions: Array<{ rule: string; confidence: string }> = [];
    
    // Detect export style
    const defaultExports = nodes.filter(n => 
      n.metadata?.exported && n.metadata?.exportKind === 'default'
    ).length;
    const namedExports = nodes.filter(n => 
      n.metadata?.exported && n.metadata?.exportKind !== 'default'
    ).length;
    
    if (namedExports > defaultExports * 3) {
      const exceptions = defaultExports > 0 ? ` (${defaultExports} exceptions)` : '';
      conventions.push({
        rule: `Named exports only — no export default found in src/${exceptions}`,
        confidence: `inferred from ${namedExports + defaultExports} exports`,
      });
    }
    
    // Detect error handling pattern
    const errorNodes = nodes.filter(n => 
      n.name.includes('Error') && n.type === 'class'
    );
    const customErrors = errorNodes.filter(n => 
      edges.some(e => e.type === 'EXTENDS' && e.from === n.id)
    );
    
    if (customErrors.length > 2) {
      conventions.push({
        rule: 'All errors extend CodeBrainError — never throw new Error()',
        confidence: `inferred from ${customErrors.length} custom error classes`,
      });
    }
    
    // Detect logging pattern
    const loggerCalls = edges.filter(e => 
      e.type === 'CALLS' && 
      (e.metadata?.targetName?.includes('logger') || 
       e.metadata?.targetName?.includes('log'))
    ).length;
    const consoleCalls = edges.filter(e => 
      e.type === 'CALLS' && 
      e.metadata?.targetName?.includes('console')
    ).length;
    
    if (loggerCalls > consoleCalls * 2) {
      conventions.push({
        rule: 'All logging via logger.info/warn/error — never console.log or console.error',
        confidence: `inferred from ${loggerCalls} logger calls vs ${consoleCalls} console calls`,
      });
    }
    
    // Detect ID generation pattern
    const stableIdCalls = edges.filter(e => 
      e.type === 'CALLS' && e.metadata?.targetName === 'stableId'
    ).length;
    
    if (stableIdCalls > 10) {
      conventions.push({
        rule: 'IDs are deterministic: stableId(type, path) — never invent IDs manually',
        confidence: `inferred from ${stableIdCalls} stableId() calls`,
      });
    }
    
    // Detect provenance requirement
    const provenanceNodes = nodes.filter(n => 
      n.provenance && n.provenance.source && n.provenance.source.length > 0
    ).length;
    const provenancePct = Math.round((provenanceNodes / nodes.length) * 100);
    
    if (provenancePct > 90) {
      conventions.push({
        rule: 'Every new node/edge MUST have a provenance.source SourceSpan — non-negotiable',
        confidence: `inferred from ${provenancePct}% of nodes having provenance`,
      });
    }
    
    // Detect async/sync patterns in storage
    const storageNodes = nodes.filter(n => 
      n.location?.file?.includes('storage')
    );
    const asyncMethods = storageNodes.filter(n => 
      n.metadata?.async === true
    ).length;
    
    if (storageNodes.length > 5 && asyncMethods === 0) {
      conventions.push({
        rule: 'All DB operations are synchronous (better-sqlite3) — no async/await in storage layer',
        confidence: `inferred from ${storageNodes.length} storage methods, 0 async`,
      });
    }
    
    return conventions;
  }

  private readArchitectureFromCodemap(): string {
    const codemapPath = path.join(this.projectRoot, 'CODEMAP.md');
    if (!fs.existsSync(codemapPath)) {
      return '(Run `code-brain codemap` to generate architecture overview)';
    }
    
    const content = fs.readFileSync(codemapPath, 'utf-8');
    const archMatch = content.match(/## Architecture\s+([\s\S]*?)(?=\n## |$)/);
    
    if (archMatch) {
      return archMatch[1].trim();
    }
    
    return '(See CODEMAP.md for architecture details)';
  }

  private detectTestCommands(): { build: string; test: string; testSingle: string } {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const scripts = pkg.scripts || {};
        
        return {
          build: scripts.build || scripts['build:server'] || 'npm run build',
          test: scripts.test || 'npm test',
          testSingle: scripts.test ? 'npx jest tests/file.test.ts' : 'npm test',
        };
      } catch {
        // Fall through to defaults
      }
    }
    
    return {
      build: 'npm run build',
      test: 'npm test',
      testSingle: 'npm test -- tests/file.test.ts',
    };
  }

  private async getHotspots(): Promise<Array<{ file: string; changes: number; authors: number }>> {
    try {
      const git = new GitIntegration(this.projectRoot);
      const hotspots = await git.getHotspots(30);
      return hotspots.slice(0, 3);
    } catch {
      return [];
    }
  }

  private buildMarkdown(data: any): string {
    const { projectMeta, conventions, architecture, testCommands, hotspots } = data;
    
    const lines: string[] = [];
    const now = new Date().toISOString();
    const fingerprint = this.computeFingerprint(projectMeta);
    
    lines.push(`# AGENTS.md — Agent Instructions for ${projectMeta.name}`);
    lines.push(``);
    lines.push(`> Auto-generated by code-brain. Commit this file. Regenerate: \`code-brain agents\``);
    lines.push(`> Last updated: ${now.slice(0, 10)} | Based on index fingerprint: ${fingerprint}`);
    lines.push(``);
    
    // Quick Start
    lines.push(`## Quick Start (Run These First)`);
    lines.push(``);
    lines.push('```bash');
    lines.push(`${testCommands.build}          # Build TypeScript → dist/`);
    lines.push(`${testCommands.test}               # Run all tests (must pass before any commit)`);
    lines.push(`node dist/cli/cli.js --help   # Verify CLI works`);
    lines.push('```');
    lines.push(``);
    
    // Repository Structure
    lines.push(`## Repository Structure`);
    lines.push(``);
    lines.push(architecture);
    lines.push(``);
    
    // Conventions
    if (conventions.length > 0) {
      lines.push(`## Conventions Detected From Source`);
      lines.push(``);
      lines.push(`<!-- GENERATED from graph analysis -->`);
      for (const conv of conventions) {
        lines.push(`- ${conv.rule}`);
        lines.push(`  - ${conv.confidence}`);
      }
      lines.push(`<!-- END GENERATED -->`);
      lines.push(``);
    }
    
    // Testing
    lines.push(`## Testing`);
    lines.push(``);
    lines.push('```bash');
    lines.push(`${testCommands.test}                          # All tests`);
    lines.push(`${testCommands.testSingle}     # Single test file`);
    lines.push(`npx jest --testNamePattern "name" # Single test case`);
    lines.push('```');
    lines.push(``);
    lines.push(`Test files live in \`tests/\` with \`.test.ts\` extension. All tests must pass before committing.`);
    lines.push(``);
    
    // Do Not
    lines.push(`## Do Not`);
    lines.push(``);
    lines.push(`- Do NOT modify \`dist/\` — it is generated by \`npm run build\``);
    lines.push(`- Do NOT use \`console.log\` — use \`logger\` from \`src/utils/logger.ts\``);
    lines.push(`- Do NOT add SQL without a migration entry in \`src/storage/migrations.ts\``);
    lines.push(`- Do NOT invent node/edge IDs — use \`stableId()\` from \`src/utils/hash.ts\``);
    lines.push(`- Do NOT add npm dependencies without justification in the commit message`);
    lines.push(``);
    
    // Key Files
    lines.push(`## Key Files to Read Before Editing Any Module`);
    lines.push(``);
    lines.push(`| Module | Read First |`);
    lines.push(`|--------|------------|`);
    lines.push(`| Any file | \`src/types/models.ts\` (all data types) |`);
    lines.push(`| Storage | \`src/storage/schema.ts\` (full DB schema) |`);
    lines.push(`| Parser | \`src/parser/index.ts\` (registry), \`src/types/models.ts\` (ParsedFile) |`);
    lines.push(`| Graph | \`src/graph/model.ts\` (GraphModel), \`src/graph/builder.ts\` (construction) |`);
    lines.push(`| Export | \`src/retrieval/export.ts\` (ExportEngine), \`src/types/models.ts\` (AIExportBundle) |`);
    lines.push(`| Server | \`src/server/app.ts\` (all routes listed at top) |`);
    lines.push(``);
    
    // Active Work Areas
    if (hotspots.length > 0) {
      lines.push(`## Active Work Areas (High Churn — Read Carefully Before Editing)`);
      lines.push(``);
      lines.push(`<!-- GENERATED from git hotspot analysis -->`);
      for (const hs of hotspots) {
        lines.push(`- \`${hs.file}\` — ${hs.changes} changes in 30 days, ${hs.authors} active author${hs.authors > 1 ? 's' : ''}`);
      }
      lines.push(`<!-- END GENERATED -->`);
      lines.push(``);
    }
    
    // How It Works
    lines.push(`## How ${projectMeta.name} Works (For Understanding, Not Just Editing)`);
    lines.push(``);
    lines.push(`- \`code-brain index\` parses all source files → GraphBuilder → SQLiteStorage`);
    lines.push(`- \`code-brain export\` queries the graph → QueryEngine → ExportEngine → stdout`);
    lines.push(`- \`code-brain graph\` starts Express server → serves ui/dist/ → opens browser`);
    lines.push(`- Python analytics are optional — run via PythonBridge.runAnalytics() → cached`);
    lines.push(``);
    
    return lines.join('\n');
  }

  private computeFingerprint(projectMeta: any): string {
    const data = `${projectMeta.name}-${projectMeta.updatedAt}`;
    return Buffer.from(data).toString('base64').slice(0, 8);
  }

  async save(markdown: string): Promise<void> {
    const agentsPath = path.join(this.projectRoot, 'AGENTS.md');
    fs.writeFileSync(agentsPath, markdown, 'utf-8');
  }
}
