// Route-level tests for routes/system.js — coverage for endpoints NOT already
// covered by tests/system-routes.test.js (which focuses on the executor-config
// POST secret-encryption path).
//
// Strategy: mock the heavy dependencies (db/uiDb, config, crypto,
// systemSettings, opencode client) with in-memory stand-ins, then mount the
// router on a real Express app and hit it via HTTP on an ephemeral port.
//
// Covers:
//   - GET /api/system/health              (db + hermes API status)
//   - GET /api/system/executors           (cache + opencode probe)
//   - GET /api/system/executor-config/:slug  (hermes-agent + opencode-1230 + 404)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const realFetch = globalThis.fetch.bind(globalThis);

function makeUiDbMock() {
  return {
    prepare() {
      return {
        get: () => undefined,
        all: () => [],
        run: () => ({ changes: 1 }),
      };
    },
    transaction(fn) {
      return (...args) => fn(...args);
    },
  };
}

function makeConfig(overrides = {}) {
  return {
    hermesApiUrl: 'http://hermes.test',
    hermesApiKey: 'k',
    hermesAgentPath: '/tmp',
    hermesPythonPath: 'python3',
    opencodeUrl: 'http://opencode.test',
    opencodeUsername: null,
    opencodePassword: null,
    corsOrigins: [],
    ...overrides,
  };
}

async function buildApp({ configOverrides = {}, getSettingImpl = () => null } = {}) {
  const ui = makeUiDbMock();
  const getSetting = vi.fn(getSettingImpl);
  const upsertSetting = vi.fn();
  const reconfigureOpencodeClient = vi.fn();

  vi.doMock('../config.js', () => ({ default: makeConfig(configOverrides) }));
  vi.doMock('../db/connections.js', () => ({ db: ui, uiDb: ui, hermesDbWrite: ui }));
  vi.doMock('../middleware/security.js', () => ({
    execLimiter: (req, _res, next) => next(),
    apiLimiter: (req, _res, next) => next(),
  }));
  vi.doMock('../lib/cloud/crypto.js', () => ({
    encrypt: () => ({ ct: 'CIPHERTEXT', iv: 'IV', tag: 'TAG' }),
    decrypt: () => '',
  }));
  vi.doMock('../lib/systemSettings.js', () => ({ getSetting, upsertSetting }));
  vi.doMock('../lib/opencode.js', () => ({
    getOpencodeClient: () => ({}),
    opencodeClient: {},
    reconfigureOpencodeClient,
  }));
  vi.resetModules();
  const [{ default: express }, { default: systemRouter }] = await Promise.all([
    import('express'),
    import('../routes/system.js'),
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/system', systemRouter);
  return { app, getSetting, upsertSetting, reconfigureOpencodeClient };
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
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, headers: res.headers, body: json ?? text };
}

describe('routes/system.js — health, executors, executor-config GET', () => {
  let originalFetch;
  let server;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    vi.doUnmock('../config.js');
    vi.doUnmock('../db/connections.js');
    vi.doUnmock('../middleware/security.js');
    vi.doUnmock('../lib/cloud/crypto.js');
    vi.doUnmock('../lib/systemSettings.js');
    vi.doUnmock('../lib/opencode.js');
    vi.resetModules();
    if (server) await close(server);
    server = null;
  });

  describe('GET /api/system/health', () => {
    it('returns ok + hermesApi:ok when upstream returns 2xx', async () => {
      globalThis.fetch = async () => ({ ok: true, status: 200 });
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/health');
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('ok');
      expect(r.body.dbConnected).toBe(true);
      expect(r.body.hermesApi).toBe('ok');
      expect(r.body.hermesApiUrl).toBe('http://hermes.test');
      expect(typeof r.body.timestamp).toBe('number');
    });

    it('returns hermesApi:error on a non-2xx upstream response', async () => {
      globalThis.fetch = async () => ({ ok: false, status: 500 });
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/health');
      expect(r.body.hermesApi).toBe('error');
    });

    it('returns hermesApi:unreachable when fetch throws', async () => {
      globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/health');
      expect(r.body.hermesApi).toBe('unreachable');
    });
  });

  describe('GET /api/system/executors', () => {
    it('returns only hermes when opencode is unreachable', async () => {
      globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executors');
      expect(r.status).toBe(200);
      expect(r.body.executors).toEqual(['hermes']);
    });

    it('includes opencode-1230 when the daemon reports healthy:true', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ healthy: true }),
      });
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executors');
      expect(r.status).toBe(200);
      expect(r.body.executors).toContain('hermes');
      expect(r.body.executors).toContain('opencode-1230');
    });

    it('excludes opencode-1230 when daemon reports healthy:false', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ healthy: false }),
      });
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executors');
      expect(r.body.executors).toEqual(['hermes']);
    });

    it('sends basic auth when opencodeUsername + opencodePassword are configured', async () => {
      let observedAuth = null;
      globalThis.fetch = async (_url, init) => {
        observedAuth = init.headers.Authorization;
        throw new Error('stop'); // short-circuit; we only care about the header
      };
      const { app } = await buildApp({
        configOverrides: { opencodeUsername: 'u', opencodePassword: 'p' },
      });
      server = await listen(app);
      await req(server, 'GET', '/api/system/executors');
      // base64('u:p') === 'dTpw'
      expect(observedAuth).toBe('Basic dTpw');
    });
  });

  describe('GET /api/system/executor-config/:slug', () => {
    it('returns hermes-agent config with hasApiKey=false by default', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executor-config/hermes-agent');
      expect(r.status).toBe(200);
      expect(r.body.slug).toBe('hermes-agent');
      expect(r.body.apiUrl).toBe('http://hermes.test');
      expect(r.body.hasApiKey).toBe(false);
    });

    it('returns hasApiKey=true when all three encrypted fields are set', async () => {
      const { app } = await buildApp({
        getSettingImpl: (key) => {
          const store = {
            executor_hermes_api_key_ct: 'ct',
            executor_hermes_api_key_iv: 'iv',
            executor_hermes_api_key_tag: 'tag',
          };
          return store[key] ?? null;
        },
      });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executor-config/hermes-agent');
      expect(r.status).toBe(200);
      expect(r.body.hasApiKey).toBe(true);
    });

    it('returns opencode-1230 config with hasPassword=false by default', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executor-config/opencode-1230');
      expect(r.status).toBe(200);
      expect(r.body.slug).toBe('opencode-1230');
      expect(r.body.url).toBe('http://opencode.test');
      expect(r.body.username).toBe('');
      expect(r.body.hasPassword).toBe(false);
    });

    it('returns 404 for an unknown slug', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executor-config/skynet');
      expect(r.status).toBe(404);
      expect(String(r.body.error)).toMatch(/Unknown executor slug/);
    });

    it('prefers DB-stored pythonPath + apiUrl over config defaults', async () => {
      const { app } = await buildApp({
        getSettingImpl: (key) => {
          const store = {
            executor_hermes_python_path: '/custom/python3',
            executor_hermes_api_url: 'http://stored.example.com',
          };
          return store[key] ?? null;
        },
      });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/system/executor-config/hermes-agent');
      expect(r.body.pythonPath).toBe('/custom/python3');
      expect(r.body.apiUrl).toBe('http://stored.example.com');
    });
  });
});
