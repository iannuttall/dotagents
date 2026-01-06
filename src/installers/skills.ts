import fs from 'fs';
import path from 'path';
import { resolveRoots } from '../core/paths.js';
import { parseSkillFile, findSkillDirs, skillDestDir } from '../core/skills.js';
import type { SkillMeta } from '../core/skills.js';
import { ensureDir, copyDir, pathExists } from '../utils/fs.js';
import { resolveSource } from './source.js';
import type { SourceType } from './source.js';
import { isUrl } from '../utils/paths.js';

type RepoHint = { repoUrl: string; ref?: string; subdir?: string };

function parseGitHubUrl(input: string): RepoHint | null {
  try {
    const url = new URL(input);
    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length < 4) return null;
      const [owner, repo, ref, ...rest] = parts;
      const filePath = rest.join('/');
      const subdir = filePath.toLowerCase().endsWith('skill.md') ? filePath.split('/').slice(0, -1).join('/') : filePath;
      return { repoUrl: `https://github.com/${owner}/${repo}.git`, ref, subdir };
    }
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return null;
    const [owner, repo, kind, ref, ...rest] = parts;
    if (kind !== 'blob' && kind !== 'tree') return null;
    const filePath = rest.join('/');
    const subdir = filePath.toLowerCase().endsWith('skill.md') ? filePath.split('/').slice(0, -1).join('/') : filePath;
    return { repoUrl: `https://github.com/${owner}/${repo}.git`, ref, subdir };
  } catch {
    return null;
  }
}

function parseGitLabUrl(input: string): RepoHint | null {
  try {
    const url = new URL(input);
    if (url.hostname !== 'gitlab.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const dash = parts.indexOf('-');
    if (dash === -1) return null;
    const kind = parts[dash + 1];
    if (kind !== 'blob' && kind !== 'tree' && kind !== 'raw') return null;
    const ref = parts[dash + 2];
    const rest = parts.slice(dash + 3).join('/');
    const namespacePath = parts.slice(0, dash).join('/');
    if (!namespacePath) return null;
    const subdir = rest.toLowerCase().endsWith('skill.md') ? rest.split('/').slice(0, -1).join('/') : rest;
    return { repoUrl: `https://gitlab.com/${namespacePath}.git`, ref, subdir };
  } catch {
    return null;
  }
}

function inferRepoFromUrl(input: string): RepoHint | null {
  return parseGitHubUrl(input) || parseGitLabUrl(input);
}

export type InstallSkillsOptions = {
  source: string;
  sourceType?: SourceType;
  scope: 'global' | 'project';
  projectRoot?: string;
  homeDir?: string;
  force?: boolean;
};

export type InstallSkillsResult = {
  installed: string[];
  skipped: string[];
  skills: SkillMeta[];
};

export async function installSkillsFromSource(opts: InstallSkillsOptions): Promise<InstallSkillsResult> {
  const roots = resolveRoots({ scope: opts.scope, projectRoot: opts.projectRoot, homeDir: opts.homeDir });
  const canonicalSkills = path.join(roots.canonicalRoot, 'skills');
  await ensureDir(canonicalSkills);

  const sourceType = opts.sourceType || 'auto';
  const isHttp = isUrl(opts.source);
  const inferred = (sourceType === 'auto' || sourceType === 'url') && isHttp ? inferRepoFromUrl(opts.source) : null;

  const resolved = inferred
    ? await resolveSource(inferred.repoUrl, 'git', { ref: inferred.ref })
    : await resolveSource(opts.source, sourceType);
  try {
    let rootDir = inferred?.subdir ? path.join(resolved.dir, inferred.subdir) : resolved.dir;
    try {
      const stat = await fs.promises.lstat(rootDir);
      if (stat.isFile()) {
        if (path.basename(rootDir).toLowerCase() !== 'skill.md') {
          throw new Error('Expected a skills folder or SKILL.md file');
        }
        rootDir = path.dirname(rootDir);
      }
    } catch {
      // ignore lstat errors; findSkillDirs will handle
    }

    const skillDirs = await findSkillDirs(rootDir);
    if (!skillDirs.length) throw new Error('No SKILL.md found in source');

    const installed: string[] = [];
    const skipped: string[] = [];
    const metas: SkillMeta[] = [];

    for (const dir of skillDirs) {
      const skillFile = path.join(dir, 'SKILL.md');
      const meta = await parseSkillFile(skillFile);
      metas.push(meta);

      const dest = skillDestDir(canonicalSkills, meta.name);
      const exists = await pathExists(dest);
      if (exists && !opts.force) {
        skipped.push(meta.name);
        continue;
      }
      await copyDir(dir, dest, true);
      installed.push(meta.name);
    }

    return { installed, skipped, skills: metas };
  } finally {
    await resolved.cleanup();
  }
}
