import fs from 'fs';
import path from 'path';
import { getMappings } from './mappings.js';
import type { MappingOptions } from './mappings.js';
import type { LinkStatus } from './types.js';
import { pathExists } from '../utils/fs.js';

async function resolveLinkTarget(targetPath: string): Promise<string | null> {
  try {
    const link = await fs.promises.readlink(targetPath);
    if (!path.isAbsolute(link)) return path.resolve(path.dirname(targetPath), link);
    return link;
  } catch {
    return null;
  }
}

export async function getLinkStatus(opts: MappingOptions): Promise<LinkStatus[]> {
  const mappings = getMappings(opts);
  const statuses: LinkStatus[] = [];

  for (const mapping of mappings) {
    const targets = [] as LinkStatus['targets'];
    for (const target of mapping.targets) {
      const exists = await pathExists(target);
      if (!exists) {
        targets.push({ path: target, status: 'missing' });
        continue;
      }
      const stat = await fs.promises.lstat(target);
      if (stat.isSymbolicLink()) {
        const resolved = await resolveLinkTarget(target);
        if (resolved && path.resolve(resolved) === path.resolve(mapping.source)) {
          targets.push({ path: target, status: 'linked' });
        } else {
          targets.push({ path: target, status: 'conflict' });
        }
        continue;
      }
      targets.push({ path: target, status: 'conflict' });
    }

    statuses.push({ name: mapping.name, source: mapping.source, targets });
  }

  return statuses;
}
