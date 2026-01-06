import path from 'path';
import { runCommand } from './run.js';

export async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) {
    await runCommand('unzip', ['-q', archivePath, '-d', destDir]);
    return;
  }
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    await runCommand('tar', ['-xzf', archivePath, '-C', destDir]);
    return;
  }
  if (lower.endsWith('.tar')) {
    await runCommand('tar', ['-xf', archivePath, '-C', destDir]);
    return;
  }
  throw new Error(`Unsupported archive format: ${path.basename(archivePath)}`);
}
