/**
 * lib/opencode.js
 *
 * OpenCode Adapter — implements ExecutorAdapter from
 * docs/executor-selection.md §0.
 *
 * Minimal HTTP + SSE client for the OpenCode `serve` daemon. The
 * `OpenCodeClient` class is a thin wrapper around fetch() that:
 *   - adds optional basic auth,
 *   - normalises errors into a typed OpenCodeError,
 *   - exposes a `health()` probe used by the system status endpoint,
 *   - exposes session lifecycle: create / get / prompt_async / abort.
 *
 * `streamOpenCodeSession()` is an async generator that subscribes to
 * `GET /event`, filters frames to the requested sessionID, and yields
 * normalized events:
 *
 *   { type: 'delta',     text }              // message.part.delta (field=text)
 *   { type: 'reasoning', text }              // message.part.delta (field=reasoning)
 *   { type: 'tool_start', id, name, args }   // message.part.updated (type=tool)
 *   { type: 'done',       finalResponse,     // session.idle (terminal)
 *                          usage, model, provider }
 *   { type: 'error',      message }          // session.error or transport error
 *
 * The generator terminates naturally after a `session.idle` or
 * `session.error` event. Callers cancel by breaking out of the `for
 * await` loop and calling `client.abortSession(sessionId)` if they
 * need to interrupt the underlying run.
 *
 * @see docs/executor-selection.md §0 (adapter interface)
 * @see docs/executor-selection.md §6.1 (this file)
 */

import { Buffer } from 'node:buffer';
import config from '../config.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenCodeError extends Error {
  constructor(message, { status, body, code } = {}) {
    super(message);
    this.name = 'OpenCodeError';
    this.status = status ?? null;
    this.body = body ?? null;
    this.code = code ?? 'OPENCODE_ERROR';
  }
}

