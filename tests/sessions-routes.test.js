// Route-level tests for routes/sessions.js.
//
// Strategy: mock the heavy dependencies (db/uiDb/hermesDbWrite, config,
// middleware, opencode client) with in-memory stand-ins, then mount the
// router on a real Express app and hit it via HTTP on an ephemeral port.
// fetch is globally available in Node 18+.
//
// Covers the `executor` field surfaced on session API responses and the
// ?executor= query filter on GET /api/sessions.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture the real Node fetch BEFORE any test overwrites globalThis.fetch.
// The `req()` helper below uses this to talk to the ephemeral Express server;
// route code (which references `fetch` at call time) still picks up any mock.
const realFetch = globalThis.fetch.bind(globalThis);

// ── seed data ───────────────────────────────────────────────────────────────
// sess_a → no assistant (free-chat hermes default)
// sess_b → assistant 1 (opencode-1230)
// sess_c → assistant 2 (hermes)
function makeSeed() {
  return {
    sessions: [
      { id: 'sess_a', title: 'A', source: 'webui', model: 'm1', startedAt: 1000, endedAt: null, messageCount: 1, inputTokens: 0, outputTokens: 0, preview: null, lastMessageAt: null },
      { id: 'sess_b', title: 'B', source: 'webui', model: 'm2', startedAt: 2000, endedAt: null, messageCount: 2, inputTokens: 0, outputTokens: 0, preview: null, lastMessageAt: null },
      { id: 'sess_c', title: 'C', source: 'webui', model: 'm3', startedAt: 3000, endedAt: null, messageCount: 3, inputTokens: 0, outputTokens: 0, preview: null, lastMessageAt: null },
    ],
    session_meta: [
      { session_id: 'sess_b', pinned: 0, archived: 0, assistant_id: 1 },
      { session_id: 'sess_c', pinned: 0, archived: 0, assistant_id: 2 },
      // sess_a intentionally absent → no assistant → 'hermes'
    ],
    assistants: [
      { id: 1, name: 'OC', description: null, color: null, icon: null, model_id: null, style: null, depth: null, system_prompt: null, executor: 'opencode-1230', is_archived: 0, archived_at: null, created_at: 1, updated_at: 1 },
      { id: 2, name: 'Hermes', description: null, color: null, icon: null, model_id: null, style: null, depth: null, system_prompt: null, executor: 'hermes', is_archived: 0, archived_at: null, created_at: 1, updated_at: 1 },
    ],
    session_files: [],
  };
}

