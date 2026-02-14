import fs from 'fs';
import path from 'path';
import type { LinkPlan, LinkTask } from './types.js';
import type { MigrationCandidate, MigrationPlan } from './migrate.js';
import type { BackupSession } from './backup.js';
import { backupPathFor } from './backup.js';
import { ensureDir, pathExists } from '../utils/fs.js';

type PreflightOptions = {
  backup: BackupSession;
  linkPlan: LinkPlan;
  migratePlan: MigrationPlan;
  selections: Map<string, MigrationCandidate | null>;
  forceLinks: boolean;
};

async function needsLinkBackup(task: LinkTask, forceLinks: boolean): Promise<boolean> {
  if (task.type === 'conflict') return forceLinks && task.target !== task.source;
  if (task.type !== 'link') return false;
  if (!await pathExists(task.target)) return false;
  if (forceLinks) return true;
  if (!task.replaceSymlink) return false;
  try {
    const stat = await fs.promises.lstat(task.target);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function collectMigrationCandidates(plan: MigrationPlan, selections: Map<string, MigrationCandidate | null>): MigrationCandidate[] {
  const candidates: MigrationCandidate[] = [...plan.auto];
  for (const conflict of plan.conflicts) {
    const choice = selections.get(conflict.targetPath);
    if (choice && choice.action === 'copy') candidates.push(choice);
  }
  return candidates;
}

export async function preflightBackup(opts: PreflightOptions): Promise<{ targets: number }> {
  const targets = new Set<string>();

  for (const task of opts.linkPlan.tasks) {
    if (await needsLinkBackup(task, opts.forceLinks)) {
      if ('target' in task) {
        targets.add(path.resolve(task.target));
      }
    }
  }

  const migrationCandidates = collectMigrationCandidates(opts.migratePlan, opts.selections);
  for (const candidate of migrationCandidates) {
    if (!candidate.sourcePath) continue;
    if (await pathExists(candidate.targetPath)) {
      targets.add(path.resolve(candidate.targetPath));
    }
  }

  for (const target of targets) {
    const exists = await pathExists(target);
    if (!exists) continue;
    const stat = await fs.promises.lstat(target);
    if (stat.isSymbolicLink()) {
      await fs.promises.readlink(target);
    }
    const dest = backupPathFor(target, opts.backup.dir);
    await ensureDir(path.dirname(dest));
    await fs.promises.access(path.dirname(dest), fs.constants.W_OK);
  }

  return { targets: targets.size };
}
