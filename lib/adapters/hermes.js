/**
 * lib/adapters/hermes.js
 *
 * HermesAdapter — ExecutorAdapter implementation for the Hermes Python
 * subprocess (run_chat.py). Spawns the subprocess, pipes the conversation
 * payload to stdin, and yields ChatEvents by parsing NDJSON from stdout.
 *
 * The adapter is a pure event generator: it does NOT write SSE headers,
 * touch req/res, manage the INFLIGHT map, call persistHermesMessage, or
 * call detectAgentFiles — those remain in the dispatcher (routes/chat.js).
 *
 * @module adapters/hermes
 */

import path from 'path';
import { spawn } from 'child_process';
import { ExecutorAdapter } from './base.js';
import config from '../../config.js';

const HERMES_PYTHON = config.hermesPythonPath;
const RUN_CHAT_SCRIPT = path.join(process.cwd(), 'run_chat.py');

export class HermesAdapter extends ExecutorAdapter {
  get slug() { return 'hermes'; }
  get displayName() { return 'Hermes'; }

  // health() inherits the default true — Hermes has no liveness endpoint;
  // the dispatcher checks for spawn errors at chat time.

  /**
   * @param {import('./base.js').ChatContext} ctx
   * @returns {AsyncGenerator<import('./base.js').ChatEvent>}
   */
  async *chat(ctx) {
    const { session_id, model, provider, currentMessage, history } = ctx;

    // ── 1. Spawn run_chat.py ───────────────────────────────────────────────
    const argv = [
      '-u', // unbuffered stdout/stderr
      RUN_CHAT_SCRIPT,
      '--session-id', session_id || `sess_${Date.now()}`,
      '--model', model,
      '--provider', provider,
      '--max-iterations', '10',
    ];

    let child;
    try {
      child = spawn(HERMES_PYTHON, argv, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
      });
    } catch (spawnErr) {
      console.error('[HermesAdapter] Failed to spawn run_chat.py:', spawnErr);
      yield {
        type: 'error',
        message: 'Hermes runtime unavailable',
        details: `Could not launch ${HERMES_PYTHON}: ${spawnErr.message}`,
        code: 'SPAWN_FAILED',
        retryable: true,
        suggestion: 'Check that the Hermes Agent venv is installed and reachable.',
      };
      return;
    }

    // ── 2. Write payload to stdin ──────────────────────────────────────────
    try {
      const stdinPayload = JSON.stringify({
        message: currentMessage,
        history,
        provider,
        model,
        session_id,
      });
      child.stdin.end(stdinPayload);
    } catch (stdinErr) {
      console.error('[HermesAdapter] Failed to write to run_chat.py stdin:', stdinErr);
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      yield {
        type: 'error',
        message: 'Failed to start Hermes conversation',
        details: stdinErr.message,
        code: 'STDIN_WRITE_FAILED',
        retryable: true,
      };
      return;
    }

    // ── 3. Stream NDJSON events from stdout ───────────────────────────────
    // We push events into a queue bridging the event-emitter world (child
    // stdout 'data') into the async-generator world (for await).
    const queue = [];
    const waiters = [];
    let done = false;
    let childError = null;

    const push = (item) => {
      if (waiters.length) {
        waiters.shift().resolve(item);
      } else {
        queue.push(item);
      }
    };

    const finish = (err) => {
      done = true;
      childError = err ?? null;
      // Drain any pending waiters with null (sentinel = end of stream).
      while (waiters.length) {
        if (err) {
          waiters.shift().reject(err);
        } else {
          waiters.shift().resolve(null);
        }
      }
    };

    const next = () => {
      if (queue.length) return Promise.resolve(queue.shift());
      if (done) return Promise.resolve(null);
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    };

    // ── stdout NDJSON parser ───────────────────────────────────────────────
    let buffer = '';
    let stderrTail = '';
    let isFirstChunk = true;

    const parseAndPush = (line) => {
      if (!line) return;
      let evt;
      try { evt = JSON.parse(line); } catch { return; }

      if (isFirstChunk) {
        push({ type: 'status', status: 'generating' });
        isFirstChunk = false;
      }

      switch (evt.event) {
        case 'delta': {
          const text = evt.text || '';
          if (text) push({ type: 'delta', text });
          break;
        }
        case 'reasoning': {
          const text = evt.text || '';
          if (text) push({ type: 'reasoning', text });
          break;
        }
        case 'tool_start': {
          const toolName = evt.name || 'tool';
          const args = evt.args || {};
          const label = args.label || args.command || args.path || toolName;
          push({ type: 'tool_call_start', id: evt.id, toolName, label });
          break;
        }
        case 'tool_complete':
          push({ type: 'tool_call_end', id: evt.id });
          break;
        case 'done':
          push({
            type: 'done',
            final_response: evt.final_response,
            usage: evt.usage || { input: 0, output: 0 },
            session_id: evt.session_id,
            model: evt.model,
            provider: evt.provider,
          });
          break;
        case 'error':
          push({
            type: 'error',
            message: 'Hermes runtime error',
            provider,
            model,
            details: evt.message || 'Unknown error from run_chat.py',
            code: evt.exception_type || 'RUNTIME_ERROR',
            retryable: false,
            suggestion: 'Please try again. If it persists, check Hermes Agent logs with: journalctl -u hermes-api -n 50',
          });
          break;
        default:
          push(evt);
      }
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let nlIdx;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);
        parseAndPush(line);
      }
    });

    child.stderr.on('data', (chunk) => {
      const s = chunk.toString('utf8');
      stderrTail += s;
      if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000);
      // Errors that arrive as NDJSON on stderr should also be surfaced.
      for (const line of s.split('\n')) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.event === 'error') parseAndPush(line);
        } catch { /* not JSON — already captured in stderrTail */ }
      }
    });

    child.on('error', (err) => {
      console.error('[HermesAdapter] child error:', err);
      finish(err);
    });

    child.on('close', (code) => {
      // Flush any trailing NDJSON that arrived without a newline.
      if (buffer.trim()) {
        try { parseAndPush(buffer.trim()); } catch { /* ignore */ }
        buffer = '';
      }

      // Non-zero exit with no done event → synthesize an error.
      if (code !== 0) {
        push({
          type: 'error',
          message: 'Provider error',
          provider,
          model,
          details: stderrTail.trim() || `run_chat.py exited with code ${code}`,
          code: String(code),
          retryable: code === 1 || code === 124,
          suggestion: 'Please try again.',
        });
      }

      finish(null);
    });

    // ── 4. Yield initial status, then drain the event queue ───────────────
    yield { type: 'status', status: 'thinking' };

    try {
      while (true) {
        const item = await next();
        if (item === null) break; // stream finished
        yield item;
        if (item.type === 'done' || item.type === 'error') break;
      }
    } catch (err) {
      console.error('[HermesAdapter] queue error:', err.message);
      yield {
        type: 'error',
        message: 'Hermes runtime error',
        details: err.message,
        retryable: true,
        suggestion: 'Please try again.',
      };
    } finally {
      // Ensure the child is cleaned up if the generator is abandoned early.
      if (child.exitCode === null) {
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
      }
    }
  }
}
