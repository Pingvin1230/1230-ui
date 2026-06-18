// Route-level tests for routes/system.js — focuses on the executor-config
// secret-encryption behaviour (Task A3): a failing encrypt() must NOT fall
// back to storing the plaintext secret; it must respond 500 and persist
// nothing.
//
// Strategy: mock the heavy dependencies (db/uiDb, config, crypto,
// systemSettings, opencode client) with in-memory stand-ins, then mount the
// router on a real Express app and hit it via HTTP on an ephemeral port.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const realFetch = globalThis.fetch.bind(globalThis);

// ── in-memory uiDb mock ─────────────────────────────────────────────────────
// transaction(fn) runs fn synchronously (mirrors better-sqlite3). We spy on
// prepare().run() via upsertSetting so tests can assert nothing was persisted.
function makeUiDbMock() {
  const store = new Map();
  return {
    store,
    db: {
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
    },
  };
}

function makeConfig() {
  return {
    hermesApiUrl: 'http://hermes.test',
    hermesApiKey: 'k',
    hermesAgentPath: '/tmp',
    hermesPythonPath: 'python3',
    opencodeUrl: 'http://opencode.test',
    opencodeUsername: null,
    opencodePassword: null,
    corsOrigins: [],
  };
}

async function buildApp({ encryptImpl }) {
  const ui = makeUiDbMock();
  const upsertSetting = vi.fn();
  const getSetting = vi.fn(() => null);
  const reconfigureOpencodeClient = vi.fn();

  vi.doMock('../config.js', () => ({ default: makeConfig() }));
  vi.doMock('../db/connections.js', () => ({ db: ui.db, uiDb: ui.db, hermesDbWrite: ui.db }));
  vi.doMock('../middleware/security.js', () => ({
    execLimiter: (req, _res, next) => next(),
    apiLimiter: (req, _res, next) => next(),
  }));
  vi.doMock('../lib/cloud/crypto.js', () => ({
    encrypt: encryptImpl,
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
  return { app, upsertSetting, reconfigureOpencodeClient };
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
  return { status: res.status, body: json ?? text };
}

describe('routes/system.js — executor-config encryption (A3)', () => {
  let server;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
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

  describe('POST /api/system/executor-config/hermes-agent', () => {
    it('returns 500 and persists nothing when encrypt() throws', async () => {
      const { app, upsertSetting } = await buildApp({
        encryptImpl: () => { throw new Error('CLOUD_CONNECT_KEY is not set'); },
      });
      server = await listen(app);
      const r = await req(server, 'POST', '/api/system/executor-config/hermes-agent', {
        pythonPath: 'python3',
        apiUrl: 'http://x',
        apiKey: 'super-secret',
      });
      expect(r.status).toBe(500);
      expect(r.body.error).toMatch(/Failed to encrypt secret/);
      // Nothing should have been persisted (transaction never ran).
      expect(upsertSetting).not.toHaveBeenCalled();
    });

    it('persists encrypted secret on success', async () => {
      const { app, upsertSetting } = await buildApp({
        encryptImpl: () => ({ ct: 'CIPHERTEXT', iv: 'IV', tag: 'TAG' }),
      });
      server = await listen(app);
      const r = await req(server, 'POST', '/api/system/executor-config/hermes-agent', {
        pythonPath: 'python3',
        apiUrl: 'http://x',
        apiKey: 'super-secret',
      });
      expect(r.status).toBe(200);
      const keys = upsertSetting.mock.calls.map((c) => c[0]);
      expect(keys).toContain('executor_hermes_api_key_ct');
      // The stored ciphertext must NOT be the plaintext secret.
      const ctCall = upsertSetting.mock.calls.find((c) => c[0] === 'executor_hermes_api_key_ct');
      expect(ctCall[1]).not.toBe('super-secret');
    });
  });

  describe('POST /api/system/executor-config/opencode-1230', () => {
    it('returns 500, persists nothing, and does not reconfigure the client when encrypt() throws', async () => {
      const { app, upsertSetting, reconfigureOpencodeClient } = await buildApp({
        encryptImpl: () => { throw new Error('CLOUD_CONNECT_KEY is not set'); },
      });
      server = await listen(app);
      const r = await req(server, 'POST', '/api/system/executor-config/opencode-1230', {
        url: 'http://opencode.new',
        username: 'u',
        password: 'super-secret',
      });
      expect(r.status).toBe(500);
      expect(r.body.error).toMatch(/Failed to encrypt secret/);
      expect(upsertSetting).not.toHaveBeenCalled();
      expect(reconfigureOpencodeClient).not.toHaveBeenCalled();
    });

    it('reconfigures the opencode client on success', async () => {
      const { app, reconfigureOpencodeClient } = await buildApp({
        encryptImpl: () => ({ ct: 'CIPHERTEXT', iv: 'IV', tag: 'TAG' }),
      });
      server = await listen(app);
      const r = await req(server, 'POST', '/api/system/executor-config/opencode-1230', {
        url: 'http://opencode.new',
        username: 'u',
        password: 'super-secret',
      });
      expect(r.status).toBe(200);
      expect(reconfigureOpencodeClient).toHaveBeenCalledTimes(1);
    });
  });
});
