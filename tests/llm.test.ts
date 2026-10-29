import { afterEach, describe, expect, it, vi } from 'vitest';
import { NorthmarkError } from '../src/errors.js';
import { createModelClient } from '../src/llm.js';
import type { ModelConfig } from '../src/types.js';

const config: ModelConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'mh-secret-key-should-not-leak',
  model: 'modelhitch/auto',
  timeoutMs: 5_000,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createModelClient', () => {
  it('posts a chat completion and reads string content', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://example.test/v1/chat/completions');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer mh-secret-key-should-not-leak' });
      const body = JSON.parse(String(init.body)) as { model: string; messages: { role: string }[] };
      expect(body.model).toBe('modelhitch/auto');
      expect(body.messages.map((message) => message.role)).toEqual(['system', 'user']);
      return new Response(JSON.stringify({ choices: [{ message: { content: '# Hello\n' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const text = await createModelClient(config).complete({ system: 'rules', user: 'context' });
    expect(text).toBe('# Hello\n');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reads array message content', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      choices: [{ message: { content: [{ type: 'text', text: '# From parts' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(createModelClient(config).complete({ system: 's', user: 'u' })).resolves.toBe('# From parts');
  });

  it('retries once when the server rejects optional fields', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push(body);
      if ('max_tokens' in body) {
        return new Response(JSON.stringify({ error: { message: 'unsupported max_tokens' } }), { status: 400 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '# Retried' } }] }), { status: 200 });
    });
    await expect(createModelClient(config).complete({ system: 's', user: 'u' })).resolves.toBe('# Retried');
    expect(calls).toHaveLength(2);
  });

  it('explains HTTP failures without echoing the API key', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 401 }));
    const error = await createModelClient({
      ...config,
      baseUrl: 'https://user:secret-pass@example.test/v1',
    }).complete({ system: 's', user: 'u' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NorthmarkError);
    expect((error as Error).message).toMatch(/401/);
    expect((error as Error).message).not.toContain('mh-secret-key-should-not-leak');
    expect((error as Error).message).not.toContain('secret-pass');
  });

  it('explains a down endpoint', async () => {
    vi.stubGlobal('fetch', async () => {
      const error = new TypeError('fetch failed');
      (error as { cause?: { code: string } }).cause = { code: 'ECONNREFUSED' };
      throw error;
    });
    await expect(createModelClient(config).complete({ system: 's', user: 'u' })).rejects.toThrow(/Couldn't reach/);
  });

  it('explains timeouts', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    await expect(createModelClient({ ...config, timeoutMs: 20 }).complete({ system: 's', user: 'u' }))
      .rejects.toThrow(/timed out/i);
  });

  it('rejects a 200 that is not a chat completion', async () => {
    vi.stubGlobal('fetch', async () => new Response('<<<not-json-garbage>>>', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }));
    await expect(createModelClient(config).complete({ system: 's', user: 'u' }))
      .rejects.toThrow(/not a chat completion/);
  });

  it('accepts a chat completion even when the content type is text/plain', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      choices: [{ message: { content: '# Hello\n' } }],
    }), { status: 200, headers: { 'content-type': 'text/plain' } }));
    await expect(createModelClient(config).complete({ system: 's', user: 'u' })).resolves.toBe('# Hello\n');
  });

  it('explains invalid JSON, empty choices, and HTML bodies', async () => {
    vi.stubGlobal('fetch', async () => new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(createModelClient(config).complete({ system: 's', user: 'u' })).rejects.toThrow(/not valid JSON/);

    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(createModelClient(config).complete({ system: 's', user: 'u' })).rejects.toThrow(/no choices/);

    vi.stubGlobal('fetch', async () => new Response('<!DOCTYPE html><html></html>', { status: 200 }));
    await expect(createModelClient(config).complete({ system: 's', user: 'u' })).rejects.toThrow(/HTML/);
  });
});
