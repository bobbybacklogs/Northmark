import { readFileSync } from 'node:fs';
import { access, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  log: {
    message: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  isCancel: (value: unknown) => typeof value === 'symbol',
  multiselect: vi.fn(async () => ['readme']),
  confirm: vi.fn(async () => false),
  spinner: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  }),
}));

import { confirm, multiselect } from '@clack/prompts';
import { normalizeArgv, shouldUseInteractive } from '../src/argv.js';
import { main } from '../src/main.js';
import { captureIo, makeTempDir, removeTemp, writeTree } from './helpers.js';

const temps: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temps.splice(0).map((dir) => removeTemp(dir)));
});

async function sampleProject(): Promise<string> {
  const dir = await makeTempDir();
  temps.push(dir);
  await writeTree(dir, {
    'package.json': '{ "name": "sample" }\n',
    'src/App.tsx': 'export function App(){ return "hello"; }\n',
  });
  return dir;
}

describe('argv', () => {
  it('treats a bare flag list as generate and leaves help alone', () => {
    expect(normalizeArgv(['node', 'northmark', '--dry-run', '--cwd', '/tmp/proj'])).toEqual([
      'node',
      'northmark',
      'generate',
      '--dry-run',
      '--cwd',
      '/tmp/proj',
    ]);
    expect(normalizeArgv(['node', 'northmark', '--help'])).toEqual(['node', 'northmark', '--help']);
    expect(normalizeArgv(['node', 'northmark', 'help', 'generate'])).toEqual([
      'node',
      'northmark',
      'help',
      'generate',
    ]);
    expect(normalizeArgv(['node', 'northmark', 'generate', '--force'])).toEqual([
      'node',
      'northmark',
      'generate',
      '--force',
    ]);
  });

  it('opens the menu only for a TTY with no arguments', () => {
    expect(shouldUseInteractive(['node', 'northmark'], true, {})).toBe(true);
    expect(shouldUseInteractive(['node', 'northmark'], false, {})).toBe(false);
    expect(shouldUseInteractive(['node', 'northmark'], true, { CI: '1' })).toBe(false);
    expect(shouldUseInteractive(['node', 'northmark', '--dry-run'], true, {})).toBe(false);
  });
});

