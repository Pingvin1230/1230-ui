// Route-level tests for routes/tududi.js.
//
// Strategy: mock the heavy dependencies (uiDb, config, crypto) with in-memory
// stand-ins, then mount the router on a real Express app and hit it via HTTP
// on an ephemeral port. fetch is globally available in Node 18+.
//
// Covers: GET /health, GET /config, POST /config (validation + save + hot
// reload), POST /test (saved + ad-hoc), proxy pass-through (hop-by-hop
// stripping, 503/502/504 mapping).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

// Capture the real Node fetch BEFORE any test overwrites globalThis.fetch.
// The `req()` helper below uses this to talk to the ephemeral Express server;
// route code (which references `fetch` at call time) still picks up the mock.
const realFetch = globalThis.fetch.bind(globalThis);

// ── in-memory system_settings store + uiDb mock ─────────────────────────────
function makeStore() {
  return new Map(); // key → { value, updated_at }
}

function makeUiDbMock(store) {
  return {
    prepare(sql) {
      return {
        get(key) {
          return store.has(key) ? store.get(key) : undefined;
        },
        run(...args) {
          if (/INSERT OR REPLACE/i.test(sql)) {
            const [key, value, now] = args;
            store.set(key, { key, value, updated_at: now });
            return { changes: 1 };
          }
          return { changes: 0 };
        },
      };
    },
    // better-sqlite3's transaction(fn) returns a synchronous wrapper.
    // Our mock just runs the fn immediately and returns its result.
    transaction(fn) {
      return (...args) => fn(...args);
    },
  };
}

// Mutable config object the router imports. We re-import per test so each
// test gets a fresh config + store.
function makeConfig(overrides = {}) {
  return {
    tududiApiUrl: 'https://todo.example.com',
    tududiApiToken: 'tt_default',
    tududiTimeoutMs: 5000,
    cloudConnectKey: 'test-key',
    ...overrides,
  };
}

async function buildApp(opts = {}) {
  const store = opts.store ?? makeStore();
  const cfg = opts.config ?? makeConfig();
  const crypto = {
    encrypt: vi.fn((s) => ({ ct: `enc:${s}`, iv: 'iv', tag: 'tag' })),
    decrypt: vi.fn(({ ct }) => (typeof ct === 'string' && ct.startsWith('enc:') ? ct.slice(4) : '')),
  };
  vi.doMock('../config.js', () => ({ default: cfg }));
  vi.doMock('../db/connections.js', () => ({
    uiDb: makeUiDbMock(store),
    db: makeUiDbMock(store),
    hermesDbWrite: makeUiDbMock(store),
  }));
  vi.doMock('../lib/cloud/crypto.js', () => crypto);
  vi.doMock('../middleware/security.js', () => ({
    apiLimiter: (req, _res, next) => next(),
    providerLimiter: (req, _res, next) => next(),
  }));
  vi.resetModules();
  const [{ default: express }, { default: tududiRouter }] = await Promise.all([
    import('express'),
    import('../routes/tududi.js'),
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/tududi', tududiRouter);
  return { app, store, cfg, crypto };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function req(server, method, path, body) {
  const { port } = server.address();
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await realFetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep null */
  }
  return { status: res.status, headers: res.headers, body: json ?? text };
}

// ── fetch mock helpers ────────────────────────────────────────────────────────
function makeOk(status = 200, body = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([
      ['content-type', 'application/json'],
      ['set-cookie', 'session=abc'],           // must be stripped by proxy
      ['x-trailer', 'hop-by-hop-test'],         // not in HOP_BY_HOP list, kept
    ]),
    arrayBuffer: async () => {
      const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  });
}

function makeBoom(status, body = { error: 'oops' }) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-type', 'application/json']]),
    arrayBuffer: async () => {
      const buf = Buffer.from(JSON.stringify(body));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  });
}