export class OpenCodeClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl         e.g. http://127.0.0.1:4097
   * @param {string|null} [opts.username] basic auth username (optional)
   * @param {string|null} [opts.password] basic auth password (optional)
   * @param {number} [opts.timeoutMs]     per-request timeout
   * @param {string} [opts.projectId]     OpenCode projectID to attach new sessions to
   *                                        (default: '1230ui' — keeps 1230UI sessions
   *                                        isolated from the user's own `global` project)
   */
  constructor({
    baseUrl,
    username = null,
    password = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    projectId = '1230ui',
  }) {
    if (!baseUrl) throw new Error('OpenCodeClient: baseUrl is required');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.projectId = projectId;
  }

  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', Accept: 'application/json', ...extra };
    if (this.username && this.password) {
      h.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    }
    return h;
  }

  async _fetch(method, path, { body, timeoutMs, signal } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs ?? this.timeoutMs);
    // AbortSignal.any() (Node 20+) handles listener cleanup automatically
    // and replaces the previous hand-rolled anySignal() helper that leaked
    // listeners under load (addEventListener('abort', …, { once: true })
    // was never removeEventListener'd once the signal fired).
    const mergedSignal = signal
      ? AbortSignal.any([ctrl.signal, signal])
      : ctrl.signal;
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this._headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: mergedSignal,
      });
      const text = await res.text();
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch { parsed = text; }
      }
      if (!res.ok) {
        throw new OpenCodeError(
          `OpenCode ${method} ${path} -> ${res.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`,
          { status: res.status, body: parsed, code: `HTTP_${res.status}` }
        );
      }
      return parsed;
    } finally {
      clearTimeout(t);
    }
  }

  /** GET /global/health — returns true iff the daemon is reachable and healthy. */
  async health() {
    try {
      const data = await this._fetch('GET', '/global/health', { timeoutMs: 2_000 });
      return Boolean(data?.healthy);
    } catch {
      return false;
    }
  }

  /** GET /config/providers — list provider IDs and their configured models. */
  async listProviders() {
    return this._fetch('GET', '/config/providers');
  }

  /**
   * GET /provider — runtime provider catalogue from the opencode daemon.
   * Returns the raw object:
   *   {
   *     all:      [{ id, name, source, env, options, models, ... }, ...],
   *     default:  { [providerID]: modelID, ... },
   *     connected:[providerID, ...]
   *   }
   * `all` is every provider the daemon knows about (built-in + custom),
   * `connected` is the subset that has credentials resolvable right now.
   * NB: `GET /config` is a different thing (the JSONC config file), not
   * the provider list — that was an earlier mistake.
   */
  async getProviders() {
    return this._fetch('GET', '/provider');
  }

  /** POST /session — create a new OpenCode session. Returns { id, ... }. */
  async createSession(title) {
    return this._fetch('POST', '/session', {
      body: {
        title: title ?? undefined,
        projectID: this.projectId,
      },
    });
  }

  /** GET /session/:id — returns the session row, or null on 404. */
  async getSession(id) {
    try {
      return await this._fetch('GET', `/session/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof OpenCodeError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * POST /session/:id/prompt_async — start a turn.
   *
   * Accepts the unified 1230UI `messages: [{role, content}]` shape and
   * converts to OpenCode's `parts: [{type:'text', text:'...'}]` shape.
   * System messages are extracted into a top-level `system` field.
   *
   * @param {string} sessionId
   * @param {{ providerID: string, modelID: string }} model
   * @param {Array<{ role: string, content: string }>} messages
   * @param {{ system?: string }} [opts]
   */
  async promptAsync(sessionId, model, messages, opts = {}) {
    const parts = [];
    let system = opts.system || null;
    for (const m of messages) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      if (m.role === 'system') {
        system = system ? `${system}\n\n${text}` : text;
        continue;
      }
      // OpenCode v1.15.4: parts are flat text parts (no per-message role).
      // The user/assistant roles are implicit in turn ordering.
      parts.push({ type: 'text', text });
    }
    const body = { model, parts };
    if (system) body.system = system;
    return this._fetch('POST', `/session/${encodeURIComponent(sessionId)}/prompt_async`, {
      body,
      // Don't wait for the response body to come back — we read it via /event.
      // A short timeout is fine; prompt_async returns quickly.
      timeoutMs: 10_000,
      signal: opts.signal ?? undefined,
    });
  }

  /** POST /session/:id/abort — cancel an in-flight run. */
  async abortSession(sessionId) {
    try {
      return await this._fetch('POST', `/session/${encodeURIComponent(sessionId)}/abort`, {
        timeoutMs: 5_000,
      });
    } catch (err) {
      if (err instanceof OpenCodeError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * PATCH /session/:id — update session metadata on the OC daemon.
   * Used to keep the OC-side title in sync with 1230UI when the user
   * renames a session. Returns null on 404 (daemon was restarted and
   * the session is gone — non-fatal, we just keep the local title).
   *
   * @param {string} sessionId
   * @param {{ title?: string }} patch
   */
  async updateSession(sessionId, patch) {
    try {
      return await this._fetch('PATCH', `/session/${encodeURIComponent(sessionId)}`, {
        body: patch,
        timeoutMs: 5_000,
      });
    } catch (err) {
      if (err instanceof OpenCodeError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * POST /session/:id/permissions/:permissionID — respond to a tool
   * permission request emitted as a `permission.updated` SSE event.
   * `response` is one of `"once" | "always" | "reject"`.
   *
   * @param {string} sessionId
   * @param {string} permissionId
   * @param {('once'|'always'|'reject')} response
   */
  async respondPermission(sessionId, permissionId, response) {
    return this._fetch('POST', `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, {
      body: { response },
      timeoutMs: 5_000,
    });
  }
}

/**
 * Parse a chunk of `text/event-stream` bytes into SSE frames.
 * Yields objects: { event?: string, data: string, id?: string }.
 * Yields `null` for `:keepalive` comment lines so the caller can ignore them.
 *
 * A "frame" is delimited by a blank line. We accept the trailing frame
 * if the chunk does not end with a blank line.
 */
