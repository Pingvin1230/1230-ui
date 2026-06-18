# Changelog

All notable changes to this project will be documented in this file.

## [0.9.3] - 2026-06-18 — Workspace (multi-session / multi-executor) + OpenCode connector overhaul + code-audit hardening

The primary area is now a **Workspace**: a tabbed surface (Sessions / Hermes / OpenCode) where each executor runs its own concurrently-active session, and switching sessions/tabs/pages never interrupts an in-flight turn. Bundled with a comprehensive overhaul of the OpenCode connector (several data-loss/crash bugs fixed) and inline tool-call support.

This release also ships a full **code-audit & hardening pass** (2026-06-18): backend security fixes, a `ChatPage` refactor with message-list virtualization, removal of the global `window` event bus, central error handling + SSE-aware logging, completed i18n, and soft runtime response validation. See [Code audit & hardening (2026-06-18)](#code-audit--hardening-2026-06-18) below. Test suite grew from 176 → 305.

### Workspace & multi-session UX

- **`/sessions` route → Workspace shell** (`src/components/Workspace.tsx`): a header with Sessions / Hermes / OpenCode tabs and a content area. The Sessions tab shows the sessions list; each executor tab shows that executor's chat. Both executor chats are mounted simultaneously, so a running stream in one survives switching to the other.
- **`/chat/:id`** now resolves the session's executor and opens the Workspace on the matching tab (`src/components/ChatRouteResolver.tsx`); deep links and the mobile nav keep working.
- **`workspaceStore`** (`src/store/workspaceStore.ts`): `activeTab` + `activeSessionByExecutor` (one active session per executor), persisted to localStorage.
- **Per-executor toolbar** (`src/components/ExecutorToolbar.tsx`): the last 3 sessions of that executor as quick-switch pills + a "…" that opens the Sessions tab filtered by that executor.
- **Executor status dots** (`src/components/ExecutorStatusDot.tsx`) live in the Workspace tab header, to the left of each executor tab.
- **Session controls moved** from the global Navbar into the Workspace header (right side): assistant/model badges, session files, applications-pane toggle, delete-session — shown only when an executor tab has an active session (`src/components/WorkspaceSessionControls.tsx`).
- **Global Navbar**: removed the Hermes/OpenCode status indicators (now in the Workspace); the 1230UI logo is now always visible, including on mobile inside a chat.
- Consistent assistant badge (free-chat sessions show "Quick chat" instead of no badge).

### Sessions list & backend executor support

- `GET /api/sessions` and `GET /api/sessions/:id` now return an `executor` field (`'hermes' | 'opencode-1230'`, derived from the assistant; free-chat = hermes).
- `?executor=hermes|opencode-1230` filter on `GET /api/sessions` (`routes/sessions.js`).
- Bright executor badge on every session card + All/Hermes/OpenCode filter chips; clicking a session opens it in its executor's tab (`src/components/SessionCard.tsx`, `src/pages/SessionsPage.tsx`).

### Per-session streaming (streams survive navigation)

- Stream ownership moved out of `ChatPage` into `chatInputStore`: new `startStream`/`stopStream` actions, a module-level `streamControllers` map of `AbortController`s, and an extended `liveMessages` slice (`pendingUserContent`, `agentFiles`). `ChatPage` is now a subscriber/renderer.
- Navigating to another session, executor tab, or another page (e.g. /settings) no longer aborts an in-flight turn — only the Stop button, turn completion, or a real browser disconnect ends a stream. Two concurrent streams (one per executor) coexist.
- Fixed scroll-to-bottom after send (the effect now keys on the pending user bubble + tool calls, not only on committed messages).

### OpenCode connector — bug fixes (several caused data loss / crashes)

- **History glue / "answers fed back as user questions"**: the adapter now sends ONLY the new user turn to the stateful OpenCode session (`lib/adapters/opencode.js`). Previously the whole history was re-flattened into one user prompt and stored back by the daemon.
- **Lost `opencode_session_id` binding → "sessions splitting"**: the binding INSERT is now `ON CONFLICT DO UPDATE` (was `DO NOTHING`, which silently no-op'd when `session_meta` already existed — e.g. a row pre-created with `assistant_id`).
- **pin/archive wiped the binding + executor**: `PATCH /:id/pin` and `/archive` now use a column-preserving upsert (`ON CONFLICT DO UPDATE SET …`) instead of `INSERT OR REPLACE`, which had been deleting the whole `session_meta` row and nulling `opencode_session_id` + `assistant_id` (silent switch back to Hermes).
- **`ReferenceError: trimmed is not defined`** in `routes/chat.js` post-stream assistant persistence (the OpenCode response was never saved and surfaced as a "Network error") — fixed to use `responseText`.
- **Concurrent `createSession` race**: per-session mutex around resolve-or-create; dead `RETURNING`/recovery code removed.
- **Context loss after daemon restart**: when the OC session is recreated, the adapter rehydrates by resending the full history for that one turn.
- **Orphan user row**: on a terminal adapter error the just-inserted user message is now deleted.
- **Merge dedup**: `GET /api/sessions/:id/messages` Hermes↔OpenCode dedup is now whitespace-tolerant (multi-part OpenCode text joins with `\n` vs Hermes concatenated deltas).
- **Token streaming**: `src/lib/api.ts` now handles adapter `{type:'delta'}` events (previously only the OpenAI `choices[].delta` shape was read, so streaming was inert for both executors and the response appeared all at once).

### OpenCode tool-call support (TODO B2)

- The adapter handles the daemon's `permission.updated` SSE event and auto-approves via `POST /session/:id/permissions/:id` (`lib/opencode.js`), so tools (bash/edit/read/…) now execute inline in 1230UI chats instead of only in the OpenCode web UI.
- New config `OPENCODE_AUTO_APPROVE_TOOLS` (env, default `1`); documented in `.env.example` with a security note.

### Tests

- 305 tests (was 176). v0.9.3 features: sessions executor field + `?executor=` filter + pin/archive binding preservation (`tests/sessions-routes.test.js`); OpenCode adapter — history-not-resent, rehydration, permission auto-approve (`tests/adapters-opencode.test.js`, `tests/opencode-stream.test.js`, `tests/opencode-client.test.js`); per-session stream store (`tests/chatInputStore.test.js`). Audit hardening: chat SSE flow incl. in-flight dedup + disconnect handling (`tests/chat-routes.test.js`); session files upload/list/content/download/delete (`tests/files-routes.test.js`); assistants CRUD + validation + fork-on-edit (`tests/assistants-routes.test.js`); global files + models + system executor-config (`tests/globalFiles-models-routes.test.js`, `tests/system-routes-extra.test.js`); central error middleware (`tests/errorHandler.test.js`); pure helpers — message-list grouping/dedup, model maps, like cooldown (`src/components/messageListUtils.test.ts`, `src/hooks/useModels.test.ts`, `src/hooks/useLike.test.ts`).

### Configuration

- `OPENCODE_AUTO_APPROVE_TOOLS` (default `1`) — auto-approve OpenCode tool permission requests.

---

### Tududi Application (2026-06-16)

Adds a self-hosted Tududi task / notes manager as a fourth right-pane Application. Server-side proxy at `/api/tududi/*` keeps the bearer token out of the browser. Three-tab UI (Tasks / Notes / Projects) inside the Applications pane.

#### Backend

- **`routes/tududi.js` (new, 175 lines)** — generic HTTP forwarder mounted at `/api/tududi/*`. Strips hop-by-hop / `set-cookie` / `content-encoding` / incoming `authorization`; attaches `Authorization: Bearer <TUDUDI_API_TOKEN>` server-side. 15 s `AbortController` timeout; 503 (`tududi_not_configured`) on missing token, 504 on timeout, 502 on network error. Body forwarded verbatim. Both `/api/tududi/api/*` and `/api/tududi/v1/*` shapes pass through.
- **`GET /api/tududi/health` (in the same router)** — 5 s `GET /api/profile` probe; returns `{ configured, reachable, status, error }`. No token leak. Used by the Tududi app header to show a green/red status dot.
- **`config.js`** — three new env vars validated by Zod at startup: `TUDUDI_API_URL` (default `https://todo.thinkout.ru`), `TUDUDI_API_TOKEN` (optional), `TUDUDI_TIMEOUT_MS` (default 15000).
- **`db/seed.js`** — seeds a `tududi` row in the `applications` table on first run: key `tududi`, icon `ListChecks`, enabled by default, `sort_order=3`, `desktop_only=1`, description "Tasks, notes and inbox from Tududi". Idempotent — `INSERT OR IGNORE`.

#### Frontend

- **`src/applications/tududi/TududiApp.tsx`** — three tabs (Tasks / Notes / Projects) in a single component; health-dot in the header; settings link to `/settings/tududi`; external link to `https://todo.thinkout.ru`. Mounted in `src/applications/registry.ts` under the `tududi` key.
- **`src/applications/tududi/views/TasksView.tsx`** — list grouped by project; filter chips for status (not_started / in_progress / done / waiting / planned); sort by due date / priority / created; **TaskDetail.tsx** for full inline editing (name, status, priority, due date, project, note, tags, subtasks). Recurring-task name fix: `displayName(task)` prefers `original_name` over the placeholder `"Monthly"` / `"Daily"` / `"Weekly"` / `"Yearly"`.
- **`src/applications/tududi/views/NotesView.tsx`** — 2-column card grid; project filter chips; inline Markdown editor with live preview (via `MarkdownRenderer`), 1 s auto-save with `Saving… / Saved` indicator, 10-color picker, search (title + content) and sort dropdown (`updated_at` / `title` / `created_at`); delete with confirmation; project link per card.
- **`src/applications/tududi/views/ProjectsView.tsx`** — card grid with progress bars (done/total tasks), note counts, due dates; "Tasks" / "Notes" buttons navigate to the filtered view; "New Project" creation form.
- **`src/lib/api/tududi.ts` (new, 215 lines)** — typed client wrapping the proxy. Methods: `health`, `listTasks`, `getTask`, `createTask`, `createSubtask`, `updateTask`, `completeTask`, `deleteTask`, `listNotes`, `getNote`, `createNote`, `updateNote`, `deleteNote`, `listProjects`, `createProject`, `listTags`. `TududiApiError` (status, message, detail) for non-2xx responses. Status / priority enum maps exported for UI use.
- **`src/pages/TududiSettingsPage.tsx` (new)** — `/settings/tududi` page. Shows the live health probe, the proxy URL, the upstream URL, and the "API Token is stored in .env" disclaimer.
- **`src/pages/SettingsPage.tsx`** — adds a "Tududi" row under the Assistants / Applications / Cloud Connect group, linking to `/settings/tududi`.
- **`src/App.tsx`** — new route `/settings/tududi` (lazy-loaded).
- **Tududi is a desktop-only app.** Inherits the `desktop_only=1` from the seed row, so on `< 1024 px` it is not reachable — the Applications pane is hidden on mobile.

#### Tududi API quirks (handled in the client)

- `/api/tasks`, `/api/notes`, `/api/projects` are plural for reads; `/api/task`, `/api/note` are singular for writes; `/api/project` POST may return 400 in some versions.
- `updateTask` / `getTask` / `createTask` return the bare object (not `{ task: ... }`). Same for notes.
- `createSubtask(parentId, name)` uses the parent's **numeric** `id` — not the `uid` string. Sending the uid yields `400 "Invalid parent task."`.
- `task.name` is `"Monthly"` for recurrence instances; the real title is in `task.original_name`. `displayName(task)` handles this. Edits to recurring tasks should not overwrite the parent template.
- `task.due_date` is `YYYY-MM-DD` only.
- Tags must be created implicitly (by applying them to a note) and then referenced by name. Tags on task create return `400` ("Tag name is required") until they exist.

#### Files changed

| File | Status | Notes |
|---|---|---|
| `routes/tududi.js` | **new** | 175 lines — proxy + health |
| `src/lib/api/tududi.ts` | **new** | 215 lines — typed client |
| `src/applications/tududi/TududiApp.tsx` | **new** | tabs + health dot + links |
| `src/applications/tududi/views/TasksView.tsx` | **new** | list + filter + sort |
| `src/applications/tududi/views/TaskDetail.tsx` | **new** | inline edit view |
| `src/applications/tududi/views/NotesView.tsx` | **new** | grid + inline Markdown editor |
| `src/applications/tududi/views/ProjectsView.tsx` | **new** | cards + nav |
| `src/applications/tududi/index.ts` | **new** | exports TududiApp |
| `src/applications/registry.ts` | modified | +1 entry |
| `src/applications/types.ts` | unchanged | ApplicationComponentProps covers it |
| `src/pages/TududiSettingsPage.tsx` | **new** | /settings/tududi |
| `src/pages/SettingsPage.tsx` | modified | +Tududi row |
| `src/App.tsx` | modified | +route |
| `config.js` | modified | +3 env vars |
| `app.js` | modified | +router mount |
| `db/seed.js` | modified | +tududi application seed |
| `.env.example` | modified | +Tududi section |
| `package.json` | unchanged | no new deps |
| **Total** | — | **~+1500** |

#### Configuration

```bash
# .env (new env vars)
TUDUDI_API_URL=https://todo.thinkout.ru
TUDUDI_API_TOKEN=tt_your_token_here
# TUDUDI_TIMEOUT_MS=15000
```

`TUDUDI_API_TOKEN` is optional — the rest of 1230-UI keeps working without it. When unset, the app shows a red status dot and the proxy returns `503 tududi_not_configured`.

#### Migration notes

- **Existing users (no Tududi setup):** no action required. The app is seeded as `enabled=1` and shows a red status dot in the UI; click the settings link to verify or set the token.
- **New Tududi users:** (1) create an API key in Tududi → Profile → Settings → API Keys; (2) set `TUDUDI_API_URL` and `TUDUDI_API_TOKEN` in `.env`; (3) `systemctl restart 1230-ui`; (4) open `/settings/tududi` to confirm "Connected".

#### Known limitations (v0.9.2)

- No runtime UI for editing the URL or token — edit `.env` and restart.
- No unit tests for the proxy or the client yet (tracked in `TODO.md` and `docs/TUDUDI_INTEGRATION.md §2.5`).
- No i18n keys — all `tududi.*` strings are inline English in the components, matching the precedent set by the other applications. Will be extracted as part of the v1.0 i18n sweep.
- Inbox is intentionally not implemented (out of scope — managed via the Tududi web UI).
- The `Inbox` mention in the `TududiApp` description string is aspirational; only Tasks / Notes / Projects tabs are rendered. Tracked in `TODO.md` §C5.

---

### Multi-executor support (executor selection per assistant)

Spike for adding OpenCode as a SECOND chat executor alongside Hermes. Per-assistant `executor` column (`'hermes' | 'opencode'`, default `'hermes'`) on the `assistants` table. The chat dispatcher (`routes/chat.js:451-485`) joins `session_meta.assistant_id → assistants.executor` per request and spawns either `run_chat.py` (Hermes) or `run_chat_opencode.py` (OpenCode). Both wrappers must use the same argv/stdin/NDJSON contract; only the spawned binary and env vars differ. Per-session lock is structural: `session_meta.assistant_id` is set once at session creation and `fork-on-edit` on `PATCH /api/assistants/:id` keeps old sessions bound to the archived assistant row (and therefore the old executor). The free-chat path (no assistant) stays Hermes. Full design in [docs/executor-selection.md](docs/executor-selection.md). Out of scope for the spike: OpenCode Settings page, per-user default executor, executor health indicator, true OpenCode session storage, per-executor model catalog.

---

### Code audit & hardening (2026-06-18)

A systematic audit of the 0.9.3 codebase (`docs/AUDIT.md`) followed by a hardening pass. No user-facing features were added; this is security, robustness, maintainability, and UX-correctness work. All changes are behavior-preserving unless noted.

#### Backend — security & correctness

- **`trust proxy` enabled** (`app.js`) — behind the reverse proxy, `req.ip` and the per-IP rate-limit buckets now reflect the real client instead of a single shared proxy IP (previously every rate limiter shared one bucket).
- **No more plaintext fallback for secrets** (`routes/system.js`) — if AES-256-GCM `encrypt()` throws while saving the Hermes API key or OpenCode password, the request now returns `500` and persists nothing. Previously it silently stored the secret in cleartext (`{ ct: secret, iv: '', tag: '' }`).
- **`opencodeClient` is reconfigurable at runtime** (`lib/opencode.js`) — the OpenCode HTTP client is rebuilt when Settings → Executor Configuration → OpenCode is saved, so URL/username/password changes take effect without a process restart. Consumers use `getOpencodeClient()`; a live ESM binding keeps the two non-refactored importers working.
- **Central error middleware + SSE-aware request logging** (`middleware/errorHandler.js`, `middleware/logger.js`, mounted in `app.js`) — unhandled route errors now produce a consistent `{ error }` envelope (5xx hides internals; 4xx forwards the app message) and never leak stacks in production. The request logger hooks the response emitter (`finish`/`close`) so `POST /api/chat` (SSE) and file downloads are logged, not only `res.json` responses.
- **`copyFile` returns `storedName`** (`routes/globalFiles.js`) — fixed a latent bug where a file copied via File Manager → "copy to chat" was never actually attached to the outgoing message (the response omitted `storedName`, so ChatInput dropped it). Typed as `SessionFile` on the client.
- **Dedup** — `fixFilenameEncoding` extracted to `lib/fileUtils.js` (was duplicated in `files.js` / `globalFiles.js`); the dead TypeScript duplicate `middleware/security.ts` removed.

#### Frontend — chat core refactor

- **`ChatPage` split: 958 → ~500 lines.** Extracted `useChatSession` (load + focus-refetch + stream-end transition), `useChatScroll` (auto-scroll / `isAtBottom` / unread), `useChatNavigationGuard` (leave-guard), and a `MessageList` component + pure `messageListUtils` (message-block grouping + render-item flattening + dedup helpers). Streaming continuity via `chatInputStore` is unchanged — `ChatPage` stays a subscriber.
- **Message list virtualized with `react-virtuoso`** (`MessageList.tsx`) — long sessions no longer render the entire history (each row re-ran `MarkdownRenderer`). Auto-scroll mirrors the old `isAtBottom` behavior (never yanks the view when scrolled up); tool-call details, reasoning, agent-file cards, copy state all work inside virtualized rows. `react-virtuoso` is now actually used (was a dead dependency).
- **Global `chat:*` window event bus removed.** `chatInput`/`chatPage` now communicate through typed store actions (`chatInputStore`: `pendingInputActions` / `pendingChatActions` FIFO queues with monotonic nonces) instead of `window.dispatchEvent(new CustomEvent(...))`. StrictMode-safe, race-free, traceable. (Side effect: fixed a double attached-file prefix on send.)
- **Leave-guard and archive-confirm use the accessible `Modal`** — was a raw `fixed inset-0` div (no focus trap) and `window.confirm`.
- **Per-route `ErrorBoundary`** (`App.tsx`) — a crash in one lazy page is isolated and recoverable (Retry / Go back) instead of taking down the whole shell.
- **Optimistic-bubble dedup hardened** (`committedUserMatchesPending`) — exact trimmed equality (tolerating the attached-file prefix) instead of a fragile `endsWith` suffix check that could eat a legitimate message.
- **Per-session send/blocked state** (`Layout.tsx`) — the global ChatInput now derives its `sending`/blocked state from the **active session's** live slice instead of a single global flag, so a stream running in one session no longer disables the input in another session of the same executor.
- **Markdown renderer** — split into a `react-refresh`-safe module; code-block highlight theme follows the app light/dark theme (was always dark); theme class applied pre-paint via an inline `index.html` script (no flash of wrong theme on reload).
- **i18n completed** — all four locales (en/ru/es/de) at full key parity; hardcoded RU/EN UI strings (Markdown renderer buttons, settings labels, time-of-day brackets, aria-labels, API error messages) extracted to translation keys.
- **DRY hooks** — `useAsync` (removed the duplicated fetch/loading/error/cancelled pattern across ~8 pages), `useModels` (shared model-map builder), `useLike` (shared like + cooldown).
- **Small fixes** — ApplicationsPage icon bug (always rendered `Eye`), Toast cap (max 4), keyboard focus ring restored on form fields, `import * as LucideIcons` replaced with an explicit icon map (tree-shaking restored). Dead code removed (`sessionStore`, `assistantsStore`, `types/session.ts`, `mockData.ts`).

#### API client — soft validation

- **Runtime response validation with `zod`** (`src/lib/api.ts`) — `getSessions` / `getSession` / `getMessages` / `getAssistants` / `getAssistant` parse against schemas. On schema drift the client **warns in the console and falls back to the raw response** instead of throwing (a hard throw had blanked session content when the backend sent `null` for nullable fields). `zod` is now actually used (was a dead dependency). A shared `request()` helper removed the duplicated `if (!res.ok) throw` boilerplate.

#### Deferred (tracked in `docs/AUDIT.md`)

- Agent-generated file path sandboxing (A1), Content-Security-Policy (A5), and versioned DB migrations (D7) were reviewed and intentionally deferred — see the audit for rationale.

---

## [0.9.2] - 2026-06-10 (Cloud Connect — WebDAV file picker + inline content expansion)

### Multi-Executor Support (OpenCode as second executor) — 2026-06-11

Shipped Variant B of the dual-executor feature. The chat backend is now pluggable: every assistant carries an `executor` column (`'hermes' | 'opencode-1230'`, default `'hermes'`), and the dispatcher in `routes/chat.js` routes requests to the matching adapter. A user can pick the executor per assistant; it is locked for the session's lifetime. See [docs/executor-selection.md](docs/executor-selection.md) for the full design and the `ExecutorAdapter` interface.

#### Architecture

Adapter pattern with `routes/chat.js` as the **core** (owns the browser SSE contract, dedup, watchdog, DB writes) and two **adapters** translating their native protocol into `AsyncIterable<ChatEvent>`:

- `run_chat.py` — Hermes Adapter (subprocess + NDJSON, **unchanged**)
- `lib/opencode.js` — OpenCode Adapter (HTTP + SSE to `opencode serve:4097`)

Adding a third executor is now ~1 file + 1 line in the adapter table; zero dispatcher changes. See `docs/executor-selection.md` §0 for the interface contract and §0.1a for the post-spike backlog.

#### Backend additions

- **`lib/opencode.js` (new, 448 lines)** — OpenCode Adapter. `OpenCodeClient` class wraps the daemon's REST API (`/global/health`, `/session`, `/session/:id/prompt_async`, `/session/:id/abort`, `/config/providers`) with optional Basic auth, per-request timeout, and normalised error handling. `streamOpenCodeSession()` is an async generator that subscribes to `GET /event`, filters frames by `sessionID`, and yields normalised `ChatEvent` payloads (`delta`, `reasoning`, `tool_start`, `done`, `error`). SSE parser is hand-rolled (no `eventsource` package) so we can also see frames for other sessions on the bus and filter on `sessionID`. `OpenCodeError` exposes `status`, `body`, `code` for the SSE error event.
- **`routes/chat.js` (+353 lines)** — `handleOpenCodeChat()` function with the same watchdog/dedup/`[DONE]`/agent-files/SIGTERM-on-`req.on('close')` conventions as the Hermes path. The dispatch happens after computing `currentMessage` + `history`; both paths share those locals. The Hermes path itself is **untouched at the protocol layer** — same argv, same env, same NDJSON handling, same error translation.
- **`routes/sessions.js`** — `/api/sessions/:id/messages` merges messages from **both** the Hermes `state.db` row and any persisted OpenCode history (via `session_meta.opencode_session_id`). Required after the messages-wiped fix (see below).
- **`routes/system.js`** — new `GET /api/system/executors` endpoint that runs a 2 s `OpenCodeClient.health()` probe and returns the visibility map. Frontend uses it to hide the OC option in the picker when the daemon is down.
- **`config.js`** — new env vars: `OPENCODE_URL` (default `http://127.0.0.1:4097`), `OPENCODE_SERVER_USERNAME`, `OPENCODE_SERVER_PASSWORD` (both optional; passed as Basic auth header).
- **`db/helpers.js`**, **`db/migrate.js`** — `assistants.executor` column added with `DEFAULT 'hermes'` (idempotent `PRAGMA table_info` check); `session_meta.opencode_session_id` column added with `DEFAULT NULL` to remember the OC session id across 1230UI restarts.
- **`routes/assistants.js`** — `sanitizeAssistantInput` accepts and validates the new `executor` field; INSERT/PATCH/fork-on-edit SQL updated. `ASSISTANT_EXECUTORS = new Set(['hermes', 'opencode-1230'])` rejects unknown values.

#### Data model

```sql
ALTER TABLE assistants     ADD COLUMN executor TEXT NOT NULL DEFAULT 'hermes';
ALTER TABLE session_meta   ADD COLUMN opencode_session_id TEXT DEFAULT NULL;
```

Why `opencode_session_id` lives on `session_meta`, not `assistants`: 1:1 mapping between 1230UI session and OC session. Same assistant + different sessions must NOT share an OC session. On resume, OC Adapter looks up `opencode_session_id`; if 404 on the daemon, creates a new one and persists.

#### Configuration

```bash
# .env (new env vars)
OPENCODE_URL=http://127.0.0.1:4097
OPENCODE_SERVER_USERNAME=             # optional
OPENCODE_SERVER_PASSWORD=             # optional
```

#### OpenCode serve setup

- Separate daemon from the user's `opencode web` on 4096 — uses port **4097** to avoid conflict. Localhost only.
- systemd unit at `/etc/systemd/system/opencode-1230ui.service` (created, **not yet enabled** — see §0.1a A1 in executor-selection.md). `Restart=always` + `RestartSec=5`. Loads `EnvironmentFile=-/opt/1230-ui/.env`.
- OpenCode project `1230ui` created in `/root/.local/share/opencode/opencode.db` with worktree `/opt/1230-ui` — new OC sessions created via 1230UI land here, NOT in the global project. Pre-existing `1230ui-*` sessions from before the spike are stranded in `global` and need a one-time migration (see §0.1a A3).

#### Frontend

- **`AssistantEditPage.tsx`** — new "Executor" field: radio-pill picker with `Hermes` (default) and `OpenCode` options. Disabled with an inline hint when OC is not configured (driven by `GET /api/system/executors`).
- **`AssistantTile.tsx`** — small "via OpenCode" badge on the tile when `executor === 'opencode-1230'`.
- **`types/api.ts`** — `Assistant.executor: 'hermes' | 'opencode-1230' | null` field; new `ExecutorsStatus` interface for the `/api/system/executors` response.
- **`lib/api.ts`** — `getExecutorsStatus()` calls `GET /api/system/executors`; assistant create/update payload includes `executor`.
- **`locales/en/translation.json`** — 6 new i18n keys under the `assistants` namespace: `assistants.executorLabel`, `assistants.executorHint`, `assistants.executor.hermes`, `assistants.executor.opencode-1230`, `assistants.executorBadge.hermes` (+ `.opencode-1230`), `assistants.executorUnavailable` (+ `executorDownOnSave`, `executorChecking`, `executorRetry`, `executorDownInline`, `chat.viaExecutor`, `chat.freeChatExecutorHint`). All four locales (en/ru/es/de) ship translations.

### Multi-Executor Hardening (2026-06-12)

#### Bug fix during spike

**Messages wiped for OC sessions after navigation** — the 1781180149780 symptom. When a user chatted with an OC-bound assistant, the assistant turn was visible in the live stream but the row disappeared from `GET /api/sessions/:id/messages` because that endpoint only read from Hermes's `state.db`. The fix: `routes/sessions.js` now merges messages from both backends (Hermes `state.db` for the row, plus the OC session history fetched via `GET /session/:id` on the daemon). Documented in [TROUBLESHOOTING.md §8](TROUBLESHOOTING.md) — *"OpenCode session shows empty messages after reload / opening the Applications pane"*.

#### Files changed

| File | Status | Lines (Δ) |
|---|---|---|
| `lib/opencode.js` | **new** | +448 |
| `routes/chat.js` | modified | +353 |
| `routes/sessions.js` | modified | +30 (message merge) |
| `routes/system.js` | modified | +20 (`/api/system/executors`) |
| `routes/assistants.js` | modified | +20 (executor CRUD) |
| `db/migrate.js` | modified | +12 (idempotent column adds) |
| `db/helpers.js` | modified | +5 (provider lookup helper) |
| `config.js` | modified | +6 (env vars) |
| `src/pages/AssistantEditPage.tsx` | modified | +50 (executor picker) |
| `src/components/AssistantTile.tsx` | modified | +8 (badge) |
| `src/types/api.ts` | modified | +10 (new types) |
| `src/lib/api.ts` | modified | +15 (getExecutorsStatus) |
| `src/i18n/locales/en/translation.json` | modified | +5 (keys) |
| `/etc/systemd/system/opencode-1230ui.service` | **new** | +20 |
| **Total** | — | **~+1002** |

#### Known limitations (see [TROUBLESHOOTING.md §8](TROUBLESHOOTING.md) for the messages-wiped bug writeup)

- **Tool calls in OpenCode happen in the daemon's own UI** (port 4096), not in 1230UI. The OC adapter ignores `permission.asked` events for the spike (`--no-tools` mode).
- **`usage.input_tokens` / `usage.output_tokens` are 0 for text-only OC replies** — OpenCode's `step-finish` event only fires when the run contains tool steps. Backfill tracked in `executor-selection.md` §0.1a A2.
- **Hermes path is structurally privileged** — the dispatch falls through to the inlined Hermes code in `routes/chat.js`; there is no `HermesAdapter` class yet. Refactor tracked in §0.1a B1.
- **OC sessions are persisted in Hermes `state.db`** (acceptable compromise for the spike) — future work: dedicated `oc_sessions` table.

#### Migration notes

- **Existing users (no OC setup):** No action required. The new column has `DEFAULT 'hermes'`, so all existing assistants keep their Hermes behaviour. The OC option is hidden in the UI because `GET /api/system/executors` reports OC as not configured.
- **New OC users:** (1) install `opencode` binary, (2) `cp docs/deploy/opencode-1230ui.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now opencode-1230ui.service`, (3) set `OPENCODE_URL` in `.env` (default `http://127.0.0.1:4097` works out-of-the-box for the local daemon), (4) open an assistant and pick "OpenCode" in the executor picker.
- **Pre-spike OC sessions** (sessions created in the user's `opencode web:4096` UI before this spike) live in the OC `global` project, not `1230ui`. They are still visible in `opencode web:4096` but **not** in 1230UI's session list (different `opencode_session_id` mapping). One-time migration script tracked in `executor-selection.md` §0.1a A3.

#### Verification

- `npm run lint` clean, `npm run typecheck` clean, `npm test` 22/22 pass (unit tests for sanitizeBody and time utilities), `npm run build` OK.
- Integration tests for executor dispatch, OC session lifecycle, watchdog, dedup, and message merge are tracked in `TODO.md §B` and have not yet been written.
- Manual test: create an assistant with `executor=opencode-1230`, send a message, verify (a) `route/chat.js` logs `adapter.slug=opencode-1230`, (b) the OpenCode daemon records the new session in project `1230ui`, (c) `state.db.sessions.model` matches the UI selection, (d) restarting 1230UI preserves the OC session via `session_meta.opencode_session_id`.

#### Post-spike hardening (rolled into v0.9.2)

A follow-up audit ([docs/brief-multi-executor-audit.md](docs/brief-multi-executor-audit.md)) tracked 30 hardening items. This release closes the following ones:

- **Title sync with OpenCode daemon** — `PATCH /api/sessions/:id/title` now also calls `PATCH /session/:id` on the OC daemon for any session bound to an OC executor. The local rename in Hermes `state.db` and the OC-side title now stay in sync. Failures of the OC update are non-fatal (logged + returned as `ocSync` in the response) so the rename UX never breaks because the OC daemon is down. Implementation: `lib/opencode.js` gained `updateSession(id, {title})`; `routes/sessions.js` PATCH handler now async.
- **Idempotency for OC session creation** — two concurrent `POST /api/chat` for the same `session_id` no longer both call `createSession()` on the OC daemon. The adapter now uses `INSERT … ON CONFLICT(session_id) DO NOTHING … RETURNING opencode_session_id`; if the returning row is empty, the existing binding is reused and the freshly-created OC session is orphaned (harmless — empty session). Race detected and logged explicitly. Implementation: `lib/adapters/opencode.js` `chat()` step 1.
- **Listener leak fix in `AbortSignal` plumbing** — the hand-rolled `anySignal()` helper (`lib/opencode.js`) leaked listeners under load because `addEventListener('abort', …, { once: true })` was never paired with `removeEventListener`. Replaced with the standard `AbortSignal.any([ctrl.signal, signal])` (Node 20+). The `_fetch` timeout signal and the caller's signal are now combined via the platform API, which cleans up its own listeners.
- **Backfill `assistants.executor = 'hermes'`** — `db/migrate.js` now runs a defensive `UPDATE assistants SET executor = 'hermes' WHERE executor IS NULL OR executor = ''` after the column add. No-op for existing rows (DEFAULT covered them) but enforces the invariant for any row that could have been touched during the migration window.
- **Vitest coverage for executor logic** — five new test files in `tests/`, 88 new tests, 110/110 green:
  - `tests/opencode-parseSseChunk.test.js` (19) — SSE parser edge cases
  - `tests/opencode-client.test.js` (25) — `OpenCodeClient` REST wrapper (mocked `fetch`)
  - `tests/adapters-opencode.test.js` (20) — `OpenCodeAdapter` session resolution + race detection + event translation
  - `tests/adapters-hermes.test.js` (15) — `HermesAdapter` child-process integration (mocked `spawn`)
  - `tests/adapters-registry.test.js` (9) — `ADAPTERS` registry symmetry
- **Documentation sync**:
  - `README.md` — new "OpenCode executor" section in **How it works** with the dispatcher diagram.
  - `TROUBLESHOOTING.md` — new §9 ("OpenCode daemon unreachable — executor picker is empty") and §10 ("Tool card stuck after tool_start — no tool_complete event arrives"). §8 already documents the messages-wiped fix.
  - `docs/EXECUTOR_ADAPTERS.md` — new file. Step-by-step guide "How to add a third executor" with a worked example (claude-direct) and the full `ExecutorAdapter` contract reference.
  - `CHANGELOG.md:64` — corrected the i18n key names that did not match the actual code (was a stale leftover from the original spike).

---

### Model Routing Overhaul (patch 2026-06-11 — direct AIAgent invocation)

Replaces the previous HTTP proxy to Hermes's `api_server` (which silently forced `config.yaml`'s `model.default` and ignored the user's per-request model) with a direct Python subprocess that constructs an `AIAgent` with the exact `model` / `provider` / `base_url` / `api_key` chosen in the UI. Every prior symptom of the routing bug — wrong model answering, stuck `[DONE]` markers, duplicate-turn retry storms, orphan Python processes — is fixed in this change. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full two-process design and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the bug-by-bug writeup.

#### Backend

- **`run_chat.py` (new, root of repo)** — Python 3 wrapper invoked by `routes/chat.js` per request. Runs inside the Hermes Agent venv (`HERMES_PYTHON_PATH`, default `python3`, see [docs/CONFIGURATION.md](docs/CONFIGURATION.md)). Calls `resolve_runtime_provider()` to fetch `api_key` / `base_url` / `api_mode` for the user-selected provider, then constructs `AIAgent(model=..., provider=..., base_url=..., api_key=..., session_id=..., max_iterations=10, skip_context_files=True, skip_memory=True, ...)` with explicit kwargs so `config.yaml` defaults are bypassed. Persists the chosen model to `state.db.sessions.model` via `SessionDB._execute_write()` (`run_chat.py:184-194`). Streams NDJSON events to stdout: `delta`, `reasoning`, `tool_start`, `tool_complete`, `done`, `error` (`run_chat.py:51-77`). Forces line-buffered output via `sys.stdout.reconfigure(line_buffering=True)` (`run_chat.py:38-48`) so the parent process's pipe receives each event immediately — without this, a child whose stdout is a pipe can buffer up to 8 KB until the process exits. Exit codes: `0` on success, `1` on any error; error details are emitted as NDJSON on stderr and captured by Node.
- **`routes/chat.js`** — HTTP-proxy path (`fetch(${HERMES_API_URL}/v1/chat/completions, ...)` with hardcoded `model: 'hermes-agent'`) replaced with `child_process.spawn` of `run_chat.py`:
  - argv: `--session-id`, `--model`, `--provider`, `--max-iterations 10` (`routes/chat.js:451-459`).
  - Spawn flags: `-u` (unbuffered) + `PYTHONUNBUFFERED=1` + `PYTHONIOENCODING=utf-8` env (`routes/chat.js:463-471`) — three layers of belt-and-suspenders buffering defeat.
  - NDJSON line-by-line parser translates wrapper events to SSE the frontend already understands (`routes/chat.js:665-676`, `routes/chat.js:694-771`).
  - In-flight deduplication: `INFLIGHT` map keyed by `${session_id}:${hash(lastUserMessage)}` with a 30 s TTL (`routes/chat.js:322-341`); duplicate requests return HTTP 409 with `code: 'DUPLICATE_INFLIGHT'`. This is the server-side safety net for the frontend retry-storm bug.
  - 90 s no-output watchdog (`FIRST_OUTPUT_TIMEOUT_MS = 90_000`, `routes/chat.js:499`) — kills the child with SIGKILL and emits a `NO_OUTPUT_TIMEOUT` SSE error if Python produces no stdout for 90 s. Reset on every chunk so a stalled mid-stream child is also killed within 90 s of its last output (`routes/chat.js:614-663`).
  - 10 min hard ceiling (`HARD_TIMEOUT_MS = 10 * 60 * 1000`, `routes/chat.js:506-514`) — guarantees the connection eventually closes even if the watchdog misfires.
  - `req.on('close')` cleanup: SIGTERM → 5 s → SIGKILL escalation (`routes/chat.js:516-522`) so orphan `run_chat.py` processes cannot survive a browser tab close.
  - `data: [DONE]\n\n` SSE sentinel emitted right after the `done` event (`routes/chat.js:749`) — OpenAI-spec compliance for third-party SSE consumers, belt-and-suspenders for the frontend's own `type: 'done'` handler.
- **`db/helpers.js`** — `getProviderForModelId(modelId)` added (`db/helpers.js:56-70`); does a `JOIN providers p ON p.id = m.provider_id` to resolve the Hermes provider slug from the `models` table. `getProviderFromModel()` now consults the DB first and only falls back to a string heuristic on cache miss (`db/helpers.js:79-93`). Fixes the bug where the user-selected model was silently overridden because the heuristic returned `unknown` for any model whose name didn't contain a known substring.

#### Frontend

- **`src/lib/api.ts`** — `sendMessage` accepts `maxRetries` via options (default `0` instead of the previous `3`, `src/lib/api.ts:149`). New `type: 'done'` handler treats the server payload's `final_response` and `usage` fields as authoritative when present (`src/lib/api.ts:266-283`). Rescue path: if the connection closes with accumulated `fullContent` but no `done` event arrived, fire `onDone(fullContent)` instead of erroring with `STREAM_ABORTED` (`src/lib/api.ts:345-353`). The `data: [DONE]` SSE sentinel is also handled (`src/lib/api.ts:236-249`).
- **`src/pages/ChatPage.tsx`** — `doSend` now passes `maxRetries: 0` (`src/pages/ChatPage.tsx:406`) and `useRef`-tracks the last-sent content for the manual Retry button. The previous default of 3 caused a single user click to spawn 4 duplicate turns in `agent.log` and 4 duplicate user messages in the UI; the manual Retry button is preserved for user-initiated retries.

#### Bug fixes (before → after)

| Symptom | Cause | Fix |
|---|---|---|
| UI shows "MiniMax-M3" but LLM answers as "qwen3.6-plus" | HTTP proxy to `api_server` used hardcoded `model: 'hermes-agent'`; `config.yaml.model.default` won. | `run_chat.py` constructs `AIAgent(model=..., provider=..., ...)` with explicit kwargs; `getProviderFromModel()` resolves the provider via DB JOIN. |
| `Network error: STREAM_ABORTED` on a successful turn | Frontend never saw a `done` event or `[DONE]` marker; treated every clean response as aborted. | `routes/chat.js:733-750` emits `type: 'done'` with `final_response`+`usage`; `api.ts:266-283` handles it; `data: [DONE]\n\n` sentinel added for OpenAI-spec compatibility. |
| 1 user click → 4 duplicate turns in `agent.log` and 4 duplicate user bubbles | Frontend auto-retried 3 times on any stream error. | `ChatPage.tsx:406` passes `maxRetries: 0`; `routes/chat.js:322-406` returns HTTP 409 for duplicate in-flight requests. |
| Orphan `python run_chat.py` processes after browser disconnect | `req.on('close')` did not exist; children kept running. | `routes/chat.js:516-522` SIGTERM → 5 s → SIGKILL. |
| Hermes gateway restarts every 5 minutes | `hermes-gateway.service` user unit conflicted with `hermes-api.service`; `TimeoutStopSec=90s` < `drain_timeout`. | Disabled `hermes-gateway.service`; `TimeoutStopSec=90s → 210s` in `/etc/systemd/system/hermes-api.service`. See *Server environment* below. |
| Long silence then burst of events at end of stream | Python child buffered up to 8 KB of stdout in non-TTY mode. | `sys.stdout.reconfigure(line_buffering=True)` (`run_chat.py:38-48`) + `python -u` + `PYTHONUNBUFFERED=1` + `PYTHONIOENCODING=utf-8`. |

#### Server environment (out-of-repo fixes, not in this codebase)

These are server-level systemd and unit fixes on BIG. They are listed here for traceability but the patches live in `/etc/systemd/system/`, not in 1230UI:

- **Dual systemd unit conflict** — `hermes-gateway.service` (a user-level unit left over from an earlier setup) was racing with `hermes-api.service`; every 5 minutes the gateway would signal a reload and the api service would restart, killing in-flight HTTP connections. Removed the user unit (`systemctl --user disable --now hermes-gateway.service`).
- **`TimeoutStopSec` too short** — `/etc/systemd/system/hermes-api.service` had `TimeoutStopSec=90s`, but `drain_timeout` on the API server is 120 s. When systemd tried to stop the service during reload, it SIGKILLed the process at 90 s while requests were still in flight. Bumped to `TimeoutStopSec=210s` (3.5× drain timeout) so a graceful stop always finishes.

#### Migration notes

- **Set `HERMES_PYTHON_PATH` explicitly** — the existing `config.js` default is `python3` (system Python). For the new code path to import `run_agent`, `hermes_cli`, and `hermes_state` from the Hermes venv, set `HERMES_PYTHON_PATH=/usr/local/lib/hermes-agent/venv/bin/python` in `.env` (or wherever the venv lives on your install). The wrapper's shebang (`run_chat.py:1`) is the authoritative path if the systemd `ExecStart` invokes the script directly.
- **Server environment only matters for BIG-class deployments** — the systemd unit fixes are listed for the BIG host. Single-user installs running `node server.js` from a shell do not need any of that.
- **No new npm or pip dependencies** — `run_chat.py` uses modules already in the Hermes venv.

#### Files changed

`run_chat.py` (new, 333 lines), `routes/chat.js` (full rewrite of `POST /api/chat`), `db/helpers.js` (`getProviderForModelId` + DB-first lookup), `src/lib/api.ts` (`maxRetries` option, `done` handler, rescue path), `src/pages/ChatPage.tsx` (`maxRetries: 0`).

#### Verification

`npm run lint` clean, `npm run typecheck` clean, `npm test` 22/22 pass, `npm run build` OK. Manual test: send the same prompt under two different models in sequence — both use the model the UI shows, and `state.db.sessions.model` matches the UI selection.

---

### Cloud Connect Application (Task #39)

Browse WebDAV cloud storage from inside 1230UI and insert file links into chat. Cloud links are automatically expanded to inline content before sending to Hermes — the agent receives file content directly without tool calls.

#### Backend

- **`db/migrate.js`** — new `cloud_connections` table (idempotent): stores label, url, username, AES-256-GCM encrypted password, status, last_tested_at, last_error
- **`lib/cloud/crypto.js` (new)** — AES-256-GCM encrypt/decrypt for credentials + HMAC-SHA256 signed URL tokens (HKDF-derived key)
- **`routes/cloudConnections.js` (new)** — CRUD endpoints: GET/POST/PATCH/DELETE `/api/cloud-connections`, POST `/:id/test` (WebDAV connection test)
- **`routes/cloudFiles.js` (new)` — directory listing (`GET /:id/list`), signed URL issuance (`POST /:id/issue-link`), proxy stream (`GET /api/cloud/:id/:token/:expiresAt/:path`)
- **`routes/chat.js`** — cloud-link interceptor: scans user messages for `/api/cloud/...` URLs before sending to Hermes
  - Text files (md/txt/json/csv/py/js/ts/yml/xml/sh/sql/log/toml/ini/conf) → `{ type: "text", text: "--- filename ---\n<content>" }`
  - Images (png/jpg/webp/gif/svg/bmp/ico) → `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }`
  - Binary files ≤ 1MB → text description with metadata
  - Files > 5MB → "File too large" placeholder
  - WebDAV clients cached per connection for efficiency
- **`config.js`** — `CLOUD_CONNECT_KEY` env variable validation (optional, 32 bytes base64)
- **`db/seed.js`** — seed `cloud_connect` application on startup
- **`app.js`** — mount `cloudConnectionsRouter` and `cloudFilesRouter`

#### Frontend

- **`src/types/api.ts`** — new types: `CloudConnection`, `CloudEntry`, `IssuedLink`
- **`src/lib/api.ts`** — 6 new API functions: `listCloudConnections`, `createCloudConnection`, `testCloudConnection`, `updateCloudConnection`, `deleteCloudConnection`, `listCloudEntries`, `issueCloudLinks`
- **`src/store/cloudConnectStore.ts` (new)` — Zustand store: connections, selectedConnectionId, currentPath, entries, selectedPaths, loading/error state, navigation, selection
- **`src/applications/cloud-connect/` (new)** — Cloud Connect application:
  - **`CloudConnectApp.tsx`** — entry component: empty state, connection form, browser
  - **`components/ConnectionChips.tsx`** — connection switcher with status dots
  - **`components/EntryList.tsx`** — breadcrumb navigation + lazy directory listing + checkbox selection
  - **`components/InsertBar.tsx`** — "N files selected" + "Insert into chat" button
  - **`components/AddConnectionForm.tsx`** — inline form (label, url, username, password) with test-on-save
  - **`index.ts`** — export
- **`src/applications/registry.ts`** — register `cloud_connect: CloudConnectApp`
- **`src/components/ChatInput.tsx`** — `chat:insertText` event listener for appending markdown links
- **i18n** — `cloudConnect.*` keys × 2 languages (en, ru)

#### Infrastructure

- **`/etc/nginx/sites-enabled/kesha.thinkout.ru.conf`** — `/api/cloud/` location bypasses Authelia (HMAC + TTL protected)
- **`.env.example`** — `CLOUD_CONNECT_KEY` documentation

#### Security

- Credentials encrypted at rest with AES-256-GCM (12-byte random IV per encryption)
- Signed proxy URLs use HMAC-SHA256 with HKDF-derived key, bound to (connectionId, path, expiresAt)
- Default TTL: 3600 seconds
- `/api/cloud/` bypasses Authelia but is cryptographically protected
- Max inline file size: 5MB (configurable constant)

#### New dependency

- `webdav ^5.7.0` — WebDAV client for Node.js

#### Changed files

`db/migrate.js`, `db/seed.js`, `config.js`, `.env.example`, `app.js`, `routes/chat.js`, `src/types/api.ts`, `src/lib/api.ts`, `src/components/ChatInput.tsx`, `src/applications/registry.ts`, i18n locales (en, ru), nginx config.

#### New files

`routes/cloudConnections.js`, `routes/cloudFiles.js`, `lib/cloud/crypto.js`, `src/store/cloudConnectStore.ts`, `src/applications/cloud-connect/` (CloudConnectApp.tsx, components/ConnectionChips.tsx, EntryList.tsx, InsertBar.tsx, AddConnectionForm.tsx, index.ts).

## [0.9.1] - 2026-06-10 (Applications architecture, File Preview, File Manager, file retention)

### File Preview Application (Task #37)

Inline file preview for all session files. Accessible from the Applications pane on the Sessions page.

#### Backend

- **`routes/files.js`** — new endpoint `GET /api/sessions/:id/files/:fileId/content` serves file content inline (`Content-Disposition: inline`) for browser rendering. Unlike `/download` which forces attachment, this lets the browser render images, PDFs, and text directly.
- **Filename encoding fix** — `fixFilenameEncoding()` helper recovers double-encoded UTF-8 filenames (mojibake) in `rowToFile()`. Some browsers send UTF-8 bytes that get re-encoded, causing "Снимок" → "Ð¡Ð½Ð¸Ð¼Ð¾Ðº". Applied to all file listing endpoints.

#### Frontend

- **`src/applications/file-preview/FilePreviewApp.tsx` (new)** — main component registered as `file_preview` in the application registry. Fetches session files via `api.listSessionFiles(sessionId)`, auto-selects the first file, renders file list and preview area.
- **`src/applications/file-preview/FileList.tsx` (new)** — horizontal pill bar showing all files in the session. Each pill: icon + filename + size. Active file highlighted in blue. Scrollable horizontally for many files.
- **`src/applications/file-preview/FilePreview.tsx` (new)** — mimeType router that detects file type and delegates to the appropriate viewer component. Uses a switch statement (React 19 compatible).
- **9 viewer components** in `src/applications/file-preview/viewers/`:
  - **`ImageViewer.tsx`** — `<img>` for `image/*` (png, jpg, jpeg, gif, webp). Fit-to-container with `object-contain`.
  - **`MarkdownViewer.tsx`** — reuses existing `MarkdownRenderer` for `.md` files. Fetches content via `api.getFileContent()`.
  - **`CodeViewer.tsx`** — `highlight.js` + `<pre>` for code files (py, js, ts, jsx, tsx, sh, sql, xml, yml, yaml, css). No line numbers.
  - **`JSONViewer.tsx`** — `highlight.js` (language: json) + pretty-print with 2-space indent.
  - **`TextViewer.tsx`** — `<pre>` monospace for `txt`, `log`.
  - **`CSVViewer.tsx`** — parses CSV with `papaparse` library, renders as `<table>` with headers.
  - **`HTMLViewer.tsx`** — sandboxed `<iframe>` with `sandbox="allow-scripts"` for `.html` files.
  - **`PDFViewer.tsx`** — `<iframe>` or `<embed>` for `.pdf`. Fallback message with download button if browser doesn't support PDF embedding.
  - **`UnsupportedViewer.tsx`** — icon + filename + size + download button for unsupported types.
- **`src/store/filePreviewStore.ts` (new)** — Zustand store for cross-component file selection. `selectedFileId` state allows Navbar file dropdown to open a specific file in the preview pane.
- **Navbar file dropdown integration** — clickable file items in the Navbar's session files dropdown set `selectedFileId` in the store and open the Applications pane if closed.
- **New API methods** in `src/lib/api.ts`:
  - `getFileContentUrl(sessionId, fileId)` — returns URL for inline file content.
  - `getFileContent(sessionId, fileId)` — fetches file content as text for code/markdown/JSON viewers.

#### New dependency

- **`papaparse ^5.5.3`** + **`@types/papaparse ^5.5.2`** — robust CSV parsing with header detection, escaping, and different delimiters. +3 KB gzip.

#### i18n — 15 keys × 4 languages

`filePreview.title`, `filePreview.noSession`, `filePreview.noFiles`, `filePreview.error`, `filePreview.retry`, `filePreview.download`, `filePreview.unsupported`, `filePreview.loading`, `filePreview.expired`, `filePreview.today`, `filePreview.daysLeft`, `filePreview.hoursLeft`, `filePreview.never`, `filePreview.extend`, `filePreview.extendFailed`.

All four locales: en, ru, es, de.

#### Files changed

`routes/files.js`, `src/applications/file-preview/FilePreviewApp.tsx`, `src/applications/file-preview/FileList.tsx`, `src/applications/file-preview/FilePreview.tsx`, `src/applications/file-preview/viewers/` (9 viewers), `src/applications/file-preview/index.ts`, `src/store/filePreviewStore.ts`, `src/applications/registry.ts`, `src/components/Navbar.tsx`, `src/lib/api.ts`, `src/i18n/locales/{en,ru,es,de}/translation.json`, `package.json`, `package-lock.json`.

---

### File Manager Application (Task #38)

Global file management across all sessions. View all files, check disk usage, extend file lifetime, delete files, and navigate to the session where a file was used.

#### Backend — File retention policy

- **`db/migrate.js`** — idempotent migrations add two columns to `session_files`:
  - `expires_at INTEGER` — epoch ms timestamp when file expires. `NULL` means "never expires" (technical capability, no UI to set this).
  - `extended_count INTEGER NOT NULL DEFAULT 0` — tracks how many times the file has been extended.
- **`config.js`** — new `fileRetentionDays` config read from `FILE_RETENTION_DAYS` environment variable (default 30). Set to 0 to disable auto-deletion.
- **`.env.example`** — added `FILE_RETENTION_DAYS=30` with documentation.
- **Auto-set expiration on upload** — `routes/files.js` POST endpoint now sets `expires_at = uploaded_at + (fileRetentionDays * 24 * 60 * 60 * 1000)` when inserting into `session_files`.
- **Startup cleanup** — `server.js` calls `cleanupExpiredFiles()` on startup, which deletes all files with `expires_at < now()` from disk and database. Handles both user files (path: `data/uploads/<session_id>/<stored_name>`) and agent files (path: `stored_name` as absolute path).
- **Periodic cleanup** — `setInterval(cleanupExpiredFiles, 60 * 60 * 1000)` runs every hour to remove expired files without requiring a server restart.

#### Backend — Global files API

- **`routes/globalFiles.js` (new)** — four endpoints mounted at `/api/files`:
  - `GET /api/files` — list all files across all sessions. Joins with `sessions` table to get session titles. Returns `{ files: GlobalFile[], stats: { totalFiles, totalSize, expiringSoon } }`. Session title fallback: uses first user message (preview) if title is null, truncated to 70 chars. Shows "Deleted session" if session no longer exists.
  - `PATCH /api/files/:fileId/extend` — extends file expiration by `fileRetentionDays`. Increments `extended_count`. Returns `{ success: true, expiresAt: number }`.
  - `DELETE /api/files/:fileId` — deletes file globally (from disk + DB). Handles both user and agent files.
  - `POST /api/files/:fileId/copy` — copies file to target session. Creates physical copy on disk and new DB record. Returns new file object with `path` for immediate use in chat.
- **`app.js`** — mounts `globalFilesRouter` at `/api/files`.
- **`db/seed.js`** — `seedStarterApplications()` now seeds `file_manager` application (FolderOpen icon, enabled, sort_order 1) alongside `file_preview`.

#### Frontend

- **`src/applications/file-manager/FileManagerApp.tsx` (new)** — main component registered as `file_manager` in the application registry. Fetches all files via `api.getGlobalFiles()`, manages sort/filter/search state, renders stats bar and file list.
- **`src/applications/file-manager/FileStatsBar.tsx` (new)** — top bar showing total files count, total size (formatted), and "expiring soon" count (files expiring within 7 days, highlighted in orange).
- **`src/applications/file-manager/FileList.tsx` (new)** — sortable and filterable file list with search. Controls: sort dropdown (name/date/size/expires), order toggle (asc/desc), filter dropdown (all/expiring/images/code/documents), search input.
- **`src/applications/file-manager/FileRow.tsx` (new)** — single file row with icon, filename, session title, size, expiration badge, and action buttons. Click navigates to session and opens File Preview app with the selected file. Action buttons: Download (gray), Copy to chat (green), Extend (blue), Delete (red).
- **`src/applications/file-manager/ExpirationBadge.tsx` (new)** — color-coded expiration indicator:
  - 🟢 Green (> 14 days): "15 days left"
  - 🟡 Yellow (7-14 days): "10 days left"
  - 🟠 Orange (1-7 days): "5 days left"
  - 🔴 Red (< 1 day): "12 hours left" or "Expired"
  - ⚪ Gray (∞): "Never expires"
- **`src/applications/file-manager/ExtendButton.tsx` (new)** — button to extend file lifetime by `fileRetentionDays`. Shows loading spinner while extending. Optimistic update on success.
- **`src/applications/file-manager/DeleteConfirmModal.tsx` (new)** — confirmation dialog for file deletion. Shows filename and warning that action cannot be undone.
- **Integration with File Preview** — clicking a file in File Manager navigates to `/chat/:sessionId` and sets `selectedFileId` in `filePreviewStore`, which triggers File Preview app to open the selected file.
- **New API methods** in `src/lib/api.ts`:
  - `getGlobalFiles(params?)` — fetches all files with optional sort/order/filter/search params.
  - `extendFile(fileId)` — extends file expiration.
  - `deleteGlobalFile(fileId)` — deletes file globally.
  - `copyFile(fileId, targetSessionId)` — copies file to target session, returns new file with `path`.
- **New types** in `src/types/api.ts`:
  - `GlobalFile` interface — `id`, `sessionId`, `sessionTitle`, `filename`, `mimeType`, `size`, `uploadedAt`, `expiresAt`, `extendedCount`, `source`, `path`.
  - `FileStats` interface — `totalFiles`, `totalSize`, `expiringSoon`.
- **Integration with ChatInput** — `chat:addFile` custom event allows File Manager to add copied files directly to the chat input area. Files appear as attached and can be sent to the agent immediately.

#### i18n — 25 keys × 4 languages

`fileManager.title`, `fileManager.stats.files`, `fileManager.stats.size`, `fileManager.stats.expiringSoon`, `fileManager.sort.label`, `fileManager.sort.name`, `fileManager.sort.date`, `fileManager.sort.size`, `fileManager.sort.expires`, `fileManager.filter.label`, `fileManager.filter.all`, `fileManager.filter.expiring`, `fileManager.filter.images`, `fileManager.filter.code`, `fileManager.filter.documents`, `fileManager.search`, `fileManager.extend`, `fileManager.download`, `fileManager.copy`, `fileManager.copyToChat`, `fileManager.copyToSession`, `fileManager.selectSession`, `fileManager.copySuccess`, `fileManager.delete`, `fileManager.deleteConfirm.title`, `fileManager.deleteConfirm.message`, `fileManager.deleteConfirm.warning`, `fileManager.empty.noFiles`, `fileManager.empty.noFilesDesc`, `fileManager.empty.noMatch`, `fileManager.empty.noSearch`, `fileManager.expiration.expired`, `fileManager.expiration.today`, `fileManager.expiration.daysLeft`, `fileManager.expiration.hoursLeft`, `fileManager.expiration.never`, `fileManager.toast.extended`, `fileManager.toast.deleted`, `fileManager.toast.extendFailed`, `fileManager.toast.deleteFailed`, `fileManager.deletedSession`.

All four locales: en, ru, es, de.

#### Files changed

`db/migrate.js`, `db/seed.js`, `config.js`, `server.js`, `app.js`, `routes/globalFiles.js`, `routes/files.js`, `src/applications/file-manager/FileManagerApp.tsx`, `src/applications/file-manager/FileStatsBar.tsx`, `src/applications/file-manager/FileList.tsx`, `src/applications/file-manager/FileRow.tsx`, `src/applications/file-manager/ExpirationBadge.tsx`, `src/applications/file-manager/ExtendButton.tsx`, `src/applications/file-manager/DeleteConfirmModal.tsx`, `src/applications/file-manager/index.ts`, `src/applications/registry.ts`, `src/lib/api.ts`, `src/types/api.ts`, `src/i18n/locales/{en,ru,es,de}/translation.json`, `.env.example`.

---

### Bug fixes and improvements

- **Russian filenames in File Manager** — `fixFilenameEncoding()` applied to `routes/globalFiles.js` to recover double-encoded UTF-8 filenames (same fix as in Task #37).
- **Session title display** — File Manager now shows session preview (first user message, truncated to 70 chars) when session title is null, matching the behavior of SessionsPage. Shows "Deleted session" if session no longer exists.
- **File filter bug** — fixed `emptyMessage` logic in `FileList.tsx` to check `filteredAndSorted.length > 0` before showing "No files match" message. Previously showed empty state even when files were found.
- **File Preview integration** — fixed `useEffect` in `FilePreviewApp.tsx` to depend on `files` array, ensuring the store-selected file is opened after files are loaded.
- **Expired file cleanup** — `cleanupExpiredFiles()` in `server.js` now handles both user files (path: `data/uploads/<session_id>/<stored_name>`) and agent files (path: `stored_name` as absolute path). Runs on startup and every hour via `setInterval`.

---

### Applications Architecture (Task #36)

The Sessions page can now be split into a two-pane workspace on desktop (≥ 1024 px):
- **Left pane** — Chat with the agent (unchanged, always visible).
- **Right pane** — Applications area with an extensible plugin system.

On mobile the applications pane is hidden and chat occupies the full width.

#### Backend

- **`db/migrate.js`** — idempotent `CREATE TABLE IF NOT EXISTS applications` with columns: `id`, `key` (unique), `name`, `icon`, `description`, `enabled`, `sort_order`, `desktop_only`, `config` (JSON), `created_at`, `updated_at`. Index on `(enabled DESC, sort_order ASC)`.
- **`db/seed.js`** — `seedStarterApplications()` seeds the first application: `file_preview` (Eye icon, enabled, sort_order 0). Safe to call on every startup — exits early if the table is non-empty.
- **`server.js`** — calls `seedStarterApplications(uiDb)` after `seedStarterAssistants`.
- **`routes/applications.js` (new)** — two endpoints:
  - `GET /api/applications` — list all applications. Optional `?enabled=1` filter. Ordered by `sort_order ASC`.
  - `PATCH /api/applications/:id` — update metadata: `enabled`, `sortOrder`, `name`, `icon`, `description`, `config`. Returns updated application object.
- **`app.js`** — mounts `applicationsRouter` at `/api/applications`.

#### Frontend — Application system

- **`src/types/api.ts`** — new `Application` interface: `id`, `key`, `name`, `icon`, `description`, `enabled`, `sortOrder`, `desktopOnly`, `config`, `createdAt`, `updatedAt`.
- **`src/lib/api.ts`** — `getApplications(enabledOnly?)` and `updateApplication(id, patch)`.
- **`src/applications/types.ts` (new)** — `ApplicationComponentProps { sessionId, config }` and `ApplicationComponent` type. Every application component receives the same props.
- **`src/applications/registry.ts` (new)** — `applicationRegistry: Record<string, ApplicationComponent>` maps `key` → React component. Adding a new application = one import + one registry entry. No changes to layout, selector, or settings code.
- **`src/applications/placeholder/PlaceholderApp.tsx` (new)** — stub component for File Preview (task #37). Shows "File Preview coming soon" with an Eye icon.
- **`src/store/applicationsStore.ts` (new)** — Zustand store: `fetchApplications()`, `selectApplication(key)`, `updateApplication(id, patch)`. Auto-selects first enabled application on fetch. `selectedKey` persisted globally in `localStorage` (`hermes-selected-application`).

#### Frontend — Split layout

- **`src/components/Layout.tsx`** — when `activeSessionId` exists and `appsPaneVisible` is true, `<main>` renders a flex row with two panes (50/50). CSS breakpoint `lg:` (1024 px) controls applications pane visibility — not JS `useMobile()`, so it works correctly on foldables in desktop mode. Chat pane: `flex flex-col overflow-hidden`. Applications pane: `hidden lg:flex lg:flex-col lg:border-l`.
- **`src/components/ApplicationsPane.tsx` (new)** — right-side container:
  - Pill selector (horizontal scrollable row of icon + name tabs). Active tab: blue background. Inactive: muted text.
  - Icon resolved dynamically from `lucide-react` by the application's `icon` field.
  - Content area renders the selected application's component from the registry.
  - Loading spinner, empty state ("No applications"), and fallback state handled.
- **`src/store/appsPaneStore.ts` (new)** — Zustand store for pane visibility. `visible` defaults to `false` (pane hidden). Persisted in `localStorage` (`hermes-apps-pane-visible`).

#### Frontend — Navbar toggle

- **`src/components/Navbar.tsx`** — new button (PanelRightOpen / PanelRightClose) placed to the right of the Delete button, separated by a divider. Hidden on mobile (CSS `hidden lg:flex`). Clicking toggles `appsPaneVisible` in `appsPaneStore`. Active state highlighted in blue.

#### Frontend — Management page

- **`src/pages/ApplicationsPage.tsx` (new)** — standalone page at `/applications`:
  - Header with back-to-settings link.
  - List of all applications sorted by `sort_order`.
  - Each row: icon, name, description, key badge, up/down reorder buttons, toggle switch (enabled/disabled).
  - Disabled applications rendered at 50% opacity.
  - Info text at the bottom explaining the purpose.
- **`src/App.tsx`** — new route `/applications` (lazy-loaded).
- **`src/pages/SettingsPage.tsx`** — new "Applications" section block (same style as Assistants section) with link to `/applications`.

#### i18n — 11 keys × 4 languages

`applications.title`, `applications.subtitle`, `applications.manage`, `applications.backToSettings`, `applications.noApplications`, `applications.selectApplication`, `applications.enabled`, `applications.disabled`, `applications.moveUp`, `applications.moveDown`, `applications.infoText`, `applications.filePreviewComing`, `applications.filePreviewDesc`, `applications.selectSession`, `applications.showApplications`, `applications.hideApplications`, `applications.settingsDesc`.

Plus `api.failedToFetchApplications`, `api.failedToUpdateApplication`.

All four locales: en, ru, es, de.

#### Files changed

`db/migrate.js`, `db/seed.js`, `server.js`, `app.js`, `routes/applications.js`, `src/types/api.ts`, `src/lib/api.ts`, `src/applications/types.ts`, `src/applications/registry.ts`, `src/applications/placeholder/PlaceholderApp.tsx`, `src/store/applicationsStore.ts`, `src/store/appsPaneStore.ts`, `src/components/ApplicationsPane.tsx`, `src/components/Layout.tsx`, `src/components/Navbar.tsx`, `src/pages/ApplicationsPage.tsx`, `src/pages/SettingsPage.tsx`, `src/App.tsx`, `src/i18n/locales/{en,ru,es,de}/translation.json`.

No new npm dependencies.

#### Verification

`npm run lint` clean, `npm run typecheck` clean, `npm test` 22/22 pass, `npm run build` OK.

---

### Navbar — session context bar

The per-session header block (session title, model badge, assistant badge, file count, delete) that previously occupied a fixed strip at the top of the chat area has been relocated into the global Navbar, freeing the full viewport height for the message thread.

#### Store (`src/store/chatInputStore.ts`)

- New `NavSessionMeta` interface: `{ title, model, assistantName, assistantIcon }`.
- New `SessionActions` interface: `{ onStartEditTitle, onSaveTitle, onDeleteSession, onStop }` — callbacks registered by `ChatPage` so `Navbar` can invoke session operations without being in the same React subtree.
- Both stored in `chatInputStore` as `navSessionMeta` / `sessionActions`; cleared on session unmount.

#### ChatPage (`src/pages/ChatPage.tsx`)

- Removed the entire header `<div>` (breadcrumb, title `<h1>`, badges, Stop, Delete).
- On load and title save: writes `NavSessionMeta` to store via `setNavMeta`.
- Registers `SessionActions` in store via `setSessionActions`.
- Removed state now owned by Navbar: `isEditingTitle`, `editingTitle`, `isSavingTitle`, `isDeleting`, `confirmDelete`, `titleInputRef`.
- Removed unused imports: `X`, `ChevronRight`, `Trash2`, `Pencil`, `Loader2`, `Square`, `Paperclip`, `formatTimeAgo`, `formatFullDateTime`.

#### Navbar (`src/components/Navbar.tsx`) — full rewrite

- Height `h-16` → `h-[50px]` (unified with ChatInput and MobileNav).
- Layout: `[brand] | [title ✏️] — flex-1 — [badges][files][🗑️] | [🔍][●][U]`; brand and global controls in normal flow with a `flex-1` spacer, no absolute positioning.
- Title editing and delete-confirm state owned in Navbar; calls `sessionActions` for API operations.
- Stop button removed from Navbar (stays in ChatInput).
- `NavSessionFilesBar` — compact pill matching badge size; dropdown fixed with `click` listener + 1-tick `setTimeout` to avoid race; `overflow-visible` on centre container to prevent clipping.

#### New utility: `src/lib/fileUtils.ts`

- `formatFileSize` extracted from ChatInput and shared with NavSessionFilesBar.

#### ChatInput (`src/components/ChatInput.tsx`)

- `SessionFilesBar` and its imports removed.
- External padding wrapper removed — ChatInput owns its own `min-h-[50px]` and `px-3`.
- Buttons resized to `h-[34px]` to fit within the 50 px bar; textarea `py-[7px] leading-[20px]` = 34 px at one line, grows upward.

### Layout — unified 50 px bar heights

- `Navbar`: `h-[50px]`.
- `MobileNav`: `h-[50px]` on `<ul>`; `py-2` removed from nav links.
- `ChatInput` wrapper: `min-h-[50px]`; outer `p-3/p-4` padding removed from Layout.
- `Layout` `bottomPad` updated: 110 px (chat + mobilenav) / 50 px (no chat).

### MobileNav — active-tab pattern (`src/components/MobileNav.tsx`)

- Active tab: pill `bg-accent/10 text-accent` with icon + label; width fits content.
- Inactive tabs: icon only `w-9 h-9`.
- Tab list: `max-w-4xl mx-auto` matches chat content width; items `flex-1` within that bound.
- `/chat/:id` route highlights the **Sessions** tab as the parent section (via `useLocation`).

### Sessions page — pin / archive buttons (`src/components/SessionCard.tsx`)

- Removed `md:opacity-0 md:group-hover:opacity-100` — buttons were unreachable due to broken `group` scope.
- Pin and archive moved to **row 3**, right-aligned via `justify-between`.
- Pin: yellow star when active; grey outline when inactive.
- Archive: always grey.
- Removed separate right-side action column introduced in previous iteration.

### Chat page — minimalist message rendering (`src/pages/ChatPage.tsx`)

Complete visual overhaul of the message thread. Goal: clean reading flow, no decorative chrome.

#### Removed
- Avatar icons (Bot / User circles) — both sides.
- Borders and non-page backgrounds on assistant messages.
- Blue border on user messages.
- Timestamps on all messages.
- Regenerate (retry) button.
- `processStatus` / `executingTool` display in the waiting indicator.

#### User messages
- Right-aligned (`flex justify-end`), max 75 % width.
- Bubble: `bg-white dark:bg-gray-800`, `rounded-2xl rounded-tr-sm`, `shadow-sm` — stands out from page background without colour accent.
- Copy button appears on hover only (`opacity-0 group-hover:opacity-100`), styled as a small `bg-bg-secondary` pill.

#### Assistant messages
- Left-aligned, no wrapper box — plain text on page background.
- Copy button + optional latency (`Xs`) appear on hover in a `bg-bg-secondary` pill.

#### Streaming
- Plain `<div>` with blinking cursor; no border or background.

#### Waiting indicator
- Three small grey bouncing dots; no card wrapper.

#### Tool calls — turn-based grouping
Messages are pre-processed into **turn blocks** (user → tools → assistant) before rendering. All `role === 'tool'` messages within a turn — regardless of tool name — are collapsed into a single `<details>` row:

```
▶ используется N инструментов   (click to expand)
  ✓ web_search
  ✓ read_file
  ✓ web_search
```

- Works for both live streaming (via `completedToolCalls`) and historical messages (via turn-block pre-processing).
- Active tool calls during streaming: single line per active tool with a pulsing dot.
- `showToolCallHistory` state removed — replaced by native `<details>`.
- `ToolCall` component updated: no border/background, plain `<details>` with `▶ toolName` summary and `<pre>` body.

#### Removed imports / state
`ToolCall` component import, `Bot`, `User`, `RefreshCw` Lucide icons, `formatTimeAgo`, `formatFullDateTime`, `processStatus`, `executingTool`, `showToolCallHistory`.

### Sessions page — list redesign

#### Motivation
Card-based layout with borders, backgrounds and coloured badges was visually heavy. Goal: plain list like a mail client or Finder — focus on content, not decoration.

#### `navPageContext` — generic Navbar page slot

- New `NavPageContext` / `NavPageAction` interfaces in `chatInputStore.ts`.
- `setNavPageContext(ctx)` / `setNavPageContext(null)` registered on mount/unmount.
- `SessionsPage` registers `title = "Sessions"` + two actions: **Archived** (toggle) and **Select** (bulk mode).
- `Navbar` renders them in the centre zone using the same `[title] — flex-1 — [actions]` pattern as chat: active action gets `bg-accent/10 text-accent` pill, inactive gets muted text.
- Page header (`<h1>`, counts, Eye/CheckSquare/Plus buttons) removed from `SessionsPage` entirely.

#### `SessionCard` (`src/components/SessionCard.tsx`) — full rewrite

**Layout:**
```
[★ pin] [🗂 archive]   ←  always-visible action buttons (right side)
Title                           ассистент · модель · N · 2ч
Preview text one line…
```

- No card box, no border-radius, no background — plain row with `border-b border-border-default`.
- Row gets `bg-bg-primary` explicitly so the mobile swipe-reveal red layer doesn't bleed through.
- Hover: `bg-bg-secondary` on the row.
- Meta string (assistant · model · message count · time) rendered inline on the right of the title row; hidden on mobile (time only shown).
- Preview indented to align with title (accounts for absent pin icon).
- `py-3.5` vertical padding for comfortable row height.

**Actions:**
- Pin and archive buttons always visible on the right — no `opacity-0 group-hover:opacity-100`.
- Duplicate pin icon in title row removed (was showing twice for pinned sessions).
- Archived sessions show only the unarchive button (no pin).

**Swipe-to-delete — mobile only:**
- Red reveal layer and `useSwipe` hook now conditional on `useMobile()`.
- On desktop: no red layer, swipe disabled; bulk mode is the delete path.
- On mobile: swipe-left + long-press behaviour unchanged.

**Group headers:**
- Removed `<hr>` line, star/archive icons, `uppercase tracking-wide`.
- Plain `text-xs text-fg-muted` label, `sticky top-0 bg-bg-secondary`, minimal `py-1.5` padding.

#### Removed from `SessionsPage`
- `Plus`, `Star`, `Archive`, `Eye`, `CheckSquare` imports (now in `SessionCard` or gone).
- `total` read reference (used only in removed header).
- Page header JSX block entirely.

### User menu — consolidated controls

Moved from Sidebar bottom bar into the Navbar user dropdown (between Settings and Logout):

- **Theme toggle** (Sun/Moon) — switches light/dark mode
- **Notifications toggle** (Bell/BellOff) — enables/disables browser notifications
- **Like button** (Heart) — sends a like; turns pink after sending; cooldown-aware. Positioned near the bottom of the menu (above GitHub/copyright) to avoid accidental clicks
- **GitHub link** — below Like
- **Copyright** — below GitHub

`Navbar.tsx` now owns `isDarkMode/toggleDarkMode` (via `useThemeStore`) and `notificationsEnabled/toggleNotifications` (via `useNotificationsStore`) and the full like state machine (`idle → sending → sent/cooldown`).

### Sidebar — removed entirely

Navigation is now exclusively through `MobileNav` (bottom bar, all devices).

#### Deleted files
- `src/components/Sidebar.tsx`
- `src/store/sidebarStore.ts`
- `src/store/navStyleStore.ts`

#### `Layout.tsx`
- Removed `Sidebar`, `useSidebarStore`, `useNavStyleStore`, `useBottomNav` logic.
- `ChatInput` is now always `fixed` above `MobileNav` (`bottom: calc(50px + safe-area)`, `z-[55]`) on all devices.
- `MobileNav` is always `fixed bottom-0` — no device gate.
- `bottomPad` on `<main>`: `110px` in chat (ChatInput + MobileNav), `50px` otherwise.

#### `Navbar.tsx`
- Removed `isSidebarOpen`/`setIsSidebarOpen` props and hamburger button.
- Removed `useNavStyleStore` import.
- `Navbar` is now a zero-argument component.
- Apps pane toggle (`PanelRight`) restored in `sessionControls` — `hidden lg:flex`, highlights blue when pane is open.

#### `MobileNav.tsx`
- Removed `useMobile`, `useNavStyleStore` imports.
- Removed `!isMobile && navStyle !== 'bottombar'` early-return guard — nav always renders.

#### `SettingsPage.tsx`
- Removed "Desktop Navigation Style" setting block (Sidebar / Bottom bar toggle).
- Removed `useNavStyleStore`, `useSidebarStore`, `PanelLeft`, `AlignJustify` imports and variables.

## [0.9.0] - 2026-06-09 (v0.9.0 release — Tasks #23 and #24 + code audit + UX sprint + mobile layout overhaul + chat UX improvements)

### UX sprint — Dashboard and Sessions redesign

#### Dashboard

- **Time-based greeting** — static «Welcome» replaced with a dynamic greeting based on time of day: «Good morning» (05:00–12:00), «Good afternoon» (12:00–18:00), «Good evening» (18:00+). Translated into all 4 locales (en, ru, es, de). New i18n keys: `dashboard.greetingMorning`, `dashboard.greetingAfternoon`, `dashboard.greetingEvening`.
- **Quick Chat redesign** — the full-width `<select>` above the textarea is replaced with a pill button in the footer row of the chat box. Clicking it opens a grouped dropdown (providers as section headers, models as rows) that pops upward. The textarea is now the first element and receives `autoFocus` on mount.
- **Send button fixed height** — `self-end h-[44px]` replaces `self-stretch`; the button no longer grows with the textarea.
- **Spinner on Send** — `Loader2` replaces the `Send` icon while a session is being created.
- **Preview in Recent Sessions** — each session row now shows `session.preview` as a second line (`text-xs text-fg-muted truncate`) when it differs from the title. Provides context without opening the session.
- **Assistants quick-start block** — when at least one active assistant exists, a grid of up to 3 `AssistantTile` cards is shown between the chat box and Recent Sessions. Clicking a tile creates a session immediately. «View all» links to `/new`.
- **Recent Sessions visual refresh** — card list uses `divide-y` instead of individual spacing; hover uses `−mx-2 px-2` to span the full card width cleanly.
- **Layout narrowed** — `max-w-6xl → max-w-3xl` and two-column grid removed; single-column flow with `space-y-6` is cleaner and focused.

#### Sessions page

- **Group headers redesigned** — TODAY / YESTERDAY / THIS WEEK headers: removed `uppercase tracking-wide`, added a `<hr className="flex-1 border-border-default">` line that stretches to the right edge. Cleaner visual separation between date groups.
- **Page title decluttered** — decorative blue icon-square removed from the `Sessions` heading. Plain `h1` + session count below.
- **Refresh button removed** — redundant; the list already reloads on navigation via `location.key`. Reduces header clutter.
- **Session count always visible** — `hidden sm:block` removed from the «24 of 24 sessions» subtitle so it shows on all screen sizes.

#### SessionCard — full rebuild

Previous layout had the checkbox overlapping the title text in bulk mode. The card is now rebuilt from scratch:

**New layout (3 rows):**
```
Row 1  ★ Title (truncate)
Row 2  Preview text (truncate, 1 line, text-fg-muted)
Row 3  [Assistant][Model][⬜ N]      [★pin][⬛archive]  5m ago
```

**Checkbox column (right side, always in DOM):**
- Separate `w-12` column with `border-l`, rendered as a sibling to the content `<Link>` inside a `flex items-stretch` wrapper.
- `opacity-0 pointer-events-none` in normal mode → `opacity-100` in bulk mode (150 ms transition). Zero layout shift — card dimensions never change.
- `tabIndex={-1}` when hidden so keyboard navigation is unaffected.

**Other changes:**
- Pin icon moved into row 1 next to the title (only shown when pinned).
- Message count displayed as icon + number (`text-xs text-fg-muted`) without a badge — less visual noise.
- «Hold to select» hint removed entirely.
- `preview`: `line-clamp-2` → `line-clamp-1` (one clean line).
- Time label: `text-xs` → `text-sm`, moved into row 3 right block alongside pin/archive actions.
- Pin and archive buttons: `min-h-[44px] min-w-[44px]` → `min-h-[36px] min-w-[36px]` (row 3 is compact).

#### Files changed

`src/pages/DashboardPage.tsx`, `src/components/SessionCard.tsx`, `src/pages/SessionsPage.tsx`, `src/i18n/locales/{en,ru,es,de}/translation.json`.

#### Verification

`npm run lint` clean, `npm run typecheck` clean, `npm test` 22/22 pass, `npm run build` OK.

---

### Mobile layout overhaul — fixed scroll, sidebar overlay, MobileNav

Complete rewrite of the layout architecture to fix systematic UX breakage on mobile browsers (Firefox mobile, Galaxy Fold, touch devices in general).

#### Root cause

The previous layout used `h-screen overflow-hidden` on the root div with nested flexbox. Mobile browsers (especially Firefox) treat `100vh` inconsistently — it does not account for the dynamic browser chrome (address bar showing/hiding on scroll), causing the layout to "fall off" the screen and all fixed-positioned elements to scroll with the page.

#### Changes

**`src/components/Layout.tsx` — full rewrite**

- Root uses `h-dvh` (`100dvh`) instead of `h-screen` — `dvh` tracks the actual visible viewport including browser chrome changes. Falls back correctly in older browsers.
- `<main>` is `overflow-hidden flex flex-col`; each page component owns its own scroll via `overflow-y-auto` on its root div. This makes scroll containment explicit and predictable.
- **Mobile ChatInput** is `position: fixed` at the bottom of the viewport (`z-[55]`), positioned above MobileNav. No longer participates in page scroll.
- **Desktop ChatInput** stays in normal flex flow as before — no change for desktop users.
- Sidebar on mobile: renders as `fixed` overlay with a semi-transparent backdrop (`z-[45]`). Tap backdrop to close. Does not shift the content area.
- Sidebar on desktop: part of the flex row — naturally pushes content to the right.
- `paddingBottom` on `<main>` compensates for fixed MobileNav + ChatInput height so last content item is never obscured.

**`src/components/Sidebar.tsx` — removed `fixed`, overlay model**

- Desktop: plain `<aside>` in flex flow (width 288 px), pushes content naturally. No more `fixed left-0 top-16` with manual `ml-72` margin compensation.
- Mobile: `fixed` overlay with `paddingTop: 64px` to clear the Navbar.
- `isMobile` prop passed from Layout; no internal `useMobile()` call.
- `hidden md:flex` removed — visibility controlled by `isSidebarOpen` state, not CSS breakpoint. Works correctly on Galaxy Fold inner screen (≥768px but touch device).

**`src/components/MobileNav.tsx`**

- `md:hidden` removed — visibility controlled exclusively by `useMobile()` hook (which uses `(pointer: coarse) and (hover: none)` media query). Previously `md:hidden` was hiding MobileNav on Galaxy Fold inner screen (≥768px wide but a touch device).
- `position: fixed bottom-0 inset-x-0 z-[50]` — always pinned to viewport bottom regardless of scroll position.
- `pb-[env(safe-area-inset-bottom,0px)]` for iPhone home indicator.

**`src/store/sidebarStore.ts`**

- Default open state now checks `(pointer: coarse) and (hover: none)` in addition to `window.innerWidth >= 768`. Touch devices (including wide-screen foldables) default to sidebar closed so it does not overlay content on first visit.

**All page components** — added `overflow-y-auto` scroll wrapper on root divs:

- `DashboardPage` — `flex-1 min-h-0 overflow-y-auto` wrapper; `autoFocus` removed from textarea (caused viewport jump and zoom on mobile).
- `SessionsPage` — same wrapper; `Virtuoso` replaced with plain `map()` + `IntersectionObserver` for infinite scroll (see below).
- `SettingsPage`, `AssistantsPage`, `AssistantEditPage` — `h-full flex flex-col` → `flex-1 min-h-0 overflow-y-auto`.
- `NewSessionPage` — `overflow-y-auto` scroll wrapper + `max-w-4xl mx-auto` inner container.
- `ChatPage` — unchanged; already had `flex-1 min-h-0 overflow-y-auto` with `scrollContainerRef`.

#### Files changed

`src/components/Layout.tsx`, `src/components/Sidebar.tsx`, `src/components/MobileNav.tsx`, `src/store/sidebarStore.ts`, `src/pages/DashboardPage.tsx`, `src/pages/SessionsPage.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/AssistantsPage.tsx`, `src/pages/AssistantEditPage.tsx`, `src/pages/NewSessionPage.tsx`.

---

### SessionsPage — Virtuoso replaced with native scroll

**Problem:** `react-virtuoso` with `useWindowScroll={false}` requires an explicit height on its container. The container's height was computed via `h-full` in a flex chain where no ancestor had a fixed height, causing Virtuoso to collapse to 0 px. Session cards rendered at incorrect (near-zero) widths.

**Solution:** Removed `react-virtuoso` entirely. Sessions list is now a plain `Array.map()` render with an `IntersectionObserver` sentinel div at the bottom for infinite scroll (loads next page when the sentinel enters the viewport with `rootMargin: 400px`).

- `SessionsPage` bundle: **79 KB → 20 KB** gzip (Virtuoso dependency removed).
- Infinite scroll behavior preserved: `loadMore()` called when sentinel is visible; `Loader2` spinner shown while loading.
- Sticky group headers (`top-0 bg-bg-secondary z-10`) work correctly without virtualization.
- `useRef` / `useEffect` for sentinel moved before any early `return` to comply with React hooks rules.

#### Files changed

`src/pages/SessionsPage.tsx`.

---

### Chat UX improvements

A comprehensive pass over the chat experience focused on non-technical users.

#### MarkdownRenderer — full overhaul (`src/components/MarkdownRenderer.tsx`)

**Links**
- All links now open in a new tab (`target="_blank" rel="noopener noreferrer"`).
- External link icon (`ExternalLink`, 12 px) appended inline after link text.
- **Bare URL auto-linking** — new `preprocessLinks()` function converts domain-only URLs written without a protocol (`drive2.ru/path`, `t.me/channel`, `aliexpress.com/...`) to `https://` prefixed URLs before passing content to ReactMarkdown. remark-gfm then autolinks them normally. Code blocks and inline code are excluded from processing. Covers ~50 TLDs.

**Code blocks**
- Dark header bar shows language label (`Python`, `TypeScript`, `JSON`, `Bash`, etc.) derived from the highlight.js `language-*` className. Falls back to `"code"` when language is unknown.
- Copy button always visible on mobile; hover-only on desktop (`md:opacity-0 md:group-hover:opacity-100`). Shows `"Копировать"` / `"Скопировано"` text label alongside the icon.
- Copy confirmation timeout: **200 ms → 1500 ms**.
- Long code blocks (scroll height > 320 px) collapse with a fade gradient. A `"Показать полностью"` / `"Свернуть"` toggle expands/collapses. Detected after first render via `useEffect` measuring `scrollHeight`.
- Code block background: `#0d1117` (GitHub dark). Header: `#1e2736`.

**Tables**
- Wrapped in `rounded-lg border` container with `overflow-x-auto`.
- Row hover effect (`hover:bg-bg-secondary/50`).
- Border colors use `var(--color-border-default)` (design system tokens, not hardcoded hex).

**Images**
- New `img` component: `max-w-full rounded-lg border shadow-sm`, `loading="lazy"`. Alt text rendered as italic caption below.

**Blockquote**
- Left border + accent background fill (`bg-accent-soft/30`) instead of plain border.

**Typography**
- `p` gains `last:mb-0` to remove trailing margin on the last paragraph.
- `h1` gets a bottom border separator (`border-b border-border-default pb-2`).

**CSS (`src/styles/markdown.css`)**
- All hardcoded hex colors (`#e5e7eb`, `#4b5563`, `#d1d5db`) replaced with `var(--color-border-default)`. Dark mode table/blockquote borders now correctly track the design system.
- Removed redundant `.markdown-content pre` margin (CodeBlock component handles this).

#### ChatPage improvements (`src/pages/ChatPage.tsx`)

**Header**
- Cancel title-editing button: `AlertCircle` icon → `X` (correct semantic).
- **Stop button in header** — appears during generation (`sending === true`) as a compact red pill (`Square` icon + "Stop" label). Allows stopping generation without scrolling to the bottom input area.

**Message actions**
- Copy/Regenerate buttons: `opacity-0 md:group-hover:opacity-100` → always visible on mobile (`opacity-100`), hover-only on desktop (`md:opacity-0`). No more invisible buttons on touch screens.
- `aria-label` for assistant copy button was hardcoded English (`'Copy message'`) — fixed to use `t('chat.copyMessage')`.
- `title` tooltip added to all action buttons.
- **Latency / token count** hidden behind group hover: `opacity-0 group-hover:opacity-100`. Previously always visible, adding visual noise. Token count abbreviated: `tokens` → `tok`.

**Streaming message**
- Now renders with the same layout as a finished assistant message: Bot avatar + card border + `bg-bg-primary`.
- **Blinking cursor** `▌` (`w-0.5 h-4 bg-fg-primary animate-[blink_1s_step-end_infinite]`) appended at end of streaming content.
- `@keyframes blink` added to `src/index.css`.

**Scroll-to-bottom button**
- Previously shown only when `!isAtBottom && unreadCount > 0`. Now shows whenever `!isAtBottom` (user scrolled up even without new messages).
- Redesigned: white pill with border + `ChevronDown` icon, replaces the blue capsule. Less intrusive.

**Empty state — prompt suggestions**
- 4 clickable suggestion chips below the empty-state illustration: "Объясни простыми словами", "Помоги составить план", "Исправь ошибки в тексте", "Переведи на русский".
- Clicking fires `window.dispatchEvent(new CustomEvent('chat:prefill', { detail: { text } }))`.
- `ChatInput` listens for `chat:prefill` and inserts the text + focuses the textarea.

#### ChatInput — SessionFilesBar redesign (`src/components/ChatInput.tsx`)

**Before:** A plain text link ("3 files in session") with an upward-opening dropdown showing filename + colored dot.

**After:** A pill button with:
- `FileStack` icon + file count label (e.g. "3 файлов в сессии").
- Source badges: blue `User` icon + count for user-uploaded files; green `Bot` icon + count for agent-created files.
- `ChevronDown` arrow rotates on open.
- Dropdown opens **above** the input (unchanged) but now has a proper header row ("Файлы сессии" + ✕ close button) and a structured file list: file type icon (`FileText`/`ImageIcon`) + truncated filename + file size + source badge ("вы" / "агент").
- Border color changes to blue when open.
- `aria-expanded` attribute for accessibility.

#### Files changed

`src/components/MarkdownRenderer.tsx`, `src/styles/markdown.css`, `src/pages/ChatPage.tsx`, `src/components/ChatInput.tsx`, `src/index.css`.

---

### Task #35 — Session-level file indicators

**Problem (follow-up to Task #23):** after a user uploads a file and sends the message, the chip disappears. There is no persistent record that the session contains uploaded or agent-created files.

**Solution:**

- **ChatPage header** — a `Paperclip` icon + count badge (`📎 3`) appears next to the model name whenever `sessionFiles.length > 0`. Uses the existing `sessionFiles` array already published to `chatInputStore` by `ChatInput`. No extra API calls.
- **SessionCard** (Sessions list) — same `Paperclip` + count badge in row 3 alongside the message count. Backend `GET /api/sessions` now returns `fileCount` via a single extra GROUP BY query against `session_files` (`fileCountMap` built in one pass, O(1) per session). Frontend `Session` type gains optional `fileCount?: number`.
- **i18n** — new `chat.sessionFilesCount` key (with `_one`/`_few`/`_many` variants) × 4 languages.

**Files changed:** `routes/sessions.js`, `src/types/api.ts`, `src/pages/ChatPage.tsx`, `src/components/SessionCard.tsx`, i18n locales.

---

### Task #28 — UX-3: jargon-free terminology

Renamed technical terms visible to non-technical users:

| Before | After (EN) | After (RU) |
|---|---|---|
| Model Providers | AI Services | Сервисы ИИ |
| API key | Access key | Ключ доступа |
| Provider Keys (page title) | Service Keys | Ключи сервисов |
| Manage provider keys | Manage service keys | Управление ключами сервисов |
| Model Providers section desc | Enable or disable available AI models | Включение и отключение доступных моделей |
| Providers page desc | Add or remove access keys for AI services | Добавьте или удалите ключи доступа к сервисам ИИ |

Updated i18n keys: `settings.modelProviders`, `settings.modelProvidersDesc`, `providers.title`, `providers.description`, `providers.apiKeyLabel`, `providers.apiKeyPlaceholder`, `providers.errorKeyEmpty`, `providers.manageKeys` — all 4 languages (en, ru, es, de). No component changes required.

**Files changed:** `src/i18n/locales/{en,ru,es,de}/translation.json`.

---

### Task #29 — UX-7: onboarding banner

A dismissable onboarding banner is shown on the Dashboard when a new user has **no models available** and **no sessions yet**. Guides them through three steps: add a service key → enable a model → start chatting.

**Implementation:**

- Detected in `DashboardPage.loadData()`: after loading models, checks `allModels.length === 0 && sessions.length === 0 && !localStorage.onboarding_dismissed`.
- Banner renders below the greeting, above the Quick Chat box.
- Three numbered steps with icons (`Key`, `Zap`, `MessageCircle`) and brief descriptions.
- "Add service key →" button links to `/settings/providers`.
- ✕ dismiss button sets `localStorage.onboarding_dismissed = '1'` and hides the banner immediately. Not shown again.
- Styled with blue accent border (`border-blue-200 dark:border-blue-800`) — visible but non-intrusive.
- Does not appear once the user has sessions or models configured (not just dismissed — actually set up).

**i18n:** 10 new keys in `dashboard.*` × 4 languages: `onboardingTitle`, `onboardingDesc`, `onboardingStep1`, `onboardingStep1Desc`, `onboardingStep2`, `onboardingStep2Desc`, `onboardingStep3`, `onboardingStep3Desc`, `onboardingDismiss`, `onboardingGoToKeys`.

**Files changed:** `src/pages/DashboardPage.tsx`, i18n locales.

---

### Task #17 — CI: README badge + release workflow

- **README badge** — `[![CI](…/ci.yml/badge.svg)](…)` added at the top of `README.md`. Status line updated to reflect current v0.9.0 features.
- **`release.yml`** (new) — GitHub Actions workflow triggered on `v*.*.*` tag push:
  1. Full CI pass (lint → typecheck → test → build)
  2. Creates `1230-ui-vX.Y.Z.tar.gz` containing `dist/`, `routes/`, `middleware/`, `db/`, `scripts/`, `app.js`, `server.js`, `config.js`, `ecosystem.config.json`, `install.sh`, `.env.example`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`
  3. Extracts the relevant section from `CHANGELOG.md` as release notes
  4. Creates a GitHub Release via `softprops/action-gh-release@v2` with the archive attached

**Files changed:** `README.md`, `.github/workflows/release.yml`.

---

### Agent File Download (Task #24)

When the agent creates or writes a file (code, report, exported data), it
mentions the path in plain text — e.g. "I saved it to `/tmp/report.md`".
Task #24 turns that bare path into a real download button inside the
chat message: no terminal, no copy-paste of `/tmp/...`.

#### How it works

- **Detection signal** — the assistant's response text is parsed for
  backtick-wrapped absolute paths (`` `(/[^\s`]{1,500})` ``). Each
  candidate is verified with `fs.statSync`; missing files / non-files
  are silently dropped.
- **Storage** — detected files are recorded in `session_files` with
  `source = 'agent'`, reusing the table from Task #23. The
  `stored_name` column carries the **full absolute path** the agent
  wrote to (we don't copy the file; we serve it from where the agent
  placed it).
- **Wire format** — a new `agent_files` SSE event is emitted before
  `res.end()`, carrying `{ id, filename, size, mimeType }` for each
  detected file. The frontend uses these ids to build the download URL.
- **Deduplication** — `(session_id, stored_name, source = 'agent')`
  unique. Re-mentioning the same path in another message is a no-op.

#### Backend

- **`db/migrate.js`** — idempotent `ALTER TABLE session_files ADD COLUMN source TEXT NOT NULL DEFAULT 'user'`. Existing user-uploaded rows from Task #23 automatically get `source = 'user'`.
- **`routes/chat.js`** — module-level `PATH_PATTERN` and `MIME_MAP`; new `detectAgentFiles(sessionId, responseText)`. The SSE handler accumulates `choices[0].delta.content` from every chunk into a local `responseText` string; detection runs in `finally {}` and the `agent_files` event is written before `res.end()`. No changes to the existing `status` / `tool_call_*` / error envelopes.
- **`routes/files.js`** —
  - `MIME_MAP` covering 22 extensions (kept identical to `routes/chat.js`).
  - `GET /api/sessions/:id/files/:fileId/download` — new endpoint. For `source = 'agent'` serves from `row.stored_name` (the agent's absolute path); for `source = 'user'` builds the path under `data/uploads/<session>/`. `fs.existsSync` check returns `404 {"error":"File no longer available"}` if the on-disk file is gone. `res.download(absolutePath, row.filename)` for the actual stream.
  - `POST /:id/files` now writes `source = 'user'` explicitly.
  - `DELETE /:id/files/:fileId` skips `fs.unlinkSync` for `source = 'agent'` (the file isn't ours to delete — only the DB row is removed).
- **`routes/sessions.js`** — `cleanupSessionUploads()` reads the new `source` column and skips the `fs.unlinkSync` call for agent rows. The `DELETE FROM session_files` still runs, so agent rows are removed in bulk delete as required by the brief.

#### Frontend

- **`src/types/api.ts`** — new `AgentFile` interface (`id`, `filename`, `size`, `mimeType`) and optional `agentFiles?: AgentFile[]` on `Message`.
- **`src/lib/api.ts`** — `sendMessage` options gained `onAgentFiles?`; new parser branch handles `parsed.type === 'agent_files'`.
- **`src/components/AgentFileCard.tsx`** (new) —
  - `AgentFileCard` — single-file row. Type-aware icon (`ImageIcon` for `image/*`, `FileDown` for `application/pdf`, `FileText` otherwise) · filename (truncate) · `·` · `formatFileSize` · chevron toggle (`useState(false)` — collapsed by default, expanded state is visually identical in v1 per brief, structural slot for Task #34) · plain `<a href="/api/sessions/:id/files/:fileId/download" download>` button.
  - `AgentFileGroup` — wraps multiple cards. `files.length === 1` returns a single `AgentFileCard` directly (no extra box); `length > 1` renders an outer collapsible container with label "Files created (N)" and the individual cards inside.
  - Visual language matches the existing `ToolCall` block (same border, same `bg-bg-secondary`, same chevron animation) for chat consistency.
- **`src/pages/ChatPage.tsx`** —
  - `currentAssistantIdRef` (`useRef<number | null>`) tracks the message being streamed.
  - `doSend` pre-allocates the assistant message id and appends an empty placeholder **before** the fetch, so the `agent_files` SSE event (which arrives before `[DONE]`) can attach cards to it.
  - `onAgentFiles` callback merges new files into `message.agentFiles`.
  - `onDone` updates the pre-allocated message in place (preserves `agentFiles`).
  - `handleStop` and `onError` updated to operate on the pre-allocated id so cards aren't orphaned.
  - The empty-content filter was loosened to keep messages that have at least one `agentFile` (otherwise the placeholder would disappear if `agent_files` arrived before any text chunk).
  - `AgentFileGroup` rendered below `MarkdownRenderer` in the assistant bubble.

#### i18n — 5 keys × 4 locales

`chat.agentFilesLabel` (with `_one` / `_other` plurals, plus `_few` / `_many` for ru), `chat.downloadFile`, `chat.fileNotFound`, `chat.expandFile`, `chat.collapseFile`. All four locales: en, ru, es, de.

#### Files changed

`db/migrate.js`, `routes/chat.js`, `routes/files.js`, `routes/sessions.js`, `src/types/api.ts`, `src/lib/api.ts`, `src/components/AgentFileCard.tsx`, `src/pages/ChatPage.tsx`, `src/i18n/locales/{en,ru,es,de}/translation.json`.

No new npm dependencies.

#### Verification

`npm run typecheck` clean, `npm run lint` clean, `npm test` 22/22 pass, `npm run build` OK, `node --check` clean on all modified backend files.

#### Known follow-up

Inline preview, syntax highlighting, bulk zip download, "Open in new tab", global Files view, and version-overwrite handling are all out of scope for Task #24 and tracked in **Task #34 (Extended file functionality)**. The `useState(false)` toggle in `AgentFileCard` and the outer `AgentFileGroup` button are the structural slots Task #34 will fill without changing the surrounding component shape.

### File Upload to Session (Task #23)

### File Upload to Session (Task #23)

Users can now attach files to a chat message. The agent reads them autonomously by path
(no multipart / base64 needed on the Hermes side — verified experimentally).

#### Backend

- **`session_files` table** — new table in the UI DB. Schema:
  ```sql
  CREATE TABLE session_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL,
    filename    TEXT    NOT NULL,  -- original filename shown to the user
    stored_name TEXT    NOT NULL,  -- UUID + lowercased extension on disk
    mime_type   TEXT,
    size        INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL
  );
  CREATE INDEX idx_session_files_session ON session_files(session_id);
  ```
  Idempotent migration added to `db/migrate.js`.
- **`routes/files.js` (new)** — three endpoints mounted at `/api/sessions`:
  - `POST /api/sessions/:id/files` — `multipart/form-data` (field `file`); multer with 50 MB cap, extension **and** MIME whitelist (`multer.fileFilter`); `apiLimiter` (100 req/min) on POST only; stored as `data/uploads/<session_id>/<uuid>.<ext>`. Returns `201` with `{ id, sessionId, filename, storedName, mimeType, size, uploadedAt, path }`.
  - `GET /api/sessions/:id/files` — list files for a session. Always verifies the session exists in Hermes.
  - `DELETE /api/sessions/:id/files/:fileId` — remove a single file. Verifies `session_id` matches the URL param before touching the disk; `fs.unlinkSync` swallows `ENOENT`.
- **EXDEV-safe move** — multer writes to `os.tmpdir()/1230-ui-uploads`, which on this host lives on a different filesystem from `/opt/1230-ui/data/uploads`. `fs.renameSync` throws `EXDEV: cross-device link not permitted`; the route falls back to `fs.copyFileSync` + `fs.unlinkSync` on that error.
- **`routes/sessions.js` cleanup** — new `cleanupSessionUploads(sessionId)` helper: deletes every file in `data/uploads/<id>/`, then `rmdirSync` (swallow `ENOENT`), then `DELETE FROM session_files WHERE session_id = ?`. Called in `DELETE /:id` and inside the `DELETE /bulk` transaction after the session is removed.
- **`multer ^2.1.1`** — new dependency.

#### Frontend

- **`src/lib/api.ts`** — new `SessionFile` type and three methods: `api.uploadFile`, `api.listSessionFiles`, `api.deleteSessionFile`. Upload uses `FormData`; error messages come from the server's `error` field when present, i18n fallback otherwise.
- **`src/pages/ChatPage.tsx`** — local `AttachedFile[]` state (no global store, per brief §2.3):
  - **Paperclip button** (`lucide-react` `Paperclip`) — placed to the left of Send. `min-h-[44px] min-w-[44px]` for the 44×44 touch target. Triggers a hidden `<input type="file" multiple accept="…">`.
  - **Drag-and-drop** — handlers attached to the page root. Uses a `dragCounterRef` to avoid the `dragleave` flicker for child elements. Overlay: full-area semi-transparent blue + dashed border + centered "Drop to attach" label. Desktop-only; on touch devices only the paperclip is available.
  - **File chips** — rendered between the message history and the input. States: `uploading` (spinner, neutral), `ready` (FileText/Image icon + blue tint), `error` (AlertCircle + red tint + inline Retry). × button on every chip. List resets when the session `:id` changes.
  - **Send flow** — handler prepends `[Attached file: <path>]` for every `ready` attachment, separated by newlines, then a blank line, then the user text. On `onDone` the chip list is cleared. On `onError` chips are kept so the user can retry without re-uploading.
  - **Client-side limits** — size > 50 MB and unsupported extension both produce an `error` chip **without** hitting the server. The 5-files cap shows an inline warning and drops the overflow.
  - **Navigation guard** — `inputHasText` returns `true` while there are attached files, and `handleLeaveConfirm` clears them on leave.
  - **Send button** — enabled when there is text **or** at least one `ready` attachment.
- **i18n** — 8 new `chat.*` keys (`attachFile`, `dropFilesHere`, `fileUploading`, `fileError`, `fileRetry`, `fileTooLarge`, `fileTypeNotAllowed`, `tooManyFiles`) + 3 new `api.*` keys (`failedToUploadFile`, `failedToDeleteFile`, `failedToListFiles`), all four locales (en, ru, es, de).

#### Files changed

`package.json`, `package-lock.json`, `db/migrate.js`, `routes/files.js`, `routes/sessions.js`, `app.js`, `src/lib/api.ts`, `src/pages/ChatPage.tsx`, `src/i18n/locales/{en,ru,es,de}/translation.json`.

#### Verification

`npm run lint` clean, `npm run typecheck` clean, `npm test` 22/22 pass, `npm run build` OK (`ChatPage` chunk 183 KB → 190 KB gzip, +7 KB).

#### Known follow-up

Once a message is sent, the chips disappear and the session has no persistent "this session has N files" indicator. This is tracked as **Task #35 (Session-level file visualisation)** in `TODO.md` and discussed in `docs/BRIEF-23-file-upload.md` § 8 — it should land before tagging v1.0.0.

## [0.8.0] - 2026-06-08

Backend refactoring sprint + UX improvements + **Assistants Phase 2** (style, depth, system prompt). `server.js` (1911 lines) split into a modular directory structure. 5 open items from the UX/UI audit closed. Task #25 Phase 2 partially shipped.

### Assistants Phase 2 — style, depth, system prompt (Task #25)

#### New assistant fields

Three new fields added to the `assistants` table via idempotent `ALTER TABLE` migrations:

| Field | Type | Values | Purpose |
|---|---|---|---|
| `style` | TEXT NULL | `friendly` / `formal` / `concise` / `creative` | Communication tone displayed on tiles |
| `depth` | TEXT NULL | `quick` / `standard` / `thorough` | Response depth (maps to `max_iterations` in future) |
| `system_prompt` | TEXT NULL | free text ≤ 4000 chars | Injected as `system` message on every chat turn |

#### AssistantTile — visual indicators

- **Style badge** — emoji + label (e.g. `💬 Friendly`). On mobile (`< sm`) only the emoji is shown to save space.
- **Depth dots** — three filled/empty dots `●●○` in the assistant's accent colour (e.g. `●●○` = Standard). Uses a `DepthDots` helper component.
- Both indicators appear only when the field is set; tiles without style/depth look identical to before.
- Loading spinner moved to the top-right corner of the tile (absolute position). The hover "create →" text is removed — the tile itself is the CTA.

#### Assistant editor — new fields, new order

Form field order (top → bottom):
1. **Name**
2. **Role / instructions** (`system_prompt`) — monospaced textarea, resize, up to 4000 chars, counter. Placeholder gives a concrete example in each language.
3. **Communication style** — 4 pill buttons (click to select/deselect): 💬 Friendly · 📋 Formal · ✂️ Concise · 🎨 Creative
4. **Response depth** — 3 pill buttons with dot indicators: `●○○` Quick · `●●○` Standard · `●●●` Thorough
5. **Model** — unchanged
6. **Color** — unchanged
7. **Icon** — unchanged

**Description field removed.** It is now derived automatically on the backend: first 100 characters of `system_prompt` (or `null` when no prompt is set). The field is kept in the DB for compatibility but is never shown or edited in the UI.

#### Backend changes

- `routes/assistants.js` — `sanitizeAssistantInput` no longer accepts `description` from the client; generates it from `system_prompt`. Validates `style` against allowed set, `depth` against allowed set, `system_prompt` ≤ 4000 chars. All four write paths (CREATE, UPDATE in-place, FORK insert, DUPLICATE) include the new fields.
- `db/helpers.js` — `rowToAssistant` returns `style`, `depth`, `systemPrompt` (camelCase).
- `db/migrate.js` — three new idempotent column migrations for `assistants`.
- `db/seed.js` — starter assistants seeded with style/depth: General Assistant (`friendly` / `standard`), Code Helper (`concise` / `thorough`), Creative Writer (`creative` / `standard`).

#### Frontend changes

- `src/types/api.ts` — `Assistant` interface: added `style`, `depth`, `systemPrompt`; removed `description`.
- `src/types/assistant.ts` — added `STYLE_OPTIONS`, `DEPTH_OPTIONS` constant arrays; `AssistantStyleId`, `AssistantDepthId` types; removed `ASSISTANT_DESC_MAX`.
- `src/lib/api.ts` — `CreateAssistantInput`: removed `description`, added `style`, `depth`, `systemPrompt`. `createAssistant` and `updateAssistant` updated accordingly.
- `src/components/AssistantTile.tsx` — rewritten bottom row; loading spinner relocated; "create" text removed; style/depth indicators added.
- `src/components/AssistantCard.tsx`, `AssistantManageTile.tsx` — description display removed.
- `src/pages/AssistantEditPage.tsx` — description state/field removed; system prompt, style, depth fields added in new order.

#### New Session page layout

- **Assistants section moved above Quick Start** — the primary workflow (pick an assistant) is now at the top; the fallback (plain model picker) is below.
- **Recent Sessions block removed** — eliminated the `getSessions(5)` API call on page load; page now loads with two parallel requests instead of three.

#### i18n — 13 new keys × 4 languages

```
assistants.systemPromptLabel  assistants.systemPromptPlaceholder  assistants.systemPromptHint
assistants.styleLabel         assistants.styleHint
assistants.styleFriendly      assistants.styleFormal
assistants.styleConcise       assistants.styleCreative
assistants.depthLabel         assistants.depthHint
assistants.depthQuick         assistants.depthStandard  assistants.depthThorough
```

### Refactoring

- **`server.js` — 1911 → 39 lines** — file is now a thin entry point that
  opens DB connections, runs migrations, seeds data, then hands off to
  `app.js`.

- **`app.js`** — new file (87 lines). Owns Express instantiation, all
  middleware, and route mounting. Can be imported by tests without starting
  the HTTP listener.

- **`db/connections.js`** — DB open/close logic extracted from `server.js`.
  Exports `db` (Hermes readonly), `hermesDbWrite` (Hermes writable),
  `uiDb` (UI DB), and `closeAll()` for graceful shutdown.

- **`db/migrate.js`** — `initSchema()` function: all `CREATE TABLE IF NOT
  EXISTS` statements and idempotent `ALTER TABLE` column migrations.

- **`db/seed.js`** — `seedStarterAssistants()` extracted verbatim; now
  receives `uiDb` as a parameter instead of closing over a module-level
  global.

- **`db/helpers.js`** — shared pure helpers used across multiple route
  modules: `rowToAssistant`, `getDefaultModelId`, `getProviderFromModel`.

- **`routes/system.js`** — `GET /api/system/status`, `POST /api/system/exec`,
  `GET /api/health`.

- **`routes/sessions.js`** — full session CRUD + messages; `POST /api/messages`
  co-located here. Two dead-code routes (`DELETE /:id` and `PATCH /:id/title`
  as Hermes API proxy) removed — they were unreachable since Express
  short-circuits at the first matching handler.

- **`routes/chat.js`** — `POST /api/chat` with SSE streaming and tool-call
  event injection.

- **`routes/models.js`** — `GET /api/models`, `GET /api/models/providers`,
  `POST /api/models/sync`, `PATCH /api/models/models/:id/toggle`.

- **`routes/assistants.js`** — full assistants CRUD including fork-on-edit,
  archive, restore, duplicate.

- **`routes/providers.js`** — `GET /api/providers/available`,
  `POST /api/providers/:name/key`, `DELETE /api/providers/:name/key`.

- **`routes/likes.js`** — `POST /api/like` with cooldown, geoip, webhook.

### Bug fix (dead code removal)

- Removed duplicate `DELETE /api/sessions/:id` and `PATCH /api/sessions/:id/title`
  route handlers (lines ~1231 and ~1259 in the original file) that proxied
  to the Hermes API. These handlers were never reachable in practice because
  Express matched the identically-pathed handlers on lines ~630 and ~594
  first. The direct-SQLite handlers (first match) are the correct ones and
  are preserved.

### UX-4 — Navigation guard in ChatPage

When the user has typed text in the input but has not sent it, navigating away
(clicking a link, pressing Back, selecting another session) now shows a
confirmation modal before proceeding.

Implemented as a three-layer manual guard (the project uses `BrowserRouter`
which does not support `useBlocker`, which requires a data router):

- **`beforeunload`** — native browser dialog on tab close / hard navigation
- **`popstate`** — intercepts Back/Forward button; pushes current state back
  so the URL does not change until the user confirms
- **`click` capture phase** — intercepts `<Link>` / `<a>` clicks before
  React Router handles them; stores the target URL and shows the modal

Modal has two buttons: **Cancel** (stay) and **Leave** (clears input, then
navigates). Keyboard-accessible.

New i18n keys: `chat.leavePageTitle`, `chat.leavePageDesc`,
`chat.leavePageConfirm` × 4 languages.

### UX-6 — Section headers on New Session page

The single flat grid of tiles on `/new` is split into two named sections:

- **"Quick Start"** (`newSession.sectionQuickStart`) — contains the Standard
  tile (model picker + Create button).
- **"Assistants"** (`newSession.sectionAssistants`) — contains all assistant
  tiles, with a "Manage →" link to `/assistants` when at least one exists.

New i18n keys: `newSession.sectionQuickStart`, `newSession.sectionAssistants`,
`newSession.manageAssistants` × 4 languages.

### UX-8 — "Hold to select" affordance on mobile

`SessionCard` now renders a small hint line below the preview text on
**touch-only devices** (`hover: none and pointer: coarse`) until the user
triggers bulk mode for the first time. After the first long-press the hint is
suppressed permanently via `localStorage` key `bulk_mode_hint_shown`.

New i18n key: `sessions.holdToSelect` × 4 languages.

### UX-9 — Consistent button visibility in ChatPage (desktop vs mobile)

Copy and Regenerate buttons on assistant messages were fully invisible on
desktop until hover (`md:opacity-0`), while always visible on mobile. This
created a discoverability gap on desktop.

Changed: `md:opacity-0` → `md:opacity-40` so the buttons are faintly visible
at rest and reach full opacity on hover/focus. Mobile behaviour unchanged
(always `opacity-60`).

### UX-13 — Dynamic import of highlight.js (ChatPage chunk 350 KB → 183 KB)

`rehype-highlight` and `highlight.js/styles/github-dark.css` are no longer
part of the initial ChatPage chunk. Both are loaded lazily via a
module-level `Promise.all([ import('rehype-highlight'), import('highlight.js/styles/github-dark.css') ])` inside `MarkdownRenderer`.

A module-level singleton pattern ensures the dynamic import runs exactly once
per page lifetime, regardless of how many `MarkdownRenderer` instances are
mounted. Syntax highlighting activates as soon as the chunk resolves (~first
message with code blocks).

**Bundle impact:**

| Chunk | Before | After |
|---|---|---|
| `ChatPage` | 350 KB gzip | 183 KB gzip |
| `rehype-highlight` (new lazy) | — | 53 KB gzip |
| `github-dark.css` (new lazy) | (inlined) | 0.4 KB gzip |

Net initial payload reduction: **~167 KB gzip** for users who visit chat pages.

### New file summary

```
server.js              39 lines  entry point
app.js                 87 lines  Express app + middleware + route mounting
db/connections.js      81 lines  SQLite connections + closeAll()
db/migrate.js         109 lines  initSchema()
db/seed.js             60 lines  seedStarterAssistants()
db/helpers.js          62 lines  rowToAssistant / getDefaultModelId / getProviderFromModel
routes/system.js      166 lines  /api/system/*, /api/health
routes/sessions.js    462 lines  /api/sessions/*, /api/messages
routes/chat.js        217 lines  /api/chat (SSE)
routes/models.js      148 lines  /api/models/*
routes/assistants.js  235 lines  /api/assistants/*
routes/providers.js   154 lines  /api/providers/*
routes/likes.js       100 lines  /api/like
```

### v0.9.0 — Code audit (Tasks #23 / #24 cleanup)

Post-implementation audit of the file upload and agent file download code.

**Removed duplicate code:**
- `db/fileTypes.js` — new shared module: `MIME_MAP`, `ALLOWED_EXTENSIONS`, `getMimeTypeForPath`, `hasAllowedExtension`. Previously these were copy-pasted independently in `routes/files.js` and `routes/chat.js`.

**Removed debug logs:**
- All `[Task24]` `console.log` calls removed from `routes/chat.js` (10 lines, including one that dumped 300 chars of the agent's response text on every request).
- Stray `console.log` calls removed from `src/lib/api.ts` (stream state logging).
- `console.log('[ChatPage] onDone …')` removed from `ChatPage.tsx`.

**Removed dead code:**
- `hermes_message_id` column migration removed from `db/migrate.js` — the column was added but never written or read anywhere; attachment of files to messages is resolved via `content.includes(storedName)` at query time.
- Nonfunctional expand/collapse toggle removed from `AgentFileCard` — the chevron button rotated but showed no content, confusing users. The slot will return in Task #34 when inline preview is implemented.

**Fixed bug — session reload losing download cards:**
- `GET /api/sessions/:id/messages` now loads all `source='agent'` files for the session and attaches each to every assistant message whose `content` contains the file's path. This restores download cards when the user re-opens a session after a page reload.

**Fixed bug — deduplication swallowing re-referenced files:**
- `detectAgentFiles` previously skipped files that already existed in `session_files` (correct for storage), but also omitted them from the returned `detected` array (wrong). Re-referencing the same path in a later message now correctly surfaces the download card on that message too.

**Fixed race condition — `[DONE]` before `agent_files`:**
- Hermes sends `[DONE]` as part of the proxied SSE stream; the backend emits `agent_files` in its `finally` block after `[DONE]`. The frontend's SSE parser previously did `return` on `[DONE]`, discarding the following event. Now it fires `onDone` on `[DONE]` but continues reading until the stream physically closes.
- `currentAssistantIdRef` in `ChatPage` was cleared synchronously in `onDone`, making `onAgentFiles` (which arrives after `onDone`) unable to find the target message. Fixed with a 2 s deferred clear + a fallback that searches `messages` by role when the ref is already null.

## [0.7.0] - 2026-06-08

Code quality sprint. All 12 issues identified in the code audit are closed. No user-facing behaviour changes.

### Security
- **Recursive XSS sanitization** — `middleware/security.js`: `sanitizeBody` now deep-traverses nested objects and arrays at all levels (was only one level deep). Added `MAX_SANITIZE_DEPTH = 10` to prevent DoS via deeply-nested payloads.

### Reliability
- **Async Hermes version check** — `server.js`: replaced blocking `execSync('hermes --version')` with `promisify(execFile)`. The Node.js event loop is no longer blocked while the shell process runs; a 5 s timeout prevents indefinite waits.
- **DB cleanup on startup failure** — if `uiDb` fails to open, the already-opened `db` and `hermesDbWrite` connections are now explicitly closed before `process.exit(1)`, leaving SQLite WAL files in a clean state.

### Testing
- **Vitest added** — `npm test` runs the full suite.
- **`tests/security.test.js`** — 9 tests for `sanitizeBody`: top-level strings, nested objects, arrays, arrays of objects, non-string primitives, immutability, depth cap (no throw beyond MAX_DEPTH), `<script>` strip.
- **`src/lib/time.test.ts`** — 13 tests for `formatTimeAgo`, `formatFullDateTime`, `formatRelativeTimestamp` with `vi.useFakeTimers()`.

### CI/CD
- **GitHub Actions** — `.github/workflows/ci.yml`: runs **Lint → Typecheck → Test → Build** on every push to `main` and on every PR.
- **`npm run typecheck`** — new script (`tsc -b --noEmit`); also wired into CI.
- **`npm run test`** / **`npm run test:watch`** — new scripts backed by Vitest.

### TypeScript
- **`middleware/security.ts`** — fully-typed TypeScript rewrite of `middleware/security.js`. Exports the same API; uses `Request/Response/NextFunction` from `@types/express`. The `.js` file is kept as the runtime entry point (server.js imports it); the `.ts` file is the authoritative source and is checked by `tsc`.
- **`@types/express` added** as a dev dependency.
- **`tsconfig.node.json`** extended to include `middleware/**/*.ts`.
- **`vite.config.ts`** imports `defineConfig` from `vitest/config` (superset of vite's config) so the `test` block passes typecheck.

### Dependencies
- **`geoip-lite` → `optionalDependencies`** — moved from `dependencies`. The import is now lazy (`await import('geoip-lite')`) inside the `/api/like` handler. If the package is absent the server starts normally and `country` is `null`. Added `DISABLE_GEOIP=true` env flag to skip the lookup regardless of installation status.

### Code quality (frontend)
- **`useEffect` exhaustive-deps** — all 5 ESLint warnings eliminated across `ChatPage`, `DashboardPage`, `SessionsPage`, `SettingsPage`: data-fetch functions wrapped in `useCallback` with correct deps; `location.state` stabilised via a render-scope variable; `Date.now()` in `SettingsPage` moved from render body to lazy `useState` initialisers.
- **`formatTimestamp` deduplication** — removed local `formatTimestamp` from `SettingsPage.tsx`; replaced with shared `formatRelativeTimestamp(ts, t)` exported from `src/lib/time.ts`.
- **`package.json` version** synchronised with latest release tag (`0.5.1` → `0.6.1`, then bumped to `0.7.0`).
- **`assistantColors.ts`** — exported `FALLBACK_COLOR = 'gray'` constant; added JSDoc on `getAssistantColorClasses` clarifying the fallback behaviour.

### Documentation
- `server.js` — added block comment documenting the three-connection DB architecture, the rationale for readonly vs writable Hermes DB handles, and the cleanup guarantee.

## [0.6.1] - 2026-06-08

UX polish for the Assistants management page (`/assistants`) based on UX audit recommendations.

### Features
- **Tile grid on `/assistants`** — management page now uses the same 1/2/3 column tile grid as the New Session page, replacing the previous horizontal card list. Visual consistency: the same tiles appear in both places.
- **Context menu (MoreVertical)** — Edit / Duplicate / Archive actions moved to a dropdown menu (three-dot icon) in the top-right corner of each tile. Menu renders via `createPortal` to avoid overflow clipping.
- **Tab-style filter with counts** — Active / Archived filter replaced with tab-style buttons showing counts: `Active (4)` · `Archived (2)`. Counts are always accurate (all assistants loaded at once, filtered client-side).
- **Archived visual treatment** — archived tiles show `line-through` on the name and a yellow warning badge instead of a neutral gray one.
- **Restore action** — archived assistants can be restored from the context menu (new `POST /api/assistants/:id/restore` endpoint).
- **Sticky save bar** — the Save / Archive / Cancel action bar on the editor page is now `flex-shrink-0` at the bottom of the viewport, no longer scrolls inside the form.
- **"New assistant" button hidden on empty state** — the header button is hidden when there are no assistants (the CTA in the empty state is sufficient).

### Changed
- `AssistantCard.tsx` superseded by `AssistantManageTile.tsx` — new component with portal-based dropdown, colored border overlay, and hover animations.
- `AssistantsPage.tsx` — grid layout, tab filters with counts, always loads all assistants (`include_archived=true`).
- `AssistantEditPage.tsx` — action bar moved outside the scrollable form area; `useRef` + `requestSubmit()` for reliable form submission.
- `server.js` — new endpoint `POST /api/assistants/:id/restore`.
- `src/lib/api.ts` — new method `restoreAssistant()`.

### i18n
- 12 new keys in `assistants.*`: `tabActive`, `tabArchived` (with pluralization), `startSession`, `restore`, `confirmRestore`, `restoredToast`, `errorRestore`, `actionsLabel`.
- 1 new key in `api.*`: `failedToRestoreAssistant`.
- All keys translated into EN / RU / ES / DE.

## [0.6.0] - 2026-06-08

Task #25 ("Session Presets"), **Phase 1** of 2. The data model and CRUD for a new "Assistant" concept (a named, optionally color/icon/model-bound bundle) is now in place. Phase 2 will add the system-prompt and inference-parameter integration.

### Features
- **Assistants** — named bundles (name, description, color, icon, model) that show up as tiles on the New Session page
- **Standard tile** — same look as Assistant tiles, but contains the inline model picker; clicking Create starts a plain session with the chosen model and no assistant
- **Assistants management page** (`/assistants`) — accessible from Settings → Assistants. Active / Archived filter, list view with compact action column (Edit / Duplicate / Archive) on the right of each card
- **Assistant editor page** (`/assistants/:id`, `/assistants/new`) — name, description, color (8-color palette), icon (30 emojis), model (grouped by provider). Archived assistants open in read-only mode
- **Clone before save** — clicking "Duplicate" in the list navigates to the editor with the source's fields prefilled (name suggested as `"<name> (copy)"`). The new row is only written when the user clicks "Create copy". Cancel returns to the list with no DB change. This avoids the previous behaviour where Duplicate immediately committed a row to the database
- **3 starter assistants** — seeded on first run with different models and colors: `General Assistant` (blue, default model), `Code Helper` (green, code-flavoured model), `Creative Writer` (purple, expressive model). Users can edit, archive, or delete them
- **Fork-on-edit** — if you edit an assistant that already has sessions referencing it, the existing row is archived and a NEW row is created with the updated fields. Old sessions keep pointing at the archived row, preserving the "what assistant was used for this chat" history. The list page surfaces a toast explaining the fork so the user is not surprised
- **Per-session assistant badge** — sessions list now shows a small assistant pill (icon + name) next to the model. If the linked assistant has been archived, the badge still renders correctly
- **Mobile-first** — all new UI respects mobile touch targets, responsive grids, and the existing dark/light theming. Action column on the list page stays accessible on small screens (labels visible at all sizes; column reflows naturally with the card)

### Backend
- New table `assistants(id, name, description, color, icon, model_id, is_archived, archived_at, created_at, updated_at)` + 2 indexes
- New column `session_meta.assistant_id` + index, FK to `assistants(id)` with `ON DELETE SET NULL`
- 6 new endpoints under `/api/assistants`: `GET /`, `GET /:id`, `POST /` (create), `PATCH /:id` (update with fork-on-edit), `POST /:id/archive`, `POST /:id/duplicate` (kept for completeness; the UI flow uses the editor's prefill instead of this endpoint)
- `POST /api/sessions` now accepts `assistantId`; the backend resolves the model from `assistant.model_id` (or falls back to the global default if the assistant has no model) and links the session to the assistant in `session_meta`. Returns 409 if the assistant is archived or its model is disabled/missing
- `GET /api/sessions` and `GET /api/sessions/:id` now return the linked `assistant` object (`{id, name, color, icon, modelId, isArchived, archivedAt, …}`) or `null` if the session has no assistant
- 3-assistant starter seeder runs once on first server start (or any time the `assistants` table is empty), picking models across different providers when possible
- PATCH-on-edit is wrapped in a SQLite transaction so the archive + insert happens atomically
- Server-side validation: name 1-60 chars, description ≤ 200 chars, color must be in the supported palette, icon ≤ 8 chars, model_id must reference an enabled model (or null for default)

### Frontend
- `src/types/assistant.ts` — palette (8 colors), icon set (30 emojis), name/desc limits
- `src/types/api.ts` — added `Assistant` and `Session.assistant` fields
- `src/lib/assistantColors.ts` — single source of truth for the color → Tailwind class mapping
- `src/lib/api.ts` — added `getAssistants`, `getAssistant`, `createAssistant`, `updateAssistant`, `archiveAssistant`, `duplicateAssistant`; `createSession` now accepts an `assistantId` argument
- `src/store/assistantsStore.ts` — Zustand store with fetch / upsert / remove (used by the editor and the New Session page)
- `src/components/ColorPicker.tsx` — 8-color radio-button palette
- `src/components/IconPicker.tsx` — 30-emoji radio-button grid
- `src/components/AssistantCard.tsx` — list-row card with a vertical action column (Edit / Duplicate / Archive) docked to the right; compact 32 px rows with icon + label
- `src/components/AssistantTile.tsx` — minimal-text tile used on the New Session page
- `src/pages/AssistantsPage.tsx` — list page (lazy-loaded) with active/archived filter; Duplicate navigates to `/assistants/new?from=<id>` (no DB write until Save)
- `src/pages/AssistantEditPage.tsx` — editor page (lazy-loaded); detects the `?from=<id>` query param to enter "clone" mode, prefills the form from the source, and shows a "Create copy" primary button instead of the generic "Create"
- `src/pages/NewSessionPage.tsx` — rewritten as a grid of tiles (Standard + assistants)
- `src/pages/SettingsPage.tsx` — new "Assistants" section with a link to `/assistants`
- `src/App.tsx` — 3 new routes: `/assistants`, `/assistants/new`, `/assistants/:id`

### i18n
- 31 new keys in `assistants.*` (titles, form labels, placeholders, toasts, error messages, the three action labels `actionEdit` / `actionDuplicate` / `actionArchive`, the `createCopy` button label, and the `cloneTitle` / `cloneHint` / `cloneNameSuggestion` triplet for the prefill flow)
- 4 new keys in `newSession.*` (`standardTile`, `create`, `createFirstAssistant`, `createFirstAssistantHint`)
- 6 new keys in `api.*` (failed-to-… for the new endpoints)
- All keys translated into EN / RU / ES / DE

### Bundle impact
- 2 new lazy chunks: `AssistantsPage` 6.77 KB (gzip 2.03 KB) + `AssistantEditPage` 9.00 KB (gzip 2.93 KB)
- `NewSessionPage` 5 KB → 7.86 KB (gzip 2.63 KB)
- `SettingsPage` 21 KB → 21.90 KB
- Index chunk +12 KB (new i18n strings + Zustand store + pickers + color helper)

### Not in this release (Phase 2)
- System prompt per assistant
- Temperature, top_p, max_tokens, response_format, stop_sequences per assistant
- Sending these parameters to Hermes on every chat request
- Per-session assistant badge in the chat header
- Sticky favorites, JSON import/export, bulk actions

## [0.5.2] - 2026-06-07

Mobile adaptation release. Brings the phone experience in line with the desktop one so a non-technical user on a phone has the same workflow. No backend changes; this is a pure-frontend UX pass.

### Features
- **Sidebar is now desktop-only** — the left rail is hidden below the `md` breakpoint (768 px). On phones, the bottom `MobileNav` covers the same routes (Home / Sessions / New / Settings), so the sidebar's persisted open/closed state becomes a no-op. The hamburger button in `Navbar` is also hidden below `md` for the same reason.
- **Touch-friendly action buttons (44×44 px hit targets)** — every interactive icon in `ChatPage` (Edit / Save / Cancel / Delete session, per-message Copy / Regenerate, Send / Stop), `SessionsPage` (Pin / Archive / bulk checkbox, header buttons, bulk-action bar), and the swipe confirm modal now enforces a minimum 44×44 px touch surface via `min-h-[44px] min-w-[44px]`.
- **Action buttons visible on touch** — Pin/Archive on session cards and Copy/Regenerate on chat messages used to be `opacity-0 group-hover:opacity-100` only, which is invisible on touch. They now default to `opacity-100` (or `opacity-60` for chat-message actions) on mobile and `md:opacity-0 md:group-hover:opacity-100` on desktop, so the user can actually see and tap them on a phone.
- **Swipe-to-delete on session cards** — drag a card left to reveal a red "Delete" affordance, release past the threshold to open a confirm modal. The modal is a separate `Modal` instance (reuses the existing bulk-delete pattern) with a `Loader2` spinner while the API call is in flight. Implemented as a new `useSwipe` hook (native `touchstart` / `touchmove` / `touchend` — no new dependencies) with a `data-swipe-ignore` attribute for nested buttons that should still receive taps.
- **Long-press to enter bulk mode** — hold a session card for 500 ms to enable bulk-mode and select that card in one gesture. Useful on mobile to start a multi-select without first hitting the "Select" toggle. Shares the same `useSwipe` hook's touch tracker.
- **Safe-area insets** — `MobileNav` and the ChatPage input area now use `env(safe-area-inset-bottom)` so the iOS home indicator doesn't overlap the bottom nav or the textarea. Implemented as `pb-[env(safe-area-inset-bottom)]` on the nav and `pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))]` on the input container.
- **Fluid typography** — the global `html { font-size: 90% }` is replaced with `clamp(14px, 0.5vw + 13px, 16px)`. Smoothly scales from 14 px on a 360-px screen to 16 px on a 768-px+ screen, then stays flat. Affects every `text-*` utility and the `rem`-based padding.
- **Responsive page padding** — `p-6` → `p-3 sm:p-4 md:p-6` on `DashboardPage`, `NewSessionPage`, `SessionsPage`; same for the inner containers of `ChatPage` (skeleton, messages, error bar, input area).
- **Responsive header layouts** — `SessionsPage` header buttons collapse to icons-only on mobile (Archived / Select hide their labels via `hidden md:inline`; "New Session" hides its label on `< sm`). The bulk-action bar wraps to two rows on mobile (`flex-col sm:flex-row`). The `ChatPage` header is `flex-wrap` with a `basis-full sm:basis-auto` breadcrumb so the delete-confirm row drops to a second line on 360-px screens instead of overflowing.
- **Smaller chat title on mobile** — the session title `<h1>` and the title-edit input are `text-base md:text-lg` so long titles don't get truncated on narrow screens.

### New files
- `src/hooks/useSwipe.ts` — generic touch gesture hook: `onSwipeLeft` / `onSwipeRight` / `onLongPress` callbacks, `threshold` (default 80 px), `maxTranslate` (default 160 px), `longPressMs` (default 500 ms), `disabled`, plus a `data-swipe-ignore` opt-out for nested clickable elements. Returns `{ ref, translateX, swiping, reset }`. ~150 LOC, no new npm dependencies.
- `src/components/SessionCard.tsx` — single-session card with built-in swipe + long-press. Replaces the inline card render in the `Virtuoso` `itemContent` callback. Owns its own `useSwipe` instance per card (cleanly attached/removed by the virtualization lifecycle).

### Changed
- **Refactored** — the inline card render in `SessionsPage` (was ~95 LOC inside the `Virtuoso.itemContent` callback) is extracted to `SessionCard`. `SessionsPage` now passes `bulkMode`, `isSelected`, and four callbacks; the card handles all per-card interaction.
- **Navbar** — hamburger button is `hidden md:flex` (no longer visible on mobile since it would do nothing there).
- **Sidebar** — `<aside>` is `hidden md:flex` instead of relying on the early `return null` when `isSidebarOpen` is false. Behavior on desktop is unchanged.

### i18n
- 3 new keys × 4 languages: `sessions.swipeToDelete` ("Swipe left to delete" / "Свайп влево для удаления" / "Desliza a la izquierda para eliminar" / "Zum Löschen nach links wischen"), `sessions.deleteSessionTitle`, `sessions.deleteSessionConfirm` (with the existing `common.untitledSession` reused for the title preview).

### Bundle impact
- `SessionsPage` chunk: **75 KB → 80.49 KB** (gzip 24.7 KB) — `+5 KB` for the `SessionCard` + `useSwipe` extraction
- `ChatPage` chunk: **350.94 KB** (no change)
- `index` chunk: **371.10 KB** (no change; new i18n strings are negligible)
- `SettingsPage`, `ProvidersPage`, `DashboardPage`, `NewSessionPage`: unchanged

### Manual verification checklist (not covered by automated tests)
- [ ] Chrome DevTools: 360 × 640, 768 × 1024, 1024 × 768 — no horizontal scroll, no overlap
- [ ] Real device (or DevTools mobile emulation) — swipe-left on a session card reveals the red Delete affordance; releasing past the threshold opens the confirm modal
- [ ] Real device — long-press on a session card (500 ms) enables bulk-mode and selects the card; the next tap on another card adds it to the selection
- [ ] iPhone with home indicator (or DevTools safe-area emulation) — MobileNav and ChatPage input area are not obscured by the home indicator

## [0.5.1] - 2026-06-07

UX-polish release. Brings the provider-key management page, moves theme/notification toggles to the sidebar, and surfaces the Hermes API status in the header. Includes all the work that accumulated since v0.3.0.

### Features
- **Provider Keys page** (`/settings/providers`) — flat list of all 24 Hermes-bundled `api_key` providers. Configured ones show a check badge and a "Remove key" button; not-configured ones show an "Add key" button that expands an inline form (env_var + API key) on the same card. Accessible only from Settings → Model Providers ("Manage provider keys →")
- **i18n** — 23 new strings × 4 languages (en, ru, es, de) for the Providers page
- **Sidebar quick controls** — Dark Mode and Notifications toggles moved from the header to the left sidebar (above the copyright block, separated by a divider). Settings → General still exposes both toggles as a fallback.
- **Hermes API status indicator** — `Server` icon in the header (right side, before the user menu). Color-coded (green = connected, red = disconnected, gray = checking) with a localized tooltip that includes the running version. No click action — read-only indicator.
- **Status polling** — new `useHermesStatusPoll` hook mounted in `Layout` polls `GET /api/system/status` every 60 s; results are cached in a new persisted Zustand store (`hermes-status`) with a 5-minute staleness guard so the indicator and Settings page share a single source of truth.
- **Settings → "Hermes Agent status"** — the former "Connection status" block was renamed and now shows the live connection state, the running Hermes Agent version, the latest version (when known), and a yellow warning if an update is available (pluralized commit count).
- **Dashboard cleanup** — the "System Status" card was removed. "Recent Sessions" now spans the full row (`lg:col-span-2`). Dashboard no longer needs to call `getSystemStatus`, removing one round-trip on first paint.

### Changed
- **i18n** — new keys in `nav.*` (`hermesApiStatus`, `hermesApiConnected`, `hermesApiDisconnected`, `hermesApiChecking`) and `settings.*` (`hermesAgentVersion`, `latestVersion`, `updateAvailable` + plurals, `loadingStatus`) across en/ru/es/de. Removed `dashboard.systemStatus`, `dashboard.hermesVersion`, `dashboard.latestVersion`, `dashboard.updateAvailable` (no longer used). `settings.connectionStatus` is reused (and re-translated) as the new block title.

### Backend
- **3 new endpoints** under `/api/providers/*`:
  - `GET /api/providers/available[?configured=0|1]` — list bundled providers with metadata
  - `POST /api/providers/:name/key` — write a key, returns `••••last4` mask
  - `DELETE /api/providers/:name/key?env_var=...` — atomic remove
- **Schema migration** — `providers` table gains `description`, `signup_url`, `auth_type` columns
- **Rate limiting** — `providerLimiter` (10 writes/min) for write paths to `~/.hermes/.env`
- **Security** — secret values never leave the Python helper process; API responses only return `••••last4` masks; `env_var` whitelisted against provider profile; value validated as non-empty ASCII printable ≤ 512 chars

### Scripts
- `list_bundled_providers.py` — enumerate bundled providers with metadata, filter `api_key` only
- `manage_provider_key.py` — atomic set/remove of one key via Hermes' `save_env_value()` (chmod 600, cache invalidate)
- `sync_providers.py` — fixed `_BASE_URL` env_var selection bug and metadata sync

### New files
- `src/store/hermesStatusStore.ts` — persisted Zustand store (`hermes-status` key) for Hermes status: `status`, `version`, `latestVersion`, `updateAvailable`, `lastChecked`
- `src/hooks/useHermesStatusPoll.ts` — poll-on-mount + 60 s interval; respects `lastChecked` staleness
- `src/components/HermesStatusIndicator.tsx` — presentational icon with localized tooltip
- `src/pages/ProvidersPage.tsx` — `/settings/providers` route, flat list of all bundled `api_key` providers
- `src/components/ProviderCard.tsx` — single provider row (configured / not configured states)
- `src/components/ApiKeyInput.tsx` — password input with show/hide eye toggle
- `scripts/list_bundled_providers.py` — Hermes-bundled provider enumeration
- `scripts/manage_provider_key.py` — atomic key set/remove via Hermes' `save_env_value()`

### Removed
- `scripts/get_models.py` — dead hardcoded provider list, superseded by `sync_providers.py`

## [0.5.0] - 2026-06-06

### Features
- **Internationalization (i18n)** — full multi-language support with 4 languages: English (default), Русский, Español, Deutsch
- **Language selector** — dropdown in Settings → General for instant language switching without page reload
- **Browser language detection** — auto-detects user's browser language with localStorage fallback
- **Pluralization support** — proper rules for each language: en/es/de (`_one`/`_other`), ru (`_one`/`_few`/`_many`)
- **~175 UI strings extracted** — organized by namespace (common, nav, chat, sessions, dashboard, settings, errors, api)
- **Dynamic string interpolation** — `{{count}}`, `{{toolName}}`, `{{query}}`, and other placeholders

### Dependencies
- **`i18next`** — core i18n framework
- **`react-i18next`** — React bindings to i18next
- **`i18next-browser-languagedetector`** — automatic language detection

### Refactoring
- **15 files updated** — all pages, components, and api.ts now use `t()` / `i18n.t()` instead of hardcoded strings
- **ErrorBoundary translated** — previously hardcoded Russian text now uses i18n keys
- **Backend unchanged** — API error messages remain in English

## [0.3.0] - 2026-06-05

### Likes (Mattermost webhook)
- **Like button in Settings → About** — sends a webhook to a configured Mattermost channel (default: `Likes`); per-user cooldown of 1 hour, persisted in UI DB and `localStorage`; webhook payload includes IP, country (via `geoip-lite`), User-Agent, and ISO timestamp
- **New `POST /api/like` endpoint** — anti-spam via per-IP `likeLimiter` (5/h) + strict DB-backed cooldown (`LIKES_COOLDOWN_SEC`, default 3600 s); returns `429` with `Retry-After` header on cooldown, `502` on webhook failure, `503` if webhook URL is not configured
- **New `LIKES_WEBHOOK_URL` and `LIKES_COOLDOWN_SEC` env vars** — `LIKES_WEBHOOK_URL` is optional; leave unset to disable the feature
- **New `likes` table** in UI DB with index on `user_hash, created_at` for fast cooldown lookups

### Sessions UX
- **Sessions sort order** — new setting in Settings → General to choose between "Created" and "Last message" ordering; preference persisted across sessions
- **Last activity time** — session cards on Sessions, Dashboard, and NewSession pages now show the time of the last message (with `startedAt` fallback for empty sessions); grouping by Today/Yesterday follows the chosen sort order
- **Sidebar state persistence** — sidebar open/closed state now persists across refreshes and is not clobbered by `resize` events

### Bug Fixes
- **Sidebar auto-toggling on resize** — removed `resize` event listener that force-set sidebar to `window.innerWidth >= 768`, which caused the sidebar to spontaneously open/close on window resize, devtools open, or device rotation
- **Sessions sort mismatch** — JS in-memory re-sort of pinned/notPinned sessions was always using `lastMessageAt` regardless of selected sort mode; now respects the active mode (created vs lastMessage)

### Backend
- **`GET /api/sessions`** — added `sort` query param (`created` | `lastMessage`); response now includes `lastMessageAt: number | null` for each session

### Dependencies
- **`geoip-lite`** — offline IP → country lookup for the like payload (no network calls)

## [0.2.0] - 2026-06-05

### Features
- **Tool call history** — expandable list of completed tool calls during streaming
- **Keyboard shortcuts** — Ctrl+K (search), Ctrl+N (new session), Ctrl+Enter (send)
- **Browser notifications** — Notification API + Badge API with toggle in Navbar and Settings
- **Design tokens** — unified color system via CSS variables for easy theming

### Security & Performance
- **Configuration validation** — zod schema validation at startup
- **Rate limiting** — 100 req/min general, 30 req/min chat, 5 req/5min system commands
- **XSS protection** — input sanitization via xss package
- **CORS configuration** — configurable trusted domains via CORS_ORIGINS env var
- **Security headers** — helmet middleware (CSP, X-Frame-Options, HSTS, Referrer-Policy)

### Bug Fixes
- **Session creation** — fixed HERMES_DB_PATH to match Hermes API database location
- **Message duplication** — initialMessage now stored in ref, sent only when session has no messages
- **Session visibility** — sessions created via API now appear in session list immediately
- **React StrictMode** — removed duplicate useEffect that caused message duplication
- **Notifications** — fixed state sync across components and stale closure issues

### Refactoring
- **UI controls** — theme toggle moved from sidebar to navbar
- **Design tokens** — migrated hardcoded Tailwind colors to design tokens (10 files)
- **Notifications** — Zustand store for synced state across Navbar, Settings, ChatPage

## [0.1.0] - 2026-06-04

### Initial Release
- Dashboard with System Status, Recent Sessions, Quick Chat
- Session list with infinite scroll and date grouping
- Chat with real-time streaming responses (SSE)
- Multi-line input field with auto-resize
- Create new sessions with model selection
- Model management (enable/disable) in Settings
- Hermes system commands (update, doctor)
- Markdown rendering with syntax highlighting
- Tool calls visualization
- Dark/Light themes
- Responsive design (mobile-friendly)
- Session management (delete, rename, pin, archive, bulk actions)
- Error handling with automatic retry
- Two database architecture (Hermes DB + UI DB)
