// Route-level tests for routes/files.js (session-scoped file endpoints).
//
// Strategy: mock the heavy dependencies (db/uiDb, config, middleware) with
// in-memory stand-ins, then mount the router on a real Express app and hit
// it via HTTP on an ephemeral port. Multipart uploads go through real multer
// against the OS tmp dir, then are renamed into the project's data/uploads
// tree. To exercise the user-source disk path without touching real session
// data, all tests use a unique synthetic session id (SESS) and clean up the
// uploads/<SESS>/ subtree in afterEach. Agent-source rows use absolute paths
// in tmpDir, which is what the production code expects for source='agent'.
//
// Covers:
//   - POST   /api/sessions/:id/files               (upload via multer)
//   - GET    /api/sessions/:id/files               (list)
//   - GET    /api/sessions/:id/files/:fileId/content  (inline preview, user+agent)
//   - GET    /api/sessions/:id/files/:fileId/download (attachment, user+agent)
//   - DELETE /api/sessions/:id/files/:fileId       (DB + disk for user; DB only for agent)
//   - 404 when session does not exist
//   - 404 when file does not exist / belongs to a different session
//   - source='agent' uses stored_name as the absolute path (no data/uploads join)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const realFetch = globalThis.fetch.bind(globalThis);

// The route computes uploadsDir from its own __dirname; mirror that here so
// cleanup targets the right on-disk subtree.
const _routeFile = fileURLToPath(import.meta.url);
const _routeDir = path.dirname(_routeFile);
const _projectRoot = path.resolve(_routeDir, '..', 'routes');
const REAL_UPLOADS_DIR = path.resolve(_routeDir, '..', 'data', 'uploads');

// Synthetic session id used by every test. Using a unique, non-real value
// keeps test files isolated from any real session data on disk.
const SESS = 'sess_files_route_test';

function makeSeed() {
  return {
    sessions: [{ id: SESS }, { id: 'sess_other' }],
    files: [],
    nextFileId: 1,
  };
}

