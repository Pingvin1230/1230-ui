// 1.14 — vitest coverage: OpenCodeAdapter (executor for opencode serve daemon)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────
// We need:
//  - `getOpencodeClient()` accessor returning the mock client (health/
//    getSession/createSession/promptAsync/abortSession/updateSession) and
//    `startOpenCodeStream`
//  - `uiDb` with a prepare(...).get(...)/.run(...) chain
//  - `config` to be importable (use the real one — no schema validation
//    side-effects if HERMES_DB_PATH exists in .env)

const mockClient = {
  health: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  promptAsync: vi.fn(),
  abortSession: vi.fn(),
  updateSession: vi.fn(),
};
const mockStartStream = vi.fn();

vi.mock('../lib/opencode.js', () => {
  // Class kept for instanceof checks
  class OpenCodeError extends Error {
    constructor(message, opts = {}) {
      super(message);
      this.name = 'OpenCodeError';
      this.status = opts.status ?? null;
      this.body = opts.body ?? null;
      this.code = opts.code ?? 'OPENCODE_ERROR';
    }
  }
  return {
    OpenCodeError,
    getOpencodeClient: () => mockClient,
    opencodeClient: mockClient,
    startOpenCodeStream: mockStartStream,
  };
});

const prepareMock = vi.fn();
const mockDb = {
  prepare: prepareMock,
};
vi.mock('../db/connections.js', () => ({
  uiDb: mockDb,
}));

// Import AFTER vi.mock so the mocks are wired in.
const adaptersMod = await import('../lib/adapters/opencode.js');
const OpenCodeAdapter = adaptersMod.OpenCodeAdapter;
// Re-import the mocked OpenCodeError so the test can `instanceof` it
const { OpenCodeError } = await import('../lib/opencode.js');

// ── Helpers ─────────────────────────────────────────────────────────────
function makeStatement(impl) {
  // Mirrors better-sqlite3 Statement: chainable, methods return what impl says
  const stmt = {
    get: vi.fn().mockImplementation(impl.get ?? (() => undefined)),
    run: vi.fn().mockImplementation(impl.run ?? (() => ({ changes: 1 }))),
    all: vi.fn().mockImplementation(impl.all ?? (() => [])),
  };
  return stmt;
}

function mockStreamWithEvents(events) {
  // Returns the shape startOpenCodeStream() produces.
  // events: array of { type, ... } to push into the async generator.
  const close = vi.fn();
  const asyncGen = (async function* () {
    for (const e of events) yield e;
  })();
  return {
    events: asyncGen,
    close,
  };
}

async function collectEvents(gen) {
  const out = [];
  for await (const e of gen) out.push(e);
  return out;
}

const baseCtx = {
  session_id: 'sess_123',
  model: 'MiniMax-M3',
  provider: 'minimax',
  currentMessage: 'hello',
  history: [],
  messages: [{ role: 'user', content: 'hello' }],
};

