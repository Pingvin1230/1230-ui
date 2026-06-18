// Route-level tests for routes/assistants.js.
//
// Strategy: mock the heavy dependencies (uiDb, middleware, db/helpers.rowToAssistant)
// with in-memory stand-ins, then mount the router on a real Express app and
// hit it via HTTP on an ephemeral port.
//
// Covers:
//   - GET    /api/assistants        (list, with/without archived)
//   - GET    /api/assistants/:id    (single, 404 when missing)
//   - POST   /api/assistants        (create; sanitizeAssistantInput validation:
//                                    invalid color/style/depth/executor/name rejected)
//   - PATCH  /api/assistants/:id    (update; fork-on-edit when sessions linked)
//   - POST   /api/assistants/:id/archive   (idempotent)
//   - POST   /api/assistants/:id/restore   (idempotent)
//   - POST   /api/assistants/:id/duplicate (name collision → "(copy N)" suffix)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const realFetch = globalThis.fetch.bind(globalThis);

// ── seed + in-memory uiDb mock ───────────────────────────────────────────────
function makeSeed() {
  return {
    assistants: [
      { id: 1, name: 'Hermes', description: null, color: null, icon: null, model_id: null, style: null, depth: null, system_prompt: null, executor: 'hermes', is_archived: 0, archived_at: null, created_at: 1, updated_at: 1 },
      { id: 2, name: 'OC', description: null, color: 'blue', icon: null, model_id: 'minimax-m1', style: 'friendly', depth: 'standard', system_prompt: 'be nice', executor: 'opencode-1230', is_archived: 0, archived_at: null, created_at: 1, updated_at: 1 },
      { id: 3, name: 'Old', description: 'archived one', color: 'red', icon: null, model_id: null, style: null, depth: null, system_prompt: null, executor: 'hermes', is_archived: 1, archived_at: 99, created_at: 1, updated_at: 1 },
    ],
    models: [{ model_id: 'minimax-m1', enabled: 1 }],
    nextAssistantId: 100,
    // session_meta for fork-on-edit: assistant_id → count
    sessionCounts: new Map([[2, 1]]), // OC has 1 linked session
  };
}

