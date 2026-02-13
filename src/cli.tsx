#!/usr/bin/env node
import path from 'path';
import chalk from 'chalk';
import { intro, outro, select, confirm, note, spinner, isCancel, cancel, multiselect } from '@clack/prompts';
import { buildLinkPlan } from './core/plan.js';
import { getLinkStatus } from './core/status.js';
import { applyMigration, scanMigration } from './core/migrate.js';
import { resolveRoots } from './core/paths.js';
import { createBackupSession, finalizeBackup } from './core/backup.js';
import { undoLastChange } from './core/undo.js';
import { preflightBackup } from './core/preflight.js';
import type { Client, LinkStatus, Scope } from './core/types.js';
import type { MigrationCandidate } from './core/migrate.js';

const appTitle = 'dotagents';

type StatusSummary = { name: string; linked: number; missing: number; conflict: number };

type Action = 'change' | 'status' | 'undo' | 'clients' | 'exit';

type ChangeChoice = 'force' | 'skip' | 'back';

type ScopeChoice = 'global' | 'project' | 'exit';

function exitCancelled() {
  cancel('Cancelled');
  process.exit(0);
}

function mergeAgentStatus(items: LinkStatus[]): LinkStatus[] {
  const claudeEntry = items.find((s) => s.name === 'claude-md') || null;
  const geminiEntry = items.find((s) => s.name === 'gemini-md') || null;
  const agentsEntry = items.find((s) => s.name === 'agents-md') || null;
  if (!claudeEntry && !agentsEntry && !geminiEntry) return items;

  const merged: LinkStatus = {
    name: 'agents-md',
    source: claudeEntry?.source || geminiEntry?.source || agentsEntry?.source || '',
    targets: [
      ...(claudeEntry?.targets || []),
      ...(geminiEntry?.targets || []),
      ...(agentsEntry?.targets || []),
    ],
  };

  const withoutAgents = items.filter((s) => s.name !== 'claude-md' && s.name !== 'gemini-md' && s.name !== 'agents-md');
  return [merged, ...withoutAgents];
}

function displayName(entry: LinkStatus): string {
  if (entry.name === 'agents-md') {
    const sourceFile = path.basename(entry.source);
    if (sourceFile === 'CLAUDE.md') return 'AGENTS.md (Claude override)';
    if (sourceFile === 'GEMINI.md') return 'AGENTS.md (Gemini override)';
    return 'AGENTS.md';
  }
  return entry.name;
}

function buildStatusSummary(status: LinkStatus[]): StatusSummary[] {
  return status.map((s) => {
    const linked = s.targets.filter((t) => t.status === 'linked').length;
    const missing = s.targets.filter((t) => t.status === 'missing').length;
    const conflict = s.targets.filter((t) => t.status === 'conflict').length;
    return { name: displayName(s), linked, missing, conflict };
  });
}

function formatSummaryTable(rows: StatusSummary[]): string[] {
  const header = { name: 'Section', conflict: 'Conflicts', missing: 'Need link', linked: 'Linked' };
  const width = {
    name: Math.max(header.name.length, ...rows.map((r) => r.name.length)),
    conflict: Math.max(header.conflict.length, ...rows.map((r) => String(r.conflict).length)),
    missing: Math.max(header.missing.length, ...rows.map((r) => String(r.missing).length)),
    linked: Math.max(header.linked.length, ...rows.map((r) => String(r.linked).length)),
  };
  const pad = (value: string, len: number) => value.padEnd(len, ' ');
  const lines = [
    `${pad(header.name, width.name)}  ${pad(header.conflict, width.conflict)}  ${pad(header.missing, width.missing)}  ${pad(header.linked, width.linked)}`,
    ...rows.map((r) => `${pad(r.name, width.name)}  ${pad(String(r.conflict), width.conflict)}  ${pad(String(r.missing), width.missing)}  ${pad(String(r.linked), width.linked)}`),
  ];
  return lines;
}

function renderStatusLines(status: LinkStatus[], conflictReasons: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const entry of status) {
    lines.push(chalk.cyan(displayName(entry)));
    for (const target of entry.targets) {
      const icon = target.status === 'linked'
        ? chalk.green('✓')
        : target.status === 'missing'
          ? chalk.yellow('•')
          : chalk.red('⚠');
      const reason = target.status === 'conflict' ? conflictReasons.get(target.path) : undefined;
      lines.push(`  ${icon} ${target.path}${reason ? chalk.dim(` — ${reason}`) : ''}`);
    }
  }
  return lines;
}

