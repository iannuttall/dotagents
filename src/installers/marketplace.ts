import fs from 'fs';
import path from 'path';
import { resolveRoots } from '../core/paths.js';
import { copyFile, ensureDir, listMarkdownFiles, listFiles, listDirs, pathExists } from '../utils/fs.js';
import { fetchJson } from '../utils/http.js';
import { isUrl } from '../utils/paths.js';
import { resolveSource } from './source.js';
import type { SourceType } from './source.js';
import { installSkillsFromSource } from './skills.js';

export type MarketplaceSource = {
  input: string;
};

export type MarketplaceJson = {
  name: string;
  pluginRoot?: string;
  plugins: PluginEntry[];
};

export type PluginEntry = {
  name: string;
  source: string | { source: 'github' | 'git' | 'url'; repo?: string; url?: string; ref?: string };
  description?: string;
};

export type InstallMarketplaceOptions = {
  marketplace: string;
  plugins: string[] | 'all';
  scope: 'global' | 'project';
  projectRoot?: string;
  homeDir?: string;
  force?: boolean;
};

export type InstallMarketplaceResult = {
  installedCommands: string[];
  installedHooks: string[];
  installedSkills: string[];
  skippedCommands: string[];
  skippedHooks: string[];
  skippedSkills: string[];
};

type MarketplaceContext = {
  baseDir?: string;
  kind?: 'github';
  owner?: string;
  repo?: string;
  ref?: string;
  basePath?: string;
};

function parseGitHubRawUrl(input: string): MarketplaceContext | null {
  try {
    const url = new URL(input);
    if (url.hostname !== 'raw.githubusercontent.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return null;
    const [owner, repo, ref, ...rest] = parts;
    const filePath = rest.join('/');
    return { kind: 'github', owner, repo, ref, basePath: path.posix.dirname(filePath) };
  } catch {
    return null;
  }
}

function parseGitHubBlobUrl(input: string): MarketplaceContext | null {
  try {
    const url = new URL(input);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 5) return null;
    const [owner, repo, blob, ref, ...rest] = parts;
    if (blob !== 'blob') return null;
    const filePath = rest.join('/');
    return { kind: 'github', owner, repo, ref, basePath: path.posix.dirname(filePath) };
  } catch {
    return null;
  }
}

export async function loadMarketplace(input: string): Promise<{ json: MarketplaceJson; context: MarketplaceContext }> {
  if (isUrl(input)) {
    const json = await fetchJson<MarketplaceJson>(input);
    const gh = parseGitHubRawUrl(input) || parseGitHubBlobUrl(input);
    return { json, context: gh || {} };
  }

  const resolved = path.resolve(input);
  let file = resolved;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    file = path.join(resolved, '.claude-plugin', 'marketplace.json');
  }
  if (!fs.existsSync(file)) throw new Error(`marketplace.json not found: ${file}`);
  const raw = await fs.promises.readFile(file, 'utf8');
  const json = JSON.parse(raw) as MarketplaceJson;
  return { json, context: { baseDir: path.dirname(file) } };
}

function resolvePluginPath(entry: PluginEntry, ctx: MarketplaceContext, pluginRoot?: string): { source: string; type: SourceType; subdir?: string; subdirCandidates?: string[]; ref?: string } {
  const base = ctx.baseDir || process.cwd();
  const root = pluginRoot ? path.resolve(base, pluginRoot) : base;

  if (typeof entry.source === 'string') {
    if (isUrl(entry.source)) return { source: entry.source, type: 'url' };
    if (ctx.kind === 'github' && ctx.owner && ctx.repo) {
      const repoRoot = pluginRoot ? pluginRoot : '';
      const primary = path.posix.normalize(path.posix.join(repoRoot, entry.source));
      const candidates = [primary];
      if (ctx.basePath) {
        candidates.push(path.posix.normalize(path.posix.join(ctx.basePath, entry.source)));
      }
      return { source: `https://github.com/${ctx.owner}/${ctx.repo}.git`, type: 'git', subdirCandidates: candidates, ref: ctx.ref };
    }
    const candidate = path.resolve(root, entry.source);
    return { source: candidate, type: 'local' };
  }

  const src = entry.source;
  if (src.source === 'github' && src.repo) {
    return { source: `https://github.com/${src.repo}.git`, type: 'git', ref: src.ref };
  }
  if (src.source === 'git' && src.url) {
    return { source: src.url, type: 'git', ref: src.ref };
  }
  if (src.source === 'url' && src.url) {
    return { source: src.url, type: 'url' };
  }
  throw new Error(`Unsupported plugin source for ${entry.name}`);
}

