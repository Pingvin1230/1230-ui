// 1.14 — vitest coverage: HermesAdapter (spawns run_chat.py, parses NDJSON)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Use vi.hoisted to share state between the mock factory and test body.
const h = vi.hoisted(() => ({
  lastChild: { current: null },
  override: null,
}));

function makeFakeChild() {
  const child = new EventEmitter();
  child.stdin = {
    end: vi.fn((payload) => {
      child._stdinPayload = payload;
    }),
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.exitCode = null;
  return child;
}

vi.mock('child_process', () => ({
  spawn: (...args) => {
    if (h.override) return h.override(...args);
    const c = makeFakeChild();
    h.lastChild.current = c;
    return c;
  },
}));

vi.mock('../../config.js', () => ({
  default: {
    hermesPythonPath: '/usr/bin/python3',
  },
}));

const { HermesAdapter } = await import('../lib/adapters/hermes.js');

beforeEach(() => {
  h.lastChild.current = null;
  h.override = null;
  vi.clearAllMocks();
});

const baseCtx = {
  session_id: 'sess_42',
  model: 'MiniMax-M3',
  provider: 'minimax',
  currentMessage: 'hello',
  history: [],
  messages: [],
};

async function collectEvents(gen, max = 50) {
  const out = [];
  for await (const e of gen) {
    out.push(e);
    if (out.length >= max) break;
    if (e.type === 'done' || e.type === 'error') break;
  }
  return out;
}

// Prime a generator: call .next() once so the body runs up to its first
// yield (which is `status:thinking` AFTER spawn). After this, spawn() has
// been called and h.lastChild.current is populated.
async function primeChat(ctx) {
  const adapter = new HermesAdapter();
  const gen = adapter.chat(ctx);
  // gen.next() executes body until the first yield. By that point spawn()
  // has been called (synchronously) and stdin has been written.
  await gen.next();
  return { adapter, gen };
}

describe('HermesAdapter', () => {
  describe('identity', () => {
    it('reports correct slug and displayName', () => {
      const a = new HermesAdapter();
      expect(a.slug).toBe('hermes');
      expect(a.displayName).toBe('Hermes');
    });
  });

  describe('spawn failures', () => {
    it('emits SPAWN_FAILED error when spawn throws synchronously', async () => {
      h.override = () => {
        throw new Error('ENOENT');
      };

      const adapter = new HermesAdapter();
      const events = await collectEvents(adapter.chat(baseCtx));
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('SPAWN_FAILED');
      expect(err.retryable).toBe(true);
      expect(err.details).toContain('ENOENT');
    });
  });

  describe('stdin failures', () => {
    it('emits STDIN_WRITE_FAILED when child.stdin.end throws', async () => {
      const adapter = new HermesAdapter();
      // Use override to make spawn return a child whose stdin.end throws
      // on the FIRST call only. The constructor body calls child.stdin.end
      // synchronously inside chat() so this must be in place before we
      // iterate the generator.
      const fakeChild = makeFakeChild();
      fakeChild.stdin.end = vi.fn(() => {
        throw new Error('EPIPE');
      });
      h.override = () => fakeChild;

      const events = await collectEvents(adapter.chat(baseCtx));
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('STDIN_WRITE_FAILED');
      // The child should have been killed
      expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('normal stream path', () => {
    it('writes the correct JSON payload to stdin', async () => {
      const { gen } = await primeChat({ ...baseCtx, history: [{ role: 'user', content: 'prev' }] });
      const child = h.lastChild.current;

      child.stdout.emit('data', Buffer.from(
        JSON.stringify({ event: 'done', final_response: 'ok', usage: { input: 1, output: 2 } }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const written = child.stdin.end.mock.calls[0][0];
      const parsed = JSON.parse(written);
      expect(parsed.message).toBe('hello');
      expect(parsed.history).toEqual([{ role: 'user', content: 'prev' }]);
      expect(parsed.provider).toBe('minimax');
      expect(parsed.model).toBe('MiniMax-M3');
      expect(parsed.session_id).toBe('sess_42');
    });

    it('emits status:thinking before any stdout events', async () => {
      const adapter = new HermesAdapter();
      const gen = adapter.chat(baseCtx);
      // First event yielded by the generator body is status:thinking
      const first = await gen.next();
      expect(first.value).toEqual({ type: 'status', status: 'thinking' });

      // Now emit done and close
      const child = h.lastChild.current;
      child.stdout.emit('data', Buffer.from(JSON.stringify({ event: 'done', final_response: '' }) + '\n'));
      child.emit('close', 0);
      await collectEvents(gen);
    });

    it('emits status:generating as the first stdout chunk is processed', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stdout.emit('data', Buffer.from(
        JSON.stringify({ event: 'delta', text: 'hi' }) + '\n' +
        JSON.stringify({ event: 'done', final_response: 'hi' }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const statuses = events.filter((e) => e.type === 'status');
      expect(statuses.map((s) => s.status)).toContain('generating');
    });

    it('translates delta → delta event', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stdout.emit('data', Buffer.from(
        JSON.stringify({ event: 'delta', text: 'hello' }) + '\n' +
        JSON.stringify({ event: 'done', final_response: 'hello' }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const deltas = events.filter((e) => e.type === 'delta');
      expect(deltas).toHaveLength(1);
      expect(deltas[0].text).toBe('hello');
    });

    it('translates tool_start → tool_call_start with label', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stdout.emit('data', Buffer.from(
        JSON.stringify({
          event: 'tool_start',
          id: 't1',
          name: 'bash',
          args: { command: 'ls -la' },
        }) + '\n' +
        JSON.stringify({ event: 'done', final_response: '' }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const tcs = events.find((e) => e.type === 'tool_call_start');
      expect(tcs).toBeDefined();
      expect(tcs.id).toBe('t1');
      expect(tcs.toolName).toBe('bash');
      // label is derived from args.label || args.command || args.path || name
      expect(tcs.label).toBe('ls -la');
    });

    it('translates tool_complete → tool_call_end', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stdout.emit('data', Buffer.from(
        JSON.stringify({ event: 'tool_complete', id: 't1' }) + '\n' +
        JSON.stringify({ event: 'done', final_response: '' }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const tce = events.find((e) => e.type === 'tool_call_end');
      expect(tce).toBeDefined();
      expect(tce.id).toBe('t1');
    });

    it('translates done → done event (terminates the generator)', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stdout.emit('data', Buffer.from(
        JSON.stringify({ event: 'done', final_response: 'final!', usage: { input: 5, output: 7 }, session_id: 'sess_x' }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const done = events.find((e) => e.type === 'done');
      expect(done).toBeDefined();
      expect(done.final_response).toBe('final!');
      expect(done.usage).toEqual({ input: 5, output: 7 });
      expect(done.session_id).toBe('sess_x');
    });

    it('translates error → error event with code from exception_type', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stdout.emit('data', Buffer.from(
        JSON.stringify({ event: 'error', message: 'kaboom', exception_type: 'CUSTOM_ERR' }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('CUSTOM_ERR');
      expect(err.details).toBe('kaboom');
    });

    it('synthesizes an error on non-zero exit without done event', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stderr.emit('data', Buffer.from('Traceback (most recent call last):\n  ...\nValueError: bad\n'));
      child.emit('close', 1);

      const events = await collectEvents(gen);
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      // Exit code 1 is retryable
      expect(err.retryable).toBe(true);
      // Details should include the stderr tail
      expect(err.details).toContain('ValueError: bad');
    });

    it('emits error event from NDJSON on stderr', async () => {
      const { gen } = await primeChat(baseCtx);
      const child = h.lastChild.current;

      child.stderr.emit('data', Buffer.from(
        JSON.stringify({ event: 'error', message: 'stderr error', exception_type: 'STDERR_ERR' }) + '\n'
      ));
      child.emit('close', 0);

      const events = await collectEvents(gen);
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      expect(err.code).toBe('STDERR_ERR');
    });
  });

  describe('cleanup', () => {
    it('kills the child in the finally block after a non-zero exit', async () => {
      // The adapter only invokes child.kill() inside the finally block,
      // which runs when the for-await loop exits. The loop exits when
      // next() returns null — which happens after child 'close' fires.
      // If the process exited non-zero with no done event, the adapter
      // pushes a synthetic error then closes the queue, the loop yields
      // the error, sees item.type === 'error' and breaks; finally runs.
      const adapter = new HermesAdapter();
      const gen = adapter.chat(baseCtx);
      await gen.next(); // status:thinking
      const child = h.lastChild.current;

      // No stdout events; emit close with non-zero code
      child.emit('close', 1);

      const events = await collectEvents(gen);
      const err = events.find((e) => e.type === 'error');
      expect(err).toBeDefined();
      // The finally runs after the queue empties — kill is then invoked
      // because exitCode is still null.
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('kills the child in the finally block after a clean exit (no done event)', async () => {
      // If the process exits 0 but the python wrapper forgot to send a
      // done event, the close handler does NOT push a synthetic error;
      // it just calls finish(null), which resolves waiters with null.
      // The for-await loop sees item === null → breaks → finally runs.
      // Per the source, kill IS still called in this case.
      const adapter = new HermesAdapter();
      const gen = adapter.chat(baseCtx);
      await gen.next();
      const child = h.lastChild.current;

      // No stdout events, clean exit
      child.emit('close', 0);

      await collectEvents(gen);
      // kill is still called (per the source code, exitCode stays null)
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });
});
