import path from 'path';
import type { SourceKind } from './types.js';

export type LinkTarget = {
  link: string;
  isRelative: boolean;
};

export function getLinkTarget(source: string, target: string, kind: SourceKind): LinkTarget {
  const resolvedSource = path.resolve(source);
  if (process.platform === 'win32' && kind === 'dir') {
    return { link: resolvedSource, isRelative: false };
  }

  const relative = path.relative(path.dirname(target), resolvedSource);
  if (!relative || path.isAbsolute(relative)) {
    return { link: resolvedSource, isRelative: false };
  }

  const resolvedRelative = path.resolve(path.dirname(target), relative);
  if (resolvedRelative !== resolvedSource) {
    return { link: resolvedSource, isRelative: false };
  }

  return { link: relative, isRelative: true };
}
