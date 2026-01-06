import fs from 'fs';
import os from 'os';
import path from 'path';

export async function makeTempDir(prefix: string): Promise<string> {
  return await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
}

export async function createSkill(dir: string, name = 'sample-skill'): Promise<string> {
  const skillDir = path.join(dir, name);
  await fs.promises.mkdir(skillDir, { recursive: true });
  const skillMd = `---\nname: ${name}\ndescription: Sample skill\n---\n\n# ${name}\n`;
  await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf8');
  return skillDir;
}