// ── in-memory db mock ───────────────────────────────────────────────────────
// prepare() returns an object whose .all()/.get()/.run() dispatch based on the
// SQL string. Mirrors the small subset of queries issued by the GET / and
// GET /:id handlers in routes/sessions.js.
function makeDbMock(seed) {
  return {
    prepare(sql) {
      return {
        all(...args) {
          // sessions list (FROM sessions s ... ORDER BY)
          if (/FROM sessions\s/i.test(sql) && /ORDER BY/i.test(sql)) {
            return seed.sessions;
          }
          // all session_meta rows (no WHERE)
          if (/FROM session_meta/i.test(sql) && !/WHERE/i.test(sql)) {
            return seed.session_meta;
          }
          // assistants bulk by id IN (?,?,...)
          if (/FROM assistants/i.test(sql) && /IN\s*\(/i.test(sql)) {
            return seed.assistants.filter((a) => args.includes(a.id));
          }
          // file counts per session
          if (/FROM session_files/i.test(sql) && /GROUP BY session_id/i.test(sql)) {
            return [];
          }
          return [];
        },
        get(...args) {
          // single session by id
          if (/FROM sessions/i.test(sql) && /WHERE id\s*=\s*\?/i.test(sql)) {
            return seed.sessions.find((s) => s.id === args[0]) ?? undefined;
          }
          // single session_meta by session_id
          if (/FROM session_meta/i.test(sql) && /WHERE session_id\s*=\s*\?/i.test(sql)) {
            return seed.session_meta.find((m) => m.session_id === args[0]) ?? undefined;
          }
          // single assistant by id
          if (/FROM assistants/i.test(sql) && /WHERE id\s*=\s*\?/i.test(sql)) {
            return seed.assistants.find((a) => a.id === args[0]) ?? undefined;
          }
          return undefined;
        },
        run(...args) {
          const sqlLower = sql.toLowerCase();
          // Pin/archive upsert: mutate only the targeted column on the
          // existing session_meta row so we can assert the binding survives.
          if (/on conflict\(session_id\)/.test(sqlLower) && /session_meta/.test(sqlLower)) {
            const sessionId = args[0];
            const row = seed.session_meta.find((m) => m.session_id === sessionId);
            if (row) {
              if (/pinned/.test(sqlLower)) row.pinned = args[1];
              if (/archived/.test(sqlLower)) row.archived = args[1];
            } else if (/pinned/.test(sqlLower)) {
              seed.session_meta.push({ session_id: sessionId, pinned: args[1] });
            } else if (/archived/.test(sqlLower)) {
              seed.session_meta.push({ session_id: sessionId, archived: args[1] });
            }
          }
          return { changes: 1 };
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

function makeConfig() {
  return {
    hermesApiUrl: 'http://x',
    hermesApiKey: 'k',
    hermesDbPath: 'x',
    hermesPythonPath: 'python3',
    scripts: { saveMessages: 'x' },
  };
}

async function buildApp() {
  const seed = makeSeed();
  const db = makeDbMock(seed);
  vi.doMock('../config.js', () => ({ default: makeConfig() }));
  vi.doMock('../db/connections.js', () => ({ db, uiDb: db, hermesDbWrite: db }));
  vi.doMock('../middleware/security.js', () => ({
    apiLimiter: (req, _res, next) => next(),
    providerLimiter: (req, _res, next) => next(),
  }));
  vi.doMock('../lib/opencode.js', () => ({ opencodeClient: {} }));
  vi.resetModules();
  const [{ default: express }, { default: sessionsRouter }] = await Promise.all([
    import('express'),
    import('../routes/sessions.js'),
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', sessionsRouter);
  return { app, seed };
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

describe('routes/sessions.js', () => {
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
    vi.doUnmock('../middleware/security.js');
    vi.doUnmock('../lib/opencode.js');
    vi.resetModules();
    if (server) await close(server);
    server = null;
  });

  describe('GET /api/sessions', () => {
    it('surfaces an executor field on every session', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/sessions');
      expect(r.status).toBe(200);
      const byId = Object.fromEntries(r.body.sessions.map((s) => [s.id, s]));
      expect(byId.sess_a.executor).toBe('hermes');
      expect(byId.sess_b.executor).toBe('opencode-1230');
      expect(byId.sess_c.executor).toBe('hermes');
      for (const s of r.body.sessions) {
        expect(s).toHaveProperty('executor');
      }
    });

    it('filters by ?executor=opencode-1230 (only sess_b)', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/sessions?executor=opencode-1230');
      expect(r.status).toBe(200);
      expect(r.body.sessions.map((s) => s.id)).toEqual(['sess_b']);
      for (const s of r.body.sessions) {
        expect(s.executor).toBe('opencode-1230');
      }
      expect(r.body.total).toBe(1);
    });

    it('filters by ?executor=hermes (sess_a + sess_c)', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/sessions?executor=hermes');
      expect(r.status).toBe(200);
      expect(r.body.sessions.map((s) => s.id).sort()).toEqual(['sess_a', 'sess_c']);
      expect(r.body.total).toBe(2);
    });

    it('ignores an unknown executor value (returns all)', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/sessions?executor=bogus');
      expect(r.status).toBe(200);
      expect(r.body.sessions.map((s) => s.id).sort()).toEqual(['sess_a', 'sess_b', 'sess_c']);
      expect(r.body.total).toBe(3);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns executor:opencode-1230 for an OC-bound session', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/sessions/sess_b');
      expect(r.status).toBe(200);
      expect(r.body.executor).toBe('opencode-1230');
    });

    it('returns executor:hermes for a session with no assistant', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/sessions/sess_a');
      expect(r.status).toBe(200);
      expect(r.body.executor).toBe('hermes');
    });
  });

  describe('PATCH /api/sessions/:id/pin & /archive — binding preservation', () => {
    it('pinning an OC-bound session preserves opencode_session_id and assistant_id', async () => {
      const { app, seed } = await buildApp();
      // Equip sess_b with an OC binding on top of its existing assistant_id.
      const meta = seed.session_meta.find((m) => m.session_id === 'sess_b');
      meta.opencode_session_id = 'ses_oc_b';
      server = await listen(app);

      const r = await req(server, 'PATCH', '/api/sessions/sess_b/pin', {});
      expect(r.status).toBe(200);
      expect(r.body.pinned).toBe(1);

      const after = seed.session_meta.find((m) => m.session_id === 'sess_b');
      expect(after.pinned).toBe(1);
      // CRITICAL: upsert must NOT wipe the OC binding or the assistant.
      expect(after.opencode_session_id).toBe('ses_oc_b');
      expect(after.assistant_id).toBe(1);
    });

    it('archiving an OC-bound session preserves opencode_session_id and assistant_id', async () => {
      const { app, seed } = await buildApp();
      const meta = seed.session_meta.find((m) => m.session_id === 'sess_b');
      meta.opencode_session_id = 'ses_oc_b';
      server = await listen(app);

      const r = await req(server, 'PATCH', '/api/sessions/sess_b/archive', {});
      expect(r.status).toBe(200);
      expect(r.body.archived).toBe(1);

      const after = seed.session_meta.find((m) => m.session_id === 'sess_b');
      expect(after.archived).toBe(1);
      expect(after.opencode_session_id).toBe('ses_oc_b');
      expect(after.assistant_id).toBe(1);
    });
  });
});