describe('routes/tududi.js', () => {
  let originalFetch;
  let server;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.doUnmock('../config.js');
    vi.doUnmock('../db/connections.js');
    vi.doUnmock('../lib/cloud/crypto.js');
    vi.doUnmock('../middleware/security.js');
    vi.resetModules();
    if (server) await close(server);
    server = null;
  });

  // ── GET /health ────────────────────────────────────────────────────────────
  describe('GET /api/tududi/health', () => {
    it('returns configured:false when no token is set', async () => {
      const { app } = await buildApp({ config: makeConfig({ tududiApiToken: null }) });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/health');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ configured: false, reachable: false });
    });

    it('returns reachable:true on 2xx from /api/profile', async () => {
      globalThis.fetch = makeOk(200, { user: 'pingvin1230' });
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/health');
      expect(r.body).toEqual({ configured: true, reachable: true, status: 200 });
    });

    it('returns reachable:false on 401 (bad token)', async () => {
      globalThis.fetch = makeBoom(401, { error: 'unauthorized' });
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/health');
      expect(r.body.configured).toBe(true);
      expect(r.body.reachable).toBe(false);
      expect(r.body.status).toBe(401);
    });

    it('returns reachable:false + error on network failure', async () => {
      globalThis.fetch = async () => {
        throw new Error('ENOTFOUND todo.example.com');
      };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/health');
      expect(r.body.configured).toBe(true);
      expect(r.body.reachable).toBe(false);
      expect(r.body.error).toMatch(/ENOTFOUND/);
    });
  });

  // ── GET /config ─────────────────────────────────────────────────────────────
  describe('GET /api/tududi/config', () => {
    it('returns apiUrl + hasToken:true when token is set', async () => {
      const { app } = await buildApp({ config: makeConfig({ tududiApiUrl: 'https://x.example.com' }) });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/config');
      expect(r.body).toEqual({ apiUrl: 'https://x.example.com', hasToken: true });
    });

    it('returns hasToken:false when token is null', async () => {
      const { app } = await buildApp({ config: makeConfig({ tududiApiToken: null }) });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/config');
      expect(r.body.hasToken).toBe(false);
    });
  });

  // ── POST /config ────────────────────────────────────────────────────────────
  describe('POST /api/tududi/config', () => {
    it('returns 400 when apiUrl is missing', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/config', {});
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/apiUrl is required/i);
    });

    it('returns 400 when apiUrl is not a valid URL', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/config', { apiUrl: 'not-a-url' });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/valid URL/i);
    });

    it('saves URL only when apiToken is omitted (preserves existing token)', async () => {
      const { app, store, cfg } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/config', { apiUrl: 'https://new.example.com' });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ success: true });
      // URL updated in both DB and in-memory config
      expect(store.get('tududi_api_url').value).toBe('https://new.example.com');
      expect(cfg.tududiApiUrl).toBe('https://new.example.com');
      // No token rows touched
      expect(store.has('tududi_api_token_ct')).toBe(false);
      // In-memory token preserved
      expect(cfg.tududiApiToken).toBe('tt_default');
    });

    it('encrypts and stores a non-empty apiToken, mutates config in-memory', async () => {
      const { app, store, cfg, crypto } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/config', {
        apiUrl: 'https://new.example.com',
        apiToken: 'tt_secret',
      });
      expect(r.status).toBe(200);
      expect(crypto.encrypt).toHaveBeenCalledTimes(1);
      expect(crypto.encrypt).toHaveBeenCalledWith('tt_secret');
      expect(store.get('tududi_api_token_ct').value).toBe('enc:tt_secret');
      expect(cfg.tududiApiToken).toBe('tt_secret');
    });

    it('clears the stored token when apiToken is ""', async () => {
      const { app, store, cfg } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/config', {
        apiUrl: 'https://x.example.com',
        apiToken: '',
      });
      expect(r.status).toBe(200);
      expect(store.get('tududi_api_token_ct').value).toBe('');
      expect(cfg.tududiApiToken).toBeNull();
    });

    it('returns 503 when saving a token but CLOUD_CONNECT_KEY is unset', async () => {
      const { app } = await buildApp({ config: makeConfig({ cloudConnectKey: null }) });
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/config', {
        apiUrl: 'https://x.example.com',
        apiToken: 'tt_secret',
      });
      expect(r.status).toBe(503);
      expect(r.body.error).toMatch(/CLOUD_CONNECT_KEY/i);
    });

    it('trims trailing whitespace in apiUrl', async () => {
      const { app, store } = await buildApp();
      server = await listen(app);
      await req(server, 'POST', '/api/tududi/config', { apiUrl: '  https://x.example.com  ' });
      expect(store.get('tududi_api_url').value).toBe('https://x.example.com');
    });
  });

  // ── POST /test ──────────────────────────────────────────────────────────────
  describe('POST /api/tududi/test', () => {
    it('uses saved config when body is empty', async () => {
      globalThis.fetch = makeOk(200, {});
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/test', {});
      expect(r.body).toEqual({ ok: true, status: 200 });
    });

    it('probes the supplied apiUrl + apiToken without saving', async () => {
      let observedUrl;
      let observedAuth;
      globalThis.fetch = async (url, init) => {
        observedUrl = url;
        observedAuth = init.headers.authorization;
        return makeOk(200, {})();
      };
      const { app, store, cfg } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/test', {
        apiUrl: 'https://candidate.example.com',
        apiToken: 'tt_candidate',
      });
      expect(r.body.ok).toBe(true);
      expect(observedUrl).toBe('https://candidate.example.com/api/profile');
      expect(observedAuth).toBe('Bearer tt_candidate');
      // Critical: nothing was persisted
      expect(store.has('tududi_api_url')).toBe(false);
      expect(store.has('tududi_api_token_ct')).toBe(false);
      expect(cfg.tududiApiUrl).toBe('https://todo.example.com');
      expect(cfg.tududiApiToken).toBe('tt_default');
    });

    it('returns ok:false with 401 status from upstream', async () => {
      globalThis.fetch = makeBoom(401);
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/test', {});
      expect(r.body).toEqual({ ok: false, status: 401 });
    });

    it('returns ok:false with error message on network failure', async () => {
      globalThis.fetch = async () => {
        throw new Error('connect ECONNREFUSED');
      };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/test', {});
      expect(r.body.ok).toBe(false);
      expect(r.body.error).toMatch(/ECONNREFUSED/);
    });

    it('returns ok:false without calling fetch when saved token is null', async () => {
      let called = 0;
      globalThis.fetch = async () => {
        called++;
        return makeOk(200)();
      };
      const { app } = await buildApp({ config: makeConfig({ tududiApiToken: null }) });
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/test', {});
      expect(r.body.ok).toBe(false);
      expect(r.body.error).toMatch(/token/i);
      expect(called).toBe(0);
    });
  });

  // ── proxy pass-through ──────────────────────────────────────────────────────
  describe('proxy pass-through (ALL /api/tududi/*)', () => {
    it('returns 503 when no token is configured', async () => {
      const { app } = await buildApp({ config: makeConfig({ tududiApiToken: null }) });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/tasks');
      expect(r.status).toBe(503);
      expect(r.body.error.type).toBe('tududi_not_configured');
    });

    it('forwards to <apiUrl>/api/<rest> with Authorization: Bearer <token>', async () => {
      let observedUrl;
      let observedInit;
      globalThis.fetch = async (url, init) => {
        observedUrl = url;
        observedInit = init;
        return makeOk(200, { tasks: [] })();
      };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/tasks?status=open');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ tasks: [] });
      expect(observedUrl).toBe('https://todo.example.com/api/tasks?status=open');
      expect(observedInit.method).toBe('GET');
      expect(observedInit.headers.authorization).toBe('Bearer tt_default');
    });

    it('strips set-cookie and authorization from upstream response headers', async () => {
      globalThis.fetch = makeOk(200, { ok: true });
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/tasks');
      expect(r.headers.get('set-cookie')).toBeNull();
      // x-trailer is not in HOP_BY_HOP — should be preserved
      expect(r.headers.get('x-trailer')).toBe('hop-by-hop-test');
    });

    it('returns 502 on network error from upstream', async () => {
      globalThis.fetch = async () => {
        throw new Error('ECONNREFUSED');
      };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/tasks');
      expect(r.status).toBe(502);
      expect(r.body.error.type).toBe('tududi_unreachable');
    });

    it('returns 504 when upstream aborts (timeout)', async () => {
      globalThis.fetch = async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/tududi/tasks');
      expect(r.status).toBe(504);
      expect(r.body.error.type).toBe('tududi_timeout');
    });

    it('forwards request body on POST and returns upstream status', async () => {
      let observedBody;
      globalThis.fetch = async (_url, init) => {
        observedBody = init.body;
        return makeBoom(400, { error: 'Invalid tag' })();
      };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/tududi/task', { name: 'New task' });
      expect(r.status).toBe(400);
      expect(observedBody).toBe(JSON.stringify({ name: 'New task' }));
      expect(r.body).toEqual({ error: 'Invalid tag' });
    });
  });
});