async function selectScope(): Promise<Scope> {
  const scope = await select({
    message: 'Choose a workspace',
    options: [
      { label: 'Global (~/.agents)', value: 'global' },
      { label: 'Project (.agents)', value: 'project' },
      { label: 'Exit', value: 'exit' },
    ],
  });
  if (isCancel(scope)) exitCancelled();
  if (scope === 'exit') {
    outro('Bye');
    process.exit(0);
  }
  return scope as Scope;
}

function scopeLabel(scope: Scope): string {
  return scope === 'global' ? 'Global (~/.agents)' : 'Project (.agents)';
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}

async function selectClients(): Promise<Client[]> {
  const options = [
    { label: 'Claude', value: 'claude' },
    { label: 'Factory', value: 'factory' },
    { label: 'Codex', value: 'codex' },
    { label: 'Cursor', value: 'cursor' },
    { label: 'OpenCode', value: 'opencode' },
    { label: 'Gemini', value: 'gemini' },
    { label: 'Kilo Code', value: 'kilocode' },
    { label: 'GitHub', value: 'github' },
    { label: 'Ampcode', value: 'ampcode' },
  ] as const;
  const selected = await multiselect({
    message: 'Select clients to manage',
    options: options.map((opt) => ({ label: opt.label, value: opt.value })),
    initialValues: options.map((opt) => opt.value),
    required: true,
  });
  if (isCancel(selected)) exitCancelled();
  return selected as Client[];
}

function formatClients(clients: Client[]): string {
  const names: Record<Client, string> = {
    claude: 'Claude',
    factory: 'Factory',
    codex: 'Codex',
    cursor: 'Cursor',
    opencode: 'OpenCode',
    gemini: 'Gemini',
    kilocode: 'Kilo Code',
    github: 'GitHub',
    ampcode: 'Ampcode',
  };
  return clients.map((c) => names[c]).join(', ');
}

async function showStatus(scope: Scope, clients: Client[], status: LinkStatus[], planConflicts: { target: string; reason: string }[]): Promise<void> {
  const conflicts = new Map(planConflicts.map((c) => [c.target, c.reason]));
  const lines = renderStatusLines(mergeAgentStatus(status), conflicts);
  note(lines.join('\n'), `Status · ${scopeLabel(scope)} · ${formatClients(clients)}`);
}

async function resolveMigrationConflicts(plan: Awaited<ReturnType<typeof scanMigration>>): Promise<Map<string, MigrationCandidate | null> | null> {
  const selections = new Map<string, MigrationCandidate | null>();
  for (let i = 0; i < plan.conflicts.length; i += 1) {
    const conflict = plan.conflicts[i];
    const choice = await select({
      message: `Resolve migration conflict ${i + 1} of ${plan.conflicts.length}: ${conflict.label}`,
      options: conflict.candidates.map((c) => ({ label: c.label, value: c })),
    });
    if (isCancel(choice)) return null;
    selections.set(conflict.targetPath, choice as MigrationCandidate);
  }
  return selections;
}

async function runChange(scope: Scope, clients: Client[]): Promise<void> {
  const spin = spinner();
  spin.start('Scanning current setup...');
  const roots = resolveRoots({ scope });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const migrate = await scanMigration({ scope, clients });
  const link = await buildLinkPlan({ scope, clients });
  const backupDir = path.join(roots.canonicalRoot, 'backup', timestamp);
  spin.stop('Scan complete');

  const planSummary = [
    `Migration: ${migrate.auto.length} auto · ${migrate.conflicts.length} conflicts (choose sources)`,
    `Links: ${link.changes.length} changes · ${link.conflicts.length} conflicts (existing files/dirs)`,
    `Backup: ${backupDir}`,
    'Undo: Use "Undo last change" after this completes.',
  ].join('\n');

  note(planSummary, 'Plan summary');

  let overwriteConflicts = true;
  if (link.conflicts.length > 0) {
    const choice = await select({
      message: 'Apply changes',
      options: [
        { label: 'Apply changes + overwrite conflicts', value: 'force' },
        { label: 'Apply changes (leave conflicts)', value: 'skip' },
        { label: 'Back', value: 'back' },
      ],
    });
    if (isCancel(choice)) return;
    if (choice === 'back') return;
    overwriteConflicts = choice === 'force';
  } else {
    const ok = await confirm({ message: 'Apply changes now?' });
    if (isCancel(ok) || !ok) return;
  }

  let selections = new Map<string, MigrationCandidate | null>();
  if (migrate.conflicts.length > 0) {
    const resolved = await resolveMigrationConflicts(migrate);
    if (!resolved) return;
    selections = resolved;
  }

  const applySpinner = spinner();
  applySpinner.start('Applying changes...');
  try {
    const backup = await createBackupSession({
      canonicalRoot: roots.canonicalRoot,
      scope,
      operation: 'change-to-agents',
      timestamp,
    });
    await preflightBackup({
      backup,
      linkPlan: link,
      migratePlan: migrate,
      selections,
      forceLinks: overwriteConflicts,
    });
    const result = await applyMigration(migrate, selections, { scope, clients, backup, forceLinks: overwriteConflicts });
    await finalizeBackup(backup);
    const migrationSummary = `Migrated ${formatCount(result.copied, 'item')}`;
    const linkSummary = `Linked ${formatCount(result.links.applied, 'path')}`;
    const conflictSummary = result.links.conflicts > 0
      ? overwriteConflicts
        ? `overwrote ${formatCount(result.links.conflicts, 'conflict')}`
        : `left ${formatCount(result.links.conflicts, 'conflict')} untouched`
      : '';
    const pieces = [migrationSummary, linkSummary];
    if (conflictSummary) pieces.push(conflictSummary);
    applySpinner.stop(`${pieces.join(' · ')}. Backup: ${result.backupDir}`);
  } catch (err: any) {
    applySpinner.stop('Change failed');
    note(String(err?.message || err), 'Error');
  }
}

