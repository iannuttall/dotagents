import fs from 'fs';
import path from 'path';
import { getMappings } from './mappings.js';
import type { MappingOptions } from './mappings.js';
import type { LinkPlan, LinkTask, SourceKind, ConflictTask } from './types.js';
import { pathExists } from '../utils/fs.js';

async function getLinkTargetAbsolute(targetPath: string): Promise<string | null> {
  try {
    const link = await fs.promises.readlink(targetPath);
    if (!path.isAbsolute(link)) {
      return path.resolve(path.dirname(targetPath), link);
    }
    return link;
  } catch {
    return null;
  }
}

async function ensureSourceTask(source: string, kind: SourceKind): Promise<LinkTask[]> {
  const exists = await pathExists(source);
  if (!exists) return [{ type: 'ensure-source', path: source, kind }];
  const stat = await fs.promises.lstat(source);
  if (kind === 'file' && stat.isDirectory()) {
    return [{ type: 'conflict', source, target: source, reason: 'Expected file but found directory', kind }];
  }
  if (kind === 'dir' && !stat.isDirectory()) {
    return [{ type: 'conflict', source, target: source, reason: 'Expected directory but found file', kind }];
  }
  return [];
}

async function analyzeTarget(source: string, target: string, kind: SourceKind): Promise<LinkTask> {
  const exists = await pathExists(target);
  if (!exists) return { type: 'link', source, target, kind };
  const stat = await fs.promises.lstat(target);
  if (stat.isSymbolicLink()) {
    const resolved = await getLinkTargetAbsolute(target);
    if (resolved && path.resolve(resolved) === path.resolve(source)) {
      return { type: 'noop', source, target };
    }
    const detail = resolved ? `Symlink points elsewhere: ${resolved}` : 'Symlink points elsewhere';
    return { type: 'conflict', source, target, reason: detail, kind };
  }
  const targetKind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'path';
  return { type: 'conflict', source, target, reason: `Target exists and is not a symlink (${targetKind})`, kind };
}

export async function buildLinkPlan(opts: MappingOptions): Promise<LinkPlan> {
  const mappings = getMappings(opts);
  const tasks: LinkTask[] = [];

  for (const mapping of mappings) {
    tasks.push(...await ensureSourceTask(mapping.source, mapping.kind));
    for (const target of mapping.targets) {
      tasks.push(await analyzeTarget(mapping.source, target, mapping.kind));
    }
  }

  const conflicts = tasks.filter((t) => t.type === 'conflict') as ConflictTask[];
  const changes = tasks.filter((t) => t.type === 'link' || t.type === 'ensure-source');

  return { tasks, conflicts, changes };
}
