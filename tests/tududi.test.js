// Tududi probe helper — unit tests with mocked global.fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeTududi } from '../lib/tududi.js';

const makeFetch = (impl) => {
  const fn = vi.fn(impl);
  globalThis.fetch = fn;
  return fn;
};

const okResponse = (status = 200) => ({ ok: status >= 200 && status < 300, status });

describe('probeTududi', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('returns ok:false without a token', async () => {
    const fetch = makeFetch(async () => okResponse(200));
    const result = await probeTududi('https://todo.example.com', '');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.error).toMatch(/token/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns ok:false without a URL', async () => {
    const fetch = makeFetch(async () => okResponse(200));
    const result = await probeTududi('', 'tt_abc');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/url/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports ok:true on 2xx from /api/profile', async () => {
    const fetch = makeFetch(async (url, init) => {
      expect(url).toBe('https://todo.example.com/api/profile');
      expect(init.headers.authorization).toBe('Bearer tt_abc');
      return okResponse(200);
    });
    const result = await probeTududi('https://todo.example.com', 'tt_abc');
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('strips a trailing slash from the URL', async () => {
    const fetch = makeFetch(async (url) => {
      expect(url).toBe('https://todo.example.com/api/profile');
      return okResponse(200);
    });
    await probeTududi('https://todo.example.com/', 'tt_abc');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports ok:false on 401 (bad token)', async () => {
    makeFetch(async () => okResponse(401));
    const result = await probeTududi('https://todo.example.com', 'tt_bad');
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it('reports ok:false on 500', async () => {
    makeFetch(async () => okResponse(500));
    const result = await probeTududi('https://todo.example.com', 'tt_abc');
    expect(result).toEqual({ ok: false, status: 500 });
  });

  it('reports timeout as ok:false with a timeout message (never throws)', async () => {
    makeFetch(async (_url, init) => {
      // emulate AbortController firing
      const signal = init.signal;
      if (signal) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        signal.throwIfAborted?.();
        throw err;
      }
      return okResponse(200);
    });
    const result = await probeTududi('https://todo.example.com', 'tt_abc', 50);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(typeof result.error).toBe('string');
  });

  it('reports network error as ok:false with the message (never throws)', async () => {
    makeFetch(async () => {
      const err = new Error('ENOTFOUND todo.example.com');
      throw err;
    });
    const result = await probeTududi('https://todo.example.com', 'tt_abc');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.error).toBe('ENOTFOUND todo.example.com');
  });

  it('uses the custom timeout argument', async () => {
    const fetch = makeFetch(async () => okResponse(200));
    await probeTududi('https://todo.example.com', 'tt_abc', 1234);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
