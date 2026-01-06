import fs from 'fs';
import path from 'path';
import { ensureDir } from './fs.js';

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'dotagents' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

export async function fetchJson<T = any>(url: string): Promise<T> {
  const text = await fetchText(url);
  return JSON.parse(text) as T;
}

export async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': 'dotagents' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await ensureDir(path.dirname(dest));
  await fs.promises.writeFile(dest, buf);
}
