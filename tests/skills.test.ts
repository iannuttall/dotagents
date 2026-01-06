import fs from 'fs';
import path from 'path';
import https from 'https';
import { test, expect } from 'bun:test';
import { makeTempDir, createSkill, writeFile } from './helpers.js';
import { installSkillsFromSource } from '../src/installers/skills.js';
import { runCommand } from '../src/utils/run.js';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';

const CERT = path.join(process.cwd(), 'tests/fixtures/localhost-cert.pem');
const KEY = path.join(process.cwd(), 'tests/fixtures/localhost-key.pem');

async function readLinkTarget(target: string): Promise<string> {
  const link = await fs.promises.readlink(target);
  return path.isAbsolute(link) ? link : path.resolve(path.dirname(target), link);
}

test('installs skill from local directory into canonical .agents', async () => {
  const home = await makeTempDir('dotagents-home-');
  const sourceRoot = await makeTempDir('dotagents-skill-');
  await createSkill(sourceRoot, 'local-skill');

  const result = await installSkillsFromSource({
    source: sourceRoot,
    sourceType: 'local',
    scope: 'global',
    homeDir: home,
  });

  expect(result.installed).toContain('local-skill');
  const skillPath = path.join(home, '.agents', 'skills', 'local-skill', 'SKILL.md');
  expect(fs.existsSync(skillPath)).toBe(true);

  const plan = await buildLinkPlan({ scope: 'global', homeDir: home });
  await applyLinkPlan(plan);
  const claudeSkills = path.join(home, '.claude', 'skills');
  expect(await readLinkTarget(claudeSkills)).toBe(path.join(home, '.agents', 'skills'));
});

test('rejects invalid SKILL.md frontmatter', async () => {
  const home = await makeTempDir('dotagents-home-');
  const sourceRoot = await makeTempDir('dotagents-skill-');
  const skillDir = path.join(sourceRoot, 'bad-skill');
  await fs.promises.mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), '# missing frontmatter');

  await expect(installSkillsFromSource({
    source: sourceRoot,
    sourceType: 'local',
    scope: 'global',
    homeDir: home,
  })).rejects.toThrow();
});

test('installs skill from git repo', async () => {
  const home = await makeTempDir('dotagents-home-');
  const repo = await makeTempDir('dotagents-git-');
  await runCommand('git', ['init'], { cwd: repo });
  await createSkill(repo, 'git-skill');
  await runCommand('git', ['add', '.'], { cwd: repo });
  await runCommand('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=test', 'commit', '-m', 'init'], { cwd: repo });

  const result = await installSkillsFromSource({
    source: repo,
    sourceType: 'git',
    scope: 'global',
    homeDir: home,
  });

  expect(result.installed).toContain('git-skill');
  const skillPath = path.join(home, '.agents', 'skills', 'git-skill', 'SKILL.md');
  expect(fs.existsSync(skillPath)).toBe(true);
});

test('installs skill from https SKILL.md url', async () => {
  const home = await makeTempDir('dotagents-home-');
  const skillContent = `---\nname: https-skill\ndescription: From HTTPS\n---\n\n# HTTPS Skill\n`;

  const server = https.createServer({
    key: fs.readFileSync(KEY),
    cert: fs.readFileSync(CERT),
  }, (req, res) => {
    if (req.url === '/SKILL.md') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(skillContent);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port as number;
  const url = `https://localhost:${port}/SKILL.md`;

  const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const result = await installSkillsFromSource({
      source: url,
      sourceType: 'url',
      scope: 'global',
      homeDir: home,
    });
    expect(result.installed).toContain('https-skill');
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = original;
    server.close();
  }
});