function makeDbMock(seed) {
  return {
    prepare(sql) {
      const sqlL = sql.toLowerCase();
      return {
        all(...args) {
          if (/from session_files/.test(sqlL) && /order by uploaded_at/.test(sqlL)) {
            return seed.files.filter((f) => f.session_id === args[0]);
          }
          return [];
        },
        get(...args) {
          if (/from sessions/.test(sqlL) && /^select id from sessions/.test(sqlL)) {
            return seed.sessions.find((s) => s.id === args[0]);
          }
          if (/from session_files/.test(sqlL) && /where id/.test(sqlL)) {
            return seed.files.find((f) => String(f.id) === String(args[0]));
          }
          return undefined;
        },
        run(...args) {
          if (/insert into session_files/.test(sqlL)) {
            const row = {
              id: seed.nextFileId++,
              session_id: args[0],
              filename: args[1],
              stored_name: args[2],
              mime_type: args[3],
              size: args[4],
              uploaded_at: args[5],
              expires_at: args[6],
              source: args[7] || 'user',
            };
            seed.files.push(row);
            return { changes: 1, lastInsertRowid: row.id };
          }
          if (/delete from session_files/.test(sqlL)) {
            const idx = seed.files.findIndex((f) => String(f.id) === String(args[0]));
            if (idx >= 0) seed.files.splice(idx, 1);
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
    fileRetentionDays: 0,
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
  vi.resetModules();
  const [{ default: express }, { default: filesRouter }] = await Promise.all([
    import('express'),
    import('../routes/files.js'),
  ]);
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', filesRouter);
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

async function req(server, method, p, init = {}) {
  const { port } = server.address();
  const res = await realFetch(`http://127.0.0.1:${port}${p}`, { method, ...init });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  return { status: res.status, headers: res.headers, body: json ?? text, text };
}

function multipartForm(fieldName, filename, content, mime = 'text/plain') {
  const boundary = '----vitest-boundary-' + Math.random().toString(16).slice(2);
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, Buffer.from(content), suffix]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// Write a "user-source" file to the real uploads dir under our test session
// so the route's hardcoded uploadsDir resolution can find it.
function writeUserUpload(storedName, content) {
  const dir = path.join(REAL_UPLOADS_DIR, SESS);
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, storedName);
  fs.writeFileSync(abs, content);
  return abs;
}

describe('routes/files.js — session files', () => {
  let server;
  let tmpDir;
  let cleanupPaths;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '1230ui-files-'));
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
    // Clean up anything we wrote under data/uploads/<SESS>/.
    for (const p of cleanupPaths) {
      try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    try { fs.rmSync(path.join(REAL_UPLOADS_DIR, SESS), { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('POST /api/sessions/:id/files (upload)', () => {
    it('returns 404 when the session does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const { body, contentType } = multipartForm('file', 'a.txt', 'hi');
      const r = await req(server, 'POST', '/api/sessions/no-such-session/files', {
        body,
        headers: { 'content-type': contentType },
      });
      expect(r.status).toBe(404);
    });

    it('uploads a .txt file, persists a session_files row, and renames into uploads/', async () => {
      const { app, seed } = await buildApp();
      server = await listen(app);
      const { body, contentType } = multipartForm('file', 'hello.txt', 'hi there');
      const r = await req(server, 'POST', `/api/sessions/${SESS}/files`, {
        body,
        headers: { 'content-type': contentType },
      });
      expect(r.status).toBe(201);
      expect(r.body.filename).toBe('hello.txt');
      expect(r.body.sessionId).toBe(SESS);
      expect(r.body.mimeType).toBe('text/plain');
      expect(r.body.size).toBe(8);
      // stored_name must be a server-generated UUID + ext, NOT the original name
      expect(r.body.storedName).toMatch(/^[0-9a-f-]{36}\.txt$/);
      // The renamed file should exist on disk under data/uploads/<SESS>/.
      const onDisk = path.join(REAL_UPLOADS_DIR, SESS, r.body.storedName);
      expect(fs.existsSync(onDisk)).toBe(true);
      expect(fs.readFileSync(onDisk, 'utf8')).toBe('hi there');
      // DB row inserted with source='user'
      expect(seed.files).toHaveLength(1);
      expect(seed.files[0].source).toBe('user');
    });

    it('rejects an unsupported extension with 400', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const { body, contentType } = multipartForm('file', 'evil.exe', 'X', 'application/octet-stream');
      const r = await req(server, 'POST', `/api/sessions/${SESS}/files`, {
        body,
        headers: { 'content-type': contentType },
      });
      expect(r.status).toBe(400);
      expect(String(r.body.error)).toMatch(/not supported|UNSUPPORTED/);
    });

    it('returns 400 when no file is provided', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const boundary = '----vitest-boundary-' + Math.random().toString(16).slice(2);
      const body = Buffer.from(`--${boundary}--\r\n`);
      const r = await req(server, 'POST', `/api/sessions/${SESS}/files`, {
        body,
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/No file provided/);
    });
  });

  describe('GET /api/sessions/:id/files (list)', () => {
    it('returns 404 when the session does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', '/api/sessions/no-such-session/files');
      expect(r.status).toBe(404);
    });

    it('returns files for the session ordered by uploaded_at', async () => {
      const seed = makeSeed();
      seed.files.push(
        { id: 5, session_id: SESS, filename: 'a.txt', stored_name: 'u1.txt', mime_type: 'text/plain', size: 1, uploaded_at: 100, source: 'user' },
        { id: 6, session_id: SESS, filename: 'b.md', stored_name: 'u2.md', mime_type: 'text/markdown', size: 2, uploaded_at: 200, source: 'user' },
        { id: 7, session_id: 'sess_other', filename: 'other.txt', stored_name: 'u3.txt', mime_type: 'text/plain', size: 3, uploaded_at: 300, source: 'user' },
      );
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files`);
      expect(r.status).toBe(200);
      expect(r.body.files.map((f) => f.id)).toEqual([5, 6]);
      expect(r.body.files[0].filename).toBe('a.txt');
    });
  });

  describe('GET /api/sessions/:id/files/:fileId/content (inline preview)', () => {
    it('returns 404 when the file does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files/999/content`);
      expect(r.status).toBe(404);
    });

    it('returns 404 when the file belongs to a different session', async () => {
      const seed = makeSeed();
      seed.files.push({ id: 5, session_id: 'sess_other', filename: 'a.txt', stored_name: 'u1.txt', mime_type: 'text/plain', size: 1, uploaded_at: 1, source: 'user' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files/5/content`);
      expect(r.status).toBe(404);
    });

    it('serves a user file inline with Content-Disposition: inline', async () => {
      const stored = 'user-inline.txt';
      const abs = writeUserUpload(stored, 'hello-bytes');
      cleanupPaths.push(abs);
      const seed = makeSeed();
      seed.files.push({ id: 5, session_id: SESS, filename: 'hello.txt', stored_name: stored, mime_type: 'text/plain', size: 11, uploaded_at: 1, source: 'user' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files/5/content`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('text/plain');
      expect(r.headers.get('content-disposition')).toMatch(/inline/);
      expect(r.headers.get('content-disposition')).toMatch(/hello\.txt/);
      expect(r.text).toBe('hello-bytes');
    });

    it('uses stored_name as the absolute path for source=agent', async () => {
      const agentFile = path.join(tmpDir, 'agent-output.md');
      fs.writeFileSync(agentFile, '# agent\nfile');
      const seed = makeSeed();
      seed.files.push({ id: 9, session_id: SESS, filename: 'agent-output.md', stored_name: agentFile, mime_type: 'text/markdown', size: 12, uploaded_at: 1, source: 'agent' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files/9/content`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('text/markdown');
      expect(r.text).toBe('# agent\nfile');
    });

    it('returns 404 when the on-disk file is gone', async () => {
      const seed = makeSeed();
      seed.files.push({ id: 5, session_id: SESS, filename: 'gone.txt', stored_name: 'definitely-missing.txt', mime_type: 'text/plain', size: 1, uploaded_at: 1, source: 'user' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files/5/content`);
      expect(r.status).toBe(404);
      expect(r.body.error).toMatch(/no longer available/);
    });
  });

  describe('GET /api/sessions/:id/files/:fileId/download (attachment)', () => {
    it('serves a user file as attachment', async () => {
      const stored = 'user-dl.md';
      const abs = writeUserUpload(stored, 'body');
      cleanupPaths.push(abs);
      const seed = makeSeed();
      seed.files.push({ id: 5, session_id: SESS, filename: 'nice.md', stored_name: stored, mime_type: 'text/markdown', size: 4, uploaded_at: 1, source: 'user' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files/5/download`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-disposition')).toMatch(/attachment/);
      expect(r.headers.get('content-disposition')).toMatch(/nice\.md/);
      expect(r.text).toBe('body');
    });

    it('serves an agent file by its absolute stored_name path', async () => {
      const agentFile = path.join(tmpDir, 'agent-dl.txt');
      fs.writeFileSync(agentFile, 'agent-body');
      const seed = makeSeed();
      seed.files.push({ id: 7, session_id: SESS, filename: 'agent-dl.txt', stored_name: agentFile, mime_type: 'text/plain', size: 9, uploaded_at: 1, source: 'agent' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'GET', `/api/sessions/${SESS}/files/7/download`);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-disposition')).toMatch(/attachment/);
      expect(r.text).toBe('agent-body');
    });
  });

  describe('DELETE /api/sessions/:id/files/:fileId', () => {
    it('returns 404 when the file does not exist', async () => {
      const { app } = await buildApp();
      server = await listen(app);
      const r = await req(server, 'DELETE', `/api/sessions/${SESS}/files/999`);
      expect(r.status).toBe(404);
    });

    it('returns 404 when the file belongs to another session', async () => {
      const seed = makeSeed();
      seed.files.push({ id: 5, session_id: 'sess_other', filename: 'a.txt', stored_name: 'u.txt', mime_type: 'text/plain', size: 1, uploaded_at: 1, source: 'user' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'DELETE', `/api/sessions/${SESS}/files/5`);
      expect(r.status).toBe(404);
      expect(r.body.error).toMatch(/not found in this session/);
    });

    it('deletes the DB row and the on-disk user file', async () => {
      const stored = 'user-del.txt';
      const abs = writeUserUpload(stored, 'bye');
      const seed = makeSeed();
      seed.files.push({ id: 5, session_id: SESS, filename: 'ccc.txt', stored_name: stored, mime_type: 'text/plain', size: 3, uploaded_at: 1, source: 'user' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'DELETE', `/api/sessions/${SESS}/files/5`);
      expect(r.status).toBe(204);
      // DB row gone
      expect(seed.files).toHaveLength(0);
      // Disk file gone
      expect(fs.existsSync(abs)).toBe(false);
    });

    it('deletes only the DB row for source=agent (does NOT unlink the agent file)', async () => {
      const agentFile = path.join(tmpDir, 'agent-keep.txt');
      fs.writeFileSync(agentFile, 'preserve-me');
      const seed = makeSeed();
      seed.files.push({ id: 8, session_id: SESS, filename: 'agent-keep.txt', stored_name: agentFile, mime_type: 'text/plain', size: 11, uploaded_at: 1, source: 'agent' });
      const { app } = await buildApp({ seed });
      server = await listen(app);
      const r = await req(server, 'DELETE', `/api/sessions/${SESS}/files/8`);
      expect(r.status).toBe(204);
      expect(seed.files).toHaveLength(0);
      // Agent file must still exist on disk (we only removed the DB card).
      expect(fs.existsSync(agentFile)).toBe(true);
    });
  });
});
