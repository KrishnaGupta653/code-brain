import crypto from 'crypto';

export function stableHash(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 16);
}

export function stableId(prefix: string, ...parts: Array<string | number>): string {
  return `${prefix}_${stableHash(parts.map(p => String(p)).join('::'))}`;
}
