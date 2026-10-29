import { apiKeyLabel, completionsUrl, displayUrl } from './config.js';
import { NorthmarkError } from './errors.js';
import type { LlmClient, LlmMessage, ModelConfig } from './types.js';
import { VERSION } from './version.js';

export function createModelClient(config: ModelConfig): LlmClient {
  return {
    complete(input: LlmMessage): Promise<string> {
      return completeChat(config, input, true);
    },
  };
}

async function completeChat(config: ModelConfig, input: LlmMessage, allowRetry: boolean): Promise<string> {
  const url = completionsUrl(config.baseUrl);
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
    temperature: 0.3,
    max_tokens: 6000,
  };
  if (!allowRetry) {
    delete body.temperature;
    delete body.max_tokens;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  timer.unref?.();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': `Northmark/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new NorthmarkError(
        `The model request timed out after ${config.timeoutMs}ms. Try again, or raise --timeout.`,
      );
    }
    throw mapNetworkError(error, config.baseUrl);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  if (response.status === 400 && allowRetry && /max_tokens|temperature|unsupported|unrecognized|unknown/i.test(raw)) {
    return completeChat(config, input, false);
  }
  if (!response.ok) {
    throw httpError(response.status, raw, config.baseUrl);
  }
  return parseSuccess(raw, response.headers.get('content-type') ?? '');
}

function parseSuccess(raw: string, contentType: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new NorthmarkError('The model returned an empty document.');
  }
  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    throw new NorthmarkError('The model endpoint returned HTML instead of a chat completion. Check --base-url.');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    const hintedJson = contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[');
    throw new NorthmarkError(
      hintedJson
        ? 'The model endpoint returned a response that was not valid JSON.'
        : 'The model endpoint returned a response that was not a chat completion.',
    );
  }
  return extractContent(payload);
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new NorthmarkError('The model response was not a chat completion.');
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new NorthmarkError('The model returned no choices. The endpoint may not speak the chat completions API.');
  }
  const first = choices[0];
  const message = first && typeof first === 'object' ? (first as { message?: { content?: unknown } }).message : undefined;
  const content = message?.content;
  if (typeof content === 'string') {
    if (!content.trim()) throw new NorthmarkError('The model returned an empty document.');
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
    if (!text.trim()) throw new NorthmarkError('The model returned an empty document.');
    return text;
  }
  throw new NorthmarkError('The model response did not include message content.');
}

function httpError(status: number, body: string, baseUrl: string): NorthmarkError {
  const extra = snippet(body);
  const detail = extra ? ` ${extra}` : '';
  if (status === 401 || status === 403) {
    return new NorthmarkError(`The API key was rejected (${status}). Set NORTHMARK_API_KEY or pass --api-key.${detail}`);
  }
  if (status === 404) {
    return new NorthmarkError(
      `The chat completions endpoint was not found (404) at ${displayUrl(baseUrl)}. Check NORTHMARK_BASE_URL. It should be the API base (for example https://mh.bycuvola.com/v1), not the full completions path.`,
    );
  }
  if (status === 429) {
    return new NorthmarkError('The model endpoint is rate limiting requests (429). Wait a moment and try again.');
  }
  if (status >= 500) {
    return new NorthmarkError(`The model endpoint returned ${status}. Try again shortly.${detail}`);
  }
  return new NorthmarkError(`The model endpoint returned ${status}.${detail}`);
}

function mapNetworkError(error: unknown, baseUrl: string): NorthmarkError {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|UND_ERR|ECONNABORTED|fetch failed|network/i.test(`${code} ${message}`)) {
    return new NorthmarkError(
      `Couldn't reach the model endpoint at ${displayUrl(baseUrl)}. Check your connection, or set --base-url / NORTHMARK_BASE_URL.`,
    );
  }
  return new NorthmarkError(`The model request failed: ${message}`);
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const direct = 'code' in error ? String(error.code) : '';
  const cause = 'cause' in error ? error.cause : undefined;
  const nested = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  return direct || nested;
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || /^<!doctype html/i.test(clean) || /^<html/i.test(clean)) return '';
  return clean.length > 240 ? `${clean.slice(0, 240)}…` : clean;
}

export function describeModel(config: ModelConfig): { endpoint: string; model: string; apiKey: string; timeoutMs: number } {
  return {
    endpoint: displayUrl(config.baseUrl),
    model: config.model,
    apiKey: apiKeyLabel(config.apiKey),
    timeoutMs: config.timeoutMs,
  };
}
