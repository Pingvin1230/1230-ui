// Route-level tests for routes/globalFiles.js + routes/models.js.
//
// Strategy: mock the heavy dependencies (db/uiDb, config, middleware) with
// in-memory stand-ins, then mount each router on a real Express app and hit
// it via HTTP on an ephemeral port.
//
// Covers:
//   globalFiles:
//     - GET    /api/files                       (list + stats)
//     - PATCH  /api/files/:fileId/extend        (expiration extension)
//     - DELETE /api/files/:fileId               (disk + DB; user & agent paths)
//     - POST   /api/files/:fileId/copy          (cross-session copy)
//   models:
//     - GET    /api/models                      (default + providers map)
//     - GET    /api/models/providers            (per-provider model lists)
//     - PATCH  /api/models/models/:id/toggle    (enable/disable)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const realFetch = globalThis.fetch.bind(globalThis);

const _testFile = fileURLToPath(import.meta.url);
const _testDir = path.dirname(_testFile);
const REAL_UPLOADS_DIR = path.resolve(_testDir, '..', 'data', 'uploads');

// ── shared seed + db mock ────────────────────────────────────────────────────
function makeSeed() {
  return {
    files: [
      // user file in sess_a
      { id: 1, session_id: 'sess_a', filename: 'a.txt', stored_name: 'ua.txt', mime_type: 'text/plain', size: 100, uploaded_at: 1000, expires_at: 99999, extended_count: 0, source: 'user' },
      // user file in sess_b (no session row → orphaned, sessionTitle null)
      { id: 2, session_id: 'sess_missing', filename: 'orphan.md', stored_name: 'uo.md', mime_type: 'text/markdown', size: 50, uploaded_at: 2000, expires_at: null, extended_count: 0, source: 'user' },
    ],
    sessions: [
      { id: 'sess_a', title: 'Alpha', preview: 'first user msg' },
      { id: 'sess_b', title: null,    preview: 'preview-b' },
    ],
    providers: [
      { id: 1, name: 'minimax', display_name: 'MiniMax', env_var: 'MM_KEY', base_url: 'https://x', sync_status: 'ok', last_synced_at: 1 },
    ],
    models: [
      { id: 10, model_id: 'minimax-m1', display_name: 'M1', provider_id: 1, enabled: 1 },
      { id: 11, model_id: 'minimax-m2', display_name: 'M2', provider_id: 1, enabled: 0 },
    ],
  };
}

