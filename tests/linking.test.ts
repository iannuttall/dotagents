import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';
import { createBackupSession, finalizeBackup } from '../src/core/backup.js';
import { getLinkTarget } from '../src/core/link-target.js';
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
  const copilotSkills = path.join(home, '.copilot', 'skills');

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
  expect(await readLinkTarget(copilotSkills)).toBe(path.join(canonical, 'skills'));
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

test('project scope links .agents/rules to supported tool rule folders', async () => {
  const home = await makeTempDir('dotagents-home-');
  const project = await makeTempDir('dotagents-project-');

  const plan = await buildLinkPlan({ scope: 'project', homeDir: home, projectRoot: project });
  const backup = await createBackupSession({ canonicalRoot: path.join(project, '.agents'), scope: 'project', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  expect(result.applied).toBeGreaterThan(0);

  const rules = path.join(project, '.agents', 'rules');
  const cursorRules = path.join(project, '.cursor', 'rules');
  const claudeRules = path.join(project, '.claude', 'rules');
  const githubInstructions = path.join(project, '.github', 'instructions');

  expect(await readLinkTarget(cursorRules)).toBe(rules);
  expect(await readLinkTarget(claudeRules)).toBe(rules);
  expect(await readLinkTarget(githubInstructions)).toBe(rules);
});

test('github skills link to .github/skills in project scope', async () => {
  const home = await makeTempDir('dotagents-home-');
  const project = await makeTempDir('dotagents-project-');

  const plan = await buildLinkPlan({ scope: 'project', homeDir: home, projectRoot: project });
  const backup = await createBackupSession({ canonicalRoot: path.join(project, '.agents'), scope: 'project', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  expect(result.applied).toBeGreaterThan(0);

  const skills = path.join(project, '.agents', 'skills');
  const githubSkills = path.join(project, '.github', 'skills');

  expect(await readLinkTarget(githubSkills)).toBe(skills);
});

test('github skills link to ~/.copilot/skills in global scope', async () => {
  const home = await makeTempDir('dotagents-home-');

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  expect(result.applied).toBeGreaterThan(0);

  const skills = path.join(home, '.agents', 'skills');
  const copilotSkills = path.join(home, '.copilot', 'skills');

  expect(await readLinkTarget(copilotSkills)).toBe(skills);
});

test('creates symlinks with relative paths when supported', async () => {
  const home = await makeTempDir('dotagents-home-');

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);

  const commands = path.join(home, '.agents', 'commands');
  const claudeCommands = path.join(home, '.claude', 'commands');
  const rawLink = await fs.promises.readlink(claudeCommands);
  const desired = getLinkTarget(commands, claudeCommands, 'dir');

  expect(await readLinkTarget(claudeCommands)).toBe(commands);
  if (desired.isRelative) {
    expect(path.isAbsolute(rawLink)).toBe(false);
    expect(rawLink).toBe(desired.link);
  } else {
    expect(path.isAbsolute(rawLink)).toBe(true);
  }
});

test('creates relative symlinks for nested targets when supported', async () => {
  const home = await makeTempDir('dotagents-home-');

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);

  const agentsFile = path.join(home, '.agents', 'AGENTS.md');
  const opencodeAgents = path.join(home, '.config', 'opencode', 'AGENTS.md');
  const rawLink = await fs.promises.readlink(opencodeAgents);
  const desired = getLinkTarget(agentsFile, opencodeAgents, 'file');

  expect(await readLinkTarget(opencodeAgents)).toBe(agentsFile);
  if (desired.isRelative) {
    expect(path.isAbsolute(rawLink)).toBe(false);
    expect(rawLink).toBe(desired.link);
  } else {
    expect(path.isAbsolute(rawLink)).toBe(true);
  }
});

test('migrates absolute symlinks to relative when supported', async () => {
  const home = await makeTempDir('dotagents-home-');

  const commands = path.join(home, '.agents', 'commands');
  const claudeCommands = path.join(home, '.claude', 'commands');
  const desired = getLinkTarget(commands, claudeCommands, 'dir');
  if (!desired.isRelative) return;

  await fs.promises.mkdir(commands, { recursive: true });
  await fs.promises.mkdir(path.dirname(claudeCommands), { recursive: true });

  await fs.promises.symlink(commands, claudeCommands);
  const beforeLink = await fs.promises.readlink(claudeCommands);
  expect(path.isAbsolute(beforeLink)).toBe(true);

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const commandsTask = plan.tasks.find((t) => t.type === 'link' && t.target === claudeCommands);
  expect(commandsTask).toBeDefined();
  expect(commandsTask?.type).toBe('link');
  if (commandsTask?.type === 'link') {
    expect(commandsTask.replaceSymlink).toBe(true);
  }

  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);
  expect(result.applied).toBeGreaterThan(0);

  const afterLink = await fs.promises.readlink(claudeCommands);
  expect(path.isAbsolute(afterLink)).toBe(false);
  expect(afterLink).toBe(desired.link);
  expect(await readLinkTarget(claudeCommands)).toBe(commands);
});

test('project symlinks are portable after directory move when supported', async () => {
  const tempBase = await makeTempDir('dotagents-portable-');
  const project = path.join(tempBase, 'myproject');
  await fs.promises.mkdir(project, { recursive: true });

  const plan = await buildLinkPlan({ scope: 'project', projectRoot: project });
  const backup = await createBackupSession({ canonicalRoot: path.join(project, '.agents'), scope: 'project', operation: 'test' });
  await applyLinkPlan(plan, { backup });
  await finalizeBackup(backup);

  const commandsDir = path.join(project, '.agents', 'commands');
  const claudeCommands = path.join(project, '.claude', 'commands');
  const desired = getLinkTarget(commandsDir, claudeCommands, 'dir');
  if (!desired.isRelative) return;

  await writeFile(path.join(commandsDir, 'test.md'), '# Test');
  expect(await readLinkTarget(claudeCommands)).toBe(commandsDir);

  const movedProject = path.join(tempBase, 'renamed-project');
  await fs.promises.rename(project, movedProject);

  const movedClaudeCommands = path.join(movedProject, '.claude', 'commands');
  const movedCommandsDir = path.join(movedProject, '.agents', 'commands');
  const movedDesired = getLinkTarget(movedCommandsDir, movedClaudeCommands, 'dir');

  const rawLink = await fs.promises.readlink(movedClaudeCommands);
  expect(path.isAbsolute(rawLink)).toBe(false);
  expect(rawLink).toBe(movedDesired.link);
  expect(await readLinkTarget(movedClaudeCommands)).toBe(movedCommandsDir);

  const testFile = path.join(movedClaudeCommands, 'test.md');
  const content = await fs.promises.readFile(testFile, 'utf8');
  expect(content).toBe('# Test');
});
