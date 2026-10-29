import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildContext } from '../src/context.js';
import { crawlProject } from '../src/crawl.js';
import { makeTempDir, removeTemp, writeTree } from './helpers.js';

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => removeTemp(dir)));
});

async function temp(prefix?: string): Promise<string> {
  const dir = await makeTempDir(prefix);
  temps.push(dir);
  return dir;
}

describe('crawlProject', () => {
  it('stays inside the project and does not follow symlinks out of it', async () => {
    const parent = await temp('PARENT_TOKEN_northmark-');
    const project = path.join(parent, 'project');
    await mkdir(project);
    await writeFile(path.join(parent, 'secret.txt'), 'OUTSIDE_TOKEN\n');
    await writeTree(project, {
      'src/app.ts': 'export const keep = "VISIBLE_TOKEN";\n',
    });
    await symlink(path.join(parent, 'secret.txt'), path.join(project, 'leak.txt'));
    await symlink(parent, path.join(project, 'escape'));

    const result = await crawlProject(project);
    const texts = result.files.map((file) => file.text ?? '').join('\n');
    expect(texts).toContain('VISIBLE_TOKEN');
    expect(texts).not.toContain('OUTSIDE_TOKEN');
    expect(result.files.some((file) => file.path.includes('..'))).toBe(false);
    expect(result.files.some((file) => file.path.includes('secret.txt'))).toBe(false);
    expect(result.samples.symlink ?? []).toEqual(expect.arrayContaining(['leak.txt', 'escape']));

    const context = buildContext(result, 100_000);
    expect(context.text).toContain('VISIBLE_TOKEN');
    expect(context.text).not.toContain('OUTSIDE_TOKEN');
    expect(context.text).not.toContain('PARENT_TOKEN_northmark');
    expect(context.text).not.toContain(result.root);
  });

  it('does not read secret files, including symlinks that point at them', async () => {
    const project = await temp();
    await writeTree(project, {
      '.env': 'ENV_SECRET_TOKEN=super\n',
      '.env.local': 'LOCAL_SECRET_TOKEN=1\n',
      'config/.env.production': 'PROD_SECRET_TOKEN=1\n',
      'certs/server.pem': 'PEM_SECRET_TOKEN\n',
      'id_rsa': 'KEY_SECRET_TOKEN\n',
      'secrets/api.txt': 'DIR_SECRET_TOKEN\n',
      'notes/plain.txt': '-----BEGIN PRIVATE KEY-----\nPRIVATE_KEY_TOKEN\n',
      'design-tokens.json': '{ "accent": "#7c3aed" }\n',
      'src/environment.ts': 'export const label = "NOT_A_SECRET_TOKEN";\n',
    });
    await symlink(path.join(project, '.env'), path.join(project, 'notes.txt'));

    const result = await crawlProject(project);
    const texts = result.files.map((file) => file.text ?? '').join('\n');
    for (const token of [
      'ENV_SECRET_TOKEN',
      'LOCAL_SECRET_TOKEN',
      'PROD_SECRET_TOKEN',
      'PEM_SECRET_TOKEN',
      'KEY_SECRET_TOKEN',
      'DIR_SECRET_TOKEN',
      'PRIVATE_KEY_TOKEN',
    ]) {
      expect(texts, token).not.toContain(token);
    }
    expect(texts).toContain('NOT_A_SECRET_TOKEN');
    expect(texts).toContain('#7c3aed');
    expect(result.files.some((file) => file.path === '.env' || file.path === 'notes.txt')).toBe(false);
    expect(result.skipped.secret).toBeGreaterThan(0);

    const context = buildContext(result, 100_000);
    expect(context.text).not.toContain('ENV_SECRET_TOKEN');
    expect(context.text).not.toContain('.env');
  });

  it('respects .gitignore, including nested rules and negations', async () => {
    const project = await temp();
    await writeTree(project, {
      '.gitignore': '*.md\n!KEEP.md\nskip-me.txt\n',
      'hidden.md': 'HIDDEN_MD_TOKEN\n',
      'KEEP.md': 'KEEP_MD_TOKEN\n',
      'skip-me.txt': 'SKIP_TOKEN\n',
      'pkg/.gitignore': '*.snap\n',
      'pkg/view.snap': 'SNAP_TOKEN\n',
      'pkg/app.ts': 'export const pkg = "PKG_TOKEN";\n',
      'src/app.ts': 'export const app = "APP_TOKEN";\n',
    });

    const result = await crawlProject(project);
    const texts = result.files.map((file) => file.text ?? '').join('\n');
    expect(texts).toContain('APP_TOKEN');
    expect(texts).toContain('PKG_TOKEN');
    expect(texts).toContain('KEEP_MD_TOKEN');
    expect(texts).not.toContain('HIDDEN_MD_TOKEN');
    expect(texts).not.toContain('SKIP_TOKEN');
    expect(texts).not.toContain('SNAP_TOKEN');
    expect(result.skipped.gitignore).toBeGreaterThan(0);
  });

  it('skips junk, lockfiles, binaries, and huge files', async () => {
    const project = await temp();
    await writeTree(project, {
      'package.json': '{ "name": "sample" }\n',
      'package-lock.json': '{ "lock": "LOCK_TOKEN" }\n',
      'src/app.ts': 'export const app = "APP_TOKEN";\n',
      'dist/bundle.js': 'export const bundled = "DIST_TOKEN";\n',
      'node_modules/leftpad/index.js': 'module.exports = "MODULE_TOKEN";\n',
      '.git/config': 'GIT_TOKEN\n',
      'assets/logo.png': 'PNG_TOKEN\0not-text',
      'src/app.min.js': 'MIN_TOKEN\n',
    });
    await writeFile(path.join(project, 'src/big.txt'), `HUGE_TOKEN${'x'.repeat(200_000)}`);

    const result = await crawlProject(project);
    const texts = result.files.map((file) => file.text ?? '').join('\n');
    expect(texts).toContain('APP_TOKEN');
    expect(texts).toContain('"name": "sample"');
    for (const token of ['LOCK_TOKEN', 'DIST_TOKEN', 'MODULE_TOKEN', 'GIT_TOKEN', 'PNG_TOKEN', 'MIN_TOKEN', 'HUGE_TOKEN']) {
      expect(texts, token).not.toContain(token);
    }
    expect(result.assets.some((asset) => asset.path === 'assets/logo.png')).toBe(true);
    expect(result.skipped.junk).toBeGreaterThan(0);
    expect(result.skipped.lockfile).toBeGreaterThan(0);
    expect(result.skipped.large).toBeGreaterThan(0);
  });

  it('reads an in-project symlink and finishes when a symlink cycles', async () => {
    const project = await temp();
    await writeTree(project, {
      'src/app.ts': 'export const value = "INSIDE_TOKEN";\n',
    });
    await symlink(path.join(project, 'src/app.ts'), path.join(project, 'alias.ts'));
    await symlink(project, path.join(project, 'loop'));

    const result = await crawlProject(project);
    const texts = result.files.map((file) => file.text ?? '').join('\n');
    expect(texts).toContain('INSIDE_TOKEN');
    expect(result.visited).toBeGreaterThan(0);
  });

  it('skips a broken symlink instead of failing the crawl', async () => {
    const project = await temp();
    await writeTree(project, { 'src/app.ts': 'export const ok = true;\n' });
    await symlink(path.join(project, 'missing-target'), path.join(project, 'broken'));
    const result = await crawlProject(project);
    expect(result.samples.symlink ?? []).toContain('broken');
    expect(result.files.some((file) => file.path === 'src/app.ts')).toBe(true);
  });

  it('stops when the entry cap is hit', async () => {
    const project = await temp();
    const files: Record<string, string> = {};
    for (let index = 0; index < 10; index += 1) files[`file-${index}.txt`] = `token ${index}\n`;
    await writeTree(project, files);
    const result = await crawlProject(project, { maxEntries: 3 });
    expect(result.truncated).toBe(true);
    expect(result.files.length).toBeLessThan(10);
  });

  it('prefers manifests over bulky notes inside the context budget', async () => {
    const project = await temp();
    await writeTree(project, {
      'package.json': '{ "name": "KEEP_PACKAGE" }\n',
      'notes/random.txt': `LOW_TOKEN ${'z'.repeat(3_000)}`,
    });
    const result = await crawlProject(project, { maxBytes: 4_000 });
    const context = buildContext(result, 4_000);
    expect(Buffer.byteLength(context.text, 'utf8')).toBeLessThanOrEqual(4_000);
    expect(context.text).toContain('KEEP_PACKAGE');
    expect(context.text).not.toContain('LOW_TOKEN');
  });

  it('refuses a missing or non-directory root', async () => {
    const project = await temp();
    const file = path.join(project, 'not-a-dir');
    await writeFile(file, 'hello');
    await expect(crawlProject(path.join(project, 'missing'))).rejects.toThrow(/does not exist/);
    await expect(crawlProject(file)).rejects.toThrow(/not a directory/);
  });
});
