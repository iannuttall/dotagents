import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { scanMigration, applyMigration } from '../src/core/migrate.js';
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

  await writeFile(path.join(home, '.claude', 'hooks', 'hook.sh'), 'echo claude');
  await writeFile(path.join(home, '.factory', 'hooks', 'hook.sh'), 'echo factory');

  await createSkill(path.join(home, '.claude', 'skills'), 'alpha-skill');
  await createSkill(path.join(home, '.factory', 'skills'), 'alpha-skill');

  await writeFile(path.join(home, '.claude', 'CLAUDE.md'), '# CLAUDE');

  const plan = await scanMigration({ scope: 'global', homeDir: home });
  expect(plan.conflicts.length).toBeGreaterThan(0);

  const selections = new Map();
  for (const conflict of plan.conflicts) {
    const pick = conflict.candidates.find((c) => c.label.includes('Claude')) || conflict.candidates[0];
    selections.set(conflict.targetPath, pick || null);
  }

  const result = await applyMigration(plan, selections, { scope: 'global', homeDir: home });
  expect(result.copied).toBeGreaterThan(0);

  const agentsRoot = path.join(home, '.agents');
  expect(fs.existsSync(path.join(agentsRoot, 'commands', 'log-session.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'commands', 'unique.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'hooks', 'hook.sh'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'skills', 'alpha-skill', 'SKILL.md'))).toBe(true);
  expect(fs.existsSync(path.join(agentsRoot, 'AGENTS.md'))).toBe(true);

  // Backup created
  expect(fs.existsSync(result.backupDir)).toBe(true);

  // Tool paths are now symlinks
  expect(await readLinkTarget(path.join(home, '.claude', 'commands'))).toBe(path.join(agentsRoot, 'commands'));
  expect(await readLinkTarget(path.join(home, '.factory', 'commands'))).toBe(path.join(agentsRoot, 'commands'));
  expect(await readLinkTarget(path.join(home, '.codex', 'prompts'))).toBe(path.join(agentsRoot, 'commands'));
});
