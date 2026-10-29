import { existsSync } from 'node:fs';
import { buildContext } from './context.js';
import { crawlProject } from './crawl.js';
import { planDocs, promptFor, specsFor, writePlannedDoc } from './docs.js';
import { NorthmarkError } from './errors.js';
import { createModelClient } from './llm.js';
import type { DocId, GenerateResult, LlmClient, ModelConfig, PlannedDoc, ProgressEvent } from './types.js';

export interface GenerateOptions {
  cwd: string;
  docs: DocId[];
  outDir: string;
  force: boolean;
  dryRun: boolean;
  maxBytes: number;
  model: ModelConfig;
  llm?: LlmClient;
  confirmOverwrite?: (files: string[]) => Promise<boolean>;
  onProgress?: (event: ProgressEvent) => void;
}

export async function generateDocs(options: GenerateOptions): Promise<GenerateResult> {
  options.onProgress?.({ type: 'crawl' });
  const crawl = await crawlProject(options.cwd, { maxBytes: options.maxBytes });
  const context = buildContext(crawl, options.maxBytes);
  options.onProgress?.({
    type: 'crawled',
    listed: crawl.files.length,
    contextBytes: Buffer.byteLength(context.text, 'utf8'),
  });

  const planned = planDocs(options.cwd, options.outDir, options.docs, existsSync);
  const base: GenerateResult = {
    dryRun: options.dryRun,
    cancelled: false,
    force: options.force,
    crawl,
    context,
    planned,
    written: [],
  };
  if (options.dryRun) return base;

  const conflicts = planned.filter((doc) => doc.existed);
  if (conflicts.length > 0 && !options.force) {
    if (!options.confirmOverwrite) {
      const list = conflicts.map((doc) => doc.relativePath).join('\n  ');
      throw new NorthmarkError(
        `These docs already exist:\n  ${list}\nNorthmark will not overwrite them. Re-run with --force, or remove the files.`,
      );
    }
    options.onProgress?.({ type: 'pause' });
    const ok = await options.confirmOverwrite(conflicts.map((doc) => doc.relativePath));
    if (!ok) return { ...base, cancelled: true };
  }

  const client = options.llm ?? createModelClient(options.model);
  const specs = specsFor(options.docs);
  const drafts: { doc: PlannedDoc; markdown: string }[] = [];
  for (let index = 0; index < planned.length; index += 1) {
    const doc = planned[index];
    const spec = specs[index];
    if (!doc || !spec) {
      throw new NorthmarkError('Northmark lost track of a document while drafting.');
    }
    options.onProgress?.({
      type: 'generate',
      filename: doc.filename,
      index: index + 1,
      total: planned.length,
    });
    try {
      const prompt = promptFor(spec, context.text);
      const markdown = await client.complete(prompt);
      drafts.push({ doc, markdown });
    } catch (error) {
      const reason = error instanceof NorthmarkError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'The model request failed.';
      throw new NorthmarkError(`Stopped while drafting ${doc.relativePath}. Nothing was written. ${reason}`);
    }
  }

  const written: PlannedDoc[] = [];
  for (const draft of drafts) {
    await writePlannedDoc(draft.doc, draft.markdown);
    written.push(draft.doc);
  }

  return { ...base, written };
}
