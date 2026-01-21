import fs from 'fs';
import path from 'path';
import { resolveRoots } from './paths.js';
import type { RootOptions } from './paths.js';
import type { Client } from './types.js';
import { findSkillDirs, parseSkillFile } from './skills.js';
import { buildLinkPlan } from './plan.js';
import { applyLinkPlan } from './apply.js';
import { copyDir, copyFile, pathExists } from '../utils/fs.js';
import type { BackupSession } from './backup.js';
import { backupPath, recordCreatedPath } from './backup.js';

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

function conflictLabel(targetPath: string, canonicalRoot: string): string {
  if (targetPath.startsWith(canonicalRoot)) {
    const rel = path.relative(canonicalRoot, targetPath);
    return rel || path.basename(targetPath);
  }
  return path.basename(targetPath);
}

export async function scanMigration(opts: RootOptions & { clients?: Client[] }): Promise<MigrationPlan> {
  const roots = resolveRoots(opts);
  const canonicalRoot = roots.canonicalRoot;
  const candidatesByTarget = new Map<string, MigrationCandidate[]>();
  const clients = new Set<Client>(opts.clients ?? ['claude', 'factory', 'codex', 'cursor', 'opencode', 'gemini']);
  const includeAgentFiles = opts.scope === 'global';

  const canonicalCommands = path.join(canonicalRoot, 'commands');
  const canonicalHooks = path.join(canonicalRoot, 'hooks');
  const canonicalSkills = path.join(canonicalRoot, 'skills');
  const canonicalAgents = path.join(canonicalRoot, 'AGENTS.md');
  const canonicalClaude = path.join(canonicalRoot, 'CLAUDE.md');
  const opencodeSkillsRoot = opts.scope === 'global' ? roots.opencodeConfigRoot : roots.opencodeRoot;

  const sources = {
    commands: [
      clients.has('claude') ? { label: 'Claude commands', dir: path.join(roots.claudeRoot, 'commands') } : null,
      clients.has('factory') ? { label: 'Factory commands', dir: path.join(roots.factoryRoot, 'commands') } : null,
      clients.has('codex') ? { label: 'Codex prompts', dir: path.join(roots.codexRoot, 'prompts') } : null,
      clients.has('cursor') ? { label: 'Cursor commands', dir: path.join(roots.cursorRoot, 'commands') } : null,
      clients.has('opencode') ? { label: 'OpenCode commands', dir: path.join(roots.opencodeRoot, 'commands') } : null,
      clients.has('gemini') ? { label: 'Gemini commands', dir: path.join(roots.geminiRoot, 'commands') } : null,
    ].filter(Boolean) as { label: string; dir: string }[],
    hooks: [
      clients.has('claude') ? { label: 'Claude hooks', dir: path.join(roots.claudeRoot, 'hooks') } : null,
      clients.has('factory') ? { label: 'Factory hooks', dir: path.join(roots.factoryRoot, 'hooks') } : null,
    ].filter(Boolean) as { label: string; dir: string }[],
    skills: [
      clients.has('claude') ? { label: 'Claude skills', dir: path.join(roots.claudeRoot, 'skills') } : null,
      clients.has('factory') ? { label: 'Factory skills', dir: path.join(roots.factoryRoot, 'skills') } : null,
      clients.has('codex') ? { label: 'Codex skills', dir: path.join(roots.codexRoot, 'skills') } : null,
      clients.has('cursor') ? { label: 'Cursor skills', dir: path.join(roots.cursorRoot, 'skills') } : null,
      clients.has('opencode') ? { label: 'OpenCode skills', dir: path.join(opencodeSkillsRoot, 'skills') } : null,
      clients.has('gemini') ? { label: 'Gemini skills', dir: path.join(roots.geminiRoot, 'skills') } : null,
    ].filter(Boolean) as { label: string; dir: string }[],
    agents: includeAgentFiles
      ? [
          clients.has('claude') ? { label: 'Claude AGENTS.md', file: path.join(roots.claudeRoot, 'AGENTS.md') } : null,
          clients.has('factory') ? { label: 'Factory AGENTS.md', file: path.join(roots.factoryRoot, 'AGENTS.md') } : null,
          clients.has('codex') ? { label: 'Codex AGENTS.md', file: path.join(roots.codexRoot, 'AGENTS.md') } : null,
          clients.has('opencode') ? { label: 'OpenCode AGENTS.md', file: path.join(roots.opencodeConfigRoot, 'AGENTS.md') } : null,
        ].filter(Boolean) as { label: string; file: string }[]
      : [],
    claude: includeAgentFiles
      ? [
          clients.has('claude') ? { label: 'Claude CLAUDE.md', file: path.join(roots.claudeRoot, 'CLAUDE.md') } : null,
        ].filter(Boolean) as { label: string; file: string }[]
      : [],
    gemini: includeAgentFiles
      ? [
          clients.has('gemini') ? { label: 'Gemini GEMINI.md', file: path.join(roots.geminiRoot, 'GEMINI.md') } : null,
        ].filter(Boolean) as { label: string; file: string }[]
      : [],
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

  for (const src of sources.claude) {
    if (!await pathExists(src.file) || await isSymlink(src.file)) continue;
    addCandidate({ label: src.label, targetPath: canonicalClaude, kind: 'file', action: 'copy', sourcePath: src.file });
  }

  const canonicalGemini = path.join(canonicalRoot, 'GEMINI.md');
  for (const src of sources.gemini) {
    if (!await pathExists(src.file) || await isSymlink(src.file)) continue;
    addCandidate({ label: src.label, targetPath: canonicalGemini, kind: 'file', action: 'copy', sourcePath: src.file });
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

  return { auto, conflicts, canonicalRoot };
}

export type MigrationResult = {
  copied: number;
  skipped: number;
  backupDir: string;
  links: { applied: number; skipped: number; conflicts: number; backedUp: number };
};

export async function applyMigration(
  plan: MigrationPlan,
  selections: Map<string, MigrationCandidate | null>,
  opts: RootOptions & { clients?: Client[]; backup?: BackupSession; forceLinks?: boolean },
): Promise<MigrationResult> {
  const backup = opts.backup;
  if (!backup) throw new Error('Backup session required.');
  let copied = 0;
  let skipped = 0;

  const copyCandidate = async (candidate: MigrationCandidate) => {
    if (candidate.action !== 'copy' || !candidate.sourcePath) return false;
    const existed = await pathExists(candidate.targetPath);
    if (existed) {
      await backupPath(candidate.targetPath, backup);
    } else {
      recordCreatedPath(candidate.targetPath, candidate.kind === 'dir' ? 'dir' : 'file', backup);
    }
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

  const linkPlan = await buildLinkPlan(opts);
  const linkResult = await applyLinkPlan(linkPlan, { force: !!opts.forceLinks, backup });

  return {
    copied,
    skipped,
    backupDir: backup.dir,
    links: {
      applied: linkResult.applied,
      skipped: linkResult.skipped,
      conflicts: linkResult.conflicts,
      backedUp: linkResult.backedUp,
    },
  };
}
