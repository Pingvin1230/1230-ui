# Adding a New Executor to 1230UI

**Status:** v0.9.3+
**Audience:** contributors adding a third chat backend (e.g. Claude-direct, a custom OpenAI-compatible gateway, a local LLM server)

This document shows the complete step-by-step recipe for plugging a new AI backend into 1230UI alongside the existing `hermes` and `opencode-1230` executors. The work is bounded: **one new file, one entry in a registry, one i18n key**, plus the executor-specific plumbing. No changes to the dispatcher, the SSE contract, the `INFLIGHT` map, persistence, or the frontend.

The example throughout is a hypothetical `claude-direct` executor that talks to Anthropic's API directly (not via Hermes), but the same steps apply to any backend.

---

## 1. The contract

Every executor is a class that extends `ExecutorAdapter` (`lib/adapters/base.js`). The interface is small:

```ts
class ExecutorAdapter {
  // Stable identifier; matches the value in assistants.executor and session_meta lookups.
  get slug(): string;
  // Human-readable name for the UI ("Hermes", "OpenCode 1230", "Claude Direct", …).
  get displayName(): string;

  // Liveness check. Returns false → the option is hidden in the UI.
  async health(): Promise<boolean>;

  // Run a chat turn and yield ChatEvents. The dispatcher does
  //   for await (const evt of adapter.chat(ctx)) writeSse(evt);
  // so this is a pure event generator — it MUST NOT touch req/res,
  // SSE headers, INFLIGHT, or persistence.
  async *chat(ctx: ChatContext): AsyncGenerator<ChatEvent>;
}
```

The full `ChatContext` and `ChatEvent` typedefs are in `lib/adapters/base.js`. The minimum a new adapter must yield:

- Any number of `delta` / `reasoning` / `status` / `tool_call_start` / `tool_call_end` events.
- **Exactly one terminal event**: either `done` (with `final_response` and `usage`) or `error` (with `message` and `retryable`).
- Throw only for programmer errors (bugs). Runtime errors (network, provider failure) become `error` events.

The dispatcher in `routes/chat.js` will wrap your generator in the SSE framing, dedup, watchdog, persistence, and `req.on('close')` cleanup. You don't have to do any of that.

---

## 2. Worked example: `claude-direct`

We will add a third executor that bypasses Hermes and calls Anthropic's Messages API directly.

### Step 1 — Implement the adapter

Create `lib/adapters/claude.js`:

```js
/**
 * lib/adapters/claude.js
 *
 * ClaudeDirectAdapter — ExecutorAdapter implementation that talks to
 * Anthropic's Messages API directly, bypassing Hermes Agent.
 *
 * @module adapters/claude
 */

import Anthropic from '@anthropic-ai/sdk';
import { ExecutorAdapter } from './base.js';
import config from '../../config.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export class ClaudeDirectAdapter extends ExecutorAdapter {
  get slug() { return 'claude-direct'; }
  get displayName() { return 'Claude Direct'; }

  async health() {
    // Quick, cheap check. Return false to hide the option in the UI.
    try {
      // Anthropic has no "ping" endpoint — use a 1-token messages call.
      // Better: just resolve true if apiKey is set; let the chat path
      // surface real errors to the user.
      return Boolean(config.anthropicApiKey);
    } catch {
      return false;
    }
  }

  async *chat(ctx) {
    const { currentMessage, history, model } = ctx;

    yield { type: 'status', status: 'thinking' };

    try {
      const response = await client.messages.create({
        model: model || 'claude-opus-4-6',
        max_tokens: 4096,
        messages: [
          ...history
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: currentMessage },
        ],
      });

      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
          yield { type: 'delta', text: block.text };
        }
      }

      yield {
        type: 'done',
        final_response: text,
        usage: {
          input: response.usage?.input_tokens ?? 0,
          output: response.usage?.output_tokens ?? 0,
        },
        model: response.model,
        provider: 'anthropic',
      };
    } catch (err) {
      yield {
        type: 'error',
        message: 'Claude Direct request failed',
        details: err.message,
        code: 'CLAUDE_DIRECT_ERROR',
        retryable: true,
        suggestion: 'Check ANTHROPIC_API_KEY in Settings → Executor Configuration.',
      };
    }
  }
}
```