async function scanPluginDir(dir: string): Promise<{ commands: string[]; hooks: string[]; skillsDir?: string }> {
  const commandsDir = path.join(dir, 'commands');
  const hooksDir = path.join(dir, 'hooks');
  const skillsDir = path.join(dir, 'skills');

  const commands = await listMarkdownFiles(commandsDir);
  const hooks = await listFiles(hooksDir);

  const skillsExists = await pathExists(skillsDir);

  return { commands, hooks, skillsDir: skillsExists ? skillsDir : undefined };
}

export async function installMarketplace(opts: InstallMarketplaceOptions): Promise<InstallMarketplaceResult> {
  const roots = resolveRoots({ scope: opts.scope, projectRoot: opts.projectRoot, homeDir: opts.homeDir });
  const canonicalRoot = roots.canonicalRoot;
  const commandsDest = path.join(canonicalRoot, 'commands');
  const hooksDest = path.join(canonicalRoot, 'hooks');

  await ensureDir(commandsDest);
  await ensureDir(hooksDest);

  const { json, context } = await loadMarketplace(opts.marketplace);
  const selected = opts.plugins === 'all'
    ? json.plugins
    : json.plugins.filter((p) => opts.plugins.includes(p.name));

  const installedCommands: string[] = [];
  const installedHooks: string[] = [];
  const installedSkills: string[] = [];
  const skippedCommands: string[] = [];
  const skippedHooks: string[] = [];
  const skippedSkills: string[] = [];

  for (const plugin of selected) {
    const { source, type, subdir, subdirCandidates, ref } = resolvePluginPath(plugin, context, json.pluginRoot);
    const resolved = await resolveSource(source, type, { ref });
    try {
      let pluginDir = resolved.dir;
      if (subdirCandidates && subdirCandidates.length) {
        const found = subdirCandidates
          .map((candidate) => path.join(resolved.dir, candidate))
          .find((candidate) => fs.existsSync(candidate));
        if (!found) {
          throw new Error(`Plugin path not found in repo: ${subdirCandidates.join(', ')}`);
        }
        pluginDir = found;
      } else if (subdir) {
        pluginDir = path.join(resolved.dir, subdir);
      }
      const scan = await scanPluginDir(pluginDir);

      for (const cmd of scan.commands) {
        const name = path.basename(cmd);
        const dest = path.join(commandsDest, name);
        const result = await copyFile(cmd, dest, !!opts.force);
        if (result === 'written') installedCommands.push(`${plugin.name}:${name}`);
        else skippedCommands.push(`${plugin.name}:${name}`);
      }

      for (const hook of scan.hooks) {
        const name = path.basename(hook);
        const dest = path.join(hooksDest, name);
        const result = await copyFile(hook, dest, !!opts.force);
        if (result === 'written') installedHooks.push(`${plugin.name}:${name}`);
        else skippedHooks.push(`${plugin.name}:${name}`);
      }

      if (scan.skillsDir) {
        const skillResult = await installSkillsFromSource({
          source: scan.skillsDir,
          sourceType: 'local',
          scope: opts.scope,
          projectRoot: opts.projectRoot,
          homeDir: opts.homeDir,
          force: opts.force,
        });
        installedSkills.push(...skillResult.installed.map((n) => `${plugin.name}:${n}`));
        skippedSkills.push(...skillResult.skipped.map((n) => `${plugin.name}:${n}`));
      }
    } finally {
      await resolved.cleanup();
    }
  }

  return {
    installedCommands,
    installedHooks,
    installedSkills,
    skippedCommands,
    skippedHooks,
    skippedSkills,
  };
}