function makeDbMock(seed) {
  return {
    prepare(sql) {
      // Normalise whitespace so multi-line prepared statements match patterns.
      const sqlL = sql.toLowerCase().replace(/\s+/g, ' ').trim();
      return {
        all(...args) {
          // SELECT a.*, m.display_name ... FROM assistants a LEFT JOIN models ...
          // The route interpolates `WHERE a.is_archived = 0` when archived
          // rows should be excluded — detect inclusion from the SQL text.
          if (/from assistants/.test(sqlL) && /left join models/.test(sqlL)) {
            const includeArchived = !/where a\.is_archived = 0/.test(sqlL);
            // Attach joins so rowToAssistant (here a passthrough) sees them.
            return seed.assistants
              .filter((a) => includeArchived || !a.is_archived)
              .map((a) => ({ ...a, model_display_name: null, model_enabled: null, provider_name: null }));
          }
          return [];
        },
        get(...args) {
          // SELECT a.*, m.display_name ... WHERE a.id = ?
          if (/from assistants/.test(sqlL) && /left join models/.test(sqlL) && /where a\.id/.test(sqlL)) {
            const row = seed.assistants.find((a) => String(a.id) === String(args[0]));
            return row ? { ...row, model_display_name: null, model_enabled: null, provider_name: null } : undefined;
          }
          // SELECT * FROM assistants WHERE id = ?
          if (/from assistants/.test(sqlL) && /where id/.test(sqlL)) {
            return seed.assistants.find((a) => String(a.id) === String(args[0]));
          }
          // model_id existence check (sanitizeAssistantInput)
          if (/from models/.test(sqlL) && /model_id = ?/.test(sqlL) && /enabled = 1/.test(sqlL)) {
            return seed.models.find((m) => m.model_id === args[0] && m.enabled) ? { 1: 1 } : undefined;
          }
          // session_meta linked-session count
          if (/from session_meta/.test(sqlL) && /count/.test(sqlL) && /assistant_id/.test(sqlL)) {
            const n = seed.sessionCounts.get(Number(args[0])) || 0;
            return { n };
          }
          // duplicate-name check (used by /duplicate)
          if (/from assistants/.test(sqlL) && /name = ?/.test(sqlL) && /is_archived = 0/.test(sqlL)) {
            return seed.assistants.find((a) => a.name === args[0] && !a.is_archived) ? { 1: 1 } : undefined;
          }
          return undefined;
        },
        run(...args) {
          // INSERT INTO assistants
          if (/insert into assistants/.test(sqlL)) {
            const row = {
              id: seed.nextAssistantId++,
              name: args[0],
              description: args[1],
              color: args[2],
              icon: args[3],
              model_id: args[4],
              style: args[5],
              depth: args[6],
              system_prompt: args[7],
              executor: args[8] ?? 'hermes',
              is_archived: 0,
              archived_at: null,
              created_at: 1,
              updated_at: 1,
            };
            seed.assistants.push(row);
            return { changes: 1, lastInsertRowid: row.id };
          }
          // UPDATE assistants SET is_archived = 1 (archive or fork-on-edit)
          if (/update assistants set is_archived = 1/.test(sqlL)) {
            const row = seed.assistants.find((a) => String(a.id) === String(args[0]));
            if (row) { row.is_archived = 1; row.archived_at = 99; }
            return { changes: row ? 1 : 0 };
          }
          // UPDATE assistants SET is_archived = 0 (restore)
          if (/update assistants set is_archived = 0/.test(sqlL)) {
            const row = seed.assistants.find((a) => String(a.id) === String(args[0]));
            if (row) { row.is_archived = 0; row.archived_at = null; }
            return { changes: row ? 1 : 0 };
          }
          // UPDATE assistants SET name = ?, ... (plain update, no fork)
          if (/update assistants set name = ?/.test(sqlL)) {
            const row = seed.assistants.find((a) => String(a.id) === String(args[9]));
            if (row) {
              row.name = args[0];
              row.description = args[1];
              row.color = args[2];
              row.icon = args[3];
              row.model_id = args[4];
              row.style = args[5];
              row.depth = args[6];
              row.system_prompt = args[7];
              row.executor = args[8] ?? 'hermes';
            }
            return { changes: row ? 1 : 0 };
          }
          return { changes: 1 };
        },
      };
    },
    transaction(fn) {
      // better-sqlite3: transaction returns a synchronous wrapper.
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
  };
}

async function buildApp({ seed = makeSeed() } = {}) {
  const db = makeDbMock(seed);
  vi.doMock('../config.js', () => ({ default: makeConfig() }));
  vi.doMock('../db/connections.js', () => ({ db, uiDb: db, hermesDbWrite: db }));
  vi.doMock('../middleware/security.js', () => ({
    apiLimiter: (req, _res, next) => next(),
    providerLimiter: (req, _res, next) => next(),
  }));
  // Use the real rowToAssistant — it just reshapes columns; with the joins
  // attached in our mock it works fine.
  vi.resetModules();
  const [{ default: express }, { default: assistantsRouter }] = await Promise.all([
    import('express'),
    import('../routes/assistants.js'),
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/assistants', assistantsRouter);
  return { app, db, seed };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function req(server, method, p, body) {
  const { port } = server.address();
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await realFetch(`http://127.0.0.1:${port}${p}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, headers: res.headers, body: json ?? text };
}

describe('routes/assistants.js', () => {
  let server;

  beforeEach(() => { vi.clearAllMocks(); });

  afterEach(async () => {
    vi.doUnmock('../config.js');
    vi.doUnmock('../db/connections.js');
    vi.doUnmock('../middleware/security.js');
    vi.resetModules();
    if (server) await close(server);
    server = null;
  });

  describe('GET /api/assistants', () => {
    it('lists only non-archived by default', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/assistants');
      expect(r.status).toBe(200);
      const names = r.body.assistants.map((a) => a.name).sort();
      expect(names).toEqual(['Hermes', 'OC']);
    });

    it('includes archived when ?include_archived=1', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/assistants?include_archived=1');
      expect(r.status).toBe(200);
      const names = r.body.assistants.map((a) => a.name).sort();
      expect(names).toEqual(['Hermes', 'OC', 'Old']);
    });
  });

  describe('GET /api/assistants/:id', () => {
    it('returns a single assistant', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/assistants/2');
      expect(r.status).toBe(200);
      expect(r.body.name).toBe('OC');
      expect(r.body.executor).toBe('opencode-1230');
    });

    it('returns 404 when not found', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/assistants/9999');
      expect(r.status).toBe(404);
    });
  });

  describe('POST /api/assistants (create + sanitizeAssistantInput)', () => {
    it('creates a valid assistant with minimal fields', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', { name: 'New One' });
      expect(r.status).toBe(201);
      expect(r.body.forked).toBe(false);
      expect(r.body.assistant.name).toBe('New One');
      // executor defaults to 'hermes' when omitted
      expect(r.body.assistant.executor).toBe('hermes');
      expect(seed.assistants.some((a) => a.name === 'New One')).toBe(true);
    });

    it('rejects an invalid color', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', { name: 'X', color: 'rainbow' });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/color/);
    });

    it('rejects an invalid style', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', { name: 'X', style: 'rude' });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/style/);
    });

    it('rejects an invalid depth', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', { name: 'X', depth: 'endless' });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/depth/);
    });

    it('rejects an invalid executor', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', { name: 'X', executor: 'skynet' });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/executor/);
    });

    it('rejects an empty name', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', { name: '   ' });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/name/);
    });

    it('rejects an unknown model_id', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', { name: 'X', model_id: 'no-such-model' });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/model_id/);
    });

    it('accepts a valid model_id and derives description from system_prompt', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const longPrompt = 'A'.repeat(150);
      const r = await req(server, 'POST', '/api/assistants', {
        name: 'WithModel',
        model_id: 'minimax-m1',
        system_prompt: longPrompt,
      });
      expect(r.status).toBe(201);
      expect(r.body.assistant.modelId).toBe('minimax-m1');
      // description is the first 100 chars of system_prompt
      expect(r.body.assistant.description).toBe('A'.repeat(100));
    });

    it('rejects a system_prompt longer than 4000 chars', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants', {
        name: 'Big',
        system_prompt: 'x'.repeat(4001),
      });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/system_prompt/);
    });
  });

  describe('PATCH /api/assistants/:id (update + fork-on-edit)', () => {
    it('updates in place when no sessions are linked', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      // Assistant 1 (Hermes) has no linked sessions → plain update
      const r = await req(server, 'PATCH', '/api/assistants/1', { name: 'Hermes2' });
      expect(r.status).toBe(200);
      expect(r.body.forked).toBe(false);
      expect(r.body.assistant.id).toBe(1);
      expect(r.body.assistant.name).toBe('Hermes2');
      // Old row updated in place
      expect(seed.assistants.find((a) => a.id === 1).name).toBe('Hermes2');
      expect(seed.assistants.find((a) => a.id === 1).is_archived).toBe(0);
    });

    it('forks (archives old + creates new) when sessions are linked', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      // Assistant 2 (OC) has 1 linked session → fork-on-edit
      const r = await req(server, 'PATCH', '/api/assistants/2', { name: 'OC-v2' });
      expect(r.status).toBe(200);
      expect(r.body.forked).toBe(true);
      expect(r.body.previousId).toBe(2);
      // New row created with a fresh id and the new name
      expect(r.body.assistant.id).not.toBe(2);
      expect(r.body.assistant.name).toBe('OC-v2');
      // Old row is now archived
      expect(seed.assistants.find((a) => a.id === 2).is_archived).toBe(1);
    });

    it('returns 404 when the assistant does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'PATCH', '/api/assistants/9999', { name: 'X' });
      expect(r.status).toBe(404);
    });

    it('returns 409 when editing an already-archived assistant', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      // Assistant 3 is archived in the seed
      const r = await req(server, 'PATCH', '/api/assistants/3', { name: 'X' });
      expect(r.status).toBe(409);
    });
  });

  describe('POST /api/assistants/:id/archive', () => {
    it('archives an active assistant', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/1/archive');
      expect(r.status).toBe(200);
      expect(r.body.assistant.isArchived).toBe(true);
      expect(seed.assistants.find((a) => a.id === 1).is_archived).toBe(1);
    });

    it('is idempotent (returns 200 with the row when already archived)', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/3/archive');
      expect(r.status).toBe(200);
      expect(r.body.assistant.isArchived).toBe(true);
    });

    it('returns 404 when not found', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/9999/archive');
      expect(r.status).toBe(404);
    });
  });

  describe('POST /api/assistants/:id/restore', () => {
    it('restores an archived assistant', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/3/restore');
      expect(r.status).toBe(200);
      expect(r.body.assistant.isArchived).toBe(false);
      expect(seed.assistants.find((a) => a.id === 3).is_archived).toBe(0);
    });

    it('is idempotent (returns 200 when already active)', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/1/restore');
      expect(r.status).toBe(200);
      expect(r.body.assistant.isArchived).toBe(false);
    });
  });

  describe('POST /api/assistants/:id/duplicate', () => {
    it('creates a copy named "<name> (copy)"', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/2/duplicate');
      expect(r.status).toBe(201);
      expect(r.body.assistant.name).toBe('OC (copy)');
      // Source is NOT archived
      expect(seed.assistants.find((a) => a.id === 2).is_archived).toBe(0);
    });

    it('suffixed "(copy N)" when the (copy) name is taken', async () => {
      const seed = makeSeed();
      // Pre-create an active assistant named "OC (copy)"
      seed.assistants.push({ id: 50, name: 'OC (copy)', is_archived: 0, executor: 'hermes' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/2/duplicate');
      expect(r.status).toBe(201);
      expect(r.body.assistant.name).toBe('OC (copy 2)');
    });

    it('returns 404 when the source does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/assistants/9999/duplicate');
      expect(r.status).toBe(404);
    });
  });
});