async function run(): Promise<void> {
  intro(chalk.cyan(appTitle));
  const scope = await selectScope();
  let clients = await selectClients();

  while (true) {
    const status = mergeAgentStatus(await getLinkStatus({ scope, clients }));
    const plan = await buildLinkPlan({ scope, clients });
    const conflicts = plan.conflicts.length || 0;
    const changes = plan.changes.length || 0;
    const summary = buildStatusSummary(status);
    const summaryLines = formatSummaryTable(summary);

    note([
      `Scope: ${scopeLabel(scope)}`,
      `Clients: ${formatClients(clients)}`,
      `Pending changes: ${changes} · Conflicts: ${conflicts}`,
      ...summaryLines,
    ].join('\n'), 'Overview');

    const options: { label: string; value: Action }[] = [];
    if (changes > 0 || conflicts > 0) {
      const label = conflicts > 0 && changes === 0
        ? `Resolve ${conflicts} ${pluralize(conflicts, 'conflict')}`
        : `Apply ${changes} ${pluralize(changes, 'change')}`;
      options.push({ label, value: 'change' });
    }
    options.push({ label: 'View status', value: 'status' });
    options.push({ label: 'Change clients', value: 'clients' });
    options.push({ label: 'Undo last change', value: 'undo' });
    options.push({ label: 'Exit', value: 'exit' });

    const action = await select({ message: 'Choose an action', options });
    if (isCancel(action)) exitCancelled();
    if (action === 'exit') break;

    if (action === 'status') {
      await showStatus(scope, clients, status, plan.conflicts);
      continue;
    }

    if (action === 'clients') {
      clients = await selectClients();
      continue;
    }

    if (action === 'undo') {
      const spin = spinner();
      spin.start('Undoing last change...');
      try {
        const result = await undoLastChange({ scope });
        const restoredSummary = `Restored ${formatCount(result.restoredBackups, 'backup')}`;
        const removedSummary = `Removed ${formatCount(result.removedCreated, 'created path')}`;
        const symlinkSummary = result.removedSymlinks > 0
          ? `${formatCount(result.removedSymlinks, 'symlink')} removed`
          : '';
        let totalSummary = '';
        if (result.restoredBackups === 0 && result.removedCreated === 0) {
          totalSummary = 'Nothing to undo.';
        } else if (result.restoredBackups === 0) {
          totalSummary = [removedSummary, symlinkSummary, 'No backups to restore.'].filter(Boolean).join(' · ');
        } else {
          totalSummary = [restoredSummary, removedSummary, symlinkSummary].filter(Boolean).join(' · ');
        }
        spin.stop(`${totalSummary} Reverted: ${result.undoneDir}`);
        note(`Undo backup: ${result.backupDir}`, 'Undo log');
      } catch (err: any) {
        spin.stop('Undo failed');
        note(String(err?.message || err), 'Error');
      }
      continue;
    }

    if (action === 'change') {
      await runChange(scope, clients);
    }
  }

  outro('Bye');
}

run().catch((err) => {
  note(String(err?.message || err), 'Fatal error');
  process.exit(1);
});