export function* parseSseChunk(chunk) {
  const text = chunk.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let current = null;
  for (const raw of lines) {
    if (raw === '') {
      if (current) { yield current; current = null; }
      continue;
    }
    if (raw.startsWith(':')) {
      yield null;
      continue;
    }
    const colon = raw.indexOf(':');
    if (colon === -1) continue;
    const field = raw.slice(0, colon);
    let value = raw.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') {
      current = current ?? { data: '' };
      current.data = current.data ? current.data + '\n' + value : value;
    } else if (field === 'event') {
      current = current ?? { data: '' };
      current.event = value;
    } else if (field === 'id') {
      current = current ?? { data: '' };
      current.id = value;
    }
  }
  if (current) { yield current; current = null; }
}

/**
 * Open a long-lived SSE consumer to /event and filter to the given
 * session id. Returns `{ events, close }` so the caller can start the
 * subscription BEFORE firing `prompt_async` (the OpenCode SSE bus does
 * not replay missed frames — events emitted before the consumer is up
 * are lost).
 *
 * The returned `events` iterable yields the same normalized ChatEvent
 * objects as `streamOpenCodeSession`.
 *
 * @param {OpenCodeClient} client
 * @param {string} sessionId
 * @param {{ signal?: AbortSignal, autoApprovePermissions?: boolean }} [opts]
 * @returns {{ events: AsyncGenerator<ChatEvent>, close: () => void }}
 */
