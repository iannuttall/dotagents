import path from 'path';
import type { Mapping, Scope } from './types.js';
import { resolveRoots } from './paths.js';

export type MappingOptions = {
  scope: Scope;
  projectRoot?: string;
  homeDir?: string;
};

export function getMappings(opts: MappingOptions): Mapping[] {
  const roots = resolveRoots(opts);
  const canonical = roots.canonicalRoot;

  return [
    {
      name: 'agents-md',
      source: path.join(canonical, 'AGENTS.md'),
      targets: [path.join(roots.claudeRoot, 'CLAUDE.md')],
      kind: 'file',
    },
    {
      name: 'commands',
      source: path.join(canonical, 'commands'),
      targets: [
        path.join(roots.claudeRoot, 'commands'),
        path.join(roots.factoryRoot, 'commands'),
        path.join(roots.codexRoot, 'prompts'),
      ],
      kind: 'dir',
    },
    {
      name: 'hooks',
      source: path.join(canonical, 'hooks'),
      targets: [
        path.join(roots.claudeRoot, 'hooks'),
        path.join(roots.factoryRoot, 'hooks'),
      ],
      kind: 'dir',
    },
    {
      name: 'skills',
      source: path.join(canonical, 'skills'),
      targets: [
        path.join(roots.claudeRoot, 'skills'),
        path.join(roots.factoryRoot, 'skills'),
      ],
      kind: 'dir',
    },
  ];
}
