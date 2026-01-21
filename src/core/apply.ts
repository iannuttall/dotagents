import fs from 'fs';
import path from 'path';
import type { LinkPlan, LinkTask, SourceKind } from './types.js';
import { getLinkTarget } from './link-target.js';
import { ensureDir, ensureFile, removePath, pathExists } from '../utils/fs.js';
import type { BackupSession } from './backup.js';
import { backupPath, recordCreatedPath } from './backup.js';

const DEFAULT_AGENTS = `# AGENTS\n\nAdd shared agent instructions here.\n`;

async function createSource(task: Extract<LinkTask, { type: 'ensure-source' }>): Promise<void> {
  if (task.kind === 'dir') {
    await ensureDir(task.path);
    return;
  }
  await ensureFile(task.path, DEFAULT_AGENTS);
}


async function createLink(
  source: string,
  target: string,
  kind: SourceKind,
  overwrite: boolean,
  backup?: BackupSession,
): Promise<{ created: boolean; backedUp: boolean }> {
  const linkTarget = getLinkTarget(source, target, kind);

  if (await pathExists(target)) {
    if (!overwrite) return { created: false, backedUp: false };
    const backedUp = backup ? await backupPath(target, backup) : false;
    if (await pathExists(target)) await removePath(target);
    await ensureDir(path.dirname(target));
    const type = kind === 'dir' ? 'junction' : 'file';
    await fs.promises.symlink(linkTarget.link, target, type as fs.symlink.Type);
    return { created: true, backedUp };
  }
  await ensureDir(path.dirname(target));
  const type = kind === 'dir' ? 'junction' : 'file';
  await fs.promises.symlink(linkTarget.link, target, type as fs.symlink.Type);
  return { created: true, backedUp: false };
}

export async function applyLinkPlan(
  plan: LinkPlan,
  opts: { force?: boolean; backup: BackupSession },
): Promise<{ applied: number; skipped: number; conflicts: number; backupDir: string; backedUp: number }> {
  const force = !!opts?.force;
  const backup = opts.backup;
  if (!backup) throw new Error('Backup session required.');
  let applied = 0;
  let skipped = 0;
  let conflicts = 0;
  let backedUp = 0;

  for (const task of plan.tasks) {
    if (task.type === 'conflict') {
      conflicts += 1;
      if (force && task.target !== task.source && task.kind) {
        const result = await createLink(task.source, task.target, task.kind, true, backup);
        if (result.backedUp) backedUp += 1;
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
      recordCreatedPath(task.path, task.kind, backup);
      applied += 1;
      continue;
    }
    if (task.type === 'link') {
      const before = await pathExists(task.target);
      let useForce = force;
      if (!useForce && task.replaceSymlink && before) {
        try {
          const stat = await fs.promises.lstat(task.target);
          if (stat.isSymbolicLink()) useForce = true;
        } catch {}
      }
      const result = await createLink(task.source, task.target, task.kind, useForce, backup);
      if (result.backedUp) backedUp += 1;
      if (!before && result.created) {
        recordCreatedPath(task.target, 'symlink', backup);
      }
      if (before && !useForce) skipped += 1; else applied += 1;
    }
  }

  return { applied, skipped, conflicts, backupDir: backup.dir, backedUp };
}
