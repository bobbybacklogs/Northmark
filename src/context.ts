import type { ContextBundle, ContextFile, CrawlResult } from './types.js';

const LANG: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.md': 'md',
  '.mdx': 'md',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.sh': 'bash',
  '.sql': 'sql',
};

export function buildContext(crawl: CrawlResult, maxBytes: number): ContextBundle {
  const bodyBudget = Math.floor(maxBytes * 0.7);
  const ranked = crawl.files
    .filter((file) => file.text !== undefined && file.text.length > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const included: ContextFile[] = [];
  const blocks: string[] = [];
  let bodyBytes = 0;

  for (const file of ranked) {
    const text = file.text ?? '';
    let block = renderBlock(file.path, text);
    const size = Buffer.byteLength(block, 'utf8') + 1;
    if (bodyBytes + size > bodyBudget) {
      const room = bodyBudget - bodyBytes;
      if (included.length > 0 || room < 240) continue;
      const trimmed = truncateUtf8(text, Math.max(0, room - 80));
      block = renderBlock(file.path, trimmed);
    }
    const finalSize = Buffer.byteLength(block, 'utf8') + 1;
    if (bodyBytes + finalSize > bodyBudget && included.length > 0) continue;
    blocks.push(block);
    bodyBytes += finalSize;
    included.push({ path: file.path, bytes: Buffer.byteLength(file.text ?? '', 'utf8'), kind: file.kind });
  }

  const header = [
    `Project folder: ${crawl.rootName}`,
    `Files listed: ${crawl.files.length + crawl.assets.length}`,
    `File bodies included: ${included.length}`,
    `Crawl truncated: ${crawl.truncated ? 'yes' : 'no'}`,
    '',
    '## Detected signals',
    renderSignals(crawl),
    '',
    '## Project tree',
    renderTree(crawl),
  ].join('\n');

  let text = `${header}\n\n## File excerpts\n\n${blocks.join('\n\n')}\n`;
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    const note = '\n… (context truncated to budget)\n';
    text = `${truncateUtf8(text, Math.max(0, maxBytes - Buffer.byteLength(note, 'utf8')))}${note}`;
  }

  return { text, included };
}

function renderSignals(crawl: CrawlResult): string {
  const { signals } = crawl;
  return [
    `Frameworks: ${signals.frameworks.length ? signals.frameworks.join(', ') : '(none detected)'}`,
    `Colors: ${signals.colors.length ? signals.colors.join(', ') : '(none detected)'}`,
    `Fonts: ${signals.fonts.length ? signals.fonts.join(', ') : '(none detected)'}`,
    `CSS variables: ${signals.cssVariables.length ? signals.cssVariables.join(', ') : '(none detected)'}`,
    `UI-related paths: ${signals.uiPaths.length ? signals.uiPaths.join(', ') : '(none detected)'}`,
  ].join('\n');
}

function renderTree(crawl: CrawlResult): string {
  const lines = [
    ...crawl.files.map((file) => file.path),
    ...crawl.assets.map((asset) => `${asset.path} (image or font, not read)`),
  ].sort((a, b) => a.localeCompare(b));
  const cap = 400;
  if (lines.length <= cap) return lines.join('\n') || '(no text files)';
  return `${lines.slice(0, cap).join('\n')}\n… and ${lines.length - cap} more files`;
}

function renderBlock(filePath: string, text: string): string {
  const fence = text.includes('```') ? '````' : '```';
  const lang = language(filePath);
  return `### ${filePath}\n\n${fence}${lang}\n${text}\n${fence}`;
}

function language(filePath: string): string {
  const base = filePath.split('/').pop()?.toLowerCase() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return LANG[base.slice(dot)] ?? '';
}

function truncateUtf8(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text);
  if (buffer.length <= maxBytes) return text;
  let end = Math.max(0, maxBytes);
  while (end > 0) {
    const byte = buffer[end];
    if (byte === undefined || (byte & 0b1100_0000) !== 0b1000_0000) break;
    end -= 1;
  }
  return buffer.subarray(0, end).toString('utf8');
}
