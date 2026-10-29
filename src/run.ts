import path from 'node:path';
import { parseMaxBytes, resolveModelConfig } from './config.js';
import { buildContext } from './context.js';
import { crawlProject } from './crawl.js';
import { parseDocs } from './docs.js';
import { generateDocs } from './generate.js';
import { formatCrawlReport, formatGenerateReport, renderBanner, startProgress, type Io } from './ui.js';
import type { DocId, ModelConfig } from './types.js';

export interface GenerateFlags {
  cwd?: string;
  maxBytes?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeout?: string;
  docs?: string;
  out?: string;
  force?: boolean;
  dryRun?: boolean;
}

export async function executeGenerate(
  flags: GenerateFlags,
  io: Io,
  presentation: { banner?: boolean; docs?: DocId[]; confirmOverwrite?: (files: string[]) => Promise<boolean> } = {},
): Promise<'ok' | 'dry-run' | 'cancelled'> {
  const cwd = path.resolve(flags.cwd ?? io.cwd);
  const model = resolveModel(flags, io);
  const maxBytes = parseMaxBytes(flags.maxBytes, io.env.NORTHMARK_MAX_BYTES);
  const docs = presentation.docs ?? parseDocs(flags.docs);
  const dryRun = Boolean(flags.dryRun);
  const progress = startProgress(io, dryRun ? 'Reading the project' : 'Drafting docs');
  try {
    const result = await generateDocs({
      cwd,
      docs,
      outDir: flags.out ?? 'docs',
      force: Boolean(flags.force),
      dryRun,
      maxBytes,
      model,
      confirmOverwrite: presentation.confirmOverwrite,
      onProgress: (event) => progress.update(event),
    });
    if (result.cancelled) {
      progress.stop('Stopped');
      return 'cancelled';
    }
    progress.stop(result.dryRun ? 'Dry run ready' : `Drafted ${result.written.length} ${result.written.length === 1 ? 'doc' : 'docs'}`);
    if (presentation.banner !== false) io.stdout.write(renderBanner());
    io.stdout.write(formatGenerateReport(result, model));
    return result.dryRun ? 'dry-run' : 'ok';
  } catch (error) {
    progress.stop('Stopped', 1);
    throw error;
  }
}

export async function executeCrawl(flags: GenerateFlags, io: Io): Promise<void> {
  const cwd = path.resolve(flags.cwd ?? io.cwd);
  const maxBytes = parseMaxBytes(flags.maxBytes, io.env.NORTHMARK_MAX_BYTES);
  const progress = startProgress(io, 'Reading the project');
  try {
    progress.update({ type: 'crawl' });
    const crawl = await crawlProject(cwd, { maxBytes });
    const context = buildContext(crawl, maxBytes);
    progress.update({
      type: 'crawled',
      listed: crawl.files.length,
      contextBytes: Buffer.byteLength(context.text, 'utf8'),
    });
    progress.stop('Crawl ready');
    io.stdout.write(renderBanner());
    io.stdout.write(formatCrawlReport(crawl, Buffer.byteLength(context.text, 'utf8'), context.included));
  } catch (error) {
    progress.stop('Stopped', 1);
    throw error;
  }
}

function resolveModel(flags: GenerateFlags, io: Io): ModelConfig {
  return resolveModelConfig(
    {
      baseUrl: flags.baseUrl,
      apiKey: flags.apiKey,
      model: flags.model,
      timeoutMs: flags.timeout,
    },
    io.env,
  );
}
