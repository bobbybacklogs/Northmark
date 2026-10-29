import { NorthmarkError } from './errors.js';
import type { ModelConfig } from './types.js';

export const DEFAULT_BASE_URL = 'https://api.genoventures.com/v1';
export const DEFAULT_API_KEY = 'MHK-123';
export const DEFAULT_MODEL = 'modelhitch/auto';
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_BYTES = 100_000;
export const MIN_MAX_BYTES = 4_000;
export const DEFAULT_OUT_DIR = 'docs';

export interface ModelFlags {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: string;
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new NorthmarkError(`The model base URL is not valid: ${input}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NorthmarkError('The model base URL must start with http:// or https://.');
  }
  if (!url.host) {
    throw new NorthmarkError(`The model base URL is not valid: ${input}`);
  }
  return trimmed;
}

export function completionsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

export function displayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

export function resolveModelConfig(flags: ModelFlags = {}, env: NodeJS.ProcessEnv = process.env): ModelConfig {
  const baseUrl = normalizeBaseUrl(first(flags.baseUrl, env.NORTHMARK_BASE_URL, DEFAULT_BASE_URL));
  const apiKey = first(flags.apiKey, env.NORTHMARK_API_KEY, DEFAULT_API_KEY).trim();
  const model = first(flags.model, env.NORTHMARK_MODEL, DEFAULT_MODEL).trim();
  if (!apiKey) {
    throw new NorthmarkError('The API key is empty. Set NORTHMARK_API_KEY or pass --api-key.');
  }
  if (!model) {
    throw new NorthmarkError('The model id is empty. Set NORTHMARK_MODEL or pass --model.');
  }
  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs: parseTimeout(flags.timeoutMs, env.NORTHMARK_TIMEOUT_MS),
  };
}

export function parseTimeout(flag: string | undefined, envValue: string | undefined): number {
  const raw = firstOptional(flag, envValue);
  if (raw == null) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1000) {
    throw new NorthmarkError('Timeout must be a number of milliseconds, at least 1000.');
  }
  return Math.floor(value);
}

export function parseMaxBytes(flag: string | undefined, envValue: string | undefined): number {
  const raw = firstOptional(flag, envValue);
  if (raw == null) return DEFAULT_MAX_BYTES;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_MAX_BYTES) {
    throw new NorthmarkError(`--max-bytes must be a number of bytes, at least ${MIN_MAX_BYTES}.`);
  }
  return Math.floor(value);
}

export function apiKeyLabel(key: string): string {
  return key === DEFAULT_API_KEY ? 'default' : 'provided';
}

function first(flag: string | undefined, envValue: string | undefined, fallback: string): string {
  const picked = firstOptional(flag, envValue);
  return picked ?? fallback;
}

function firstOptional(flag: string | undefined, envValue: string | undefined): string | undefined {
  if (flag != null && flag.trim() !== '') return flag.trim();
  if (envValue != null && envValue.trim() !== '') return envValue.trim();
  return undefined;
}
