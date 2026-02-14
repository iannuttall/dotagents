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
  cursorRoot: string;
  opencodeRoot: string;
  opencodeConfigRoot: string;
  geminiRoot: string;
  githubRoot: string;
  copilotRoot: string;
  ampcodeConfigRoot: string;
  roocodeRoot: string;
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
      cursorRoot: path.join(homeDir, '.cursor'),
      opencodeRoot: path.join(homeDir, '.config', 'opencode'),
      opencodeConfigRoot: path.join(homeDir, '.config', 'opencode'),
      geminiRoot: path.join(homeDir, '.gemini'),
      githubRoot: path.join(projectRoot, '.github'),
      copilotRoot: path.join(homeDir, '.copilot'),
      ampcodeConfigRoot: path.join(homeDir, '.config', 'amp'),
      roocodeRoot: path.join(homeDir, '.roo'),
      projectRoot,
      homeDir,
    };
  }
  return {
    canonicalRoot: path.join(projectRoot, '.agents'),
    claudeRoot: path.join(projectRoot, '.claude'),
    factoryRoot: path.join(projectRoot, '.factory'),
    codexRoot: path.join(projectRoot, '.codex'),
    cursorRoot: path.join(projectRoot, '.cursor'),
    opencodeRoot: path.join(projectRoot, '.opencode'),
    opencodeConfigRoot: path.join(homeDir, '.config', 'opencode'),
    geminiRoot: path.join(projectRoot, '.gemini'),
    githubRoot: path.join(projectRoot, '.github'),
    copilotRoot: path.join(homeDir, '.copilot'),
    ampcodeConfigRoot: path.join(homeDir, '.config', 'amp'),
    roocodeRoot: path.join(projectRoot, '.roo'),
    projectRoot,
    homeDir,
  };
}