function makeDbMock(seed) {
  return {
    prepare(sql) {
      // Normalise whitespace so multi-line prepared statements match patterns.
      // NOTE: use String.indexOf for substring checks — JS regex `?` is a
      // quantifier, so `/x = ?/` does NOT match the literal `?` in SQL.
      const sqlL = sql.toLowerCase().replace(/\s+/g, ' ').trim();
      const has = (sub) => sqlL.includes(sub);
      return {
        all(...args) {
          // globalFiles: SELECT ... FROM session_files f ORDER BY f.uploaded_at DESC
          if (has('from session_files f order by f.uploaded_at desc')) {
            return seed.files.map((f) => ({ ...f }));
          }
          // globalFiles: SELECT s.id, s.title, (subquery) FROM sessions s WHERE s.id IN (?,?,...)
          if (has('from sessions s where s.id in')) {
            const ids = args;
            return seed.sessions
              .filter((s) => ids.includes(s.id))
              .map((s) => ({ id: s.id, title: s.title, preview: s.preview }));
          }
          // models providers detail: SELECT ... env_var ... FROM providers ORDER BY name
          // (checked BEFORE the simpler providers-list pattern to win on overlap)
          if (has('from providers order by name') && has('env_var')) {
            return seed.providers.map((p) => ({
              id: p.id, name: p.name, display_name: p.display_name,
              env_var: p.env_var, base_url: p.base_url,
              sync_status: p.sync_status, last_synced_at: p.last_synced_at,
            }));
          }
          // models: SELECT id, name, display_name FROM providers ORDER BY name
          if (has('from providers order by name') && /^select id, name/.test(sqlL)) {
            return seed.providers.map((p) => ({ id: p.id, name: p.name, display_name: p.display_name }));
          }
          // models: SELECT model_id, display_name FROM models WHERE provider_id = ? AND enabled = 1
          if (has('from models where provider_id =') && has('and enabled = 1')) {
            return seed.models.filter((m) => m.provider_id === args[0] && m.enabled === 1);
          }
          // models providers detail: SELECT id, model_id, display_name, enabled FROM models WHERE provider_id = ?
          if (has('from models where provider_id =') && has('order by model_id')) {
            return seed.models
              .filter((m) => m.provider_id === args[0])
              .map((m) => ({ id: m.id, model_id: m.model_id, display_name: m.display_name, enabled: m.enabled }));
          }
          return [];
        },
        get(...args) {
          // globalFiles: SELECT * FROM session_files WHERE id = ?
          if (has('from session_files where id =')) {
            return seed.files.find((f) => String(f.id) === String(args[0]));
          }
          // globalFiles: SELECT id FROM sessions WHERE id = ? (target session)
          if (has('from sessions where id =') && /^select id from sessions/.test(sqlL)) {
            return seed.sessions.find((s) => s.id === args[0]) ? { id: args[0] } : undefined;
          }
          // models toggle: SELECT * FROM models WHERE id = ?
          if (has('from models where id =') && /^select \* from models/.test(sqlL)) {
            return seed.models.find((m) => String(m.id) === String(args[0]));
          }
          return undefined;
        },
        run(...args) {
          // globalFiles extend: UPDATE session_files SET expires_at = ?, extended_count = extended_count + 1
          if (has('update session_files set expires_at =')) {
            const row = seed.files.find((f) => String(f.id) === String(args[1]));
            if (row) { row.expires_at = args[0]; row.extended_count = (row.extended_count || 0) + 1; }
            return { changes: 1 };
          }
          // globalFiles delete: DELETE FROM session_files WHERE id = ?
          if (has('delete from session_files where id =')) {
            const idx = seed.files.findIndex((f) => String(f.id) === String(args[0]));
            if (idx >= 0) seed.files.splice(idx, 1);
            return { changes: 1 };
          }
          // globalFiles copy: INSERT INTO session_files (...) VALUES (...)
          if (has('insert into session_files')) {
            const row = {
              id: (seed.files.reduce((m, f) => Math.max(m, f.id), 0) + 1),
              session_id: args[0], filename: args[1], stored_name: args[2],
              mime_type: args[3], size: args[4], uploaded_at: args[5],
              expires_at: args[6], source: 'user',
            };
            seed.files.push(row);
            return { changes: 1, lastInsertRowid: row.id };
          }
          // models toggle: UPDATE models SET enabled = ? WHERE id = ?
          if (has('update models set enabled =')) {
            const m = seed.models.find((x) => String(x.id) === String(args[1]));
            if (m) m.enabled = args[0];
            return { changes: 1 };
          }
          return { changes: 1 };
        },
      };
    },
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
    fileRetentionDays: 7,
    scripts: { syncProviders: '/tmp/sync.py' },
    uiDbPath: '/tmp/ui.db',
  };
}

