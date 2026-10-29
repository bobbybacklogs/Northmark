import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { NorthmarkError } from './errors.js';
import { describeModel } from './llm.js';
import type { CrawlResult, GenerateResult, ModelConfig, ProgressEvent } from './types.js';

const PURPLE: [number, number, number] = [124, 58, 237];

export interface Io {
  stdout: { write(chunk: string): boolean | void };
  stderr: { write(chunk: string): boolean | void };
  tty: boolean;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

export function defaultIo(): Io {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    tty: Boolean(process.stdout.isTTY),
    env: process.env,
    cwd: process.cwd(),
  };
}

export function brand(text: string): string {
  return purple(pc.bold(text));
}

export function renderBanner(): string {
  return ['', `  ${brand('NORTHMARK')}`, `  ${pc.dim('Give every product a clear direction.')}`, '', ''].join('\n');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

export function formatGenerateReport(result: GenerateResult, model: ModelConfig): string {
  const heading = result.dryRun ? 'Dry run' : result.cancelled ? 'Cancelled' : 'Generated';
  const lines: string[] = [heading, '', 'Project', row('name', result.crawl.rootName), '', 'Docs'];
  if (result.planned.length === 0) lines.push(row('planned', '(none)'));
  for (const doc of result.planned) lines.push(row(doc.relativePath, docStatus(doc, result)));
  const described = describeModel(model);
  lines.push(
    '',
    'Model',
    row('endpoint', described.endpoint),
    row('model', described.model),
    row('api key', described.apiKey),
    row('timeout', formatDuration(described.timeoutMs)),
    ...crawlLines(result.crawl, Buffer.byteLength(result.context.text, 'utf8'), result.context.included),
  );
  if (result.cancelled) lines.push('', 'Left existing docs untouched.');
  else if (result.dryRun) lines.push('', 'The model was not called. Nothing was written.');
  else lines.push('', `Wrote ${result.written.length} ${result.written.length === 1 ? 'file' : 'files'}.`);
  return `${lines.join('\n')}\n`;
}

export function formatCrawlReport(
  crawl: CrawlResult,
  contextBytes: number,
  included: { path: string; bytes: number; kind: string }[],
): string {
  const lines = ['Crawl', '', 'Project', row('name', crawl.rootName), ...crawlLines(crawl, contextBytes, included)];
  lines.push('', 'No model call. Nothing written.');
  return `${lines.join('\n')}\n`;
}

export interface Progress {
  update(event: ProgressEvent): void;
  stop(message: string, code?: number): void;
}

export function startProgress(io: Io, label: string): Progress {
  if (!io.tty || io.env.CI) {
    return {
      update(event) {
        if (event.type === 'crawl') io.stdout.write(`${label}…\n`);
        else if (event.type === 'crawled') {
          io.stdout.write(`Read ${event.listed} files · ${formatBytes(event.contextBytes)} of context.\n`);
        } else if (event.type === 'generate') {
          io.stdout.write(`Drafting ${event.filename} (${event.index}/${event.total})…\n`);
        }
      },
      stop() {},
    };
  }

  let spin: ReturnType<typeof spinner> | null = spinner();
  spin.start(label);
  return {
    update(event) {
      if (event.type === 'crawled') spin?.message(`${label} · ${event.listed} files`);
      else if (event.type === 'pause') {
        spin?.stop('Read the project');
        spin = null;
      } else if (event.type === 'generate') {
        const message = `Drafting ${event.filename} (${event.index}/${event.total})`;
        if (!spin) {
          spin = spinner();
          spin.start(message);
        } else {
          spin.message(message);
        }
      }
    },
    stop(message, code) {
      spin?.stop(message, code);
      spin = null;
    },
  };
}

export function writeError(io: Io, error: unknown): void {
  const message = error instanceof NorthmarkError
    ? error.message
    : error instanceof Error
      ? `Northmark hit an unexpected error: ${error.message}`
      : 'Northmark hit an unexpected error.';
  const hint = error instanceof NorthmarkError ? '' : '\nRe-run with DEBUG=1 for the stack.';
  io.stderr.write(`${pc.red(message)}${hint}\n`);
  if (!(error instanceof NorthmarkError) && io.env.DEBUG && error instanceof Error && error.stack) {
    io.stderr.write(`\n${error.stack}\n`);
  }
}

function crawlLines(
  crawl: CrawlResult,
  contextBytes: number,
  included: { path: string; bytes: number; kind: string }[],
): string[] {
  const lines = [
    '',
    'Context',
    row('entries seen', String(crawl.visited)),
    row('files listed', String(crawl.files.length)),
    row('bodies packed', String(included.length)),
    row('packed', formatBytes(contextBytes)),
    row('truncated', crawl.truncated ? 'yes' : 'no'),
    '',
    'Signals',
    row('frameworks', listOrNone(crawl.signals.frameworks)),
    row('colors', listOrNone(crawl.signals.colors)),
    row('fonts', listOrNone(crawl.signals.fonts)),
    row('css variables', listOrNone(crawl.signals.cssVariables)),
    '',
    'Would send',
  ];
  const preview = included.slice(0, 40);
  if (preview.length === 0) lines.push(row('files', '(none)'));
  for (const file of preview) lines.push(row(file.path, `${file.kind}  ${formatBytes(file.bytes)}`));
  if (included.length > preview.length) lines.push(row('more', `${included.length - preview.length} more files`));
  if (crawl.assets.length > 0) {
    lines.push('', 'Assets (not read)');
    for (const asset of crawl.assets.slice(0, 15)) lines.push(row(asset.path, formatBytes(asset.bytes)));
  }
  lines.push(
    '',
    'Safety',
    row('secrets skipped', String(crawl.skipped.secret)),
    row('symlinks skipped', String(crawl.skipped.symlink)),
    row('gitignore skipped', String(crawl.skipped.gitignore)),
    row('junk / build skipped', String(crawl.skipped.junk)),
    row('lockfiles skipped', String(crawl.skipped.lockfile)),
    row('binaries skipped', String(crawl.skipped.binary)),
    row('large files skipped', String(crawl.skipped.large)),
  );
  for (const sample of crawl.samples.secret ?? []) lines.push(row('', sample));
  if (crawl.truncated) {
    lines.push('', 'The crawl stopped early so a very large tree could not crowd out the rest of the project.');
  }
  return lines;
}

function docStatus(doc: { relativePath: string; existed: boolean }, result: GenerateResult): string {
  const written = result.written.some((item) => item.relativePath === doc.relativePath);
  if (written) return doc.existed ? 'wrote (overwrite)' : 'wrote';
  if (result.dryRun && doc.existed) return result.force ? 'would overwrite' : 'needs --force';
  if (result.dryRun) return 'new';
  return doc.existed ? 'exists' : 'pending';
}

function row(label: string, value: string): string {
  return `  ${label.padEnd(28)}  ${value}`;
}

function listOrNone(values: string[]): string {
  if (values.length === 0) return '(none)';
  const shown = values.slice(0, 12);
  const extra = values.length > shown.length ? ` +${values.length - shown.length}` : '';
  return `${shown.join(', ')}${extra}`;
}

function purple(text: string): string {
  if (!pc.isColorSupported) return text;
  return `\x1b[38;2;${PURPLE[0]};${PURPLE[1]};${PURPLE[2]}m${text}\x1b[39m`;
}