describe('northmark cli', () => {
  it('prints help and version', async () => {
    const help = captureIo();
    expect(await main(['node', 'northmark', '--help'], help)).toBe(0);
    expect(help.output()).toContain('NORTHMARK');
    expect(help.output()).toContain('Give every product a clear direction.');
    expect(help.output()).toContain('generate');
    expect(help.output()).toContain('product_brief.md');
    expect(help.output()).toContain('NORTHMARK_BASE_URL');
    expect(help.output()).toContain('https://mh.bycuvola.com/v1');

    const version = captureIo();
    expect(await main(['node', 'northmark', '--version'], version)).toBe(0);
    expect(version.output().trim()).toBe('1.0.0');

    const commandHelp = captureIo();
    expect(await main(['node', 'northmark', 'help', 'generate'], commandHelp)).toBe(0);
    expect(commandHelp.output()).toContain('--dry-run');
    expect(commandHelp.output()).toContain('--force');

    const generateHelp = captureIo();
    expect(await main(['node', 'northmark', 'generate', '--help'], generateHelp)).toBe(0);
    expect(generateHelp.output()).toContain('--api-key');
    expect(generateHelp.output()).toContain('--model');
  });

  it('shows help when there is no TTY and no command', async () => {
    const io = captureIo({ tty: false });
    expect(await main(['node', 'northmark'], io)).toBe(0);
    expect(io.output()).toContain('generate');
  });

  it('dry-runs a sample project without calling the network or writing', async () => {
    const cwd = await sampleProject();
    vi.stubGlobal('fetch', () => {
      throw new Error('network should not be called');
    });
    const io = captureIo({ cwd, env: {} });
    const code = await main(['node', 'northmark', '--dry-run', '--cwd', cwd], io);
    expect(code).toBe(0);
    expect(io.output()).toContain('Dry run');
    expect(io.output()).toContain('docs/README.md');
    expect(io.output()).toContain('docs/product_brief.md');
    expect(io.output()).toContain('docs/design_direction.md');
    expect(io.output()).toContain('docs/architecture.md');
    expect(io.output()).toContain('The model was not called. Nothing was written.');
    await expect(access(path.join(cwd, 'docs'))).rejects.toThrow();
  });

  it('refuses to overwrite existing docs unless --force is set', async () => {
    const cwd = await sampleProject();
    await mkdir(path.join(cwd, 'docs'));
    await writeFile(path.join(cwd, 'docs/README.md'), 'keep me\n');
    vi.stubGlobal('fetch', () => {
      throw new Error('network should not be called');
    });
    const io = captureIo({ cwd, env: {} });
    const code = await main(['node', 'northmark', 'generate', '--cwd', cwd, '--docs', 'readme'], io);
    expect(code).toBe(1);
    expect(io.errorOutput()).toMatch(/--force/);
    expect(await readFile(path.join(cwd, 'docs/README.md'), 'utf8')).toBe('keep me\n');
  });

  it('rejects paths outside the project and unknown commands', async () => {
    const cwd = await sampleProject();
    const outside = captureIo({ cwd, env: {} });
    const code = await main(['node', 'northmark', 'generate', '--cwd', cwd, '--out', '../nope', '--dry-run'], outside);
    expect(code).toBe(1);
    expect(outside.errorOutput()).toMatch(/outside the project/);

    const unknown = captureIo();
    expect(await main(['node', 'northmark', 'nope'], unknown)).not.toBe(0);
  });

  it('does not save a non-completion 200 as docs', async () => {
    const cwd = await sampleProject();
    vi.stubGlobal('fetch', async () => new Response('<<<not-json-garbage>>>', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }));
    const io = captureIo({ cwd, env: {} });
    const code = await main(['node', 'northmark', 'generate', '--cwd', cwd], io);
    expect(code).toBe(1);
    expect(io.errorOutput()).toMatch(/not a chat completion/);
    expect(io.output()).not.toContain('Wrote 4 files');
    expect(io.output()).not.toContain('<<<not-json-garbage>>>');
    await expect(access(path.join(cwd, 'docs'))).rejects.toThrow();
  });

  it('crawls a project through a symlinked --cwd', async () => {
    const parent = await makeTempDir();
    temps.push(parent);
    const project = path.join(parent, 'project');
    await mkdir(project, { recursive: true });
    await writeTree(project, {
      'src/app.ts': 'export const via = "SYMLINK_ROOT_TOKEN";\n',
    });
    await writeFile(path.join(parent, 'outside.txt'), 'OUTSIDE_STILL_HIDDEN\n');
    await symlink(path.join(parent, 'outside.txt'), path.join(project, 'leak.txt'));
    const link = path.join(parent, 'via-link');
    await symlink(project, link);

    const io = captureIo({ env: {} });
    const code = await main(['node', 'northmark', 'crawl', '--cwd', link], io);
    expect(code).toBe(0);
    expect(io.output()).toContain('src/app.ts');
    expect(io.output()).not.toMatch(/files listed\s+0/);
    expect(io.output()).not.toContain('OUTSIDE_STILL_HIDDEN');
  });

  it('uses the interactive menu on a TTY and can cancel', async () => {
    const cwd = await sampleProject();
    vi.mocked(multiselect).mockResolvedValueOnce(['readme'] as never);
    vi.mocked(confirm).mockResolvedValueOnce(true as never);
    const io = captureIo({ cwd, tty: true, env: {} });
    expect(await main(['node', 'northmark'], io)).toBe(0);
    expect(io.output()).toContain('The model was not called. Nothing was written.');
    expect(io.output()).toContain('docs/README.md');
    await expect(access(path.join(cwd, 'docs'))).rejects.toThrow();

    vi.mocked(multiselect).mockResolvedValueOnce(Symbol.for('cancel') as never);
    const cancelled = captureIo({ cwd, tty: true, env: {} });
    expect(await main(['node', 'northmark'], cancelled)).toBe(0);
  });
});

describe('package metadata', () => {
  it('is set up as a pure-JS npm CLI', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string;
      license: string;
      type: string;
      bin: { northmark: string };
      files: string[];
      engines: { node: string };
    };
    expect(pkg.name).toBe('northmark');
    expect(pkg.license).toBe('MIT');
    expect(pkg.type).toBe('module');
    expect(pkg.bin.northmark).toBe('./dist/cli.js');
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'assets', 'LICENSE']));
    expect(pkg.engines.node).toContain('>=18');
    const cli = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8');
    expect(cli.startsWith('#!/usr/bin/env node\n')).toBe(true);
  });
});