// ── Reset between tests ────────────────────────────────────────────────
beforeEach(() => {
  // resetAllMocks clears mockReturnValue/mockReturnValueOnce/mockResolvedValue
  // implementations, so tests don't inherit each other's stubs.
  vi.resetAllMocks();
  // Default: startStream returns a no-event stream
  mockStartStream.mockReturnValue(mockStreamWithEvents([]));
  // Default: promptAsync resolves
  mockClient.promptAsync.mockResolvedValue(undefined);
  // Default: createSession returns a fresh id
  mockClient.createSession.mockResolvedValue({ id: 'ses_oc_new' });
  // Default: getSession returns an existing row
  mockClient.getSession.mockResolvedValue({ id: 'ses_oc_existing' });
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ───────────────────────────────────────────────────────────────
describe('OpenCodeAdapter', () => {
  describe('session resolution', () => {
    it('reuses persisted opencode_session_id without calling createSession', async () => {
      // session_meta row already has an OC id
      const getStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_persisted' }) });
      prepareMock.mockReturnValue(getStmt);

      const adapter = new OpenCodeAdapter();
      const gen = adapter.chat({ ...baseCtx, session_id: 'sess_123' });
      // First yielded event should be 'status:thinking'; consume a few to ensure
      // the create path is NOT taken.
      const events = [];
      for await (const e of gen) {
        events.push(e);
        if (events.length >= 2) break; // don't need to drain full stream
      }

      expect(mockClient.createSession).not.toHaveBeenCalled();
      // getSession WAS called to verify the OC daemon still knows it
      expect(mockClient.getSession).toHaveBeenCalledWith('ses_persisted');
    });

    it('recreates session when persisted id is stale (getSession returns null)', async () => {
      const getStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_stale' }) });
      const insertStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_oc_new' }) });
      // SELECT first → existing; INSERT ... ON CONFLICT DO NOTHING RETURNING → new
      prepareMock
        .mockReturnValueOnce(getStmt)   // session_meta lookup
        .mockReturnValueOnce(insertStmt); // insert binding

      mockClient.getSession.mockResolvedValue(null); // 404 on daemon
      mockClient.createSession.mockResolvedValue({ id: 'ses_oc_new' });

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat({ ...baseCtx, session_id: 'sess_123' }));
      // Must not contain an error event
      expect(events.find((e) => e.type === 'error')).toBeUndefined();
      expect(mockClient.createSession).toHaveBeenCalledTimes(1);
    });

    it('creates a new session and persists the binding when no persisted id exists', async () => {
      const selectEmpty = makeStatement({ get: () => undefined });
      const insertStmt = makeStatement({ run: () => ({ changes: 1 }) });
      prepareMock
        .mockReturnValueOnce(selectEmpty)  // session_meta lookup → no row
        .mockReturnValueOnce(insertStmt);   // INSERT ... ON CONFLICT DO UPDATE

      mockClient.createSession.mockResolvedValue({ id: 'ses_oc_new' });

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat({ ...baseCtx, session_id: 'sess_123' }));
      expect(mockClient.createSession).toHaveBeenCalledTimes(1);
      // INSERT statement should have been called with the (session_id, oc_id) tuple
      expect(insertStmt.run).toHaveBeenCalledWith('sess_123', 'ses_oc_new');
      // No error events
      expect(events.find((e) => e.type === 'error')).toBeUndefined();
    });

    it('creates a session WITHOUT persisting when session_id is null (free chat)', async () => {
      mockClient.createSession.mockResolvedValue({ id: 'ses_free' });

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat({ ...baseCtx, session_id: null }));
      expect(mockClient.createSession).toHaveBeenCalledTimes(1);
      // prepare() should not have been called (no SELECT, no INSERT)
      expect(prepareMock).not.toHaveBeenCalled();
    });

    it('on rehydration (stale binding), resends full history for that one turn', async () => {
      // session_meta returns a stale id; getSession 404s; createSession returns
      // a new id. With prior history present, promptAsync must be called with
      // the full history (system stripped) + currentMessage so the freshly
      // created OC session keeps the LLM context.
      const getStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_stale' }) });
      const insertStmt = makeStatement({ run: () => ({ changes: 1 }) });
      prepareMock
        .mockReturnValueOnce(getStmt)    // session_meta lookup → stale binding
        .mockReturnValueOnce(insertStmt); // INSERT new binding

      mockClient.getSession.mockResolvedValue(null);      // daemon lost the session
      mockClient.createSession.mockResolvedValue({ id: 'ses_oc_new' });

      const adapter = new OpenCodeAdapter();
      const ctx = {
        ...baseCtx,
        session_id: 'sess_123',
        currentMessage: 'and how do I differentiate it?',
        history: [
          { role: 'system', content: 'You are a calculus tutor.' },
          { role: 'user', content: 'what is an integral?' },
          { role: 'assistant', content: 'an integral is ...' },
        ],
      };
      await collectEvents(adapter.chat(ctx));

      expect(mockClient.createSession).toHaveBeenCalledTimes(1);
      expect(mockClient.promptAsync).toHaveBeenCalledTimes(1);
      const [, , messagesArg, optsArg] = mockClient.promptAsync.mock.calls[0];
      // System message is lifted out of history into the `system` opt, and the
      // remaining history + currentMessage is sent as the messages body.
      expect(messagesArg).toEqual([
        { role: 'user', content: 'what is an integral?' },
        { role: 'assistant', content: 'an integral is ...' },
        { role: 'user', content: 'and how do I differentiate it?' },
      ]);
      expect(optsArg.system).toBe('You are a calculus tutor.');
    });
  });

  describe('prompt body (stateful OC session)', () => {
    it('sends ONLY the new user message — does not resend history', async () => {
      const getStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_persisted' }) });
      prepareMock.mockReturnValue(getStmt);

      const adapter = new OpenCodeAdapter();
      const ctx = {
        ...baseCtx,
        session_id: 'sess_123',
        currentMessage: 'what is an integral?',
        history: [
          { role: 'user', content: 'Ghbdtn' },
          { role: 'assistant', content: 'Hi! How can I help?' },
          { role: 'user', content: 'what is an integral?' },
        ],
      };
      await collectEvents(adapter.chat(ctx));

      expect(mockClient.promptAsync).toHaveBeenCalledTimes(1);
      const messagesArg = mockClient.promptAsync.mock.calls[0][2];
      expect(messagesArg).toEqual([{ role: 'user', content: 'what is an integral?' }]);
    });

    it('lifts a system message from history into the system field, not into parts', async () => {
      const getStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_persisted' }) });
      prepareMock.mockReturnValue(getStmt);

      const adapter = new OpenCodeAdapter();
      const ctx = {
        ...baseCtx,
        session_id: 'sess_123',
        currentMessage: 'hi',
        history: [{ role: 'system', content: 'You are a concise assistant.' }],
      };
      await collectEvents(adapter.chat(ctx));

      const [, , messagesArg, optsArg] = mockClient.promptAsync.mock.calls[0];
      expect(messagesArg).toEqual([{ role: 'user', content: 'hi' }]);
      expect(optsArg.system).toBe('You are a concise assistant.');
    });
  });

  describe('error handling', () => {
    it('emits error with suggestion containing systemctl status when createSession throws', async () => {
      // No persisted id → goes to createSession path
      const selectEmpty = makeStatement({ get: () => undefined });
      prepareMock.mockReturnValueOnce(selectEmpty);
      mockClient.createSession.mockRejectedValue(new Error('ECONNREFUSED'));

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat({ ...baseCtx, session_id: 'sess_1' }));
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('OPENCODE_CONNECT_FAILED');
      expect(err.suggestion).toContain('systemctl status opencode-1230ui.service');
      expect(err.retryable).toBe(true);
    });

    it('emits OPENCODE_PROMPT_FAILED when promptAsync throws', async () => {
      // We need a happy session resolve path → reuse persisted
      const getStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_1' }) });
      prepareMock.mockReturnValue(getStmt);
      mockClient.promptAsync.mockRejectedValue(new Error('boom'));

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat({ ...baseCtx, session_id: 'sess_1' }));
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('OPENCODE_PROMPT_FAILED');
      expect(err.retryable).toBe(true);
    });

    it('uses OpenCodeError.code if it is an OpenCodeError instance', async () => {
      const selectEmpty = makeStatement({ get: () => undefined });
      prepareMock.mockReturnValueOnce(selectEmpty);
      mockClient.createSession.mockRejectedValue(
        new OpenCodeError('bad', { code: 'HTTP_502' })
      );

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat({ ...baseCtx, session_id: 'sess_1' }));
      const err = events.find((e) => e.type === 'error');
      expect(err.code).toBe('HTTP_502');
    });
  });

  describe('SSE event translation', () => {
    function setupHappyPath() {
      const getStmt = makeStatement({ get: () => ({ opencode_session_id: 'ses_1' }) });
      prepareMock.mockReturnValue(getStmt);
    }

    it('translates tool_start → tool_call_start', async () => {
      setupHappyPath();
      mockStartStream.mockReturnValue(
        mockStreamWithEvents([
          { type: 'tool_start', id: 'part1', name: 'bash', args: { cmd: 'ls' } },
          { type: 'done', finalResponse: 'ok', usage: { input: 1, output: 2 } },
        ])
      );

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat(baseCtx));
      const tcs = events.find((e) => e.type === 'tool_call_start');
      expect(tcs).toBeDefined();
      expect(tcs.id).toBe('part1');
      expect(tcs.toolName).toBe('bash');
      expect(tcs.label).toBe('bash');
    });

    it('translates tool_complete → tool_call_end', async () => {
      setupHappyPath();
      mockStartStream.mockReturnValue(
        mockStreamWithEvents([
          { type: 'tool_complete', id: 'part1', result: 'output' },
          { type: 'done', finalResponse: 'ok', usage: { input: 0, output: 0 } },
        ])
      );

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat(baseCtx));
      const tce = events.find((e) => e.type === 'tool_call_end');
      expect(tce).toBeDefined();
      expect(tce.id).toBe('part1');
    });

    it('translates done → done with final_response', async () => {
      setupHappyPath();
      mockStartStream.mockReturnValue(
        mockStreamWithEvents([
          { type: 'done', finalResponse: 'final!', usage: { input: 5, output: 7 } },
        ])
      );

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat(baseCtx));
      const done = events.find((e) => e.type === 'done');
      expect(done).toBeDefined();
      expect(done.final_response).toBe('final!');
      expect(done.usage).toEqual({ input: 5, output: 7 });
    });

    it('yields status:thinking before any other event from the stream', async () => {
      setupHappyPath();
      // No events on the stream; pump just the 'thinking' status.
      mockStartStream.mockReturnValue(mockStreamWithEvents([]));

      const adapter = new OpenCodeAdapter();
      const gen = adapter.chat(baseCtx);
      const first = await gen.next();
      expect(first.value).toEqual({ type: 'status', status: 'thinking' });
      // Don't await the rest — close it
      await gen.return(undefined);
    });

    it('translates delta events to delta events', async () => {
      setupHappyPath();
      mockStartStream.mockReturnValue(
        mockStreamWithEvents([
          { type: 'delta', text: 'Hello' },
          { type: 'delta', text: ' world' },
          { type: 'done', finalResponse: 'Hello world', usage: { input: 0, output: 0 } },
        ])
      );

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat(baseCtx));
      const deltas = events.filter((e) => e.type === 'delta');
      expect(deltas.map((d) => d.text)).toEqual(['Hello', ' world']);
    });

    it('emits status:generating on the first delta', async () => {
      setupHappyPath();
      mockStartStream.mockReturnValue(
        mockStreamWithEvents([
          { type: 'delta', text: 'X' },
          { type: 'done', finalResponse: 'X', usage: { input: 0, output: 0 } },
        ])
      );

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat(baseCtx));
      const statuses = events.filter((e) => e.type === 'status');
      expect(statuses.map((s) => s.status)).toEqual(['thinking', 'generating']);
    });

    it('translates stream error → error event with code OPENCODE_SESSION_ERROR', async () => {
      setupHappyPath();
      mockStartStream.mockReturnValue(
        mockStreamWithEvents([
          { type: 'error', message: 'model overloaded' },
        ])
      );

      const adapter = new OpenCodeAdapter();
      const events = await collectEvents(adapter.chat(baseCtx));
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('OPENCODE_SESSION_ERROR');
      expect(err.details).toBe('model overloaded');
      expect(err.retryable).toBe(false);
    });

    it('closes the stream on done', async () => {
      setupHappyPath();
      const stream = mockStreamWithEvents([{ type: 'done', finalResponse: '', usage: { input: 0, output: 0 } }]);
      mockStartStream.mockReturnValue(stream);

      const adapter = new OpenCodeAdapter();
      await collectEvents(adapter.chat(baseCtx));
      // close() is called in the finally block
      expect(stream.close).toHaveBeenCalled();
    });
  });

  describe('identity', () => {
    it('reports correct slug and displayName', () => {
      const adapter = new OpenCodeAdapter();
      expect(adapter.slug).toBe('opencode-1230');
      expect(adapter.displayName).toBe('OpenCode 1230');
    });

    it('health() delegates to opencodeClient.health()', async () => {
      mockClient.health.mockResolvedValue(true);
      const adapter = new OpenCodeAdapter();
      await expect(adapter.health()).resolves.toBe(true);
      expect(mockClient.health).toHaveBeenCalledTimes(1);
    });
  });

  describe('abortSession', () => {
    it('returns silently when opencodeSessionId is null', async () => {
      const adapter = new OpenCodeAdapter();
      await expect(adapter.abortSession(null)).resolves.toBeUndefined();
      expect(mockClient.abortSession).not.toHaveBeenCalled();
    });

    it('swallows errors from the daemon (non-fatal)', async () => {
      mockClient.abortSession.mockRejectedValue(new Error('boom'));
      const adapter = new OpenCodeAdapter();
      await expect(adapter.abortSession('ses_1')).resolves.toBeUndefined();
    });
  });
});
