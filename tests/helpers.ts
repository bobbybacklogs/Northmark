import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Io } from '../src/ui.js';

export async function makeTempDir(prefix = 'northmark-'): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = path.join(root, rel);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
}

export async function removeTemp(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export function captureIo(options: { cwd?: string; env?: NodeJS.ProcessEnv; tty?: boolean } = {}): Io & {
  output(): string;
  errorOutput(): string;
} {
  let out = '';
  let err = '';
  return {
    stdout: {
      write(chunk: string) {
        out += chunk;
        return true;
      },
    },
    stderr: {
      write(chunk: string) {
        err += chunk;
        return true;
      },
    },
    tty: options.tty ?? false,
    env: options.env ?? {},
    cwd: options.cwd ?? process.cwd(),
    output: () => out,
    errorOutput: () => err,
  };
}
