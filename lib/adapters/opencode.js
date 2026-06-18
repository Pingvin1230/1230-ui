/**
 * lib/adapters/opencode.js
 *
 * OpenCodeAdapter — ExecutorAdapter implementation for the `opencode serve`
 * daemon (Variant B). Talks to the daemon over HTTP REST + SSE via the
 * shared singleton from lib/opencode.js.
 *
 * The adapter is a pure event generator: it handles session resolve/create,
 * promptAsync, and SSE stream consumption. It yields ChatEvent objects and
 * does NOT touch req/res, write SSE headers, manage the INFLIGHT map, or
 * call persistHermesMessage / detectAgentFiles — those remain in the
 * dispatcher (routes/chat.js).
 *
 * @module adapters/opencode
 */

import { ExecutorAdapter } from './base.js';
import { getOpencodeClient, startOpenCodeStream, OpenCodeError } from '../opencode.js';
import { uiDb } from '../../db/connections.js';
import config from '../../config.js';

/**
 * Build the OpenCode { providerID, modelID } object from a 1230UI model
 * string and provider slug. If the model already contains "/" (i.e. it is
 * already in "providerID/modelID" form) we split on the first slash.
 *
 * @param {string} model
 * @param {string} provider
 * @returns {{ providerID: string, modelID: string }}
 */
function buildOpenCodeModel(model, provider) {
  if (model && model.includes('/')) {
    const [providerID, ...rest] = model.split('/');
    return { providerID, modelID: rest.join('/') };
  }
  return { providerID: provider, modelID: model };
}

const _sessionLocks = new Map();
async function withSessionLock(key, fn) {
  const prev = _sessionLocks.get(key) ?? Promise.resolve();
  let release;
  const next = new Promise((r) => { release = r; });
  _sessionLocks.set(key, prev.then(() => next));
  try {
    return await fn();
  } finally {
    release();
    if (_sessionLocks.get(key) === next) _sessionLocks.delete(key);
  }
}

export class OpenCodeAdapter extends ExecutorAdapter {
  get slug() { return 'opencode-1230'; }
  get displayName() { return 'OpenCode 1230'; }

  async health() {
    return getOpencodeClient().health();
  }

