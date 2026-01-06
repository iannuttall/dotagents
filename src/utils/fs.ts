import fs from 'fs';
import path from 'path';

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.lstat(p);
    return true;
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function ensureFile(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, content, 'utf8');
}

export async function readText(filePath: string): Promise<string> {
  return await fs.promises.readFile(filePath, 'utf8');
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, content, 'utf8');
}

export async function copyFile(src: string, dest: string, force = false): Promise<'skipped' | 'written'> {
  if (!force && await pathExists(dest)) return 'skipped';
  await ensureDir(path.dirname(dest));
  await fs.promises.copyFile(src, dest);
  return 'written';
}

export async function copyDir(src: string, dest: string, force = false): Promise<'skipped' | 'written'> {
  if (!force && await pathExists(dest)) return 'skipped';
  await ensureDir(path.dirname(dest));
  await fs.promises.cp(src, dest, { recursive: true, force });
  return 'written';
}

export async function removePath(target: string): Promise<void> {
  if (!await pathExists(target)) return;
  const stat = await fs.promises.lstat(target);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await fs.promises.rm(target, { recursive: true, force: true });
  } else {
    await fs.promises.unlink(target);
  }
}

export async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function listMarkdownFiles(dir: string): Promise<string[]> {
  const files = await listFiles(dir);
  return files.filter((f) => f.toLowerCase().endsWith('.md'));
}

export async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}
