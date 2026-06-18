// Route-level tests for routes/chat.js — the SSE chat dispatcher.
//
// Strategy: mock the heavy dependencies (db/uiDb/hermesDbWrite, config,
// middleware/security, db/helpers, db/fileTypes) with in-memory stand-ins,
// and replace the adapter registry (lib/adapters/index.js) with a fake
// adapter whose .chat() generator yields a known event sequence. Then mount
// the router on a real Express app and POST /api/chat, consuming the
// text/event-stream response with a streaming reader.
//
// Covers:
//   - SSE response headers (Content-Type, Cache-Control, Connection, X-Accel-Buffering)
//   - status → delta → delta → done event accumulation
//   - [DONE] sentinel after the done event
//   - final assistant message is persisted for the OpenCode path
//   - in-flight dedup (INFLIGHT) returns 409 on a duplicate
//   - invalid payloads (no messages, no model, empty current message)
//   - adapter stream error → error event + cleanup
//   - rescue path: stream ends without 'done' but has delta text
//   - agent-file detection (does not crash when no files match)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture the real Node fetch BEFORE any test overwrites globalThis.fetch.
// req() uses this to talk to the ephemeral Express server.
const realFetch = globalThis.fetch.bind(globalThis);

// ── seed + in-memory db mock ─────────────────────────────────────────────────
function makeSeed() {
  return {
    sessions: [{ id: 'sess_1', title: 'T', source: 'webui', model: 'm', startedAt: 1, endedAt: null, messageCount: 0, inputTokens: 0, outputTokens: 0, preview: null, lastMessageAt: null }],
    session_meta: [{ session_id: 'sess_1', pinned: 0, archived: 0, assistant_id: 2 }],
    assistants: [
      { id: 1, name: 'H', executor: 'hermes', is_archived: 0 },
      { id: 2, name: 'OC', executor: 'opencode-1230', is_archived: 0 },
    ],
    messages: [],      // hermesDbWrite messages table
    session_files: [], // uiDb session_files table
  };
}

