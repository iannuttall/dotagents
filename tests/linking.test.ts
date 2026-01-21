import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';
import { createBackupSession, finalizeBackup } from '../src/core/backup.js';
import { makeTempDir, writeFile } from './helpers.js';

async function readLinkTarget(target: string): Promise<string> {
  const link = await fs.promises.readlink(target);
  return path.isAbsolute(link) ? link : path.resolve(path.dirname(target), link);
}

test('creates symlinks from canonical .agents to tool homes', async () => {
  const home = await makeTempDir('dotagents-home-');

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  expect(result.applied).toBeGreaterThan(0);

  const canonical = path.join(home, '.agents');
  const commands = path.join(canonical, 'commands');
  const agentsFile = path.join(canonical, 'AGENTS.md');

  await writeFile(path.join(commands, 'hello.md'), '# hello');

  const claudeCommands = path.join(home, '.claude', 'commands');
  const factoryCommands = path.join(home, '.factory', 'commands');
  const codexPrompts = path.join(home, '.codex', 'prompts');
  const cursorCommands = path.join(home, '.cursor', 'commands');
  const opencodeCommands = path.join(home, '.config', 'opencode', 'commands');
  const claudeAgents = path.join(home, '.claude', 'CLAUDE.md');
  const factoryAgents = path.join(home, '.factory', 'AGENTS.md');
  const codexAgents = path.join(home, '.codex', 'AGENTS.md');
  const opencodeAgents = path.join(home, '.config', 'opencode', 'AGENTS.md');
  const cursorSkills = path.join(home, '.cursor', 'skills');
  const opencodeSkills = path.join(home, '.config', 'opencode', 'skills');
  const geminiCommands = path.join(home, '.gemini', 'commands');
  const geminiSkills = path.join(home, '.gemini', 'skills');

  expect(await readLinkTarget(claudeCommands)).toBe(commands);
  expect(await readLinkTarget(factoryCommands)).toBe(commands);
  expect(await readLinkTarget(codexPrompts)).toBe(commands);
  expect(await readLinkTarget(cursorCommands)).toBe(commands);
  expect(await readLinkTarget(opencodeCommands)).toBe(commands);
  expect(await readLinkTarget(geminiCommands)).toBe(commands);
  expect(await readLinkTarget(claudeAgents)).toBe(agentsFile);
  expect(await readLinkTarget(factoryAgents)).toBe(agentsFile);
  expect(await readLinkTarget(codexAgents)).toBe(agentsFile);
  expect(await readLinkTarget(opencodeAgents)).toBe(agentsFile);
  expect(await readLinkTarget(cursorSkills)).toBe(path.join(canonical, 'skills'));
  expect(await readLinkTarget(opencodeSkills)).toBe(path.join(canonical, 'skills'));
  expect(await readLinkTarget(geminiSkills)).toBe(path.join(canonical, 'skills'));
});

test('adds cursor links when .cursor exists without .claude', async () => {
  const home = await makeTempDir('dotagents-home-');
  const cursorRoot = path.join(home, '.cursor');
  await fs.promises.mkdir(cursorRoot, { recursive: true });

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  expect(result.applied).toBeGreaterThan(0);

  const commands = path.join(home, '.agents', 'commands');
  const skills = path.join(home, '.agents', 'skills');
  const cursorCommands = path.join(cursorRoot, 'commands');
  const cursorSkills = path.join(cursorRoot, 'skills');

  expect(await readLinkTarget(cursorCommands)).toBe(commands);
  expect(await readLinkTarget(cursorSkills)).toBe(skills);
});

test('relinks Claude prompt when CLAUDE.md is added', async () => {
  const home = await makeTempDir('dotagents-home-');

  const first = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backupFirst = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  await applyLinkPlan(first, { backup: backupFirst });
  await finalizeBackup(backupFirst);

  const canonical = path.join(home, '.agents');
  const agentsFile = path.join(canonical, 'AGENTS.md');
  const claudeFile = path.join(canonical, 'CLAUDE.md');
  const claudeAgents = path.join(home, '.claude', 'CLAUDE.md');
  const factoryAgents = path.join(home, '.factory', 'AGENTS.md');
  const codexAgents = path.join(home, '.codex', 'AGENTS.md');

  expect(await readLinkTarget(claudeAgents)).toBe(agentsFile);
  expect(await readLinkTarget(factoryAgents)).toBe(agentsFile);
  expect(await readLinkTarget(codexAgents)).toBe(agentsFile);

  await writeFile(claudeFile, '# Claude override');
  await writeFile(path.join(canonical, 'GEMINI.md'), '# Gemini override');

  const second = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backupSecond = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(second, { backup: backupSecond });
  await finalizeBackup(backupSecond);
  expect(result.applied).toBeGreaterThan(0);

  expect(await readLinkTarget(claudeAgents)).toBe(claudeFile);
  expect(await readLinkTarget(path.join(home, '.gemini', 'GEMINI.md'))).toBe(path.join(canonical, 'GEMINI.md'));
  expect(await readLinkTarget(factoryAgents)).toBe(agentsFile);
  expect(await readLinkTarget(codexAgents)).toBe(agentsFile);
});

test('idempotent apply produces no changes on second run', async () => {
  const home = await makeTempDir('dotagents-home-');
  const first = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backupFirst = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  await applyLinkPlan(first, { backup: backupFirst });
  await finalizeBackup(backupFirst);

  const second = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backupSecond = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(second, { backup: backupSecond });
  await finalizeBackup(backupSecond);
  expect(result.applied).toBe(0);
});

test('force apply replaces conflicting targets', async () => {
  const home = await makeTempDir('dotagents-home-');
  const codexPrompts = path.join(home, '.codex', 'prompts');
  await fs.promises.mkdir(path.dirname(codexPrompts), { recursive: true });
  await fs.promises.mkdir(codexPrompts, { recursive: true });

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  expect(plan.conflicts.length).toBeGreaterThan(0);

  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(plan, { force: true, backup });
  await finalizeBackup(backup);
  expect(result.applied).toBeGreaterThan(0);

  const target = await readLinkTarget(codexPrompts);
  expect(target).toBe(path.join(home, '.agents', 'commands'));
});

test('project scope does not link AGENTS/CLAUDE files', async () => {
  const home = await makeTempDir('dotagents-home-');
  const project = await makeTempDir('dotagents-project-');

  const plan = await buildLinkPlan({ scope: 'project', homeDir: home, projectRoot: project });

  const blockedTargets = new Set([
    path.join(project, '.claude', 'CLAUDE.md'),
    path.join(project, '.factory', 'AGENTS.md'),
    path.join(project, '.codex', 'AGENTS.md'),
    path.join(home, '.config', 'opencode', 'AGENTS.md'),
    path.join(project, '.agents', 'AGENTS.md'),
    path.join(project, '.agents', 'CLAUDE.md'),
  ]);

  for (const task of plan.tasks) {
    if (task.type === 'ensure-source') {
      expect(blockedTargets.has(task.path)).toBe(false);
      continue;
    }
    expect(blockedTargets.has(task.source)).toBe(false);
    expect(blockedTargets.has(task.target)).toBe(false);
  }
});