export function startOpenCodeStream(client, sessionId, { signal, autoApprovePermissions } = {}) {
  const ctrl = new AbortController();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  // Channel between the reader task (producer) and the consumer task.
  // Use a transform stream so backpressure works for both sides.
  let producerDone = false;
  let producerError = null;
  const waiters = [];

  const pump = () => {
    while (waiters.length) {
      const w = waiters.shift();
      if (producerError) w.reject(producerError);
      else w.resolve();
    }
  };

  // Producer: opens SSE, parses, pushes events into a per-call buffer.
  const buffer = [];
  let bufferWaiters = [];
  const push = (evt) => {
    if (bufferWaiters.length) {
      const w = bufferWaiters.shift();
      w.resolve({ value: evt, done: false });
    } else {
      buffer.push(evt);
    }
  };
  const endStream = () => {
    while (bufferWaiters.length) {
      const w = bufferWaiters.shift();
      w.resolve({ value: undefined, done: true });
    }
  };

  (async () => {
    let res;
    try {
      res = await fetch(`${client.baseUrl}/event`, {
        headers: client._headers({ Accept: 'text/event-stream' }),
        signal: ctrl.signal,
      });
    } catch (err) {
      push({ type: 'error', message: `OpenCode SSE connect failed: ${err.message}` });
      producerDone = true;
      endStream();
      pump();
      return;
    }
    if (!res.ok || !res.body) {
      push({ type: 'error', message: `OpenCode SSE HTTP ${res.status}` });
      producerDone = true;
      endStream();
      pump();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let usage = null;
    let finalResponse = '';
    let meta = {};
    // Track tool-call states so we can emit tool_complete when a tool
    // transitions from 'pending' (or any in-flight state) to 'complete'
    // or 'error'. Key: part id, value: last seen state type string.
    const toolStates = new Map();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const parsed of parseSseChunk(frame)) {
            if (!parsed || !parsed.data) continue;
            let payload;
            try { payload = JSON.parse(parsed.data); } catch { continue; }
            const eventType = payload?.type;
            const props = payload?.properties ?? {};
            if (props.sessionID && props.sessionID !== sessionId) continue;
            switch (eventType) {
              case 'server.connected':
                break;
              case 'message.part.delta': {
                if (props.field === 'text') {
                  push({ type: 'delta', text: props.delta ?? '' });
                } else if (props.field === 'reasoning') {
                  push({ type: 'reasoning', text: props.delta ?? '' });
                }
                break;
              }
              case 'message.part.updated': {
                const part = props.part ?? {};
                if (part.type === 'tool') {
                  const partId = part.id ?? part.callID ?? `tool_${Date.now()}`;
                  const stateType = part.state?.type ?? part.status ?? null;
                  const prevState = toolStates.get(partId);

                  if (!prevState) {
                    // First time we see this tool part — emit tool_start.
                    toolStates.set(partId, stateType);
                    push({
                      type: 'tool_start',
                      id: partId,
                      name: part.tool ?? part.name ?? 'tool',
                      args: part.state?.input ?? part.input ?? {},
                    });
                  } else if (
                    prevState !== stateType &&
                    (stateType === 'complete' || stateType === 'error' || stateType === 'success')
                  ) {
                    // Tool transitioned to a terminal state — emit tool_complete.
                    toolStates.set(partId, stateType);
                    push({
                      type: 'tool_complete',
                      id: partId,
                      result: part.state?.output ?? part.output ?? null,
                    });
                  } else {
                    toolStates.set(partId, stateType);
                  }
                } else if (part.type === 'text' && part.text) {
                  finalResponse = part.text;
                }
                break;
              }
              case 'step-finish': {
                const t = props.tokens ?? {};
                usage = {
                  input: t.input ?? 0,
                  output: t.output ?? 0,
                  reasoning: t.reasoning ?? 0,
                };
                break;
              }
              case 'session.idle': {
                // Close any tool cards that never received a terminal state
                // (e.g. if the daemon ended the session before emitting
                // a 'complete' part update). This prevents stuck tool cards.
                for (const [partId, stateType] of toolStates) {
                  if (stateType !== 'complete' && stateType !== 'error' && stateType !== 'success') {
                    push({ type: 'tool_complete', id: partId, result: null });
                  }
                }
                toolStates.clear();
                push({
                  type: 'done',
                  finalResponse,
                  usage: usage ?? { input: 0, output: 0 },
                  model: meta.model,
                  provider: meta.provider,
                });
                producerDone = true;
                endStream();
                pump();
                return;
              }
              case 'session.error': {
                const errMsg = props.error?.message ?? props.message ?? 'OpenCode session error';
                push({ type: 'error', message: errMsg });
                producerDone = true;
                endStream();
                pump();
                return;
              }
              case 'permission.updated': {
                const p = props;
                if (autoApprovePermissions && p?.sessionID && p?.id) {
                  client.respondPermission(p.sessionID, p.id, 'once').catch((e) => {
                    console.warn(`[opencode] auto-approve failed for permission ${p.id}: ${e?.message || e}`);
                  });
                }
                break;
              }
              default:
                break;
            }
          }
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        producerError = err;
        push({ type: 'error', message: `OpenCode SSE read failed: ${err.message}` });
      }
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
      if (!producerDone) {
        push({ type: 'error', message: 'OpenCode SSE stream ended without session.idle' });
      }
      producerDone = true;
      endStream();
      pump();
    }
  })();

  const events = (async function* () {
    while (true) {
      if (buffer.length) { yield buffer.shift(); continue; }
      if (producerDone) {
        if (producerError) throw producerError;
        return;
      }
      const next = await new Promise((resolve, reject) => bufferWaiters.push({ resolve, reject }));
      if (next.done) return;
      yield next.value;
    }
  })();

  return {
    events,
    close: () => {
      if (!ctrl.signal.aborted) ctrl.abort();
      producerDone = true;
      endStream();
      pump();
    },
  };
}

/**
 * Shared OpenCodeClient holder.
 *
 * The client is created once at import time from the initial config, but can
 * be recreated at runtime via `reconfigureOpencodeClient()` (called by the
 * executor-config route after OpenCode URL/credentials are updated) so a
 * settings change takes effect without a process restart.
 *
 * `opencodeClient` is exported as a live-binding `let` for backwards
 * compatibility with importers that still reference it directly; new code
 * should use `getOpencodeClient()` at the point of use.
 */
export let opencodeClient = new OpenCodeClient({
  baseUrl: config.opencodeUrl,
  username: config.opencodeUsername ?? null,
  password: config.opencodePassword ?? null,
  projectId: '1230ui',
});

export function getOpencodeClient() {
  return opencodeClient;
}

export function reconfigureOpencodeClient() {
  opencodeClient = new OpenCodeClient({
    baseUrl: config.opencodeUrl,
    username: config.opencodeUsername ?? null,
    password: config.opencodePassword ?? null,
    projectId: '1230ui',
  });
  return opencodeClient;
}
