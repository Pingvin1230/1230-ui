/**
 * lib/adapters/base.js
 *
 * ExecutorAdapter interface (JSDoc typedefs only — zero runtime overhead).
 *
 * @module adapters/base
 */

/**
 * @typedef {Object} ChatContext
 * @property {string|null} session_id        — 1230UI session_id (sess_<ts>) or null for new sessions
 * @property {string} model                  — bare model name, e.g. "MiniMax-M3"
 * @property {string} provider               — provider slug, e.g. "minimax"
 * @property {Array<{role:string,content:string}>} messages  — full messages array
 * @property {string} currentMessage         — last user message text
 * @property {Array<{role:string,content:string}>} history   — messages before currentMessage
 * @property {string|null} dedupKey          — INFLIGHT map key (may be null for anonymous sessions)
 * @property {import('express').Request} req
 * @property {import('express').Response} res
 */

/**
 * @typedef {Object} ChatEvent
 * @property {string} type          — 'delta'|'reasoning'|'tool_start'|'tool_complete'|'done'|'error'|'status'|'agent_files'
 * @property {string} [text]        — for delta, reasoning
 * @property {string} [id]          — for tool_start, tool_complete
 * @property {string} [name]        — for tool_start (tool name)
 * @property {*} [args]             — for tool_start (tool arguments)
 * @property {*} [result]           — for tool_complete
 * @property {string} [finalResponse]   — for done
 * @property {*} [usage]            — for done { input, output }
 * @property {string} [model]       — for done
 * @property {string} [provider]    — for done
 * @property {string} [message]     — for error
 * @property {string} [executor]    — which executor produced this event ('hermes'|'opencode-1230')
 */

/**
 * ExecutorAdapter interface.
 *
 * Implementations:
 *   - OpenCodeAdapter  (lib/adapters/opencode.js) — talks to opencode serve daemon
 *   - HermesAdapter    (lib/adapters/hermes.js)   — spawns run_chat.py subprocess
 *
 * Design decision: SSE plumbing (headers, watchdog, INFLIGHT, req.on('close'),
 * persistHermesMessage, detectAgentFiles) stays in routes/chat.js to minimise
 * refactor scope. Adapters are pure event generators.
 *
 * @abstract
 */
export class ExecutorAdapter {
  /** @type {string} */
  get slug() { throw new Error('Not implemented'); }

  /** @type {string} */
  get displayName() { throw new Error('Not implemented'); }

  /**
   * Quick liveness check — returns false if the backend is unreachable.
   * @returns {Promise<boolean>}
   */
  async health() { return true; }

  /**
   * Execute a chat turn and yield ChatEvents.
   *
   * Contract:
   * - Must yield exactly one 'done' or 'error' event as the last event.
   * - Must NOT write to req/res directly.
   * - Must NOT manage SSE headers or INFLIGHT — those are the dispatcher's job.
   * - May throw; the dispatcher catches and converts to an error event.
   *
   * @param {ChatContext} ctx
   * @returns {AsyncGenerator<ChatEvent>}
   */
  async *chat(_ctx) { throw new Error('Not implemented'); }
}