Note what this class does **not** do:

- No `req` / `res`.
- No `INFLIGHT.set(...)`.
- No `persistHermesMessage(...)`.
- No `res.setHeader(...)` / `res.write(...)`.
- No `child_process.spawn(...)`.
- No `AbortSignal` plumbing for the client (the dispatcher owns the abort; if you need to interrupt a long stream, yield a `done` event when the caller's generator is `return()`-ed — the dispatcher will then `break` out of the for-await loop).

### Step 2 — Register the adapter

Edit `lib/adapters/index.js`:

```js
import { OpenCodeAdapter } from './opencode.js';
import { HermesAdapter } from './hermes.js';
import { ClaudeDirectAdapter } from './claude.js';     // <-- new

export const ADAPTERS = {
  'hermes': new HermesAdapter(),
  'opencode-1230': new OpenCodeAdapter(),
  'claude-direct': new ClaudeDirectAdapter(),         // <-- new
};

export { ExecutorAdapter } from './base.js';
export { HermesAdapter } from './hermes.js';
export { OpenCodeAdapter } from './opencode.js';
export { ClaudeDirectAdapter } from './claude.js';    // <-- new
```

That's it for the dispatcher side. The lookup `ADAPTERS[slug]` will resolve your new adapter on the next request.

### Step 3 — Whitelist the slug in the assistants CRUD

`routes/assistants.js` keeps an allowlist:

```js
const ASSISTANT_EXECUTORS = new Set(['hermes', 'opencode-1230']);
//                                       ^ add 'claude-direct' here
const ASSISTANT_EXECUTORS = new Set(['hermes', 'opencode-1230', 'claude-direct']);
```

If you skip this step, the user can save an assistant with `executor='claude-direct'` in the form, but the backend will reject the INSERT with 400. The dispatcher will also refuse to route to an unknown slug and fall back to `hermes` — silent failure, bad UX. Always whitelist explicitly.

### Step 4 — Add i18n keys

Edit each of `src/i18n/locales/{en,ru,es,de}/translation.json`. Add the following keys under the existing `assistants` namespace:

```json
"executor.claude-direct": "Claude Direct",
"executorBadge.claude-direct": "✨ Claude Direct"
```

The first is the label in the executor picker on the assistant editor page. The second is the badge shown on the assistant tile and on each assistant message in the chat (`"via Hermes"`, `"via OpenCode"`, `"via Claude Direct"`).

The `executorLabel`, `executorHint`, `executorUnavailable`, `executorDownOnSave`, `executorChecking`, `executorRetry`, and `executorDownInline` keys are already shared across all executors — no new keys needed for those.

### Step 5 (optional) — Surface in `types/assistant.ts`

`src/types/assistant.ts` has a const list of the executor options. Extend it so the assistant editor's radio-button picker shows the new option:

```ts
export const EXECUTOR_OPTIONS = [
  { id: 'hermes',         emoji: '🤖', label: 'assistants.executor.hermes' },
  { id: 'opencode-1230',  emoji: '⚡', label: 'assistants.executor.opencode-1230' },
  { id: 'claude-direct',  emoji: '✨', label: 'assistants.executor.claude-direct' },  // <-- new
] as const;

export type AssistantExecutorId = typeof EXECUTOR_OPTIONS[number]['id'];
```

This is the only frontend change strictly required to make the new executor selectable. The badge component (`AssistantTile.tsx`) and the message-level indicator (`ChatPage.tsx`) both pull from the `executorBadge.<slug>` translation key, so they work automatically once the i18n keys are present.

### Step 6 (optional) — Configuration UI

If the new executor needs user-configurable values (URL, API key, etc.), mirror the OpenCode pattern:

1. Add the env vars / encrypted settings to `routes/system.js` `GET/POST /api/system/executor-config`.
2. Add a section to `SettingsPage.tsx` "Executor Configuration" for the new fields.
3. Add a config helper in `server.js` that decrypts the values at startup and merges them into `config`.

If the new executor takes only static configuration (a build-time API key in `.env`, for example), no Settings UI is needed — just document the env var in `.env.example` and `docs/CONFIGURATION.md`.

### Step 7 (optional) — Tests

Add `tests/adapters-claude.test.js`. The pattern is the same as the existing `tests/adapters-opencode.test.js`: mock the Anthropic SDK with `vi.mock(...)`, drive the generator, and assert the yielded events.

If the adapter is thin (just an SDK wrapper), 3-5 tests are enough:

1. Happy path yields `delta` events then a `done` event.
2. SDK throws → adapter yields a single `error` event with the right code.
3. Adapter slug and displayName are correct.
4. Adapter is registered in `ADAPTERS`.
5. `health()` returns the expected boolean.

---

## 3. The contract in detail

### `ChatContext` (input to `chat(ctx)`)

```ts
type ChatContext = {
  session_id: string | null;          // 1230UI session id ('sess_<ts>') or null for free chat
  model: string;                       // user-selected model id
  provider: string;                    // provider slug (from getProviderFromModel)
  messages: Array<{role, content}>;    // full conversation (history + current)
  currentMessage: string;              // last user message text
  history: Array<{role, content}>;     // everything before currentMessage
  dedupKey: string | null;             // INFLIGHT map key (you don't need this; the dispatcher manages dedup)
  req: import('express').Request;      // provided but DO NOT use it for streaming
  res: import('express').Response;     // provided but DO NOT use it for streaming
};
```

### `ChatEvent` (output of `yield …`)

```ts
type ChatEvent = {
  type: 'delta' | 'reasoning' | 'tool_call_start' | 'tool_call_end' |
        'done' | 'error' | 'status' | 'agent_files';
  // type-specific fields — see lib/adapters/base.js for the full typedef
};
```

Frontend behaviour per type (from `src/lib/api.ts`):

| Event | Frontend does |
|---|---|
| `delta` | Appends `text` to the streaming assistant bubble |
| `reasoning` | Appends to a collapsible reasoning panel (if shown) |
| `tool_call_start` | Opens a tool card with the tool name and args |
| `tool_call_end` | Closes the tool card (success or error) |
| `status: 'thinking'` | Shows the "thinking" indicator |
| `status: 'generating'` | Shows the "generating" indicator (replaces thinking) |
| `done` | Finalises the assistant message, persists, hides indicators |
| `error` | Shows error toast, closes the message |
| `agent_files` | Renders file download cards inside the assistant message |

Yielding an unknown `type` is allowed — the dispatcher forwards it via `yield evt` to the SSE stream and the frontend ignores it.

---

## 4. Common pitfalls

1. **Touching `res` directly** — the dispatcher is the only thing that writes to `res`. If you call `res.write(...)` from the adapter you'll corrupt the SSE framing (the dispatcher will double-write headers or interleave events). The `req` and `res` fields on the context are provided for spawn-style adapters (Hermes needs `req.on('close')` for SIGTERM escalation) but the OpenCode pattern (a separate `abort()` method on the adapter) is preferred for HTTP-style backends.

2. **Forgetting to yield a terminal event** — every generator MUST end with exactly one `done` or `error` event. The dispatcher relies on this to know when to flush and close the SSE stream. If your generator returns without yielding a terminal event, the dispatcher's rescue path kicks in (yields a synthetic `done` with whatever text was buffered) but this is a fallback, not a contract.

3. **Yielding two `done` events** — the dispatcher treats the first `done` as terminal and `break`s out of the for-await loop. A second `done` would never be reached. Don't try to "double-tap" the terminal event; if you have multiple completion signals (e.g. an SDK calls back twice), guard with a local flag:

   ```js
   let doneEmitted = false;
   const finish = (evt) => {
     if (doneEmitted) return;
     doneEmitted = true;
     // ... push evt to consumer ...
   };
   ```

4. **Blocking the event loop** — `chat(ctx)` is an async generator. The dispatcher awaits each `yield`. If your generator does heavy CPU work between yields, the browser sees long pauses between SSE events. Yield `delta` events frequently (per token if possible) to keep the UX smooth.

5. **Not using the dispatcher's `AbortSignal`** — the dispatcher calls `adapter.abort?.(sessionId)` on `req.on('close')` if your adapter exposes an `abort` method. Without it, the user closing the browser tab does not stop the underlying work. See `OpenCodeAdapter.abortSession()` in `lib/adapters/opencode.js:243-250` for the pattern.

6. **Re-sending the full history to a stateful daemon** — the OpenCode daemon keeps the conversation in-process. On a reused session the adapter sends **only the new user turn** (`currentMessage`); flattening `history` into one glued prompt makes the daemon re-see every prior turn and produces duplicated / confused context. History is resent in full **exactly once** — right after a `getSession` 404, to rehydrate a freshly-created session that still has prior 1230UI history (see the `justCreated` branch in `OpenCodeAdapter.chat()`). If your backend is stateful, model your send logic on that adapter, not on the stateless Hermes one.

7. **Losing the backend-session binding with `INSERT … ON CONFLICT DO NOTHING`** — the `opencode_session_id` (or equivalent) binding on `session_meta` must be written with an **upsert** (`INSERT … ON CONFLICT(session_id) DO UPDATE SET opencode_session_id = excluded.opencode_session_id`). `DO NOTHING` silently no-ops when the row already exists, so a daemon-side session swap (the old OC session was evicted and a new one created) never persists the new id and every subsequent turn re-triggers creation. The same applies to pin/archive writes: they must be **column-preserving upserts** (`UPDATE session_meta SET pinned=? WHERE session_id=?`, or an `INSERT … ON CONFLICT DO UPDATE` that only touches the pinned/archived columns). Never use `INSERT OR REPLACE` — it wipes every column not named in the statement, including `opencode_session_id`, `assistant_id`, and `executor`.

8. **Forgetting the per-session create mutex** — two concurrent `POST /api/chat` for the same session (e.g. a double-send before dedup lands) will both pass the "no binding yet" check and both call `createSession`. Wrap the resolve-or-create block in a per-session lock (`withSessionLock(session_id, …)` in the OpenCode adapter) so only one creation races.

9. **Dropping the orphan user row on adapter failure** — if the adapter errors after the user turn was persisted but before the assistant reply lands, delete the orphan user row in the error path so the next turn does not see a dangling user message with no reply. `routes/chat.js` does this in its cleanup; if your adapter persists eagerly, mirror it.

10. **Whitespace-sensitive merge dedup** — when merging backend history with the local DB (the OpenCode path merges OC messages with Hermes `state.db` rows), normalise whitespace before comparing, or trailing-newline differences will produce duplicate messages.

---

## 5. Tool permission handling (OpenCode / stateful daemons)

The OpenCode daemon emits a `permission.updated` SSE event on its `/event` bus whenever the model wants to run a tool that needs approval (`bash`, `edit`, …). The adapter handles it automatically:

1. The stream consumer (`startOpenCodeStream` in `lib/opencode.js`) sees `permission.updated` carrying `{ sessionID, id, … }`.
2. If `config.opencodeAutoApproveTools` is truthy (the default — see `OPENCODE_AUTO_APPROVE_TOOLS` in [CONFIGURATION.md](CONFIGURATION.md)), it immediately `POST /session/:id/permissions/:id` with `{ response: 'once' }` via `OpenCodeClient.respondPermission()`. The `response` field is one of `'once' | 'always' | 'reject'`; the adapter always uses `'once'` so each tool call is approved individually and the user's blast radius stays bounded.
3. If auto-approve is disabled, the event is ignored and the turn blocks on the daemon waiting for a human response (there is no in-UI approval flow today).

The `POST /session/:id/permissions/:id` endpoint is **internal** — it is an adapter→daemon call against `opencode serve`, not part of 1230UI's own REST surface. New HTTP-based adapters with a similar permission model should mirror this pattern: subscribe to the permission event on the event stream, and gate the auto-response behind a single config flag so operators can disable it for high-trust worktrees.

**Security reminder.** With auto-approve on, the model runs tools as the daemon user inside the worktree with no per-turn confirmation. That is the intended UX for an unattended agent loop, but it means a prompt-injected or confused model can write files and run commands. Document the flag and default it on only when that trade-off is acceptable — see the security note under `OPENCODE_AUTO_APPROVE_TOOLS` in [CONFIGURATION.md](CONFIGURATION.md).

---

## 6. Reference implementations in this repo

| File | What it demonstrates |
|---|---|
| `lib/adapters/base.js` | The `ExecutorAdapter` abstract class and the `ChatContext` / `ChatEvent` JSDoc typedefs |
| `lib/adapters/hermes.js` | Subprocess-based adapter (spawn, NDJSON parsing, event bridging, abort on close) |
| `lib/adapters/opencode.js` | HTTP-based adapter (session resolve/create, idempotency, SSE event translation, tool lifecycle) |
| `lib/adapters/index.js` | The `ADAPTERS` registry — adding a new adapter is one import + one entry |
| `tests/adapters-opencode.test.js` | How to test an adapter with `vi.mock` for the singleton client and DB |
| `tests/adapters-hermes.test.js` | How to test a subprocess adapter by mocking `child_process.spawn` with an EventEmitter |
| `routes/chat.js` | The dispatcher (search for `ADAPTERS[adapterSlug]` to see the call site) |

For the OpenCode example (most likely the closest reference for new HTTP-based adapters), the entry point is `OpenCodeAdapter.chat(ctx)` in `lib/adapters/opencode.js:51-235`. The structure is:

1. Resolve or create the backend session (with idempotency if needed).
2. Start the streaming consumer **before** firing the request (so events emitted before the consumer is up are not lost).
3. Build the request payload.
4. Fire the request.
5. Yield `status: 'thinking'`.
6. `for await (const evt of stream.events)` and re-emit each event with the right `type` (translating native event names to the `ChatEvent` contract).
7. Yield `done` on terminal events, `error` on failures, and clean up the stream in `finally`.

---

## 7. Checklist

Before opening a PR for a new executor, verify:

- [ ] `lib/adapters/<your-executor>.js` extends `ExecutorAdapter` and implements `slug`, `displayName`, `health()`, `chat(ctx)`.
- [ ] `chat(ctx)` yields exactly one `done` or `error` event as the terminal.
- [ ] `chat(ctx)` does not touch `req` or `res` directly (no `res.write`, no `res.setHeader`, no `req.on`).
- [ ] If your backend takes time to abort, expose an `async abort(sessionId)` method on the adapter.
- [ ] `lib/adapters/index.js` imports and registers the new adapter in `ADAPTERS`.
- [ ] `routes/assistants.js` `ASSISTANT_EXECUTORS` allowlist includes the new slug.
- [ ] `src/types/assistant.ts` `EXECUTOR_OPTIONS` includes the new option (so the picker shows it).
- [ ] All four `src/i18n/locales/{en,ru,es,de}/translation.json` have `assistants.executor.<slug>` and `assistants.executorBadge.<slug>`.
- [ ] If the executor needs configuration, the Settings page has a section (or env var documented in `.env.example`).
- [ ] If the backend is **stateful** (keeps conversation server-side): send only the new user turn on a reused session, rehydrate full history once after a session-not-found, write the backend-session binding with an `ON CONFLICT DO UPDATE` upsert (not `DO NOTHING`), and use column-preserving upserts for pin/archive (never `INSERT OR REPLACE`). See §5.
- [ ] `tests/adapters-<your-executor>.test.js` exists and passes; `npm test` is green.
- [ ] `npm run lint` and `npm run typecheck` are clean.
- [ ] The CHANGELOG has an entry under the current release with the new executor's slug, the new file, and a one-line "what it does" summary.

A PR that touches the dispatcher (`routes/chat.js`) for anything other than a one-line `ADAPTERS` entry needs extra justification — the design goal is that adding an executor is a localised change.
