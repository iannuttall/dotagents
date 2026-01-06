import fs from 'fs';
import path from 'path';
import type { LinkPlan, LinkTask, SourceKind } from './types.js';
import { ensureDir, ensureFile, removePath, pathExists } from '../utils/fs.js';

const DEFAULT_AGENTS = `# AGENTS\n\nAdd shared agent instructions here.\n`;

async function createSource(task: Extract<LinkTask, { type: 'ensure-source' }>): Promise<void> {
  if (task.kind === 'dir') {
    await ensureDir(task.path);
    return;
  }
  await ensureFile(task.path, DEFAULT_AGENTS);
}

async function createLink(source: string, target: string, kind: SourceKind, force: boolean): Promise<void> {
  if (await pathExists(target)) {
    if (!force) return;
    await removePath(target);
  }
  await ensureDir(path.dirname(target));
  const type = kind === 'dir' ? 'junction' : 'file';
  await fs.promises.symlink(source, target, type as fs.symlink.Type);
}

export async function applyLinkPlan(plan: LinkPlan, opts?: { force?: boolean }): Promise<{ applied: number; skipped: number; conflicts: number }> {
  const force = !!opts?.force;
  let applied = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const task of plan.tasks) {
    if (task.type === 'conflict') {
      conflicts += 1;
      if (force && task.target !== task.source && task.kind) {
        await createLink(task.source, task.target, task.kind, true);
        applied += 1;
      }
      continue;
    }
    if (task.type === 'noop') {
      skipped += 1;
      continue;
    }
    if (task.type === 'ensure-source') {
      await createSource(task);
      applied += 1;
      continue;
    }
    if (task.type === 'link') {
      const before = await pathExists(task.target);
      await createLink(task.source, task.target, task.kind, force);
      if (before && !force) skipped += 1; else applied += 1;
    }
  }

  return { applied, skipped, conflicts };
}
