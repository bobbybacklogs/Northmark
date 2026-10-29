import type { Signals } from './types.js';

const FRAMEWORKS: { names: string[]; label: string }[] = [
  { names: ['next'], label: 'Next.js' },
  { names: ['nuxt'], label: 'Nuxt' },
  { names: ['astro'], label: 'Astro' },
  { names: ['@remix-run/react', 'remix'], label: 'Remix' },
  { names: ['expo', 'react-native'], label: 'React Native' },
  { names: ['electron'], label: 'Electron' },
  { names: ['react', 'react-dom'], label: 'React' },
  { names: ['vue'], label: 'Vue' },
  { names: ['svelte', '@sveltejs/kit'], label: 'Svelte' },
  { names: ['solid-js'], label: 'Solid' },
  { names: ['@angular/core'], label: 'Angular' },
  { names: ['tailwindcss'], label: 'Tailwind CSS' },
  { names: ['styled-components'], label: 'styled-components' },
  { names: ['@emotion/react', '@emotion/styled'], label: 'Emotion' },
  { names: ['@radix-ui/react-dialog', '@radix-ui/themes'], label: 'Radix UI' },
  { names: ['@mui/material'], label: 'Material UI' },
  { names: ['@chakra-ui/react'], label: 'Chakra UI' },
  { names: ['framer-motion'], label: 'Framer Motion' },
  { names: ['vite'], label: 'Vite' },
  { names: ['hono'], label: 'Hono' },
  { names: ['express'], label: 'Express' },
  { names: ['fastify'], label: 'Fastify' },
  { names: ['@nestjs/core'], label: 'NestJS' },
  { names: ['three'], label: 'Three.js' },
];

const FILE_HINTS: { test: RegExp; label: string }[] = [
  { test: /(^|\/)tailwind\.config\./i, label: 'Tailwind CSS' },
  { test: /(^|\/)next\.config\./i, label: 'Next.js' },
  { test: /(^|\/)nuxt\.config\./i, label: 'Nuxt' },
  { test: /(^|\/)astro\.config\./i, label: 'Astro' },
  { test: /(^|\/)svelte\.config\./i, label: 'Svelte' },
  { test: /(^|\/)vite\.config\./i, label: 'Vite' },
];

const GENERIC_FONTS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'emoji',
  'math',
  'fangsong',
]);

export function detectSignals(files: { path: string; text?: string }[]): Signals {
  const frameworks = new Set<string>();
  const colors: string[] = [];
  const fonts: string[] = [];
  const cssVariables: string[] = [];
  const uiPaths: string[] = [];
  const seenColors = new Set<string>();
  const seenFonts = new Set<string>();
  const seenVars = new Set<string>();

  for (const file of files) {
    if (isUiPath(file.path) && uiPaths.length < 20) uiPaths.push(file.path);
    for (const hint of FILE_HINTS) {
      if (hint.test.test(file.path)) frameworks.add(hint.label);
    }
    if ((file.path === 'package.json' || file.path.endsWith('/package.json')) && file.text) {
      for (const label of frameworksFromPackage(file.text)) frameworks.add(label);
    }
    if (!file.text) continue;
    if (!shouldScan(file.path)) continue;
    collectColors(file.text, seenColors, colors);
    collectFonts(file.text, seenFonts, fonts);
    collectVars(file.text, seenVars, cssVariables);
  }

  return {
    frameworks: [...frameworks],
    colors: colors.slice(0, 24),
    fonts: fonts.slice(0, 12),
    cssVariables: preferDesignVars(cssVariables).slice(0, 24),
    uiPaths,
  };
}

function frameworksFromPackage(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const record = parsed as Record<string, unknown>;
  const deps = {
    ...(asRecord(record.dependencies)),
    ...(asRecord(record.devDependencies)),
    ...(asRecord(record.peerDependencies)),
  };
  const found: string[] = [];
  for (const entry of FRAMEWORKS) {
    if (entry.names.some((name) => Object.prototype.hasOwnProperty.call(deps, name))) {
      found.push(entry.label);
    }
  }
  for (const key of Object.keys(deps)) {
    if (key.startsWith('@radix-ui/') && !found.includes('Radix UI')) found.push('Radix UI');
    if ((key.startsWith('@mui/') || key === '@material-ui/core') && !found.includes('Material UI')) {
      found.push('Material UI');
    }
    if (key.startsWith('@angular/') && !found.includes('Angular')) found.push('Angular');
    if (key.startsWith('@vue/') && !found.includes('Vue')) found.push('Vue');
    if (key.startsWith('@sveltejs/') && !found.includes('Svelte')) found.push('Svelte');
    if (key.startsWith('@nuxt/') && !found.includes('Nuxt')) found.push('Nuxt');
  }
  return found;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function shouldScan(filePath: string): boolean {
  return /\.(css|scss|sass|less|svg|tsx|jsx|vue|svelte|html|htm|json|ts|js)$/i.test(filePath);
}

function isUiPath(filePath: string): boolean {
  return /\.(css|scss|sass|less|svg)$/i.test(filePath)
    || /\/(components?|pages?|screens?|layouts?|ui|theme|styles?)\//i.test(`/${filePath}`);
}

function collectColors(text: string, seen: Set<string>, out: string[]): void {
  const pattern = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    if (!raw) continue;
    const body = raw.slice(1);
    if (body.length < 6 && !/[a-f]/i.test(body)) continue;
    const hex = raw.toLowerCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
    if (out.length >= 24) return;
  }
}

function collectFonts(text: string, seen: Set<string>, out: string[]): void {
  const pattern = /font-family\s*:\s*([^;}{]+)/gi;
  for (const match of text.matchAll(pattern)) {
    const list = match[1];
    if (!list) continue;
    const first = list.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
    if (!first || first.startsWith('var(') || GENERIC_FONTS.has(first.toLowerCase())) continue;
    if (seen.has(first)) continue;
    seen.add(first);
    out.push(first);
    if (out.length >= 12) return;
  }
  const google = /fonts\.googleapis\.com\/css2?\?family=([^&"')\s]+)/gi;
  for (const match of text.matchAll(google)) {
    const family = decodeURIComponent(match[1] ?? '').split(':')[0]?.replace(/\+/g, ' ').trim();
    if (!family || seen.has(family)) continue;
    seen.add(family);
    out.push(family);
    if (out.length >= 12) return;
  }
}

function collectVars(text: string, seen: Set<string>, out: string[]): void {
  const pattern = /--[A-Za-z_][\w-]*/g;
  for (const match of text.matchAll(pattern)) {
    const name = match[0];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= 48) return;
  }
}

function preferDesignVars(names: string[]): string[] {
  const interesting = names.filter((name) => /color|font|space|gap|radius|shadow|size|text|bg|brand/i.test(name));
  const rest = names.filter((name) => !interesting.includes(name));
  return [...interesting, ...rest];
}
