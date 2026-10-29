import { open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import { NorthmarkError } from './errors.js';
import { isInsideRoot, toPosix } from './paths.js';
import {
  classifyFile,
  isAssetName,
  isBinaryName,
  isJunkDir,
  isJunkFile,
  isLockfile,
  isSecretPath,
  isTextCandidate,
  looksLikePrivateKey,
} from './rules.js';
import { detectSignals } from './signals.js';
import type { CrawlAsset, CrawlFile, CrawlResult, SkipReason } from './types.js';

export const DEFAULT_MAX_ENTRIES = 8_000;
const MAX_LISTED = 1_500;
const MAX_ASSETS = 40;
const MAX_READ_SIZE = 128 * 1024;
const MAX_LIST_SIZE = 1_500 * 1024;
const MAX_SNIFF = 32 * 1024;
const READ_HEAD = 16 * 1024;
const SAMPLE_LIMIT = 8;

export interface CrawlOptions {
  maxBytes?: number;
  maxEntries?: number;
}

type IgnoreFilter = ReturnType<typeof ignore>;

interface Layer {
  prefix: string;
  ig: IgnoreFilter;
}

interface State {
  rootLogical: string;
  rootReal: string;
  maxEntries: number;
  visited: number;
  truncated: boolean;
  seenDirs: Set<string>;
  files: CrawlFile[];
  assets: CrawlAsset[];
  skipped: Record<SkipReason, number>;
  samples: Partial<Record<SkipReason, string[]>>;
  layers: Layer[];
}

const SKIP_REASONS: SkipReason[] = [
  'gitignore',
  'secret',
  'junk',
  'binary',
  'lockfile',
  'large',
  'symlink',
  'unreadable',
];

export async function crawlProject(cwd: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const root = path.resolve(cwd);
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (error) {
    if (isEnoent(error)) {
      throw new NorthmarkError(`Project directory does not exist: ${root}`);
    }
    throw new NorthmarkError(`Can't read the project directory: ${root}`);
  }
  if (!rootStat.isDirectory()) {
    throw new NorthmarkError(`${root} is not a directory. Northmark reads a project folder.`);
  }

  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    throw new NorthmarkError(`Can't resolve the project directory: ${root}`);
  }

  const state: State = {
    rootLogical: root,
    rootReal,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    visited: 0,
    truncated: false,
    seenDirs: new Set<string>(),
    files: [],
    assets: [],
    skipped: emptySkips(),
    samples: {},
    layers: [],
  };

  await walk(root, '', state);

  const bodyBudget = Math.floor((options.maxBytes ?? 100_000) * 0.72);
  await readBodies(state, bodyBudget);

  const files = [...state.files].sort((a, b) => a.path.localeCompare(b.path));

  const readable = files.filter((file) => file.text !== undefined);
  const rootName = path.basename(root) || 'project';

  return {
    root,
    rootName,
    files,
    assets: state.assets,
    skipped: state.skipped,
    samples: state.samples,
    truncated: state.truncated,
    visited: state.visited,
    signals: detectSignals([...readable, ...state.assets.map((asset) => ({ path: asset.path }))]),
  };
}

