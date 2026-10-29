import type { FileKind } from './types.js';

const JUNK_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  'out',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vercel',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.idea',
  'bower_components',
  'jspm_packages',
  '.gradle',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  '.eggs',
  'dist-newstyle',
  '.serverless',
  '.fusebox',
  '.docusaurus',
  'storybook-static',
  '.expo',
  '.angular',
  '.svelte-kit',
  '.yarn',
  '.pnpm',
]);

const LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'gemfile.lock',
  'composer.lock',
  'go.sum',
  'packages.lock.json',
  'npm-shrinkwrap.json',
  'pixi.lock',
  'uv.lock',
  'flake.lock',
  'pubspec.lock',
]);

const BINARY_EXT = new Set([
  '.zip',
  '.gz',
  '.tgz',
  '.bz2',
  '.7z',
  '.rar',
  '.tar',
  '.xz',
  '.wasm',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.class',
  '.jar',
  '.war',
  '.pyc',
  '.pyo',
  '.o',
  '.a',
  '.obj',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.dmg',
  '.iso',
  '.pkg',
  '.psd',
  '.ai',
  '.sketch',
  '.fig',
  '.lockb',
]);

const ASSET_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.icns',
  '.bmp',
  '.tif',
  '.tiff',
  '.avif',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
]);

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.astro',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.java',
  '.kt',
  '.kts',
  '.swift',
  '.cs',
  '.scala',
  '.ex',
  '.exs',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.svg',
  '.md',
  '.mdx',
  '.rst',
  '.txt',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.graphql',
  '.gql',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.css',
]);

const SPECIAL_NAMES = new Set([
  'dockerfile',
  'containerfile',
  'makefile',
  'gemfile',
  'rakefile',
  'procfile',
  'brewfile',
  'justfile',
  'license',
  'copying',
  'readme',
]);

const MANIFESTS = new Set([
  'package.json',
  'pyproject.toml',
  'setup.cfg',
  'cargo.toml',
  'go.mod',
  'composer.json',
  'gemfile',
  'pubspec.yaml',
  'mix.exs',
  'package.swift',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
]);

const SECRET_PATH =
  /(?:^|\/)(?:\.ssh|\.gnupg|\.aws|\.?secrets)(?:\/|$)/i;

const SECRET_BASE =
  /^(?:\.env(?:\..*)?|env\.(?:local|development|production|test|staging)|id_rsa|id_dsa|id_ecdsa|id_ed25519|id_rsa\.pub|id_dsa\.pub|id_ecdsa\.pub|id_ed25519\.pub|.*\.(?:pem|key|p12|pfx|p8|jks|keystore|kdbx)|\.netrc|\.npmrc|\.pypirc|credentials\.(?:json|ya?ml)|secrets?\.(?:json|ya?ml|txt)|service-account(?:[.-].*)?\.json|.*-credentials\.json)$/i;

const DESIGN_FILE =
  /^(?:tailwind\.config\..+|theme\..+|tokens\..+|design-tokens\..+|global\.(?:css|scss))$/i;

const CONFIG_FILE =
  /^(?:tsconfig(?:\..*)?\.json|jsconfig\.json|(?:vite|next|nuxt|svelte|postcss|astro|remix|metro|webpack|eslint|prettier)\.config\.[cm]?[jt]s|angular\.json|components\.json|app\.config\.[cm]?[jt]s|biome\.json)$/i;

const SOURCE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.astro',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.java',
  '.kt',
  '.kts',
  '.swift',
  '.cs',
  '.html',
  '.htm',
  '.svg',
]);

export function isJunkDir(name: string): boolean {
  return JUNK_DIRS.has(name) || JUNK_DIRS.has(name.toLowerCase());
}

export function isJunkFile(name: string): boolean {
  const base = name.toLowerCase();
  return base === '.ds_store' || base === 'thumbs.db' || base === 'desktop.ini' || /\.min\.(?:js|css|mjs|cjs)$/i.test(base) || base.endsWith('.map');
}

export function isLockfile(name: string): boolean {
  const base = name.toLowerCase();
  return LOCKFILES.has(base) || base.endsWith('.lock');
}

export function isAssetName(name: string): boolean {
  return ASSET_EXT.has(extension(name));
}

export function isBinaryName(name: string): boolean {
  return BINARY_EXT.has(extension(name));
}

export function isSecretPath(relPosix: string): boolean {
  const rel = relPosix.replace(/\\/g, '/');
  if (SECRET_PATH.test(rel)) return true;
  const base = rel.split('/').pop() ?? rel;
  return SECRET_BASE.test(base);
}

export function looksLikePrivateKey(text: string): boolean {
  return /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(text);
}

export function isTextCandidate(name: string): boolean {
  const base = name.toLowerCase();
  if (SPECIAL_NAMES.has(base)) return true;
  const ext = extension(base);
  if (!ext) return true;
  return TEXT_EXT.has(ext);
}

export function classifyFile(relPosix: string): { kind: FileKind; score: number } {
  const rel = relPosix.replace(/\\/g, '/');
  const base = rel.split('/').pop()?.toLowerCase() ?? rel.toLowerCase();
  const ext = extension(base);

  if (MANIFESTS.has(base)) return { kind: 'manifest', score: 100 };
  if (base === 'readme' || base.startsWith('readme.')) return { kind: 'readme', score: 96 };
  if (DESIGN_FILE.test(base)) return { kind: 'style', score: 92 };
  if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less' || ext === '.svg') {
    return { kind: 'style', score: 86 };
  }
  if (CONFIG_FILE.test(base)) return { kind: 'config', score: 84 };
  if (SOURCE_EXT.has(ext)) {
    const boost = /\/(components?|pages?|screens?|layouts?|routes?|ui|theme|styles?)\//i.test(`/${rel}/`) ? 10 : 0;
    const entry = /(^|\/)(app|main|index|server)\.(tsx|jsx|vue|svelte|ts|js)$/i.test(rel) ? 8 : 0;
    return { kind: 'source', score: 60 + boost + entry };
  }
  if (ext === '.md' || ext === '.mdx' || ext === '.rst') return { kind: 'doc', score: 40 };
  if (ext === '.json' || ext === '.yml' || ext === '.yaml' || ext === '.toml') {
    return { kind: 'config', score: 36 };
  }
  return { kind: 'other', score: 12 };
}

function extension(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) return '';
  return lower.slice(dot);
}
