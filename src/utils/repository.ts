import fs from 'fs';
import path from 'path';
import { isSupportedSourceFile } from './paths.js';

function normalizePattern(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function matchesPattern(relativePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }

  const normalizedPath = normalizePattern(relativePath);
  return patterns.some(pattern => {
    const normalizedPattern = normalizePattern(pattern);

    if (!normalizedPattern || normalizedPattern === '**' || normalizedPattern === '.') {
      return true;
    }

    if (normalizedPattern.startsWith('**/*.')) {
      return normalizedPath.endsWith(normalizedPattern.slice(4));
    }

    if (normalizedPattern.startsWith('*.')) {
      return normalizedPath.endsWith(normalizedPattern.slice(1));
    }

    return (
      normalizedPath === normalizedPattern ||
      normalizedPath.startsWith(`${normalizedPattern}/`) ||
      normalizedPath.endsWith(`/${normalizedPattern}`)
    );
  });
}

export function scanSourceFiles(
  root: string,
  include: string[] = ['**'],
  exclude: string[] = []
): string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath);

      if (matchesPattern(relativePath, exclude)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (isSupportedSourceFile(fullPath) && matchesPattern(relativePath, include)) {
        files.push(fullPath);
      }
    }
  };

  if (fs.existsSync(root)) {
    walk(root);
  }

  return files.sort();
}