async function walk(dir: string, relDir: string, state: State): Promise<void> {
  if (state.truncated) return;

  let dirReal: string;
  try {
    dirReal = await realpath(dir);
  } catch {
    record(state, 'unreadable', relDir || '.');
    return;
  }
  if (!isInsideRoot(state.rootReal, dirReal)) {
    record(state, 'symlink', relDir || '.');
    return;
  }
  if (state.seenDirs.has(dirReal)) {
    if (relDir) record(state, 'symlink', relDir);
    return;
  }
  state.seenDirs.add(dirReal);

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    if (relDir === '') {
      throw new NorthmarkError(`Can't read the project directory: ${dir}`);
    }
    record(state, 'unreadable', relDir);
    return;
  }

  let pushed = false;
  const gitignore = entries.find((entry) => entry.name === '.gitignore' && entry.isFile() && !entry.isSymbolicLink());
  if (gitignore) {
    try {
      const text = await readFile(path.join(dir, '.gitignore'), 'utf8');
      const ig = compileIgnore(text);
      if (ig) {
        state.layers.push({ prefix: relDir, ig });
        pushed = true;
      }
    } catch {
      record(state, 'unreadable', relDir ? `${relDir}/.gitignore` : '.gitignore');
    }
  }

  try {
    for (const entry of entries) {
      if (state.visited >= state.maxEntries) {
        state.truncated = true;
        return;
      }
      const name = entry.name;
      if (name === '.' || name === '..' || name.includes('\0') || name.includes('/') || name.includes('\\')) {
        continue;
      }
      state.visited += 1;
      const rel = relDir ? `${relDir}/${name}` : name;
      const full = path.join(dir, name);

      if (name === '.gitignore') continue;

      if (entry.isSymbolicLink()) {
        await handleSymlink(full, rel, name, state);
        continue;
      }
      if (entry.isDirectory()) {
        if (isJunkDir(name)) {
          record(state, 'junk', rel);
          continue;
        }
        if (gitIgnored(rel, true, state.layers)) {
          record(state, 'gitignore', rel);
          continue;
        }
        await walk(full, rel, state);
        continue;
      }
      if (entry.isFile()) {
        await considerFile(full, rel, name, state);
      }
    }
  } finally {
    if (pushed) state.layers.pop();
  }
}

async function handleSymlink(full: string, rel: string, name: string, state: State): Promise<void> {
  let target: string;
  try {
    target = await realpath(full);
  } catch {
    record(state, 'symlink', rel);
    return;
  }
  if (!isInsideRoot(state.rootReal, target)) {
    record(state, 'symlink', rel);
    return;
  }
  let info;
  try {
    info = await stat(full);
  } catch {
    record(state, 'unreadable', rel);
    return;
  }
  if (info.isDirectory()) {
    if (isJunkDir(name)) {
      record(state, 'junk', rel);
      return;
    }
    if (gitIgnored(rel, true, state.layers)) {
      record(state, 'gitignore', rel);
      return;
    }
    await walk(full, rel, state);
    return;
  }
  if (info.isFile()) {
    await considerFile(full, rel, name, state, info.size);
  }
}

async function considerFile(
  full: string,
  rel: string,
  name: string,
  state: State,
  knownSize?: number,
): Promise<void> {
  if (state.files.length >= MAX_LISTED) {
    state.truncated = true;
    return;
  }
  if (isJunkFile(name)) {
    record(state, 'junk', rel);
    return;
  }
  if (isLockfile(name)) {
    record(state, 'lockfile', rel);
    return;
  }
  if (isSecretPath(rel)) {
    record(state, 'secret', rel);
    return;
  }
  if (gitIgnored(rel, false, state.layers)) {
    record(state, 'gitignore', rel);
    return;
  }

  let target: string;
  try {
    target = await realpath(full);
  } catch {
    record(state, 'symlink', rel);
    return;
  }
  if (!isInsideRoot(state.rootReal, target)) {
    record(state, 'symlink', rel);
    return;
  }
  const realRel = toPosix(path.relative(state.rootReal, target));
  if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
    record(state, 'symlink', rel);
    return;
  }
  if (isSecretPath(realRel)) {
    record(state, 'secret', rel);
    return;
  }

  let size = knownSize;
  if (size == null) {
    try {
      size = (await stat(full)).size;
    } catch {
      record(state, 'unreadable', rel);
      return;
    }
  }

  if (isAssetName(name)) {
    if (state.assets.length < MAX_ASSETS) state.assets.push({ path: rel, bytes: size });
    return;
  }
  if (isBinaryName(name)) {
    record(state, 'binary', rel);
    return;
  }
  if (!isTextCandidate(name)) {
    record(state, 'binary', rel);
    return;
  }
  if (size > MAX_LIST_SIZE) {
    record(state, 'large', rel);
    return;
  }

  const classified = classifyFile(rel);
  const file: CrawlFile = {
    path: rel,
    bytes: size,
    kind: classified.kind,
    score: classified.score,
  };
  if (size > MAX_READ_SIZE || (size > MAX_SNIFF && !extensionOf(name))) {
    record(state, 'large', rel);
    return;
  }
  state.files.push(file);
}

