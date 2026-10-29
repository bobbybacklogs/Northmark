import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/context.js';
import type { CrawlResult } from '../src/types.js';

function crawl(partial: Partial<CrawlResult> = {}): CrawlResult {
  return {
    root: '/tmp/hidden-root/project',
    rootName: 'project',
    files: [],
    assets: [],
    skipped: {
      gitignore: 0,
      secret: 0,
      junk: 0,
      binary: 0,
      lockfile: 0,
      large: 0,
      symlink: 0,
      unreadable: 0,
    },
    samples: {},
    truncated: false,
    visited: 0,
    signals: { frameworks: [], colors: [], fonts: [], cssVariables: [], uiPaths: [] },
    ...partial,
  };
}

describe('buildContext', () => {
  it('keeps the packed prompt inside the budget and uses relative paths', () => {
    const files = [
      {
        path: 'package.json',
        bytes: 40,
        kind: 'manifest' as const,
        score: 100,
        text: '{ "name": "KEEP_PACKAGE" }\n',
      },
      {
        path: 'notes/random.txt',
        bytes: 3000,
        kind: 'other' as const,
        score: 12,
        text: `LOW_TOKEN ${'z'.repeat(3_000)}`,
      },
    ];
    const context = buildContext(crawl({ files, visited: 2 }), 4_000);
    expect(Buffer.byteLength(context.text, 'utf8')).toBeLessThanOrEqual(4_000);
    expect(context.text).toContain('KEEP_PACKAGE');
    expect(context.text).toContain('Project folder: project');
    expect(context.text).not.toContain('/tmp/hidden-root');
    expect(context.included.some((file) => file.path === 'package.json')).toBe(true);
  });
});