  /**
   * @param {import('./base.js').ChatContext} ctx
   * @returns {AsyncGenerator<import('./base.js').ChatEvent>}
   */
  async *chat(ctx) {
    const { session_id, model, provider, currentMessage, history } = ctx;
    const client = getOpencodeClient();

    // ── 1. Resolve or create the OpenCode session ─────────────────────────
    // We persist the `ses_…` id on session_meta.opencode_session_id so that a
    // 1230UI restart (or a follow-up message after the user closed the browser)
    // can re-attach to the same OpenCode session.
    let opencodeSessionId = null;
    let justCreated = false;
    try {
      if (session_id) {
        opencodeSessionId = await withSessionLock(session_id, async () => {
          const row = uiDb.prepare(
            'SELECT opencode_session_id FROM session_meta WHERE session_id = ?'
          ).get(session_id);
          let id = row?.opencode_session_id ?? null;
          if (id) {
            const exists = await client.getSession(id);
            if (!exists) {
              console.warn(`[OpenCodeAdapter] opencode session ${id} not found on daemon — creating new`);
              id = null;
            }
          }
          if (!id) {
            const created = await client.createSession(`1230ui-${session_id}`);
            id = created.id;
            uiDb.prepare(
              `INSERT INTO session_meta (session_id, opencode_session_id)
               VALUES (?, ?)
               ON CONFLICT(session_id) DO UPDATE SET opencode_session_id = excluded.opencode_session_id`
            ).run(session_id, id);
            justCreated = true;
          }
          return id;
        });
      } else {
        const created = await client.createSession(`1230ui-new`);
        opencodeSessionId = created.id;
        justCreated = true;
      }
    } catch (err) {
      console.error(`[OpenCodeAdapter] createSession failed: ${err.message}`);
      yield {
        type: 'error',
        message: 'OpenCode unavailable',
        details: `Could not create session on ${config.opencodeUrl}: ${err.message}`,
        code: err instanceof OpenCodeError ? err.code : 'OPENCODE_CONNECT_FAILED',
        retryable: true,
        suggestion: 'Check that the opencode-1230ui service is running (systemctl status opencode-1230ui.service).',
      };
      return;
    }

    // ── 2. Start the SSE consumer BEFORE firing prompt_async ──────────────
    // OpenCode's /event bus does not replay missed frames — if we await
    // promptAsync first, the events for our session may have already flowed
    // past before we subscribed.
    const abortCtrl = new AbortController();
    // Propagate caller's abort (req.on('close')) into the stream.
    // We can't pass req directly (adapters are req-agnostic), so the
    // dispatcher calls ocAdapter.abort(sessionId) on disconnect instead.
    // The abortCtrl here is for our own internal cleanup on generator return.
    const ocStream = startOpenCodeStream(client, opencodeSessionId, {
      signal: abortCtrl.signal,
      autoApprovePermissions: config.opencodeAutoApproveTools,
    });

    // ── 3. Build the messages and extract system prompt ────────────────────
    const ocModel = buildOpenCodeModel(model, provider);
    // OpenCode sessions are STATEFUL — the daemon keeps the conversation, so on
    // a normal (reused) turn we send ONLY the new user message. The exception is
    // a freshly-created session that still has prior 1230UI history (rehydration
    // after a daemon restart): there we resend the full history for this one
    // turn so the LLM does not lose context. (First-ever turn has empty history,
    // so this branch is a no-op there.)
    let promptSystem = null;
    for (const m of history) {
      if (m.role === 'system') {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        promptSystem = promptSystem ? `${promptSystem}\n\n${text}` : text;
      }
    }
    const filteredMessages = (justCreated && history.some((m) => m.role !== 'system'))
      ? [
          ...history
            .filter((m) => m.role !== 'system')
            .map((m) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
          { role: 'user', content: currentMessage },
        ]
      : [{ role: 'user', content: currentMessage }];

    // ── 4. POST the prompt ─────────────────────────────────────────────────
    try {
      await client.promptAsync(
        opencodeSessionId,
        ocModel,
        filteredMessages,
        { system: promptSystem }
      );
    } catch (err) {
      console.error(`[OpenCodeAdapter] promptAsync failed: ${err.message}`);
      ocStream.close();
      yield {
        type: 'error',
        message: 'OpenCode prompt failed',
        details: err.message,
        code: err instanceof OpenCodeError ? err.code : 'OPENCODE_PROMPT_FAILED',
        retryable: true,
        suggestion: 'Try again. If it persists, check /var/log/opencode-1230ui.log.',
      };
      return;
    }

    // ── 5. Yield status + consume the SSE stream ───────────────────────────
    yield { type: 'status', status: 'thinking' };

    let responseText = '';

    try {
      for await (const evt of ocStream.events) {
        switch (evt.type) {
          case 'delta': {
            if (!evt.text) break;
            responseText += evt.text;
            if (responseText === evt.text) {
              // First content chunk → flip status.
              yield { type: 'status', status: 'generating' };
            }
            yield { type: 'delta', text: evt.text };
            break;
          }
          case 'reasoning':
            if (evt.text) yield { type: 'reasoning', text: evt.text };
            break;
          case 'tool_start':
            yield {
              type: 'tool_call_start',
              id: evt.id,
              toolName: evt.name,
              label: evt.name,
            };
            break;
          case 'tool_complete':
            yield { type: 'tool_call_end', id: evt.id };
            break;
          case 'done':
            yield {
              type: 'done',
              final_response: evt.finalResponse || responseText,
              usage: evt.usage ?? { input: 0, output: 0 },
              model,
              provider,
            };
            return;
          case 'error':
            yield {
              type: 'error',
              message: 'OpenCode error',
              details: evt.message,
              provider,
              model,
              retryable: false,
              code: 'OPENCODE_SESSION_ERROR',
              suggestion: `OpenCode session error. Check the service: journalctl -u opencode-1230ui -n 50 (daemon at ${config.opencodeUrl})`,
            };
            return;
          default:
            yield evt;
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error(`[OpenCodeAdapter] stream error: ${err.message}`);
        yield {
          type: 'error',
          message: 'OpenCode stream error',
          details: err.message,
          retryable: true,
          code: 'OPENCODE_STREAM_ERROR',
        };
      }
    } finally {
      abortCtrl.abort();
      ocStream.close();
    }

    // Rescue path: stream ended without a 'done' event but we have content.
    if (responseText) {
      yield {
        type: 'done',
        final_response: responseText,
        usage: { input: 0, output: 0 },
        model,
        provider,
      };
    }
  }

  /**
   * Abort an in-flight session on the daemon side (called on client disconnect).
   * Non-fatal — failures are logged but never thrown.
   *
   * @param {string} opencodeSessionId
   */
  async abortSession(opencodeSessionId) {
    if (!opencodeSessionId) return;
    try {
      await getOpencodeClient().abortSession(opencodeSessionId);
    } catch {
      // Non-fatal; the daemon will time out on its own.
    }
  }

  /**
   * Look up the opencode session id for a given 1230UI session.
   * Used by the dispatcher to call abortSession on disconnect.
   *
   * @param {string|null} sessionId
   * @returns {string|null}
   */
  getOpencodeSessionId(sessionId) {
    if (!sessionId) return null;
    const row = uiDb.prepare(
      'SELECT opencode_session_id FROM session_meta WHERE session_id = ?'
    ).get(sessionId);
    return row?.opencode_session_id ?? null;
  }
}