async function readBodies(state: State, bodyBudget: number): Promise<void> {
  const ranked = [...state.files].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  let used = 0;
  const dropped = new Set<string>();

  for (const file of ranked) {
    if (used >= bodyBudget && file.score < 90) continue;
    const abs = path.resolve(state.rootLogical, ...file.path.split('/'));
    if (!isInsideRoot(state.rootReal, abs)) {
      dropped.add(file.path);
      record(state, 'symlink', file.path);
      continue;
    }
    let text: string | null;
    try {
      text = await readHead(abs, Math.min(READ_HEAD, file.bytes), file.bytes);
    } catch {
      dropped.add(file.path);
      record(state, 'unreadable', file.path);
      continue;
    }
    if (text == null) {
      dropped.add(file.path);
      record(state, 'binary', file.path);
      continue;
    }
    if (looksLikePrivateKey(text)) {
      dropped.add(file.path);
      record(state, 'secret', file.path);
      continue;
    }
    const room = bodyBudget - used;
    if (file.score < 90 && Buffer.byteLength(text, 'utf8') > room) continue;
    if (Buffer.byteLength(text, 'utf8') > room && room > 200) {
      text = truncateUtf8(text, room);
    }
    file.text = text;
    used += Buffer.byteLength(text, 'utf8');
  }

  if (dropped.size > 0) {
    state.files = state.files.filter((file) => !dropped.has(file.path));
  }
}

async function readHead(full: string, maxBytes: number, fileSize: number): Promise<string | null> {
  const length = Math.max(0, Math.min(maxBytes, fileSize));
  if (length === 0) return '';
  const handle = await open(full, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const slice = buffer.subarray(0, bytesRead);
    if (slice.includes(0)) return null;
    let text = slice.toString('utf8');
    if (bytesRead < fileSize) text += '\n… (truncated)';
    return text;
  } finally {
    await handle.close();
  }
}

function compileIgnore(text: string): IgnoreFilter | null {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      kept.push(line);
      continue;
    }
    try {
      ignore().add(line);
      kept.push(line);
    } catch {
      // Skip a single bad pattern rather than failing the crawl.
    }
  }
  if (!kept.some((line) => line.trim() && !line.trim().startsWith('#'))) return null;
  return ignore().add(kept.join('\n'));
}

function gitIgnored(rel: string, directory: boolean, layers: Layer[]): boolean {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (!layer) continue;
    const local = localPath(layer.prefix, rel);
    if (!local) continue;
    if (layer.ig.ignores(local)) return true;
    if (directory && layer.ig.ignores(`${local}/`)) return true;
  }
  return false;
}

function localPath(prefix: string, rel: string): string | null {
  if (!prefix) return rel;
  if (rel === prefix) return null;
  if (rel.startsWith(`${prefix}/`)) return rel.slice(prefix.length + 1);
  return null;
}

function record(state: State, reason: SkipReason, rel: string): void {
  state.skipped[reason] += 1;
  const list = state.samples[reason] ?? [];
  if (list.length < SAMPLE_LIMIT) {
    list.push(rel);
    state.samples[reason] = list;
  }
}

function emptySkips(): Record<SkipReason, number> {
  return Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0])) as Record<SkipReason, number>;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot);
}

function truncateUtf8(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text);
  if (buffer.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0) {
    const byte = buffer[end];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) break;
    end -= 1;
  }
  return `${buffer.subarray(0, end).toString('utf8')}\n… (truncated)`;
}

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
