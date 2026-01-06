import fs from 'fs';
import os from 'os';
import path from 'path';
import { expandHome, isGitUrl, isUrl, isFileUrl, normalizeFileUrl } from '../utils/paths.js';
import { ensureDir } from '../utils/fs.js';
import { downloadToFile } from '../utils/http.js';
import { extractArchive } from '../utils/archive.js';
import { runCommand } from '../utils/run.js';

export type SourceType = 'auto' | 'local' | 'git' | 'url';

export type ResolvedSource = {
  dir: string;
  cleanup: () => Promise<void>;
};

async function makeTempDir(prefix: string): Promise<string> {
  return await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cloneGitRepo(repo: string, dest: string, ref?: string): Promise<void> {
  await runCommand('git', ['clone', '--depth', '1', repo, dest]);
  if (ref) {
    await runCommand('git', ['checkout', ref], { cwd: dest });
  }
}

function detectSourceType(source: string): SourceType {
  if (isFileUrl(source)) return 'local';
  if (isGitUrl(source)) return 'git';
  if (isUrl(source)) return 'url';
  return 'local';
}

export async function resolveSource(source: string, type: SourceType = 'auto', opts?: { ref?: string }): Promise<ResolvedSource> {
  const inferred = type === 'auto' ? detectSourceType(source) : type;
  const input = expandHome(source);

  if (inferred === 'local') {
    const p = isFileUrl(input) ? normalizeFileUrl(input) : input;
    if (!fs.existsSync(p)) throw new Error(`Source path not found: ${p}`);
    return { dir: p, cleanup: async () => {} };
  }

  const tempDir = await makeTempDir('dotagents-src-');

  if (inferred === 'git') {
    await cloneGitRepo(input, tempDir, opts?.ref);
    return { dir: tempDir, cleanup: async () => { await fs.promises.rm(tempDir, { recursive: true, force: true }); } };
  }

  if (inferred === 'url') {
    const lower = input.toLowerCase();
    if (lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
      const archivePath = path.join(tempDir, path.basename(lower));
      await downloadToFile(input, archivePath);
      await ensureDir(tempDir);
      await extractArchive(archivePath, tempDir);
      return { dir: tempDir, cleanup: async () => { await fs.promises.rm(tempDir, { recursive: true, force: true }); } };
    }
    if (lower.endsWith('skill.md')) {
      const skillDir = path.join(tempDir, 'skill');
      await ensureDir(skillDir);
      const dest = path.join(skillDir, 'SKILL.md');
      await downloadToFile(input, dest);
      return { dir: skillDir, cleanup: async () => { await fs.promises.rm(tempDir, { recursive: true, force: true }); } };
    }
    throw new Error('Unsupported URL source. Provide a git URL, archive (.zip/.tar.gz), or direct SKILL.md URL.');
  }

  throw new Error(`Unsupported source type: ${inferred}`);
}
