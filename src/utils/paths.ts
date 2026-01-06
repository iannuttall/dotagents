import os from 'os';
import path from 'path';

export function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export function isGitUrl(input: string): boolean {
  return /^(git@|https?:\/\/).+\.git$/i.test(input) || input.startsWith('git://');
}

export function isFileUrl(input: string): boolean {
  return /^file:\/\//i.test(input);
}

export function normalizeFileUrl(input: string): string {
  if (!isFileUrl(input)) return input;
  const url = new URL(input);
  return url.pathname;
}
