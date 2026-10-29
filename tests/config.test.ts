import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSavedModelKey } from '../src/credentials.js';

vi.mock('../src/credentials.js', () => ({ readSavedModelKey: vi.fn() }));
beforeEach(() => vi.mocked(readSavedModelKey).mockReset());
import {
  DEFAULT_API_KEY,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  completionsUrl,
  resolveModelConfig,
} from '../src/config.js';
import { NorthmarkError } from '../src/errors.js';

describe('resolveModelConfig', () => {
  it('defaults to ModelHitch', () => {
    const config = resolveModelConfig({}, {});
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.apiKey).toBe(DEFAULT_API_KEY);
    expect(config.model).toBe(DEFAULT_MODEL);
    expect(config.timeoutMs).toBe(120_000);
  });

  it('uses the saved key only for the default endpoint and preserves explicit overrides', () => {
    vi.mocked(readSavedModelKey).mockReturnValue('saved-test-key');
    expect(resolveModelConfig({}, {}).apiKey).toBe('saved-test-key');
    expect(resolveModelConfig({ apiKey: 'flag-key' }, {}).apiKey).toBe('flag-key');
    expect(resolveModelConfig({}, { NORTHMARK_API_KEY: 'env-key' }).apiKey).toBe('env-key');
    vi.mocked(readSavedModelKey).mockClear();
    expect(resolveModelConfig({ baseUrl: 'https://example.test/v1' }, {}).apiKey).toBe(DEFAULT_API_KEY);
    expect(readSavedModelKey).not.toHaveBeenCalled();
  });

  it('lets flags override env and env override defaults', () => {
    const fromEnv = resolveModelConfig({}, {
      NORTHMARK_BASE_URL: 'https://example.test/v1',
      NORTHMARK_API_KEY: 'env-key',
      NORTHMARK_MODEL: 'env-model',
      NORTHMARK_TIMEOUT_MS: '5000',
    });
    expect(fromEnv).toMatchObject({
      baseUrl: 'https://example.test/v1',
      apiKey: 'env-key',
      model: 'env-model',
      timeoutMs: 5000,
    });

    const fromFlags = resolveModelConfig(
      { baseUrl: 'https://flags.test/v1/', model: 'flag-model', apiKey: 'flag-key', timeoutMs: '9000' },
      { NORTHMARK_MODEL: 'env-model', NORTHMARK_API_KEY: 'env-key' },
    );
    expect(fromFlags).toMatchObject({
      baseUrl: 'https://flags.test/v1',
      apiKey: 'flag-key',
      model: 'flag-model',
      timeoutMs: 9000,
    });
  });

  it('treats blank env values as unset', () => {
    const config = resolveModelConfig({}, { NORTHMARK_API_KEY: '   ', NORTHMARK_MODEL: '' });
    expect(config.apiKey).toBe(DEFAULT_API_KEY);
    expect(config.model).toBe(DEFAULT_MODEL);
  });

  it('rejects bad timeouts and base URLs', () => {
    expect(() => resolveModelConfig({ timeoutMs: '10' }, {})).toThrow(NorthmarkError);
    expect(() => resolveModelConfig({ baseUrl: 'not a url' }, {})).toThrow(/not valid/);
    expect(() => resolveModelConfig({ baseUrl: 'ftp://example.test/v1' }, {})).toThrow(/http/);
  });
});

describe('completionsUrl', () => {
  it('appends the chat completions path once', () => {
    expect(completionsUrl('https://mh.bycuvola.com/v1')).toBe(
      'https://mh.bycuvola.com/v1/chat/completions',
    );
    expect(completionsUrl('https://mh.bycuvola.com/v1/')).toBe(
      'https://mh.bycuvola.com/v1/chat/completions',
    );
    expect(completionsUrl('https://example.test/v1/chat/completions')).toBe(
      'https://example.test/v1/chat/completions',
    );
  });
});
