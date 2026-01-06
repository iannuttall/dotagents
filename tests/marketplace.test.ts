import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { makeTempDir, createSkill, writeFile } from './helpers.js';
import { installMarketplace } from '../src/installers/marketplace.js';

async function createPlugin(dir: string) {
  const pluginDir = path.join(dir, 'my-plugin');
  await fs.promises.mkdir(pluginDir, { recursive: true });
  await writeFile(path.join(pluginDir, 'commands', 'hello.md'), '# hello');
  await writeFile(path.join(pluginDir, 'hooks', 'hooks.json'), '{"onSave": "echo"}');
  const skillsRoot = path.join(pluginDir, 'skills');
  await createSkill(skillsRoot, 'plugin-skill');
  return pluginDir;
}

test('installs commands, hooks, and skills from marketplace plugin', async () => {
  const home = await makeTempDir('dotagents-home-');
  const marketRoot = await makeTempDir('dotagents-market-');
  await createPlugin(marketRoot);

  const marketplace = {
    name: 'local-market',
    pluginRoot: '..',
    plugins: [
      {
        name: 'my-plugin',
        source: 'my-plugin'
      }
    ]
  };

  const marketplaceDir = path.join(marketRoot, '.claude-plugin');
  await fs.promises.mkdir(marketplaceDir, { recursive: true });
  await fs.promises.writeFile(path.join(marketplaceDir, 'marketplace.json'), JSON.stringify(marketplace, null, 2));

  const result = await installMarketplace({
    marketplace: marketRoot,
    plugins: ['my-plugin'],
    scope: 'global',
    homeDir: home,
  });

  expect(result.installedCommands.length).toBe(1);
  expect(result.installedHooks.length).toBe(1);
  expect(result.installedSkills.length).toBe(1);

  expect(fs.existsSync(path.join(home, '.agents', 'commands', 'hello.md'))).toBe(true);
  expect(fs.existsSync(path.join(home, '.agents', 'hooks', 'hooks.json'))).toBe(true);
  expect(fs.existsSync(path.join(home, '.agents', 'skills', 'plugin-skill', 'SKILL.md'))).toBe(true);
});
