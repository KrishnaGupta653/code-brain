import path from 'path';
import fs from 'fs';
import { ConfigManager } from '../config/loader.js';
import { registerParserForExtension } from './registry.js';

type PluginModule = {
  extensions?: string[];
  parser?: { parseFile: (filePath: string) => any };
};

export async function loadParsersForProject(projectRoot: string): Promise<void> {
  const cfgManager = new ConfigManager(projectRoot);
  const cfg = cfgManager.getConfig();

  const candidates: string[] = [];

  // user-specified plugin paths (relative to project root)
  if (Array.isArray(cfg.parserPlugins) && cfg.parserPlugins.length > 0) {
    for (const p of cfg.parserPlugins) {
      candidates.push(path.isAbsolute(p) ? p : path.join(projectRoot, p));
    }
  }

  // default parsers directory inside project
  const defaultParsersDir = path.join(projectRoot, 'parsers');
  if (fs.existsSync(defaultParsersDir)) {
    const files = fs.readdirSync(defaultParsersDir);
    for (const f of files) {
      if (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs')) {
        candidates.push(path.join(defaultParsersDir, f));
      }
    }
  }

  // load each candidate module and register
  for (const modPath of candidates) {
    try {
      const imported: PluginModule = await import(modPath);
      if (imported && imported.parser && Array.isArray(imported.extensions)) {
        for (const ext of imported.extensions) {
          registerParserForExtension(ext, imported.parser as any);
        }
      }
    } catch (err) {
      // non-fatal: log and continue
      // avoid importing logger to keep loader simple
      // eslint-disable-next-line no-console
      console.warn(`Failed to load parser plugin ${modPath}:`, (err as Error)?.message || err);
    }
  }
}

export default loadParsersForProject;
