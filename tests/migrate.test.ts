import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { scanMigration, applyMigration } from '../src/core/migrate.js';
import { createBackupSession, finalizeBackup } from '../src/core/backup.js';
import { makeTempDir, writeFile, createSkill } from './helpers.js';

async function readLinkTarget(target: string): Promise<string> {
  const link = await fs.promises.readlink(target);
  return path.isAbsolute(link) ? link : path.resolve(path.dirname(target), link);
}

test('migration wizard copies selected items, backs up, and links', async () => {
  const home = await makeTempDir('dotagents-home-');

  // Seed tool folders
  await writeFile(path.join(home, '.claude', 'commands', 'log-session.md'), 'claude');
  await writeFile(path.join(home, '.factory', 'commands', 'log-session.md'), 'factory');
  await writeFile(path.join(home, '.codex', 'prompts', 'unique.md'), 'codex');
  await writeFile(path.join(home, '.gemini', 'commands', 'log-session.toml'), 'prompt = "gemini"');

  await writeFile(path.join(home, '.claude', 'hooks', 'hook.sh'), 'echo claude');
  await writeFile(path.join(home, '.factory', 'hooks', 'hook.sh'), 'echo factory');

  await createSkill(path.join(home, '.claude', 'skills'), 'alpha-skill');
  await createSkill(path.join(home, '.factory', 'skills'), 'alpha-skill');
  await createSkill(path.join(home, '.gemini', 'skills'), 'alpha-skill');

  await writeFile(path.join(home, '.claude', 'CLAUDE.md'), '# CLAUDE');
  await writeFile(path.join(home, '.gemini', 'GEMINI.md'), '# GEMINI AGENTS');

  const plan = await scanMigration({ scope: 'global', homeDir: home });
  expect(plan.conflicts.length).toBeGreaterThan(0);

  const selections = new Map();
  for (const conflict of plan.conflicts) {
    const pick = conflict.candidates.find((c) => c.label.includes('Claude')) || conflict.candidates[0];
    selections.set(conflict.targetPath, pick || null);
  }

  const backup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const result = await applyMigration(plan, selections, { scope: 'global', homeDir: home, backup, forceLinks: true });
  await finalizeBackup(backup);
  expect(result.copied).toBeGreaterThan(0);

  const agentsRoot = path.join(home, '.agents');
  expect(fs.existsSync(path.join(agentsRoot, 'commands', 'log-session.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'commands', 'unique.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'commands', 'log-session.toml'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'hooks', 'hook.sh'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'skills', 'alpha-skill', 'SKILL.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'AGENTS.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'CLAUDE.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'GEMINI.md'))).toBe(true);

  // Backup created
  expect(fs.existsSync(result.backupDir)).toBe(true);

  // Tool paths are now symlinks
  expect(await readLinkTarget(path.join(home, '.claude', 'commands'))).toBe(path.join(agentsRoot, 'commands'));
  expect(await readLinkTarget(path.join(home, '.factory', 'commands'))).toBe(path.join(agentsRoot, 'commands'));
  expect(await readLinkTarget(path.join(home, '.codex', 'prompts'))).toBe(path.join(agentsRoot, 'commands'));
  expect(await readLinkTarget(path.join(home, '.gemini', 'commands'))).toBe(path.join(agentsRoot, 'commands'));
});

test('migration wizard copies skills from github/copilot folders', async () => {
  const home = await makeTempDir('dotagents-home-');
  const project = await makeTempDir('dotagents-project-');

  // Seed GitHub Copilot skill folders
  await createSkill(path.join(home, '.copilot', 'skills'), 'global-github-skill');
  await createSkill(path.join(project, '.github', 'skills'), 'project-github-skill');

  // Test global scope migration (from ~/.copilot/skills)
  const globalPlan = await scanMigration({ scope: 'global', homeDir: home, clients: ['github'] });
  expect(globalPlan.auto.length + globalPlan.conflicts.length).toBeGreaterThan(0);

  const globalSelections = new Map();
  for (const conflict of globalPlan.conflicts) {
    globalSelections.set(conflict.targetPath, conflict.candidates[0] || null);
  }

  const globalBackup = await createBackupSession({ canonicalRoot: path.join(home, '.agents'), scope: 'global', operation: 'test' });
  const globalResult = await applyMigration(globalPlan, globalSelections, { scope: 'global', homeDir: home, backup: globalBackup, forceLinks: true, clients: ['github'] });
  await finalizeBackup(globalBackup);

  expect(globalResult.copied).toBeGreaterThan(0);
  expect(fs.existsSync(path.join(home, '.agents', 'skills', 'global-github-skill', 'SKILL.md'))).toBe(true);

  // Test project scope migration (from .github/skills)
  const projectPlan = await scanMigration({ scope: 'project', homeDir: home, projectRoot: project, clients: ['github'] });
  expect(projectPlan.auto.length + projectPlan.conflicts.length).toBeGreaterThan(0);

  const projectSelections = new Map();
  for (const conflict of projectPlan.conflicts) {
    projectSelections.set(conflict.targetPath, conflict.candidates[0] || null);
  }

  const projectBackup = await createBackupSession({ canonicalRoot: path.join(project, '.agents'), scope: 'project', operation: 'test' });
  const projectResult = await applyMigration(projectPlan, projectSelections, { scope: 'project', homeDir: home, projectRoot: project, backup: projectBackup, forceLinks: true, clients: ['github'] });
  await finalizeBackup(projectBackup);

  expect(projectResult.copied).toBeGreaterThan(0);
  expect(fs.existsSync(path.join(project, '.agents', 'skills', 'project-github-skill', 'SKILL.md'))).toBe(true);
});
