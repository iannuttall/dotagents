import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';
import { makeTempDir, writeFile } from './helpers.js';

async function readLinkTarget(target: string): Promise<string> {
  const link = await fs.promises.readlink(target);
  return path.isAbsolute(link) ? link : path.resolve(path.dirname(target), link);
}

test('creates symlinks from canonical .agents to tool homes', async () => {
  const home = await makeTempDir('dotagents-home-');

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  const result = await applyLinkPlan(plan);
  expect(result.applied).toBeGreaterThan(0);

  const canonical = path.join(home, '.agents');
  const commands = path.join(canonical, 'commands');
  const agentsFile = path.join(canonical, 'AGENTS.md');

  await writeFile(path.join(commands, 'hello.md'), '# hello');

  const claudeCommands = path.join(home, '.claude', 'commands');
  const factoryCommands = path.join(home, '.factory', 'commands');
  const codexPrompts = path.join(home, '.codex', 'prompts');
  const claudeAgents = path.join(home, '.claude', 'CLAUDE.md');

  expect(await readLinkTarget(claudeCommands)).toBe(commands);
  expect(await readLinkTarget(factoryCommands)).toBe(commands);
  expect(await readLinkTarget(codexPrompts)).toBe(commands);
  expect(await readLinkTarget(claudeAgents)).toBe(agentsFile);
});

test('idempotent apply produces no changes on second run', async () => {
  const home = await makeTempDir('dotagents-home-');
  const first = await buildLinkPlan({ scope: 'global', homeDir: home });
  await applyLinkPlan(first);

  const second = await buildLinkPlan({ scope: 'global', homeDir: home });
  const result = await applyLinkPlan(second);
  expect(result.applied).toBe(0);
});

test('force apply replaces conflicting targets', async () => {
  const home = await makeTempDir('dotagents-home-');
  const codexPrompts = path.join(home, '.codex', 'prompts');
  await fs.promises.mkdir(path.dirname(codexPrompts), { recursive: true });
  await fs.promises.mkdir(codexPrompts, { recursive: true });

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  expect(plan.conflicts.length).toBeGreaterThan(0);

  const result = await applyLinkPlan(plan, { force: true });
  expect(result.applied).toBeGreaterThan(0);

  const target = await readLinkTarget(codexPrompts);
  expect(target).toBe(path.join(home, '.agents', 'commands'));
});
