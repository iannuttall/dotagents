import path from 'path';
import matter from 'gray-matter';
import { listDirs, pathExists, readText } from '../utils/fs.js';

export type SkillMeta = {
  name: string;
  description: string;
  allowedTools?: string[];
  model?: string;
};

const NAME_RE = /^[a-z0-9-]{1,64}$/;

export async function parseSkillFile(skillFile: string): Promise<SkillMeta> {
  const raw = await readText(skillFile);
  const parsed = matter(raw);
  const data = parsed.data as Record<string, any>;
  const name = String(data?.name || '').trim();
  const description = String(data?.description || '').trim();
  if (!name || !description) {
    throw new Error(`SKILL.md missing required frontmatter fields (name, description): ${skillFile}`);
  }
  if (!NAME_RE.test(name)) {
    throw new Error(`Skill name must be lowercase letters, numbers, and hyphens (max 64): ${name}`);
  }
  return {
    name,
    description,
    allowedTools: Array.isArray(data?.['allowed-tools']) ? data['allowed-tools'] : undefined,
    model: typeof data?.model === 'string' ? data.model : undefined,
  };
}

export async function isSkillDir(dir: string): Promise<boolean> {
  return await pathExists(path.join(dir, 'SKILL.md'));
}

export async function findSkillDirs(root: string): Promise<string[]> {
  const direct = await isSkillDir(root);
  if (direct) return [root];

  const skillsDir = path.join(root, 'skills');
  const skillsDirExists = await pathExists(skillsDir);
  if (skillsDirExists) {
    const children = await listDirs(skillsDir);
    const matches: string[] = [];
    for (const child of children) {
      if (await isSkillDir(child)) matches.push(child);
    }
    if (matches.length) return matches;
  }

  const children = await listDirs(root);
  const matches: string[] = [];
  for (const child of children) {
    if (await isSkillDir(child)) matches.push(child);
  }
  return matches;
}

export function skillDestDir(canonicalSkillsRoot: string, name: string): string {
  return path.join(canonicalSkillsRoot, name);
}
