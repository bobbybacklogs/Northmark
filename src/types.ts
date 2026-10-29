export type DocId = 'readme' | 'product-brief' | 'design' | 'architecture';

export type FileKind = 'manifest' | 'readme' | 'config' | 'style' | 'source' | 'doc' | 'other';

export type SkipReason =
  | 'gitignore'
  | 'secret'
  | 'junk'
  | 'binary'
  | 'lockfile'
  | 'large'
  | 'symlink'
  | 'unreadable';

export interface CrawlFile {
  path: string;
  bytes: number;
  kind: FileKind;
  score: number;
  text?: string;
}

export interface CrawlAsset {
  path: string;
  bytes: number;
}

export interface Signals {
  frameworks: string[];
  colors: string[];
  fonts: string[];
  cssVariables: string[];
  uiPaths: string[];
}

export interface CrawlResult {
  root: string;
  rootName: string;
  files: CrawlFile[];
  assets: CrawlAsset[];
  skipped: Record<SkipReason, number>;
  samples: Partial<Record<SkipReason, string[]>>;
  truncated: boolean;
  visited: number;
  signals: Signals;
}

export interface ContextFile {
  path: string;
  bytes: number;
  kind: FileKind;
}

export interface ContextBundle {
  text: string;
  included: ContextFile[];
}

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface LlmMessage {
  system: string;
  user: string;
}

export interface LlmClient {
  complete(input: LlmMessage): Promise<string>;
}

export interface PlannedDoc {
  id: DocId;
  filename: string;
  absolutePath: string;
  relativePath: string;
  existed: boolean;
}

export interface GenerateResult {
  dryRun: boolean;
  cancelled: boolean;
  force: boolean;
  crawl: CrawlResult;
  context: ContextBundle;
  planned: PlannedDoc[];
  written: PlannedDoc[];
}

export type ProgressEvent =
  | { type: 'crawl' }
  | { type: 'crawled'; listed: number; contextBytes: number }
  | { type: 'pause' }
  | { type: 'generate'; filename: string; index: number; total: number };
