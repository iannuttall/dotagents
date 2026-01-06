import os from 'os';
import path from 'path';
import type { Scope } from './types.js';

export type RootOptions = {
  scope: Scope;
  projectRoot?: string;
  homeDir?: string;
};

export type ResolvedRoots = {
  canonicalRoot: string;
  claudeRoot: string;
  factoryRoot: string;
  codexRoot: string;
  projectRoot: string;
  homeDir: string;
};

export function resolveRoots(opts: RootOptions): ResolvedRoots {
  const homeDir = opts.homeDir || os.homedir();
  const projectRoot = path.resolve(opts.projectRoot || process.cwd());
  if (opts.scope === 'global') {
    return {
      canonicalRoot: path.join(homeDir, '.agents'),
      claudeRoot: path.join(homeDir, '.claude'),
      factoryRoot: path.join(homeDir, '.factory'),
      codexRoot: path.join(homeDir, '.codex'),
      projectRoot,
      homeDir,
    };
  }
  return {
    canonicalRoot: path.join(projectRoot, '.agents'),
    claudeRoot: path.join(projectRoot, '.claude'),
    factoryRoot: path.join(projectRoot, '.factory'),
    codexRoot: path.join(projectRoot, '.codex'),
    projectRoot,
    homeDir,
  };
}
