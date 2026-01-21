import fs from 'fs';
import path from 'path';
import { getMappings } from './mappings.js';
import type { MappingOptions } from './mappings.js';
import type { LinkPlan, LinkTask, SourceKind, ConflictTask } from './types.js';
import { pathExists } from '../utils/fs.js';
import { getLinkTarget } from './link-target.js';

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

async function analyzeTarget(
  source: string,
  target: string,
  kind: SourceKind,
  opts?: { relinkableSources?: string[] },
): Promise<LinkTask> {
  const exists = await pathExists(target);
  if (!exists) return { type: 'link', source, target, kind };
  const stat = await fs.promises.lstat(target);
  if (stat.isSymbolicLink()) {
    const rawLink = await fs.promises.readlink(target);
    const resolved = await getLinkTargetAbsolute(target);
    if (resolved && path.resolve(resolved) === path.resolve(source)) {
      const desired = getLinkTarget(source, target, kind);
      if (desired.isRelative && path.isAbsolute(rawLink)) {
        // Migrate absolute links to relative when safe on this platform.
        return { type: 'link', source, target, kind, replaceSymlink: true };
      }
      return { type: 'noop', source, target };
    }
    if (resolved && opts?.relinkableSources) {
      const relinkable = new Set(opts.relinkableSources.map((p) => path.resolve(p)));
      if (relinkable.has(path.resolve(resolved))) {
        return { type: 'link', source, target, kind, replaceSymlink: true };
      }
    }
    const detail = resolved ? `Symlink points elsewhere: ${resolved}` : 'Symlink points elsewhere';
    return { type: 'conflict', source, target, reason: detail, kind };
  }
  const targetKind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'path';
  return { type: 'conflict', source, target, reason: `Target exists and is not a symlink (${targetKind})`, kind };
}

export async function buildLinkPlan(opts: MappingOptions): Promise<LinkPlan> {
  const mappings = await getMappings(opts);
  const tasks: LinkTask[] = [];

  for (const mapping of mappings) {
    tasks.push(...await ensureSourceTask(mapping.source, mapping.kind));
    let relinkableSources: string[] | undefined;
    if (mapping.name === 'claude-md') {
      relinkableSources = [
        path.join(path.dirname(mapping.source), 'AGENTS.md'),
        path.join(path.dirname(mapping.source), 'CLAUDE.md'),
      ];
    } else if (mapping.name === 'gemini-md') {
      relinkableSources = [
        path.join(path.dirname(mapping.source), 'AGENTS.md'),
        path.join(path.dirname(mapping.source), 'GEMINI.md'),
      ];
    }

    for (const target of mapping.targets) {
      tasks.push(await analyzeTarget(mapping.source, target, mapping.kind, { relinkableSources }));
    }
  }

  const conflicts = tasks.filter((t) => t.type === 'conflict') as ConflictTask[];
  const changes = tasks.filter((t) => t.type === 'link' || t.type === 'ensure-source');

  return { tasks, conflicts, changes };
}
