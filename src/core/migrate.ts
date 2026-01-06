import fs from 'fs';
import path from 'path';
import { resolveRoots } from './paths.js';
import type { RootOptions } from './paths.js';
import { findSkillDirs, parseSkillFile } from './skills.js';
import { buildLinkPlan } from './plan.js';
import { applyLinkPlan } from './apply.js';
import { copyDir, copyFile, ensureDir, pathExists, removePath } from '../utils/fs.js';

export type MigrationCandidate = {
  label: string;
  targetPath: string;
  kind: 'file' | 'dir';
  action: 'copy' | 'keep';
  sourcePath?: string;
};

export type MigrationConflict = {
  label: string;
  targetPath: string;
  candidates: MigrationCandidate[];
};

export type MigrationPlan = {
  auto: MigrationCandidate[];
  conflicts: MigrationConflict[];
  backupPaths: { label: string; path: string; kind: 'file' | 'dir' }[];
  canonicalRoot: string;
};

async function isSymlink(p: string): Promise<boolean> {
  try {
    const stat = await fs.promises.lstat(p);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

async function movePath(src: string, dest: string, kind: 'file' | 'dir'): Promise<void> {
  await ensureDir(path.dirname(dest));
  try {
    await fs.promises.rename(src, dest);
    return;
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err;
  }

  if (kind === 'file') {
    await copyFile(src, dest, true);
  } else {
    await copyDir(src, dest, true);
  }
  await removePath(src);
}

function conflictLabel(targetPath: string, canonicalRoot: string): string {
  if (targetPath.startsWith(canonicalRoot)) {
    const rel = path.relative(canonicalRoot, targetPath);
    return rel || path.basename(targetPath);
  }
  return path.basename(targetPath);
}

export async function scanMigration(opts: RootOptions): Promise<MigrationPlan> {
  const roots = resolveRoots(opts);
  const canonicalRoot = roots.canonicalRoot;
  const candidatesByTarget = new Map<string, MigrationCandidate[]>();

  const canonicalCommands = path.join(canonicalRoot, 'commands');
  const canonicalHooks = path.join(canonicalRoot, 'hooks');
  const canonicalSkills = path.join(canonicalRoot, 'skills');
  const canonicalAgents = path.join(canonicalRoot, 'AGENTS.md');

  const sources = {
    commands: [
      { label: 'Claude commands', dir: path.join(roots.claudeRoot, 'commands') },
      { label: 'Factory commands', dir: path.join(roots.factoryRoot, 'commands') },
      { label: 'Codex prompts', dir: path.join(roots.codexRoot, 'prompts') },
    ],
    hooks: [
      { label: 'Claude hooks', dir: path.join(roots.claudeRoot, 'hooks') },
      { label: 'Factory hooks', dir: path.join(roots.factoryRoot, 'hooks') },
    ],
    skills: [
      { label: 'Claude skills', dir: path.join(roots.claudeRoot, 'skills') },
      { label: 'Factory skills', dir: path.join(roots.factoryRoot, 'skills') },
    ],
    agents: [
      { label: 'Claude CLAUDE.md', file: path.join(roots.claudeRoot, 'CLAUDE.md') },
    ],
  } as const;

  const addCandidate = (candidate: MigrationCandidate) => {
    const list = candidatesByTarget.get(candidate.targetPath) || [];
    list.push(candidate);
    candidatesByTarget.set(candidate.targetPath, list);
  };

  for (const src of sources.commands) {
    if (!await pathExists(src.dir) || await isSymlink(src.dir)) continue;
    const files = await listFiles(src.dir);
    for (const file of files) {
      const targetPath = path.join(canonicalCommands, path.basename(file));
      addCandidate({ label: src.label, targetPath, kind: 'file', action: 'copy', sourcePath: file });
    }
  }

  for (const src of sources.hooks) {
    if (!await pathExists(src.dir) || await isSymlink(src.dir)) continue;
    const files = await listFiles(src.dir);
    for (const file of files) {
      const targetPath = path.join(canonicalHooks, path.basename(file));
      addCandidate({ label: src.label, targetPath, kind: 'file', action: 'copy', sourcePath: file });
    }
  }

  for (const src of sources.skills) {
    if (!await pathExists(src.dir) || await isSymlink(src.dir)) continue;
    const skillDirs = await findSkillDirs(src.dir);
    for (const dir of skillDirs) {
      try {
        const meta = await parseSkillFile(path.join(dir, 'SKILL.md'));
        const targetPath = path.join(canonicalSkills, meta.name);
        addCandidate({ label: src.label, targetPath, kind: 'dir', action: 'copy', sourcePath: dir });
      } catch {
        // skip invalid skill folders
      }
    }
  }

  for (const src of sources.agents) {
    if (!await pathExists(src.file) || await isSymlink(src.file)) continue;
    addCandidate({ label: src.label, targetPath: canonicalAgents, kind: 'file', action: 'copy', sourcePath: src.file });
  }

  const auto: MigrationCandidate[] = [];
  const conflicts: MigrationConflict[] = [];

  for (const [targetPath, list] of candidatesByTarget.entries()) {
    const canonicalExists = await pathExists(targetPath);
    if (canonicalExists) {
      let kind: 'file' | 'dir' = 'file';
      try {
        const stat = await fs.promises.lstat(targetPath);
        kind = stat.isDirectory() ? 'dir' : 'file';
      } catch {}
      list.unshift({
        label: 'Keep existing (.agents)',
        targetPath,
        kind,
        action: 'keep',
      });
    }

    if (list.length === 1 && !canonicalExists) {
      const only = list[0];
      if (only) auto.push(only);
      continue;
    }

    conflicts.push({
      label: conflictLabel(targetPath, canonicalRoot),
      targetPath,
      candidates: list,
    });
  }

  const backupPaths: MigrationPlan['backupPaths'] = [
    { label: 'claude/commands', path: path.join(roots.claudeRoot, 'commands'), kind: 'dir' },
    { label: 'factory/commands', path: path.join(roots.factoryRoot, 'commands'), kind: 'dir' },
    { label: 'codex/prompts', path: path.join(roots.codexRoot, 'prompts'), kind: 'dir' },
    { label: 'claude/hooks', path: path.join(roots.claudeRoot, 'hooks'), kind: 'dir' },
    { label: 'factory/hooks', path: path.join(roots.factoryRoot, 'hooks'), kind: 'dir' },
    { label: 'claude/skills', path: path.join(roots.claudeRoot, 'skills'), kind: 'dir' },
    { label: 'factory/skills', path: path.join(roots.factoryRoot, 'skills'), kind: 'dir' },
    { label: 'claude/CLAUDE.md', path: path.join(roots.claudeRoot, 'CLAUDE.md'), kind: 'file' },
  ];

  return { auto, conflicts, backupPaths, canonicalRoot };
}

export async function applyMigration(plan: MigrationPlan, selections: Map<string, MigrationCandidate | null>, opts: RootOptions): Promise<{ copied: number; skipped: number; backupDir: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(plan.canonicalRoot, 'backup', timestamp);
  await ensureDir(backupDir);

  let copied = 0;
  let skipped = 0;

  const copyCandidate = async (candidate: MigrationCandidate) => {
    if (candidate.action !== 'copy' || !candidate.sourcePath) return false;
    if (candidate.kind === 'file') {
      await copyFile(candidate.sourcePath, candidate.targetPath, true);
    } else {
      await copyDir(candidate.sourcePath, candidate.targetPath, true);
    }
    return true;
  };

  for (const candidate of plan.auto) {
    if (await copyCandidate(candidate)) copied += 1; else skipped += 1;
  }

  for (const conflict of plan.conflicts) {
    const choice = selections.get(conflict.targetPath);
    if (!choice || choice.action !== 'copy') { skipped += 1; continue; }
    if (await copyCandidate(choice)) copied += 1; else skipped += 1;
  }

  // Backup existing tool paths before linking
  for (const item of plan.backupPaths) {
    if (!await pathExists(item.path)) continue;
    if (await isSymlink(item.path)) continue;
    const dest = path.join(backupDir, item.label);
    await movePath(item.path, dest, item.kind);
  }

  const linkPlan = await buildLinkPlan(opts);
  await applyLinkPlan(linkPlan);

  return { copied, skipped, backupDir };
}
