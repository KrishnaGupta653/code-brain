import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getProjectRoot(): string {
  return path.resolve(__dirname, '../../');
}

export function getCodeBrainDir(projectRoot: string): string {
  return path.join(projectRoot, '.codebrain');
}

export function getDbPath(projectRoot: string): string {
  return path.join(getCodeBrainDir(projectRoot), 'graph.db');
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

export function isSupportedSourceFile(filePath: string): boolean {
  // Consider most textual source files supported. Exclude common binary/document extensions.
  const blacklist = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.zip', '.tar', '.gz', '.pdf', '.woff', '.woff2', '.ttf'
  ]);
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true; // files without extension may still be source
  if (blacklist.has(ext)) return false;
  // allow common source code extensions
  return true;
}

export function getTempDir(): string {
  return path.join(os.tmpdir(), 'code-brain');
}

export function getHomeDir(): string {
  return os.homedir();
}
