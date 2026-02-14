import path from 'path';
import type { Client, Mapping, Scope } from './types.js';
import { resolveRoots } from './paths.js';
import { pathExists } from '../utils/fs.js';

export type MappingOptions = {
  scope: Scope;
  projectRoot?: string;
  homeDir?: string;
  clients?: Client[];
};

export async function getMappings(opts: MappingOptions): Promise<Mapping[]> {
  const roots = resolveRoots(opts);
  const canonical = roots.canonicalRoot;
  const claudeOverride = path.join(canonical, 'CLAUDE.md');
  const geminiOverride = path.join(canonical, 'GEMINI.md');
  const agentsFallback = path.join(canonical, 'AGENTS.md');
  const claudeSource = await pathExists(claudeOverride) ? claudeOverride : agentsFallback;
  const geminiSource = await pathExists(geminiOverride) ? geminiOverride : agentsFallback;
  const clients = new Set<Client>(opts.clients ?? ['claude', 'factory', 'codex', 'cursor', 'opencode', 'gemini', 'github', 'ampcode', 'roocode', 'windsurf']);
  const opencodeSkillsRoot = opts.scope === 'global' ? roots.opencodeConfigRoot : roots.opencodeRoot;

  const mappings: Mapping[] = [];
  const includeAgentFiles = opts.scope === 'global';
  if (includeAgentFiles && clients.has('claude')) {
    mappings.push({
      name: 'claude-md',
      source: claudeSource,
      targets: [path.join(roots.claudeRoot, 'CLAUDE.md')],
      kind: 'file',
    });
  }

  if (includeAgentFiles && clients.has('gemini')) {
    mappings.push({
      name: 'gemini-md',
      source: geminiSource,
      targets: [path.join(roots.geminiRoot, 'GEMINI.md')],
      kind: 'file',
    });
  }

  if (includeAgentFiles) {
    const agentTargets = [
      clients.has('factory') ? path.join(roots.factoryRoot, 'AGENTS.md') : null,
      clients.has('codex') ? path.join(roots.codexRoot, 'AGENTS.md') : null,
      clients.has('opencode') ? path.join(roots.opencodeConfigRoot, 'AGENTS.md') : null,
      clients.has('ampcode') ? path.join(roots.ampcodeConfigRoot, 'AGENTS.md') : null,
      clients.has('roocode') ? path.join(roots.roocodeRoot, 'AGENTS.md') : null,
    ].filter(Boolean) as string[];

    if (agentTargets.length > 0) {
      mappings.push({
        name: 'agents-md',
        source: agentsFallback,
        targets: agentTargets,
        kind: 'file',
      });
    }
  }

  // Windsurf uses a single .windsurfrules file at the root level
  if (clients.has('windsurf')) {
    mappings.push({
      name: 'windsurfrules',
      source: agentsFallback,
      targets: [path.join(roots.windsurfRoot, '.windsurfrules')],
      kind: 'file',
    });
  }

  mappings.push(
    {
      name: 'commands',
      source: path.join(canonical, 'commands'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'commands') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'commands') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'prompts') : null,
        clients.has('opencode') ? path.join(roots.opencodeRoot, 'commands') : null,
        clients.has('cursor') ? path.join(roots.cursorRoot, 'commands') : null,
        clients.has('gemini') ? path.join(roots.geminiRoot, 'commands') : null,
        clients.has('roocode') ? path.join(roots.roocodeRoot, 'commands') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
    {
      name: 'hooks',
      source: path.join(canonical, 'hooks'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'hooks') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'hooks') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
    {
      name: 'skills',
      source: path.join(canonical, 'skills'),
      targets: [
        clients.has('claude') ? path.join(roots.claudeRoot, 'skills') : null,
        clients.has('factory') ? path.join(roots.factoryRoot, 'skills') : null,
        clients.has('codex') ? path.join(roots.codexRoot, 'skills') : null,
        clients.has('opencode') ? path.join(opencodeSkillsRoot, 'skills') : null,
        clients.has('cursor') ? path.join(roots.cursorRoot, 'skills') : null,
        clients.has('gemini') ? path.join(roots.geminiRoot, 'skills') : null,
        // GitHub uses .github/skills for project scope and ~/.copilot/skills for global scope.
        clients.has('github')
          ? (opts.scope === 'global' ? path.join(roots.copilotRoot, 'skills') : path.join(roots.githubRoot, 'skills'))
          : null,
        clients.has('roocode') ? path.join(roots.roocodeRoot, 'skills') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
    {
      name: 'rules',
      source: path.join(canonical, 'rules'),
      targets: [
        clients.has('roocode') ? path.join(roots.roocodeRoot, 'rules') : null,
      ].filter(Boolean) as string[],
      kind: 'dir',
    },
  );

  return mappings;
}