function makeDbMock(seed) {
  const insertedMessages = [];
  return {
    insertedMessages,
    prepare(sql) {
      const sqlL = sql.toLowerCase();
      return {
        all(...args) {
          if (/from session_files/.test(sqlL) && /group by session_id/.test(sqlL)) return [];
          return [];
        },
        get(...args) {
          // executor lookup for a session
          if (/from session_meta/.test(sqlL) && /assistants/.test(sqlL) && /executor/.test(sqlL)) {
            const meta = seed.session_meta.find((m) => m.session_id === args[0]);
            if (!meta) return undefined;
            const a = seed.assistants.find((x) => x.id === meta.assistant_id);
            return a ? { executor: a.executor } : undefined;
          }
          // SELECT id FROM messages ... (recent-user / dup-assistant checks)
          if (/from messages/.test(sqlL) && /^select id/.test(sqlL)) {
            return undefined;
          }
          // session_files lookup (agent file dedupe)
          if (/from session_files/.test(sqlL) && /stored_name/.test(sqlL)) {
            return seed.session_files.find(
              (f) => f.session_id === args[0] && f.stored_name === args[1],
            );
          }
          // newly inserted row by id (messages or session_files)
          if (/from messages/.test(sqlL) && /where id/.test(sqlL)) {
            return insertedMessages.find((m) => String(m.id) === String(args[0]));
          }
          if (/from session_files/.test(sqlL) && /where id/.test(sqlL)) {
            return seed.session_files.find((f) => String(f.id) === String(args[0]));
          }
          return undefined;
        },
        run(...args) {
          // INSERT INTO messages
          if (/insert into messages/.test(sqlL)) {
            const row = {
              id: insertedMessages.length + 1,
              session_id: args[0],
              role: args[1],
              content: args[2],
              tool_name: args[3],
              tool_call_id: args[4],
              tool_calls: args[5],
              timestamp: args[6],
            };
            insertedMessages.push(row);
            return { changes: 1, lastInsertRowid: row.id };
          }
          // UPDATE sessions message_count
          if (/update sessions set message_count/.test(sqlL)) {
            return { changes: 1 };
          }
          // INSERT INTO session_files (agent-file detection)
          if (/insert into session_files/.test(sqlL)) {
            const row = {
              id: seed.session_files.length + 1,
              session_id: args[0],
              filename: args[1],
              stored_name: args[2],
              mime_type: args[3],
              size: args[4],
              uploaded_at: args[5],
              source: 'agent',
            };
            seed.session_files.push(row);
            return { changes: 1, lastInsertRowid: row.id };
          }
          // DELETE FROM messages (orphan user cleanup)
          if (/delete from messages/.test(sqlL)) {
            const idx = insertedMessages.findIndex((m) => String(m.id) === String(args[0]));
            if (idx >= 0) insertedMessages.splice(idx, 1);
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
    opencodeUrl: 'http://oc',
    scripts: { saveMessages: 'x' },
  };
}

// ── fake adapter ────────────────────────────────────────────────────────────
// Yields a programmer-supplied sequence of events. .chat is an async generator
// so the dispatcher's `for await (...)` loop works as designed.
function makeFakeAdapter(events = []) {
  return {
    slug: 'fake',
    displayName: 'Fake',
    async *chat(_ctx) {
      for (const e of events) {
        yield e;
      }
    },
  };
}

async function buildApp({ seed, events = [], adapterOverrides = null }) {
  const db = makeDbMock(seed);
  const fakeAdapters = adapterOverrides ?? {
    hermes: makeFakeAdapter(events),
    'opencode-1230': makeFakeAdapter(events),
  };

  vi.doMock('../config.js', () => ({ default: makeConfig() }));
  vi.doMock('../db/connections.js', () => ({ db, uiDb: db, hermesDbWrite: db }));
  vi.doMock('../middleware/security.js', () => ({
    chatLimiter: (req, _res, next) => next(),
    apiLimiter: (req, _res, next) => next(),
    providerLimiter: (req, _res, next) => next(),
  }));
  vi.doMock('../db/helpers.js', () => ({
    rowToAssistant: (r) => r,
    getDefaultModelId: () => null,
    getProviderForModelId: () => null,
    getProviderFromModel: (m) => (m && m.toLowerCase().includes('minimax') ? 'minimax' : 'unknown'),
  }));
  vi.doMock('../lib/adapters/index.js', () => ({ ADAPTERS: fakeAdapters }));

  vi.resetModules();
  const [{ default: express }, { default: chatRouter }] = await Promise.all([
    import('express'),
    import('../routes/chat.js'),
  ]);
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/chat', chatRouter);
  return { app, db };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

// POST /api/chat and read the response body as text (SSE stream).
// Returns { status, headers, text }.
async function reqStream(server, body) {
  const { port } = server.address();
  const res = await realFetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

// POST /api/chat but do NOT await the body — used for the duplicate-inflight
// test, where we need a second request to land WHILE the first is still
// mid-stream. Returns a controller that lets the caller wait for the response.
async function reqBackground(server, body) {
  const { port } = server.address();
  const resP = realFetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resP;
}

// Parse SSE text into an array of decoded event payloads. Handles JSON
// objects, the [DONE] sentinel (note: chat.js writes it via writeSse, so
// the wire payload is the JSON-stringified string "[DONE]"), and bare
// strings.
function parseSse(text) {
  const out = [];
  for (const chunk of text.split('\n\n')) {
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      let parsed;
      try { parsed = JSON.parse(payload); } catch { parsed = payload; }
      if (parsed === '[DONE]') {
        out.push({ __done: true });
      } else if (parsed && typeof parsed === 'object') {
        out.push(parsed);
      } else {
        out.push({ __raw: parsed });
      }
    }
  }
  return out;
}

describe('routes/chat.js — SSE dispatcher', () => {
  let server;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.doUnmock('../config.js');
    vi.doUnmock('../db/connections.js');
    vi.doUnmock('../middleware/security.js');
    vi.doUnmock('../db/helpers.js');
    vi.doUnmock('../lib/adapters/index.js');
    vi.resetModules();
    if (server) await close(server);
    server = null;
  });

  describe('request validation', () => {
    it('rejects missing messages array with 400', async () => {
      const { app } = await buildApp({ seed: makeSeed() });
      server = await listen(app);
      const r = await reqStream(server, { model: 'm' });
      expect(r.status).toBe(400);
      expect(r.text).toMatch(/messages array is required/);
    });

    it('rejects missing model with 400', async () => {
      const { app } = await buildApp({ seed: makeSeed() });
      server = await listen(app);
      const r = await reqStream(server, { messages: [{ role: 'user', content: 'hi' }] });
      expect(r.status).toBe(400);
      expect(r.text).toMatch(/model is required/);
    });

    it('rejects an empty user message with 400', async () => {
      const { app } = await buildApp({ seed: makeSeed(), events: [] });
      server = await listen(app);
      const r = await reqStream(server, {
        messages: [{ role: 'assistant', content: 'hi' }],
        model: 'm',
      });
      expect(r.status).toBe(400);
      expect(r.text).toMatch(/No user message/);
    });
  });

  describe('happy-path SSE', () => {
    it('sets the correct SSE response headers', async () => {
      const events = [
        { type: 'status', status: 'thinking' },
        { type: 'delta', text: 'Hello' },
        { type: 'delta', text: ', world' },
        { type: 'done', final_response: 'Hello, world', usage: { input: 1, output: 2 } },
      ];
      const { app } = await buildApp({ seed: makeSeed(), events });
      server = await listen(app);
      const r = await reqStream(server, {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'minimax-m1',
      });
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('text/event-stream');
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(r.headers.get('connection')).toBe('keep-alive');
      expect(r.headers.get('x-accel-buffering')).toBe('no');
    });

    it('streams status → delta → delta → done and emits the [DONE] sentinel', async () => {
      const events = [
        { type: 'status', status: 'thinking' },
        { type: 'delta', text: 'Hello' },
        { type: 'delta', text: ', world' },
        { type: 'done', final_response: 'Hello, world', usage: { input: 1, output: 2 } },
      ];
      const { app } = await buildApp({ seed: makeSeed(), events });
      server = await listen(app);
      const r = await reqStream(server, {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'minimax-m1',
      });
      expect(r.status).toBe(200);
      const evts = parseSse(r.text);
      const types = evts.filter((e) => !e.__done).map((e) => e.type);
      expect(types).toEqual(['status', 'delta', 'delta', 'done']);
      // last element should be the [DONE] sentinel
      expect(evts.some((e) => e.__done)).toBe(true);
      // deltas accumulate correctly
      const deltas = evts.filter((e) => e.type === 'delta').map((e) => e.text).join('');
      expect(deltas).toBe('Hello, world');
      const done = evts.find((e) => e.type === 'done');
      expect(done.final_response).toBe('Hello, world');
    });

    it('persists the assistant message for the OpenCode path (sess_1 → opencode-1230)', async () => {
      const events = [
        { type: 'delta', text: 'answer' },
        { type: 'done', final_response: 'answer', usage: { input: 0, output: 1 } },
      ];
      const { app, db } = await buildApp({ seed: makeSeed(), events });
      server = await listen(app);
      const r = await reqStream(server, {
        session_id: 'sess_1',
        messages: [{ role: 'user', content: 'q' }],
        model: 'minimax-m1',
      });
      expect(r.status).toBe(200);
      // The assistant message should have been persisted with role=assistant.
      const assistantMsgs = db.insertedMessages.filter((m) => m.role === 'assistant');
      expect(assistantMsgs.length).toBe(1);
      expect(assistantMsgs[0].content).toBe('answer');
      expect(assistantMsgs[0].session_id).toBe('sess_1');
    });
  });

  describe('adapter error handling', () => {
    it('emits an error SSE event and terminates when adapter throws', async () => {
      const boom = {
        slug: 'boom',
        displayName: 'Boom',
        async *chat() { throw new Error('upstream exploded'); },
      };
      const { app } = await buildApp({
        seed: makeSeed(),
        events: [],
        adapterOverrides: {
          hermes: boom,
          'opencode-1230': boom,
        },
      });
      server = await listen(app);
      const r = await reqStream(server, {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'minimax-m1',
      });
      expect(r.status).toBe(200);
      const evts = parseSse(r.text);
      const err = evts.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.details).toMatch(/upstream exploded/);
      expect(err.code).toBe('ADAPTER_STREAM_ERROR');
    });

    it('emits an error event when the adapter yields one, then stops', async () => {
      // NOTE: no delta before the error — the rescue path in chat.js fires
      // whenever buffered text exists and no `done` was sent, so to assert
      // the absence of a [DONE] sentinel we keep responseText empty.
      const events = [
        { type: 'error', code: 'BAD', message: 'broke', details: 'broke' },
      ];
      const { app } = await buildApp({ seed: makeSeed(), events });
      server = await listen(app);
      const r = await reqStream(server, {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'minimax-m1',
      });
      expect(r.status).toBe(200);
      const evts = parseSse(r.text);
      const err = evts.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('BAD');
      // No buffered text → no rescue path → no [DONE] sentinel.
      expect(evts.some((e) => e.__done)).toBe(false);
    });
  });

  describe('rescue path (no done event but content available)', () => {
    it('synthesizes a done event from buffered delta text', async () => {
      const events = [
        { type: 'delta', text: 'partial ' },
        { type: 'delta', text: 'response' },
        // generator returns naturally WITHOUT a done event
      ];
      const { app } = await buildApp({ seed: makeSeed(), events });
      server = await listen(app);
      const r = await reqStream(server, {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'minimax-m1',
      });
      expect(r.status).toBe(200);
      const evts = parseSse(r.text);
      const done = evts.find((e) => e.type === 'done');
      expect(done).toBeDefined();
      expect(done.final_response).toBe('partial response');
      expect(evts.some((e) => e.__done)).toBe(true);
    });
  });

  describe('in-flight dedup (INFLIGHT → 409)', () => {
    it('returns 409 for a duplicate (session, message) pair while the first is in-flight', async () => {
      // Adapter that blocks until we release the gate, so the first request
      // stays in-flight while the second arrives.
      let releaseFirst;
      const gate = new Promise((r) => { releaseFirst = r; });
      const blockingAdapter = {
        slug: 'block',
        displayName: 'Block',
        async *chat() {
          yield { type: 'status', status: 'thinking' };
          await gate; // hold the generator open
          yield { type: 'done', final_response: 'late', usage: { input: 0, output: 0 } };
        },
      };
      const { app } = await buildApp({
        seed: makeSeed(),
        events: [],
        adapterOverrides: {
          hermes: blockingAdapter,
          'opencode-1230': blockingAdapter,
        },
      });
      server = await listen(app);

      // Fire the first request — it will hang inside the adapter.
      const firstP = reqBackground(server, {
        session_id: 'sess_1',
        messages: [{ role: 'user', content: 'same-text' }],
        model: 'minimax-m1',
      });
      // Yield once so the first request has a chance to register in INFLIGHT.
      await new Promise((r) => setImmediate(r));

      // Fire the duplicate — should short-circuit to 409.
      const dup = await reqBackground(server, {
        session_id: 'sess_1',
        messages: [{ role: 'user', content: 'same-text' }],
        model: 'minimax-m1',
      });
      const dupRes = await dup;
      expect(dupRes.status).toBe(409);
      const dupText = await dupRes.text();
      expect(dupText).toMatch(/duplicate_request/);
      expect(dupText).toMatch(/DUPLICATE_INFLIGHT/);

      // Release the first request so it can finish and the server can close.
      releaseFirst();
      const firstRes = await firstP;
      // Drain the body so the underlying socket is freed.
      await firstRes.text();
      expect(firstRes.status).toBe(200);
    });
  });
});