async function buildApp({ seed = makeSeed(), mount = '/api/files' } = {}) {
  const db = makeDbMock(seed);
  vi.doMock('../config.js', () => ({ default: makeConfig() }));
  vi.doMock('../db/connections.js', () => ({ db, uiDb: db, hermesDbWrite: db }));
  vi.doMock('../middleware/security.js', () => ({
    apiLimiter: (req, _res, next) => next(),
    providerLimiter: (req, _res, next) => next(),
  }));
  vi.resetModules();
  const [{ default: express }, { default: router }] = await Promise.all([
    import('express'),
    mount === '/api/files' ? import('../routes/globalFiles.js') : import('../routes/models.js'),
  ]);
  const app = express();
  app.use(express.json());
  app.use(mount, router);
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

// ─────────────────────────────────────────────────────────────────────────────
// routes/globalFiles.js
// ─────────────────────────────────────────────────────────────────────────────
describe('routes/globalFiles.js', () => {
  let server;
  let tmpDir;
  let cleanupPaths;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '1230ui-gf-'));
    cleanupPaths = [];
  });

  afterEach(async () => {
    vi.doUnmock('../config.js');
    vi.doUnmock('../db/connections.js');
    vi.doUnmock('../middleware/security.js');
    vi.resetModules();
    if (server) await close(server);
    server = null;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    for (const p of cleanupPaths) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  describe('GET /api/files', () => {
    it('lists files with session titles and computes stats', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/files');
      expect(r.status).toBe(200);
      // sess_a has a session row with title "Alpha"
      const a = r.body.files.find((f) => f.sessionId === 'sess_a');
      expect(a.sessionTitle).toBe('Alpha');
      // sess_missing has NO session row → sessionTitle is null
      const orphan = r.body.files.find((f) => f.sessionId === 'sess_missing');
      expect(orphan.sessionTitle).toBeNull();
      // stats reflect totals
      expect(r.body.stats.totalFiles).toBe(2);
      expect(r.body.stats.totalSize).toBe(150);
    });

    it('falls back to preview when title is null', async () => {
      const seed = makeSeed();
      seed.files.push({ id: 99, session_id: 'sess_b', filename: 'b.txt', stored_name: 'ub.txt', mime_type: 'text/plain', size: 1, uploaded_at: 1, expires_at: null, extended_count: 0, source: 'user' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/files');
      const b = r.body.files.find((f) => f.sessionId === 'sess_b');
      // sess_b has title=null, preview='preview-b' (<70 chars) → 'preview-b'
      expect(b.sessionTitle).toBe('preview-b');
    });
  });

  describe('PATCH /api/files/:fileId/extend', () => {
    it('returns 400 for a non-integer fileId', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'PATCH', '/api/files/abc/extend');
      expect(r.status).toBe(400);
    });

    it('returns 404 when the file does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'PATCH', '/api/files/9999/extend');
      expect(r.status).toBe(404);
    });

    it('extends expiration by fileRetentionDays and bumps extended_count', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      const before = seed.files.find((f) => f.id === 1);
      const oldExpires = before.expires_at;
      const r = await req(server, 'PATCH', '/api/files/1/extend');
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      // 7 days = 604800000 ms
      expect(r.body.expiresAt).toBe(oldExpires + 604800000);
      expect(before.extended_count).toBe(1);
    });
  });

  describe('DELETE /api/files/:fileId', () => {
    it('returns 404 when the file does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'DELETE', '/api/files/9999');
      expect(r.status).toBe(404);
    });

    it('deletes a user file from disk + DB', async () => {
      // Drop a real file at data/uploads/sess_a/ua.txt
      const dir = path.join(REAL_UPLOADS_DIR, 'sess_a');
      fs.mkdirSync(dir, { recursive: true });
      const abs = path.join(dir, 'ua.txt');
      fs.writeFileSync(abs, 'x');
      cleanupPaths.push(abs);
      cleanupPaths.push(dir);

      const { app, seed } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'DELETE', '/api/files/1');
      expect(r.status).toBe(204);
      expect(seed.files.find((f) => f.id === 1)).toBeUndefined();
      expect(fs.existsSync(abs)).toBe(false);
    });

    it('deletes an agent file by its absolute stored_name path', async () => {
      const agentFile = path.join(tmpDir, 'agent-del.txt');
      fs.writeFileSync(agentFile, 'agent');
      const seed = makeSeed();
      seed.files.push({ id: 50, session_id: 'sess_a', filename: 'agent-del.txt', stored_name: agentFile, mime_type: 'text/plain', size: 5, uploaded_at: 1, expires_at: null, extended_count: 0, source: 'agent' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'DELETE', '/api/files/50');
      expect(r.status).toBe(204);
      expect(fs.existsSync(agentFile)).toBe(false);
    });
  });

  describe('POST /api/files/:fileId/copy', () => {
    it('returns 400 when targetSessionId is missing', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/files/1/copy', {});
      expect(r.status).toBe(400);
    });

    it('returns 404 when the source file does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/files/9999/copy', { targetSessionId: 'sess_a' });
      expect(r.status).toBe(404);
    });

    it('returns 404 when the target session does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/files/1/copy', { targetSessionId: 'sess_nope' });
      expect(r.status).toBe(404);
      expect(String(r.body.error)).toMatch(/Target session/);
    });

    it('copies a user file on disk and creates a new DB row with source=user', async () => {
      // Source file at data/uploads/sess_a/ua.txt
      const srcDir = path.join(REAL_UPLOADS_DIR, 'sess_a');
      fs.mkdirSync(srcDir, { recursive: true });
      const srcAbs = path.join(srcDir, 'ua.txt');
      fs.writeFileSync(srcAbs, 'source-bytes');
      cleanupPaths.push(srcAbs);
      cleanupPaths.push(srcDir);
      // Target session sess_b — copy lands at data/uploads/sess_b/<uuid>.txt
      const targetDir = path.join(REAL_UPLOADS_DIR, 'sess_b');
      cleanupPaths.push(targetDir);

      const { app, seed } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'POST', '/api/files/1/copy', { targetSessionId: 'sess_b' });
      expect(r.status).toBe(201);
      expect(r.body.sessionId).toBe('sess_b');
      expect(r.body.source).toBe('user');
      expect(r.body.filename).toBe('a.txt');
      // New DB row exists in seed
      expect(seed.files.some((f) => f.id === r.body.id && f.session_id === 'sess_b')).toBe(true);
      // The new on-disk file exists and has the source content.
      expect(fs.existsSync(r.body.path)).toBe(true);
      expect(fs.readFileSync(r.body.path, 'utf8')).toBe('source-bytes');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routes/models.js
// ─────────────────────────────────────────────────────────────────────────────
describe('routes/models.js', () => {
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

  describe('GET /api/models', () => {
    it('returns enabled models grouped by provider and a default', async () => {
      const { app } = await buildApp({ mount: '/api/models' });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/models');
      expect(r.status).toBe(200);
      // Only enabled models are surfaced (m1 enabled, m2 disabled → excluded)
      expect(r.body.providers.minimax.models.map((m) => m.id)).toEqual(['minimax-m1']);
      // default is the first enabled model
      expect(r.body.default.id).toBe('minimax-m1');
      expect(r.body.default.provider).toBe('minimax');
    });

    it('returns default:null when no models are enabled', async () => {
      const seed = makeSeed();
      seed.models.forEach((m) => (m.enabled = 0));
      const { app } = await buildApp({ seed, mount: '/api/models' });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/models');
      expect(r.status).toBe(200);
      expect(r.body.default).toBeNull();
      expect(Object.keys(r.body.providers)).toHaveLength(0);
    });
  });

  describe('GET /api/models/providers', () => {
    it('returns providers with model lists and enabled/total counts', async () => {
      const { app } = await buildApp({ mount: '/api/models' });
      server = await listen(app);
      const r = await req(server, 'GET', '/api/models/providers');
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      const p = r.body[0];
      expect(p.name).toBe('minimax');
      expect(p.totalCount).toBe(2);
      expect(p.enabledCount).toBe(1);
      expect(p.models.map((m) => m.model_id)).toEqual(['minimax-m1', 'minimax-m2']);
    });
  });

  describe('PATCH /api/models/models/:id/toggle', () => {
    it('toggles an enabled model to disabled', async () => {
      const { app, seed } = await buildApp({ mount: '/api/models' });
      server = await listen(app);
      const r = await req(server, 'PATCH', '/api/models/models/10/toggle');
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.id).toBe('10');
      expect(r.body.enabled).toBe(0);
      expect(seed.models.find((m) => m.id === 10).enabled).toBe(0);
    });

    it('toggles a disabled model to enabled', async () => {
      const { app, seed } = await buildApp({ mount: '/api/models' });
      server = await listen(app);
      const r = await req(server, 'PATCH', '/api/models/models/11/toggle');
      expect(r.status).toBe(200);
      expect(r.body.enabled).toBe(1);
      expect(seed.models.find((m) => m.id === 11).enabled).toBe(1);
    });

    it('returns 404 when the model does not exist', async () => {
      const { app } = await buildApp({ mount: '/api/models' });
      server = await listen(app);
      const r = await req(server, 'PATCH', '/api/models/models/9999/toggle');
      expect(r.status).toBe(404);
    });
  });
});
