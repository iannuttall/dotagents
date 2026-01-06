import fs from 'fs';
import path from 'path';
import { test, expect } from 'bun:test';
import { makeTempDir } from './helpers.js';
import { installMarketplace } from '../src/installers/marketplace.js';

const MARKETPLACE_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json';

// This test hits a real marketplace URL and clones a real repo.
// It validates that remote marketplaces with relative plugin paths are supported.

test('installs from a real marketplace URL (Anthropic)', async () => {
  const home = await makeTempDir('dotagents-home-');

  const result = await installMarketplace({
    marketplace: MARKETPLACE_URL,
    plugins: ['commit-commands'],
    scope: 'global',
    homeDir: home,
  });

  expect(result.installedCommands.length).toBeGreaterThan(0);

  const commandsDir = path.join(home, '.agents', 'commands');
  const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
  expect(commandFiles.length).toBeGreaterThan(0);

  // Commit commands plugin should include commit.md in the source repo.
  // If it changes in the upstream repo, this assertion can be relaxed.
  expect(commandFiles).toContain('commit.md');
});
