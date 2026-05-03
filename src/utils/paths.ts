import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getProjectRoot(): string {
  return path.resolve(__dirname, '../../');
}

export function getCodeBrainDir(projectRoot: string, customDbPath?: string): string {
  if (customDbPath) {
    return path.dirname(customDbPath);
  }
  return path.join(projectRoot, '.codebrain');
}

export function getDbPath(projectRoot: string, customDbPath?: string): string {
  if (customDbPath) {
    // If custom path is provided, use it
    return customDbPath;
  }
  
  // Check if .codebrainrc.json exists in project directory and has a dbPath
  const configPath = path.join(projectRoot, '.codebrainrc.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.dbPath) {
        return config.dbPath;
      }
    } catch (error) {
      // If config is invalid, continue to check fallback
    }
  }
  
  // Check fallback config location (next to default db location)
  const defaultDbPath = path.join(projectRoot, '.codebrain', 'graph.db');
  const fallbackConfigPath = path.join(path.dirname(defaultDbPath), 'config.json');
  if (fs.existsSync(fallbackConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(fallbackConfigPath, 'utf-8'));
      if (config.dbPath) {
        return config.dbPath;
      }
    } catch (error) {
      // If config is invalid, fall back to default
    }
  }
  
  return defaultDbPath;
}

export function getPythonDir(): string {
  return path.resolve(__dirname, '../../python');
}

export function getPythonScript(scriptName: string): string {
  return path.join(getPythonDir(), 'analytics', `${scriptName}.py`);
}

export function normalizePath(filePath: string, baseDir: string): string {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(baseDir, filePath);
  return path.normalize(absolute);
}

export function getRelativePath(filePath: string, baseDir: string): string {
  return path.relative(baseDir, filePath);
}

export function isTypescriptFile(filePath: string): boolean {
  return /\.(ts|tsx)$/.test(filePath);
}

export function isJavascriptFile(filePath: string): boolean {
  return /\.(js|jsx|mjs|cjs)$/.test(filePath);
}

export function isJavaFile(filePath: string): boolean {
  return /\.(java)$/.test(filePath);
}

export function isPythonFile(filePath: string): boolean {
  return /\.(py)$/.test(filePath);
}

export function isGoFile(filePath: string): boolean {
  return /\.(go)$/.test(filePath);
}

export function isSupportedSourceFile(filePath: string): boolean {
  // Consider most textual source files supported. Exclude common binary/document extensions.
  const blacklist = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.pyc', '.pyo'
  ]);
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true; // files without extension may still be source
  if (blacklist.has(ext)) return false;
  // allow common source code extensions and multi-modal formats (pdf)
  return true;
}

export function getTempDir(): string {
  return path.join(os.tmpdir(), 'code-brain');
}

export function getHomeDir(): string {
  return os.homedir();
}
