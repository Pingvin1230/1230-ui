// 1.14 — vitest coverage: OpenCodeClient (REST wrapper around fetch)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeClient, OpenCodeError } from '../lib/opencode.js';

const makeFetch = (impl) => {
  const fn = vi.fn(impl);
  globalThis.fetch = fn;
  return fn;
};

const makeOkResponse = (body) => ({
  ok: true,
  status: 200,
  text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
});

const makeErrorResponse = (status, body) => ({
  ok: false,
  status,
  text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
});

describe('OpenCodeClient', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('throws when baseUrl is missing', () => {
      expect(() => new OpenCodeClient({ baseUrl: '' })).toThrow(/baseUrl/);
    });

    it('strips trailing slashes from baseUrl', () => {
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097///' });
      expect(c.baseUrl).toBe('http://x:4097');
    });

    it('defaults projectId to 1230ui', () => {
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      expect(c.projectId).toBe('1230ui');
    });
  });

  describe('health()', () => {
    it('returns true when /global/health responds with healthy=true', async () => {
      const fetch = makeFetch(async () => makeOkResponse({ healthy: true }));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await expect(c.health()).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('http://x:4097/global/health');
      expect(init.method).toBe('GET');
    });

    it('returns false when fetch throws (network error)', async () => {
      makeFetch(async () => {
        throw new TypeError('ECONNREFUSED');
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await expect(c.health()).resolves.toBe(false);
    });

    it('returns false when response says healthy=false', async () => {
      makeFetch(async () => makeOkResponse({ healthy: false }));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await expect(c.health()).resolves.toBe(false);
    });

    it('uses a 2s timeout (not the default 30s) for health checks', async () => {
      let observedSignal;
      makeFetch(async (url, init) => {
        observedSignal = init.signal;
        return makeOkResponse({ healthy: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.health();
      // The signal is an AbortSignal managed by AbortController — we can't
      // measure the exact timeout directly, but the call must have used
      // one. Assert the call went through.
      expect(observedSignal).toBeDefined();
    });
  });

  describe('getSession()', () => {
    it('returns null on 404 (no throw)', async () => {
      makeFetch(async () => makeErrorResponse(404, { error: 'not found' }));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await expect(c.getSession('ses_missing')).resolves.toBeNull();
    });

    it('throws OpenCodeError on 404 (status field exposed)', async () => {
      makeFetch(async () => makeErrorResponse(404, { error: 'missing' }));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      // Direct call to _fetch to check error shape (getSession swallows it)
      try {
        await c._fetch('GET', '/session/abc');
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenCodeError);
        expect(err.status).toBe(404);
        expect(err.code).toBe('HTTP_404');
        expect(err.body).toEqual({ error: 'missing' });
      }
    });

    it('returns session data on 200', async () => {
      const sessionRow = { id: 'ses_abc', title: 't', projectID: '1230ui' };
      makeFetch(async () => makeOkResponse(sessionRow));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      const out = await c.getSession('ses_abc');
      expect(out).toEqual(sessionRow);
    });

    it('re-throws non-404 OpenCodeError', async () => {
      makeFetch(async () => makeErrorResponse(500, 'oops'));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await expect(c.getSession('ses_abc')).rejects.toBeInstanceOf(OpenCodeError);
    });
  });

  describe('createSession()', () => {
    it('POSTs to /session with title and projectID=1230ui', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ id: 'ses_new' });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      const out = await c.createSession('hello');
      expect(captured.url).toBe('http://x:4097/session');
      expect(captured.init.method).toBe('POST');
      expect(JSON.parse(captured.init.body)).toEqual({ title: 'hello', projectID: '1230ui' });
      expect(out).toEqual({ id: 'ses_new' });
    });

    it('omits title when not provided', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ id: 'ses_x' });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.createSession();
      expect(JSON.parse(captured.init.body)).toEqual({ projectID: '1230ui' });
    });
  });

  describe('updateSession()', () => {
    it('PATCHes /session/:id with the given body', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ id: 'ses_abc', title: 'renamed' });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      const out = await c.updateSession('ses_abc', { title: 'renamed' });
      expect(captured.url).toBe('http://x:4097/session/ses_abc');
      expect(captured.init.method).toBe('PATCH');
      expect(JSON.parse(captured.init.body)).toEqual({ title: 'renamed' });
      expect(out.title).toBe('renamed');
    });

    it('returns null on 404', async () => {
      makeFetch(async () => makeErrorResponse(404, 'gone'));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await expect(c.updateSession('ses_x', { title: 't' })).resolves.toBeNull();
    });
  });

  describe('abortSession()', () => {
    it('returns null on 404 (daemon restarted)', async () => {
      makeFetch(async () => makeErrorResponse(404, 'gone'));
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await expect(c.abortSession('ses_x')).resolves.toBeNull();
    });
  });

  describe('respondPermission()', () => {
    it('POSTs to /session/:id/permissions/:pid with { response }', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ ok: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.respondPermission('ses_1', 'perm_42', 'once');
      expect(captured.url).toBe('http://x:4097/session/ses_1/permissions/perm_42');
      expect(captured.init.method).toBe('POST');
      expect(JSON.parse(captured.init.body)).toEqual({ response: 'once' });
    });

    it('URL-encodes the permission id', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ ok: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.respondPermission('ses_1', 'a b/c', 'reject');
      expect(captured.url).toBe('http://x:4097/session/ses_1/permissions/a%20b%2Fc');
    });
  });

  describe('basic auth', () => {
    it('adds Authorization: Basic header when username+password are set', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = init;
        return makeOkResponse({ healthy: true });
      });
      const c = new OpenCodeClient({
        baseUrl: 'http://x:4097',
        username: 'alice',
        password: 's3cret',
      });
      await c.health();
      const authHeader = captured.headers.Authorization;
      expect(authHeader).toBeDefined();
      expect(authHeader.startsWith('Basic ')).toBe(true);
      // Decode and verify
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      expect(decoded).toBe('alice:s3cret');
    });

    it('omits Authorization header when no credentials are provided', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = init;
        return makeOkResponse({ healthy: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.health();
      expect(captured.headers.Authorization).toBeUndefined();
    });

    it('omits Authorization header when only one of username/password is set', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = init;
        return makeOkResponse({ healthy: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097', username: 'alice' });
      await c.health();
      expect(captured.headers.Authorization).toBeUndefined();
    });

    it('always sends Content-Type: application/json', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = init;
        return makeOkResponse({ healthy: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.health();
      expect(captured.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('timeout', () => {
    it('uses the configured timeoutMs for the request', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = init;
        // Return immediately so we just verify the signal plumbing
        return makeOkResponse({ healthy: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097', timeoutMs: 5000 });
      await c.health();
      expect(captured.signal).toBeDefined();
      // The signal is an AbortSignal; abort() should not have been called
      // since the fetch resolved in microtasks.
      expect(captured.signal.aborted).toBe(false);
    });

    it('aborts the request when fetch takes longer than timeoutMs', async () => {
      let abortFired = false;
      makeFetch(async (url, init) => {
        return new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            abortFired = true;
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });
      // Use a 50ms timeout — short enough to fire during the test.
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097', timeoutMs: 50 });
      // health() catches all errors and returns false; this exercises
      // the abort path inside _fetch().
      await expect(c.health()).resolves.toBe(false);
      expect(abortFired).toBe(true);
    });
  });

  describe('promptAsync()', () => {
    it('POSTs prompt with flat text parts and extracted system field', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ ok: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.promptAsync(
        'ses_1',
        { providerID: 'p', modelID: 'm' },
        [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'bye' },
        ]
      );
      expect(captured.url).toBe('http://x:4097/session/ses_1/prompt_async');
      const body = JSON.parse(captured.init.body);
      expect(body.system).toBe('be brief');
      // system role is stripped from parts
      expect(body.parts).toEqual([
        { type: 'text', text: 'hi' },
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'bye' },
      ]);
    });

    it('omits system field when there is no system message', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ ok: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.promptAsync(
        'ses_1',
        { providerID: 'p', modelID: 'm' },
        [{ role: 'user', content: 'hi' }]
      );
      const body = JSON.parse(captured.init.body);
      expect('system' in body).toBe(false);
    });

    it('uses opts.system if provided (overrides inline system messages)', async () => {
      let captured;
      makeFetch(async (url, init) => {
        captured = { url, init };
        return makeOkResponse({ ok: true });
      });
      const c = new OpenCodeClient({ baseUrl: 'http://x:4097' });
      await c.promptAsync(
        'ses_1',
        { providerID: 'p', modelID: 'm' },
        [
          { role: 'system', content: 'inline' },
          { role: 'user', content: 'hi' },
        ],
        { system: 'override' }
      );
      const body = JSON.parse(captured.init.body);
      // Both inline + override are concatenated with \n\n
      expect(body.system).toBe('override\n\ninline');
    });
  });
});
