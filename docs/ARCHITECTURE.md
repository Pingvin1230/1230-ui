# Architecture

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │   React 19 SPA (Vite 8 + TypeScript 6)           │  │
│  │  ┌────────┐ ┌──────────┐ ┌─────┐ ┌──────────┐  │  │
│  │  │Dashboard│ │Sessions │ │Chat │ │Settings  │  │  │
│  │  └────────┘ └──────────┘ └─────┘ └──────────┘  │  │
│  │  │  Applications pane  (FilePreview, FileManager │  │
│  │  │  CloudConnect, Tududi) — desktop only, ≥1024px│  │
│  │  Zustand stores │ React Router v7 │ Tailwind v4 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↕ HTTP/REST + SSE
┌─────────────────────────────────────────────────────────┐
│          Node.js Backend (Express 5, ESM)                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/sessions │ /api/chat (SSE) │ /api/models   │  │
│  │  /api/assistants │ /api/providers │ /api/system  │  │
│  │  /api/applications │ /api/tududi/* (proxy)       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌────────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │  Hermes DB     │ │   UI DB      │ │ Adapters     │  │
│  │  (read-only +  │ │  (read-write)│ │ (hermes/OC)  │  │
│  │  delete)       │ │              │ │              │  │
│  └────────────────┘ └──────────────┘ └──────────────┘  │
│  middleware/security.js — rate limiting + XSS (recursive) │
└─────────────────────────────────────────────────────────┘
        │                                          │
        │ spawn(HERMES_PYTHON,                     │ HTTP/SSE
        │       ['-u', 'run_chat.py', …])          │ to opencode serve:4097
        ▼                                          ▼
┌────────────────────┐                ┌─────────────────────────┐
│ Python: run_chat.py│                │ opencode serve (Go)     │
│ (Hermes Agent venv)│                │ 127.0.0.1:4097          │
│ AIAgent(model=…)   │                │ /session, /event (SSE)  │
│ NDJSON on stdout   │                └─────────────────────────┘
└────────────────────┘
```

The chat backend is pluggable: the dispatcher in `routes/chat.js` selects the executor per request from `session_meta.assistant_id → assistants.executor` and runs a single `for await (const evt of adapter.chat(ctx)) writeSse(evt)` loop. The two shipped adapters live in `lib/adapters/{hermes,opencode}.js` and are registered in `lib/adapters/index.js`. Adding a third backend is a one-file change — see [EXECUTOR_ADAPTERS.md](EXECUTOR_ADAPTERS.md) for the contract.

The Tududi proxy (`routes/tududi.js`) is a separate, non-executor path: a generic HTTP forwarder that mounts under `/api/tududi/*` and injects a server-side bearer token. The browser never holds the token. See [TUDUDI_INTEGRATION.md](TUDUDI_INTEGRATION.md).

## Tech Stack

### Frontend
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS v4 — design-token-based styling
- Zustand 5 — state management (9 persisted stores; `appsPaneStore` and `openCodeStatusStore` added in v0.9.2)
- React Router v7 — client-side routing
- Lucide React — icons
- react-markdown + remark-gfm + rehype-highlight — markdown rendering
- highlight.js — code syntax highlighting
- react-virtuoso — virtualised **message list** (`src/components/MessageList.tsx`, v0.9.3). (The session list used Virtuoso briefly pre-v0.9.0, then switched to native scroll; the dep was reintroduced in v0.9.3 to virtualise long chat histories.)

### Backend
- Node.js (ESM) + Express 5 — REST API + SSE streaming
- better-sqlite3 — synchronous SQLite (three separate DB files: Hermes read-only, Hermes write, UI)
- xss — recursive input sanitization (see `middleware/security.js`)
- helmet — security headers (CSP, HSTS, X-Frame-Options, …)
- express-rate-limit — five rate-limit profiles
- webdav — WebDAV client for Cloud Connect
- AES-256-GCM (built-in `crypto`) — Cloud Connect + OpenCode password encryption at rest

### Testing
- Vitest 4 — unit test runner (`npm test`)
- 305 tests across ~24 files. Backend: `tests/security`, `sessions-routes`, `chat-routes`, `files-routes`, `assistants-routes`, `globalFiles-models-routes`, `system-routes`, `system-routes-extra`, `tududi-routes`, `tududi`, `errorHandler`, `systemSettings`, plus the executor layer (`adapters-hermes`, `adapters-opencode`, `adapters-registry`, `opencode-client`, `opencode-parseSseChunk`, `opencode-stream`). Frontend: `src/lib/time.test.ts`, `src/store/chatInputStore.test.ts`, `src/components/messageListUtils.test.ts`, `src/hooks/useModels.test.ts`, `src/hooks/useLike.test.ts`.

### CI/CD
- GitHub Actions — `.github/workflows/ci.yml`
- Pipeline: **Lint → Typecheck → Test → Build** on every push/PR to `main`

### Infrastructure
- PM2 / systemd — process manager
- Nginx — reverse proxy
- Authelia — SSO / authentication
- Let's Encrypt — HTTPS certificates

### External Dependencies
- Hermes Agent — AI agent (CLI)
- Python 3.x — for Hermes DB operations, provider key management, and the `run_chat.py` per-request chat wrapper
- OpenCode — optional second chat executor; `opencode serve` daemon on port 4097
- Tududi — optional self-hosted task / notes manager, proxied through `/api/tududi/*`
- geoip-lite — **optional** (~30 MB MaxMind data); used only for the `/api/like` country field; server starts fine without it

---

## Components

### Frontend Pages (all lazy-loaded via `React.lazy`)

| Page | Route | Description |
|---|---|---|
| `DashboardPage` | `/` | Time-based greeting, Quick Chat (pill model picker + fixed Send), Assistants quick-start grid (up to 3 tiles), Recent Sessions with preview |
| `SessionsPage` | `/sessions` | Renders inside the Workspace shell as the Sessions tab. Virtualised list, search, date groups with `<hr>` separators, bulk actions; Refresh button removed |
| `ChatPage` | (inside Workspace) | Orchestrator for one chat (~500 lines, v0.9.3): subscribes to the per-session live slice in `chatInputStore`, dispatches send/stop to the store, and renders `<MessageList>`. Logic lives in hooks — `useChatSession` (load + focus-refetch + stream-end transition), `useChatScroll` (auto-scroll / `isAtBottom` / unread), `useChatNavigationGuard` (leave-guard). Mounted once per executor tab (dual-mount); takes `sessionId` + `isActive` props. No longer a top-level route — `/chat/:id` resolves through `ChatRouteResolver` into the Workspace |
| `MessageList` | (inside `ChatPage`) | Virtualised message list (`react-virtuoso`). Pure grouping/dedup in `messageListUtils.ts` flattens committed turn-blocks (user → tool-group → assistant) + the in-flight overlay into render items; `followOutput`/`atBottomStateChange` replicate the old "stick to bottom unless scrolled up" behaviour |
| `NewSessionPage` | `/new` | Assistant tiles + standard model tile |
| `SettingsPage` | `/settings` | General, Assistants / Applications / Cloud Connect / Tududi shortcuts, Executor Configuration list, Hermes Commands, About |
| `ProvidersPage` | `/settings/providers` | API key management (add / remove per provider) |
| `HermesSettingsPage` | `/settings/executors/hermes-agent` | Per-executor sub-page for Hermes |
| `OpenCodeSettingsPage` | `/settings/executors/opencode` | URL, username, encrypted password; executor status dot |
| `TududiSettingsPage` | `/settings/tududi` | Tududi connection status, proxy URL, upstream URL |
| `CloudSettingsPage` | `/settings/cloud` | Cloud Connect connection management |
| `AssistantsPage` | `/assistants` | Tile grid, tab filters (Active/Archived + counts), context menus |
| `AssistantEditPage` | `/assistants/:id`, `/assistants/new` | Create/edit with sticky action bar; clone mode via `?from=<id>`; executor picker |
| `ApplicationsPage` | `/applications` | Manage application plugins (toggle enabled, reorder) |

### Frontend Components (selected)

| Component | Description |
|---|---|
| `HermesStatusIndicator` | Header icon (green/red/gray) + localized tooltip with running version |
| `OpenCodeStatusIndicator` | Header dot for the OpenCode executor; grey/red/green |
| `SessionCard` | 3-row layout: title / preview / meta+actions. Checkbox column always in DOM (right side, `opacity-0`→`opacity-100` in bulk mode, zero layout shift). Swipe-to-delete, long-press bulk. |
| `AssistantManageTile` | Context menu via `createPortal`, colored border, archived treatment |
| `AssistantTile` | Clickable tile on `/new`, model label, "via OpenCode" badge, hover "Create" indicator |
| `ToolCall` | Collapsible block showing tool name, input, output, timing |
| `AgentFileCard` | Download card inside assistant messages; filename + size + Download button; `404`-safe |
| `AgentFileGroup` | Groups multiple `AgentFileCard`s from one message in a collapsible container |
| `ApplicationsPane` | Container for the right split-pane; renders the enabled application from the registry |
| `CloudConnectApp` | WebDAV browser in Applications pane: connection switcher, folder browser, multi-select, insert links |
| `TududiApp` | Tasks / Notes / Projects tabs in Applications pane; health dot in header |
| `OpenCodeProviderCard` | OpenCode-specific provider row in Providers page |
| `Modal` | Focus-trapped modal; used for confirm dialogs and command output |
| `Toast` | Queued notifications with auto-dismiss |
| `MobileNav` | Bottom nav (4 routes); iOS safe-area aware |
| `Workspace` | Shell on `/sessions`: 3-tab header (Sessions / Hermes / OpenCode), dual-mounts one `ChatPage` per executor with `isActive` gating. See [WORKSPACE.md](WORKSPACE.md). |
| `ChatRouteResolver` | Translates `/chat/:id` into a Workspace tab + active-session claim (resolves executor via `GET /api/sessions/:id`, then redirects to `/sessions`) |
| `ExecutorToolbar` | Per-executor row of recent-session pills + a `…` filter link to `/sessions?executor=` |
| `ExecutorStatusDot` | Green/red/grey dot inside each executor tab (moved out of the global Navbar) |
| `WorkspaceSessionControls` | Assistant/model badges, files popover, apps-pane toggle, delete — moved from the Navbar into the Workspace header |

### Frontend State (Zustand stores, all persisted)

| Store | Key | Contents |
|---|---|---|
| `themeStore` | `hermes-theme` | `isDarkMode` |
| `notificationsStore` | `hermes-notifications` | `enabled` |
| `sidebarStore` | `hermes-sidebar` | `isOpen` |
| `appsPaneStore` | `hermes-apps-pane` | `visible` (right split-pane toggle) |
| `sessionsSortStore` | `hermes-sessions-sort` | `sortMode: 'created' \| 'lastMessage'` |
| `searchStore` | _(session, URL-synced)_ | `query` |
| `hermesStatusStore` | `hermes-status` | status, version, latestVersion, updateAvailable, lastChecked |
| `openCodeStatusStore` | `hermes-opencode-status` | OpenCode executor health (lastChecked) |
| `assistantsStore` | _(session)_ | assistants list, fetch / upsert / remove |
| `cloudConnectStore` | _(session)_ | cloud connections, selected connection, current path, directory entries, selected files, loading/error state |
| `applicationsStore` | _(session)_ | application registry, fetch / update |
| `filePreviewStore` | _(session)_ | selected file id, viewer mode |
| `chatInputStore` | _(session)_ | draft message text, attached files, and the **per-session stream store** (see below): `startStream`/`stopStream`, module-level `streamControllers` map, `liveMessages` slice |
| `workspaceStore` | `1230-workspace-active-tab`, `1230-workspace-session-<executor>` | `activeTab`, `activeSessionByExecutor` (which session each executor tab has open) |

### Hooks

| Hook | Description |
|---|---|
| `useKeyboardShortcuts` | Ctrl+K (search), Ctrl+N (new session), Ctrl+Enter (send) |
| `useNotifications` | Browser Notification API + Badge API |
| `useToast` | Toast queue (show / dismiss) |
| `useHermesStatusPoll` | Polls `/api/system/status` every 60 s with 5-min staleness guard |
| `useOpenCodeStatusPoll` | Polls `/api/system/executors` every 60 s |
| `useSwipe` | Native `touchstart/touchmove/touchend`: `onSwipeLeft`, `onSwipeRight`, `onLongPress`; `data-swipe-ignore` opt-out for nested buttons |
| `useMobile` | True on viewports < 768 px |
| `useDocumentVisibility` | `document.visibilityState` as a hook |
| `useExecutorConfig` | Read / write the OpenCode executor config (URL / username / password) via `GET/POST /api/system/executor-config` |
| `useTimeBracketColor` | Bracket colour for time-of-day chat rows |

### Backend

The backend is split into focused modules (v0.8.0+):

| File | Lines | Responsibility |
|---|---|---|
| `server.js` | 132 | Entry point: open DBs → migrate → seed → load executor config → cleanup expired files → listen |
| `app.js` | 114 | Express instance, middleware stack, route mounting |
| `db/connections.js` | 81 | Open `db` / `hermesDbWrite` / `uiDb`; export `closeAll()` |
| `db/migrate.js` | 243 | `initSchema()`: `CREATE TABLE IF NOT EXISTS` + idempotent `ALTER TABLE` migrations (includes `cloud_connections`, `system_settings`, `applications`) |
| `db/seed.js` | 100 | `seedStarterAssistants()` + `seedStarterApplications()` (seeds 4 apps: file_preview, file_manager, cloud_connect, **tududi**) |
| `db/helpers.js` | 93 | Shared pure helpers: `rowToAssistant`, `getDefaultModelId`, `getProviderFromModel`, `getProviderForModelId` (DB JOIN) |
| `db/fileTypes.js` | 55 | Shared MIME map, `ALLOWED_EXTENSIONS`, `getMimeTypeForPath`, `hasAllowedExtension` — single source of truth used by `routes/files.js`, `routes/chat.js`, and `lib/cloud/crypto.js` |
| `lib/cloud/crypto.js` | 83 | AES-256-GCM encrypt/decrypt for cloud credentials; HMAC-SHA256 signed URL tokens (HKDF-derived key) |
| `lib/opencode.js` | 448 | Legacy `OpenCodeClient` REST wrapper + `streamOpenCodeSession()` async generator (used by `lib/adapters/opencode.js`) |
| `lib/adapters/base.js` | 100 | `ExecutorAdapter` abstract class + `ChatContext` / `ChatEvent` typedefs |
| `lib/adapters/hermes.js` | 280 | `HermesAdapter` — subprocess + NDJSON bridge to `run_chat.py` |
| `lib/adapters/opencode.js` | 350 | `OpenCodeAdapter` — HTTP + SSE to `opencode serve` with idempotent session creation |
| `lib/adapters/index.js` | 26 | `ADAPTERS` registry; one import + one entry per executor |
| `routes/system.js` | 200+ | `/api/system/status`, `/api/system/exec`, `/api/system/executors`, `/api/system/executor-config`, `/api/health` |
| `routes/sessions.js` | 500 | Full session CRUD + messages (`/api/sessions/*`, `/api/messages`); attaches `agentFiles` to messages on load; merges OC and Hermes history |
| `routes/chat.js` | 712 | SSE streaming chat (`POST /api/chat`); dispatcher resolves executor from `session_meta.assistant_id → assistants.executor` and runs the matching adapter's generator through the SSE pipe; in-flight dedup; 90 s no-output watchdog + 10 min hard ceiling; cloud-link interceptor; agent-file detection; `SIGTERM`→`SIGKILL` on `req.on('close')` |
| `routes/files.js` | 360 | File upload / list / delete / download (`/api/sessions/:id/files/*`); multer, whitelist, disk cleanup |
| `routes/cloudConnections.js` | 123 | WebDAV connection CRUD (`/api/cloud-connections/*`); AES-256-GCM encrypted credentials |
| `routes/cloudFiles.js` | 140 | Cloud file listing, signed URL issuance, proxy streaming (`/api/cloud/*`) |
| `routes/applications.js` | 111 | Application registry CRUD (`/api/applications/*`); GET all / PATCH single |
| `routes/tududi.js` | 175 | Tududi proxy: `/api/tududi/*` and `GET /api/tududi/health`; bearer token attached server-side |
| `routes/opencode.js` | 84 | Small OpenCode-facing HTTP router (status, executor visibility, executor config write) |
| `routes/models.js` | 148 | `/api/models/*` (list, providers, sync, toggle) |
| `routes/assistants.js` | 235 | `/api/assistants/*` CRUD + fork-on-edit + archive/restore/duplicate; `ASSISTANT_EXECUTORS` allowlist |
| `routes/providers.js` | 154 | `/api/providers/*` (list, set key, remove key) |
| `routes/likes.js` | 100 | `POST /api/like` (cooldown, geoip, Mattermost webhook) |
| `routes/globalFiles.js` | — | Global files view across sessions (drives File Manager app) |

- **`middleware/security.js`** — security middleware: the five rate-limit profiles + `sanitizeBody` (recursive XSS sanitization). Plus `middleware/logger.js` (request logging, SSE/stream-aware) and `middleware/errorHandler.js` (central `{ error }` envelope).

### Databases (SQLite)

**Hermes DB** (`~/.hermes/state.db`)

Managed by Hermes Agent. 1230-UI opens two connections:
- `db` — read-only (SELECT on sessions, messages, models)
- `hermesDbWrite` — writable in WAL mode (DELETE sessions only; Hermes has no delete API)

**UI DB** (`./data/1230-ui.db`)

Owned by 1230-UI. Created on first run.

| Table | Purpose |
|---|---|
| `providers` | Provider list with `description`, `signup_url`, `auth_type` |
| `models` | Model list with `enabled` flag |
| `cache` | TTL cache (GitHub latest version, etc.) |
| `likes` | Like-button cooldowns, indexed on `(user_hash, created_at)` |
| `session_meta` | `pinned` / `archived` / `assistant_id` / `opencode_session_id` per session |
| `assistants` | Named bundles (name, color, icon, model_id, style, depth, system_prompt, executor, is_archived) |
| `session_files` | User-uploaded (`source='user'`) and agent-created (`source='agent'`) file records. `stored_name` = UUID filename on disk (user uploads) or absolute agent-written path (agent files). `expires_at` and `extended_count` for the retention policy. Cleaned up on session delete. |
| `applications` | Application plugins registry (key, name, icon, enabled, sort_order, desktop_only, config JSON) |
| `cloud_connections` | WebDAV connection records: label, url, username, AES-256-GCM encrypted password, status, timestamps |
| `system_settings` | Encrypted executor config (OpenCode URL / username / password, Hermes python path / API URL / API key) and override toggles |

Schema migrations are idempotent: `PRAGMA table_info` checked before each `ALTER TABLE`.

### Python Scripts

| Script | Purpose |
|---|---|
| `run_chat.py` | **Per-request wrapper** for `POST /api/chat`. Constructs an `AIAgent` with explicit `model` / `provider` / `base_url` / `api_key` and streams NDJSON events to stdout. See [Two-Process Model](#two-process-model). |
| `save_messages.py` | Save messages to Hermes DB |
| `sync_providers.py` | Sync providers/models from Hermes → UI DB |
| `list_bundled_providers.py` | Enumerate `api_key` providers with metadata; check which env vars are set |
| `manage_provider_key.py` | Atomic set/remove of a key in `~/.hermes/.env` via `save_env_value()` |

### Backend Endpoints

**Sessions**
- `GET /api/sessions` — list (paginated, sort, include_archived)
- `GET /api/sessions/:id` — single session (includes linked `assistant` object)
- `GET /api/sessions/:id/messages` — messages; each assistant message includes `agentFiles` array reconstructed from `session_files` by path-matching; **messages from OC sessions are merged with Hermes `state.db` rows**
- `POST /api/sessions` — create (accepts optional `assistantId`)
- `PATCH /api/sessions/:id/title` — rename; for OC sessions also `PATCH /session/:id` on the daemon
- `PATCH /api/sessions/:id/pin` — toggle pin
- `PATCH /api/sessions/:id/archive` — toggle archive
- `DELETE /api/sessions/:id` — delete (cleans up `data/uploads/<id>/` and `session_files` rows)
- `DELETE /api/sessions/bulk` — bulk delete (same cleanup)

**Session Files**
- `POST /api/sessions/:id/files` — upload (multer, whitelist, 50 MB / 5-file limits)
- `GET /api/sessions/:id/files` — list (user + agent files)
- `DELETE /api/sessions/:id/files/:fileId` — delete user file (disk + DB)
- `GET /api/sessions/:id/files/:fileId/download` — stream file (user or agent)

**Chat**
- `POST /api/chat` — streaming SSE chat. The dispatcher in `routes/chat.js` resolves the executor from `session_meta.assistant_id → assistants.executor` and runs the matching adapter's generator through the SSE pipe. In-flight dedup returns HTTP 409 on duplicates; 90 s no-output watchdog + 10 min hard ceiling; after stream ends, detects agent-created files and emits `agent_files` SSE event
- `POST /api/messages` — persist message to Hermes DB

**Models**
- `GET /api/models` — enabled models with default
- `GET /api/models/providers` — all providers with models
- `POST /api/models/sync` — sync from Hermes
- `PATCH /api/models/models/:id/toggle` — enable/disable

**Assistants**
- `GET /api/assistants[?include_archived=0|1]` — list
- `GET /api/assistants/:id` — single
- `POST /api/assistants` — create (optional `executor: 'hermes' | 'opencode-1230'`)
- `PATCH /api/assistants/:id` — update (fork-on-edit if sessions exist; `executor` is part of the editable surface)
- `POST /api/assistants/:id/archive` — archive
- `POST /api/assistants/:id/restore` — restore archived
- `POST /api/assistants/:id/duplicate` — duplicate

**Providers**
- `GET /api/providers/available[?configured=0|1]` — list bundled `api_key` providers
- `POST /api/providers/:name/key` — set key (rate-limited 10/min)
- `DELETE /api/providers/:name/key?env_var=…` — remove key

**Applications**
- `GET /api/applications[?enabled=0|1]` — list registered applications
- `PATCH /api/applications/:id` — update `enabled`, `sortOrder`, `name`, `icon`, `description`, `config`

**System**
- `GET /api/health` — liveness probe
- `GET /api/system/status` — Hermes version (async `execFile`), provider list, stats
- `GET /api/system/executors` — visibility map for the executor picker (`{ hermes, opencode-1230, … }` → boolean)
- `GET /api/system/executor-config` — encrypted executor config (URL / username / password masked)
- `POST /api/system/executor-config` — write encrypted executor config
- `POST /api/system/exec` — run `hermes update` or `hermes doctor --fix`
- `POST /api/like` — Mattermost webhook like (rate-limited + DB cooldown)

**Cloud Connect**
- `GET /api/cloud-connections` — list all connections (credentials never returned)
- `POST /api/cloud-connections` — create connection (password encrypted at rest)
- `PATCH /api/cloud-connections/:id` — update label
- `DELETE /api/cloud-connections/:id` — hard delete
- `POST /api/cloud-connections/:id/test` — test WebDAV connectivity
- `GET /api/cloud-connections/:id/list?path=/` — list directory contents
- `POST /api/cloud-connections/:id/issue-link` — issue signed proxy URLs for files
- `GET /api/cloud/:id/:token/:expiresAt/:path` — signed proxy stream (HMAC verified, TTL checked)

**Tududi**
- `GET /api/tududi/health` — 5 s `GET /api/profile` probe; returns `{ configured, reachable, status, error }`
- `* /api/tududi/*` — generic HTTP proxy: strips hop-by-hop headers and any incoming `Authorization`, attaches the server-side bearer token, forwards method / body / query string, returns the upstream response. 15 s `AbortController` timeout. Returns 503 (`tududi_not_configured`) if `TUDUDI_API_TOKEN` is unset, 504 on timeout, 502 on network error.

---

## Implementation Details

### Design Tokens

All UI colors use a unified token system in `src/index.css` via Tailwind CSS v4 `@theme`:

| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg-bg-primary` | `#ffffff` | `#1f2937` | Cards, panels, message bubbles |
| `bg-bg-secondary` | `#f9fafb` | `#111827` | Inputs, hover states, page background |
| `bg-bg-muted` | `#f3f4f6` | `#374151` | Skeletons, badges, avatars |
| `text-fg-primary` | `#111827` | `#f9fafb` | Headings, main content |
| `text-fg-secondary` | `#4b5563` | `#d1d5db` | Labels, descriptions |
| `text-fg-muted` | `#6b7280` | `#9ca3af` | Timestamps, hints |
| `border-border-default` | `#e5e7eb` | `#374151` | Card borders, dividers |
| `border-border-strong` | `#d1d5db` | `#4b5563` | Tables, blockquotes |

Accent (blue), danger (red), success (green), warning (yellow) remain as Tailwind utilities for status indicators and CTAs.

### Multi-Executor Pattern

Starting with v0.9.2, the chat backend is pluggable. `routes/chat.js` is the **core**; it owns:

- the SSE framing (`res.write('data: …\n\n')`),
- the `INFLIGHT` dedup map,
- the 90 s no-output watchdog and the 10 min hard ceiling,
- the `req.on('close')` SIGTERM/SIGKILL escalation,
- the agent-file detection (`agent_files` SSE event),
- the cloud-link interceptor (expands WebDAV URLs before sending to Hermes).

`ExecutorAdapter` subclasses in `lib/adapters/{hermes,opencode}.js` are **event generators**. They yield `AsyncIterable<ChatEvent>`; they MUST NOT touch `req` / `res`, the `INFLIGHT` map, or persistence. The dispatcher does:

```js
const adapter = ADAPTERS[adapterSlug];
for await (const evt of adapter.chat(ctx)) writeSse(evt);
```

`adapterSlug` is resolved from `session_meta.assistant_id → assistants.executor` for the current request. The free-chat path (no assistant) always resolves to `hermes`. Adding a third backend is a one-file change — see [EXECUTOR_ADAPTERS.md](EXECUTOR_ADAPTERS.md) for the full contract.

The two shipped adapters:

| Adapter | Transport | Native events | Notes |
|---|---|---|---|
| `HermesAdapter` | `child_process.spawn(python, ['-u', 'run_chat.py', …])` | NDJSON on stdout, body on stdin | Persists messages via `run_chat.py` → `SessionDB` |
| `OpenCodeAdapter` | `fetch` to `opencode serve:4097` (`/session`, `/session/:id/prompt_async`, `/event` SSE) | SSE frames on the daemon's `/event` bus | Persists messages via `routes/chat.js` `persistHermesMessage` (Hermes DB) |

Idempotency: `OpenCodeAdapter.chat()` step 1 resolves the `opencode_session_id` binding inside a per-session mutex and upserts it with `INSERT … ON CONFLICT(session_id) DO UPDATE SET opencode_session_id = excluded.opencode_session_id`, so two concurrent requests for the same session don't both create an OC session **and** the binding survives a daemon-side session swap.

**OpenCode connector (v0.9.3 fixes).** The OpenCode daemon is stateful — it keeps the conversation in-process — so the adapter sends **only the new user turn** on a reused session (it rehydrates the full history exactly once after a `getSession` 404). The `opencode_session_id` binding is written with the upsert above (was `DO NOTHING`, which silently lost the binding on a swap), and pin/archive use column-preserving upserts (was `INSERT OR REPLACE`, which wiped the binding and the executor). Tool permission requests are auto-approved (see `OPENCODE_AUTO_APPROVE_TOOLS`). The full list of pitfalls and the rationale live in [EXECUTOR_ADAPTERS.md](EXECUTOR_ADAPTERS.md) § "Tool permission handling" and § "Common pitfalls".

### Workspace (v0.9.3+)

`/sessions` is no longer a bare list page. It renders a `Workspace` shell (`src/components/Workspace.tsx`) with a 3-tab header — **Sessions / Hermes / OpenCode** — that keeps both executor chats mounted simultaneously. The Sessions tab is the sessions list; each executor tab is that executor's chat. Two streams (one per executor) coexist, and switching tabs never aborts a running turn.

```
/sessions  →  Workspace
                 ├─ Sessions tab   = SessionsPage (list)
                 ├─ Hermes tab     = ExecutorToolbar + ChatPage (isActive)
                 └─ OpenCode tab   = ExecutorToolbar + ChatPage (isActive)

/chat/:id  →  ChatRouteResolver
                 └─ resolve executor → claim active session → switch tab → /sessions
```

The active tab and the per-executor active session live in `workspaceStore` (persisted to `localStorage`). Session controls (assistant/model badges, files, apps-pane toggle, delete) moved from the global Navbar into the Workspace header; executor status dots moved into the tab header. The full component breakdown, the dual-mount safety rules (`isActive` gating via the store's `pendingChatActions` queue + the active-session claim), and the `/chat/:id` deep-link flow are in [WORKSPACE.md](WORKSPACE.md). (v0.9.3: the old `window` `chat:send`/`chat:stop` event bus was replaced by typed store actions — see [Cross-component messaging](#cross-component-messaging-chat--chatpage--chatinput) below.)

### Per-session streaming store

Stream ownership moved out of `ChatPage` and into `chatInputStore` (`src/store/chatInputStore.ts`). `ChatPage` is now a subscriber/renderer. The store owns:

- a module-level `streamControllers: Map<sessionId, AbortController>` registry that lives outside React,
- `startStream(sessionId, opts)` / `stopStream(sessionId)` — the only entry points that create or abort a fetch,
- a `liveMessages: Record<sessionId, LiveMessageState>` slice carrying `status`, `streamingContent`, active/completed tool calls, `pendingUserContent`, `agentFiles`, and the pre-allocated `pendingAssistantId`.

Because the fetch + its `AbortController` live at the app root (not in component state), navigating away from a chat **while the agent is still responding** does not abort the turn. Only an explicit Stop (`stopStream`), the turn completing (`onDone`/`onError`), or a real browser disconnect ends a stream. This is what makes the dual-mount Workspace safe: a turn streaming on the inactive tab keeps writing into its `liveMessages[id]` slice, and the chat rehydrates from that slice when its tab becomes active again.

#### Cross-component messaging (Chat ↔ ChatPage ↔ ChatInput)

`ChatInput` is mounted once globally (in `Layout`), but the active `ChatPage` (in the router outlet) needs to trigger send/stop, and applications (File Manager, Cloud Connect, prompt suggestions) need to push files/text into the input. In v0.9.3 the old `window.dispatchEvent(new CustomEvent('chat:*'))` bus was replaced by **typed store actions** on `chatInputStore`:

- `requestSend(content)` / `requestStop()` → `pendingChatActions` FIFO; the active `ChatPage` drains it (gated by `isActiveRef`) and runs `startStream`/`stopStream`.
- `prefillInput(text)` / `addFileToInput(file)` / `insertTextToInput(text)` → `pendingInputActions` FIFO; `ChatInput` drains it.

Each queued item carries a monotonic `nonce`; consumers track their last-seen nonce, so an action fires exactly once (StrictMode-safe) and an inactive `ChatPage` advances past an action without executing it. This is race-free, type-safe, and traceable in React DevTools — unlike the stringly-typed window bus.

The global `ChatInput`'s `sending`/blocked state is derived in `Layout` from the **active session's** live slice (`liveMessages[activeSessionId].status`), not a global flag — so a stream running in one session never disables the input in another.

#### Response validation & error handling

- **Soft runtime validation.** `src/lib/api.ts` validates the main list/detail responses (`getSessions`, `getSession`, `getMessages`, `getAssistants`, `getAssistant`) against `zod` schemas. On schema drift the client `console.warn`s and falls back to the raw response rather than throwing — a hard throw had blanked session content when the backend sent `null` for nullable fields. This makes validation a dev-time signal without it becoming a production failure mode.
- **Central error middleware.** `middleware/errorHandler.js` (mounted last in `app.js`) turns any unhandled route error into a consistent `{ error }` envelope: 5xx hides internals (generic message, no stack leak); 4xx forwards the app-controlled message. `middleware/logger.js` logs every request by hooking the response emitter (`finish`/`close`), so SSE (`POST /api/chat`) and file downloads are logged, not only `res.json` responses. `app.set('trust proxy', 1)` is set so `req.ip` and the rate-limit buckets reflect the real client behind the reverse proxy.

### Tududi Proxy

`routes/tududi.js` is a generic HTTP forwarder mounted at `/api/tududi/*`. It is not an executor; it is an application-level proxy that exists so the Tududi bearer token never leaves the server.

```
Browser
   │  fetch('/api/tududi/tasks', { headers: { … } })
   ▼
routes/tududi.js
   │  • strip hop-by-hop, set-cookie, content-encoding, authorization
   │  • attach Authorization: Bearer <TUDUDI_API_TOKEN>  (from config.tududiApiToken)
   │  • 15 s AbortController timeout
   │  • forward method, body, query string
   ▼
Tududi (TUDUDI_API_URL)
   │  GET /api/tasks
   ▼
routes/tududi.js
   │  • forward response headers, status, body
   ▼
Browser
```

The same router also exposes `GET /api/tududi/health`, a 5 s `GET /api/profile` probe used by the Tududi app header to show a green/red status dot. The 1230-UI side stores the URL and token in `.env` (`TUDUDI_API_URL`, `TUDUDI_API_TOKEN`); there is no runtime Settings UI for editing them today (planned in v1.0).

The frontend client lives in `src/lib/api/tududi.ts`. Methods map 1:1 to Tududi's REST surface (`/api/tasks`, `/api/notes`, `/api/projects`, `/api/tags`, etc.) with the singular-vs-plural quirks handled in the client. The UI is in `src/applications/tududi/` and ships with three tabs (Tasks, Notes, Projects). See [TUDUDI_INTEGRATION.md](TUDUDI_INTEGRATION.md).

### Streaming Chat (SSE)

```
Frontend (api.ts)
   │  POST /api/chat  { messages, session_id, model, stream: true }
   ▼
routes/chat.js (Node, Express)
   │  • resolve provider via db/helpers.js (DB JOIN, db/helpers.js:79)
   │  • dedup check against INFLIGHT map (routes/chat.js:387-406)
   │  • spawn(HERMES_PYTHON, ['-u', 'run_chat.py', --model, --provider, …])
   │  • write JSON payload to child.stdin, then close stdin
   ▼
run_chat.py (Python, inside Hermes venv)
   │  • resolve_runtime_provider(requested=provider, target_model=model)
   │  • construct AIAgent(model=…, provider=…, base_url=…, api_key=…, session_id=…)
   │  • agent.run_conversation(user_message=…, conversation_history=…)
   │      ↓ streams deltas / reasoning / tool_start / tool_complete
   │  • persist state.db.sessions.model = model
   │  • emit {"event":"done", final_response, usage, session_id, model, provider}
   │  • exit 0 (or {"event":"error", …} on stderr + exit 1)
   ▼
routes/chat.js NDJSON parser (lines 665-771)
   │  delta          → SSE  { type: 'delta', text }
   │  reasoning      → SSE  { type: 'reasoning', text }
   │  tool_start     → SSE  { type: 'tool_call_start', id, toolName, label }
   │  tool_complete  → SSE  { type: 'tool_call_end', id }
   │  done           → SSE  { type: 'done', final_response, usage, … }
   │                  → SSE  [DONE]              (OpenAI-spec sentinel)
   │  error          → SSE  { error: { type:'provider_error', … } }
   ▼
Frontend (api.ts parser, src/lib/api.ts:225-380)
   │  • accumulates deltas into fullContent, calls onChunk(delta)
   │  • handles type:'done' (api.ts:266) and [DONE] (api.ts:236)
   │  • tool_call_start / tool_call_end update active tool sidebar
   │  • on stream close with partial fullContent + no done:
   │      → rescue path fires onDone(fullContent) instead of STREAM_ABORTED
   │        (api.ts:345-353)
   ▼
On child close (routes/chat.js:792-843)
   • unregister INFLIGHT key
   • detectAgentFiles(session_id, responseText) scans for backtick-wrapped
     absolute paths, fs.statSync's each candidate, inserts survivors into
     session_files (source='agent')
   • SSE  { type: 'agent_files', files: […] }  — handled in api.ts:297
   • res.end()
```

### Two-Process Model

1230UI is a Node.js HTTP server that does not speak to the LLM directly. Per chat turn it `child_process.spawn`s a Python interpreter running `run_chat.py`, which constructs an `AIAgent` with the exact `model` / `provider` / `base_url` / `api_key` the user picked, and streams events back as NDJSON.

**Why a subprocess and not an HTTP proxy.** The obvious alternative would be to POST to Hermes's `api_server` (the OpenAI-compatible HTTP gateway at `HERMES_API_URL`). We tried that and it has a hard, silent failure mode: `api_server` resolves its model via `_resolve_gateway_model()` and **ignores the per-request model**. The UI could display "MiniMax-M3" while the LLM answered as whatever was in `config.yaml.model.default`. Spawning `AIAgent(...)` directly with explicit kwargs bypasses that path entirely.

**Why the wrapper lives in the Hermes venv.** The wrapper imports `run_agent.AIAgent`, `hermes_cli.runtime_provider.resolve_runtime_provider`, and `hermes_state.SessionDB`. These modules are not on `pip`'s default path; they ship inside the Hermes Agent venv. The shebang on line 1 of `run_chat.py` and the `HERMES_PYTHON_PATH` config variable both point at the venv interpreter.

**Why NDJSON over a more elaborate IPC.** NDJSON is line-oriented JSON — every event is exactly one line on stdout, terminated by `\n`, parseable independently. This means:

- A burst of events can be parsed by `buffer.indexOf('\n')` without any framing protocol.
- A crash mid-stream still leaves the events that *did* arrive usable (the next `run_chat.py` will not collide on a half-written line because `\n` is the atomic boundary).
- The Node side can map 1:1 to SSE without any batching: each NDJSON line becomes one `data: …\n\n` frame.

### Model Selection Mechanism

```
User picks "MiniMax-M3" in the model picker
  │
  ▼
Frontend sends model="MiniMax-M3" in POST /api/chat
  │
  ▼
routes/chat.js:411  const provider = getProviderFromModel(model)
  │
  ▼
db/helpers.js:79  getProviderFromModel("MiniMax-M3")
   ├─ uiDb.prepare("SELECT p.name FROM models m JOIN providers p ON p.id=m.provider_id WHERE m.model_id = ?")
   ├─ returns "minimax"   (DB hit, the common case)
   └─ on cache miss:  substring heuristic → "unknown" or a guess
  │
  ▼
routes/chat.js:451  argv: ['-u', 'run_chat.py', '--model', 'MiniMax-M3', '--provider', 'minimax', …]
  │
  ▼
run_chat.py:156  resolve_runtime_provider(requested="minimax", target_model="MiniMax-M3")
   → returns { api_key, base_url, api_mode, provider }  keyed on the *requested* provider
  │
  ▼
run_chat.py:251  AIAgent(model="MiniMax-M3", provider="minimax", base_url=…, api_key=…, …)
   → config.yaml.model.default is NEVER consulted
```

The DB JOIN is the load-bearing part: a wrong provider slug here means the wrong API key and wrong `base_url`, which means the request either 401s or hits a different LLM entirely. The JOIN is idempotent and cheap (one indexed lookup); the previous string-heuristic fallback has been demoted to a last-resort path.

### NDJSON Event Protocol

`run_chat.py` writes one JSON object per line to stdout. `routes/chat.js` reads with `buffer.indexOf('\n')`, parses each line, and translates to SSE.

| Event | Payload fields | Frontend SSE | Notes |
|---|---|---|---|
| `delta` | `text` | `{ type: 'delta', text }` | One per token-ish chunk from the LLM. Accumulated into the assistant bubble. |
| `reasoning` | `text` | `{ type: 'reasoning', text }` | Reasoning content; rendered separately if the model exposes it. |
| `tool_start` | `id`, `name`, `args` | `{ type: 'tool_call_start', id, toolName, label }` | `label` is synthesized from `args.label` / `args.command` / `args.path` / fallback to `name`. |
| `tool_complete` | `id`, `name`, `result` | `{ type: 'tool_call_end', id }` | `result` is JSON-parsed in the wrapper so the UI gets a structured object. |
| `done` | `final_response`, `usage`, `session_id`, `model`, `provider`, `message_count` | `{ type: 'done', final_response, usage, … }` **+** `data: [DONE]\n\n` | The `[DONE]` sentinel is the OpenAI-spec termination marker; the `type:'done'` payload carries the authoritative `final_response` and `usage` for the UI. |
| `error` | `message`, `exception_type`, `traceback` (last 4 KB) | `{ error: { type:'provider_error', … } }` | Emitted on stderr by the wrapper; Node also forwards it to SSE so the browser can show the error message verbatim. |

Buffering in the Python child is disabled at three layers so events arrive in real time (see *Streaming behavior* below).

### In-Flight Deduplication

`routes/chat.js:322-341` keeps a `Map<string, {startedAt, res}>` keyed by `${session_id}:${hash(lastUserMessage)}`. The hash is a 32-bit djb-style accumulator over the first 512 chars of the last user message — we do not need cryptographic strength, just a per-message key that fits in memory.

```
POST /api/chat  (session_id="abc", message="Hello")
  │
  ├─ compute key "abc:1234567890"
  ├─ INFLIGHT has "abc:1234567890"?  no  →  proceed
  ├─ INFLIGHT.set("abc:1234567890", { startedAt: now, res })
  ├─ spawn run_chat.py
  │
POST /api/chat  (session_id="abc", message="Hello")   ← 0.4s later
  │
  ├─ compute key "abc:1234567890"   (same hash, same message)
  ├─ INFLIGHT has "abc:1234567890"?  yes  →  HTTP 409
  └─ res.status(409).json({ error: { type:'duplicate_request', code:'DUPLICATE_INFLIGHT', retryable: false } })
  │
  ⋯ 30s passes with no further requests for this key
  │
  pruneInflight() deletes the key (routes/chat.js:336-341)

POST /api/chat  (session_id="abc", message="Hello")
  │
  ├─ INFLIGHT has "abc:1234567890"?  no (pruned)  →  proceed normally
```

**Why this exists.** The frontend's previous default of 3 retries meant a single user click could spawn 4 parallel `run_chat.py` instances, producing 4 duplicate user turns in `agent.log` and 4 duplicate user bubbles in the chat. The frontend now passes `maxRetries: 0` (`src/pages/ChatPage.tsx:406`), but the server-side dedup is the safety net for: (a) old clients, (b) hand-rolled `fetch()` calls, (c) a network blip that fires multiple sends before the first one is acknowledged.

**TTL.** `INFLIGHT_TTL_MS = 30_000` (30 s). Auto-retry storms finish in under 5 s; the 30 s window is enough for any plausible duplicate burst without holding the slot open for genuinely different messages. `pruneInflight()` runs on every entry to `POST /api/chat` so the map self-cleans.

### Streaming Behavior

Three things have to be right for the browser to see a smooth token-by-token stream:

**1. Python buffering must be off.** A child whose stdout is a pipe (not a TTY) buffers up to 8 KB in C stdio before flushing. We defeat that at three layers:

| Layer | Where | Effect |
|---|---|---|
| `sys.stdout.reconfigure(line_buffering=True)` | `run_chat.py:38-48` | Per-Python-process line buffering. Survives being launched with or without `-u`. |
| `python -u` flag in argv | `routes/chat.js:453` | Disables C-level block buffering on stdout/stderr. |
| `PYTHONUNBUFFERED=1` env | `routes/chat.js:470` | Belt-and-suspenders; the standard "unbuffered" toggle. |
| `PYTHONIOENCODING=utf-8` env | `routes/chat.js:470` | Avoids `UnicodeDecodeError` on non-ASCII content in some locales. |

**2. The 90 s no-output watchdog.** `FIRST_OUTPUT_TIMEOUT_MS = 90_000` (`routes/chat.js:499`). On the first stdout chunk the watchdog starts; on every subsequent chunk it resets. A child that imports heavy modules and never produces output is killed at 90 s (a typical cold start takes 10-20 s, so 90 s is comfortably above the warm-up ceiling). A child that streams, then stalls mid-stream, is killed 90 s after its last byte. The watchdog fires a `SIGKILL` and emits a `NO_OUTPUT_TIMEOUT` SSE error before closing the response.

**3. The `data: [DONE]\n\n` sentinel.** Right after the `done` event the Node side writes a literal `data: [DONE]\n\n` frame (`routes/chat.js:749`). This is OpenAI-spec compliance: third-party SSE consumers (and older versions of `api.ts`) look for that exact string to close the stream cleanly. The frontend's own `type: 'done'` handler (`src/lib/api.ts:266-283`) also fires `onDone` with the server's authoritative `final_response` — both paths converge.

### Rescue Path

A long silence followed by a connection close is the classic "the wrapper completed successfully but the network died before the last frame" case. The previous `api.ts` would call it `STREAM_ABORTED` and tell the user to retry, losing the partial text.

The fix is in `src/lib/api.ts:345-353`:

```ts
// Stream closed without [DONE] — retry
if (!isDone) {
  // …build STREAM_ABORTED error…
  if (attempt < maxRetries) { /* retry */ }
  // Final fallback: if we have a partial response, surface it instead
  // of dropping it.
  if (fullContent && fullContent.trim().length > 0) {
    options.onDone?.(fullContent);
    return;
  }
  options.onError?.(err);
  return;
}
```

If the user is reading a streamed answer, presses nothing, and the connection drops at byte 4096 / 8192, the UI gets `onDone(fullContent)` — the user sees their answer. The STREAM_ABORTED error path is only taken when the stream closes with **zero** accumulated content.

### Error Handling

| Failure mode | Where detected | What happens |
|---|---|---|
| `spawn()` throws (venv not found, permissions) | `routes/chat.js:472-485` | HTTP 502 `SPAWN_FAILED` with `retryable: true`. The frontend shows the suggestion to check the venv path. |
| Child writes `{"event":"error", …}` to stderr | `routes/chat.js:678-692` | Translated to SSE `{ error: { type:'provider_error', … } }`; the frontend fires `onError`. |
| Child exits non-zero with no `done` event | `routes/chat.js:813-828` (in `child.on('close')`) | Synthesized SSE error: `code = String(exitCode)`, `retryable` true for `1` and `124` (timeout). |
| Child produces no stdout for 90 s | `routes/chat.js:614-663` | `SIGKILL`; SSE `NO_OUTPUT_TIMEOUT` error; response closes. |
| Child produces no stdout for 10 min total | `routes/chat.js:506-514` | Hard ceiling: `SIGKILL` and close. The watchdog should have fired first; this is the upper bound. |
| Browser disconnects mid-stream | `routes/chat.js:516-522` | `SIGTERM` → 5 s → `SIGKILL`. `INFLIGHT` key released, slot freed. |
| Duplicate request (same session + message) | `routes/chat.js:388-406` | HTTP 409 `DUPLICATE_INFLIGHT`, `retryable: false`. |
| Frontend SSE consumer sees no `done` event | `src/lib/api.ts:345-353` | Rescue path: fire `onDone(fullContent)` if anything was streamed. |
| LLM provider 4xx/5xx | `run_chat.py:144-167` | Caught in the wrapper; emitted as `{"event":"error", "message": "...", "exception_type": "..."}`. |

### Configuration

For the model-routing path, two environment variables are load-bearing:

| Variable | Default in `config.js` | Required in practice | Notes |
|---|---|---|---|
| `HERMES_PYTHON_PATH` | `python3` | **yes** | Absolute path to the Python interpreter **inside the Hermes Agent venv**. The wrapper imports `run_agent`, `hermes_cli.runtime_provider`, and `hermes_state`, which are only on the venv's `sys.path`. With the default `python3` you will get `ModuleNotFoundError`. Recommended value: `/usr/local/lib/hermes-agent/venv/bin/python` (matches the `run_chat.py` shebang on line 1). |
| `HERMES_API_URL` | `http://127.0.0.1:8642` | yes (legacy) | Still loaded by `config.js` for compatibility and used by the `/api/system/status` health probe, but the chat path no longer proxies to it. |

Optional tunables via environment when running outside systemd:

- `PYTHONUNBUFFERED=1` — already set by `routes/chat.js:470`, but set it in the shell too if you launch the Node process directly with stdout going to a pipe.
- `PYTHONIOENCODING=utf-8` — same as above; already set by the spawn env.

### Operational Notes

**Orphan processes.** `req.on('close')` (`routes/chat.js:516-522`) sends `SIGTERM`, waits 5 s, then `SIGKILL`. After every request, regardless of how it ended:

```bash
ps -ef | grep run_chat | grep -v grep
```

should be empty between requests. If a process lingers, the SIGTERM was swallowed (some Python code is non-interruptible); the SIGKILL escalation should clean it up within 5 s.

**Watchdog tuning.** 90 s is conservative — a cold `run_chat.py` start with the AIAgent import takes 10-20 s in normal conditions. If your environment is consistently slower than 90 s for the first byte, raise `FIRST_OUTPUT_TIMEOUT_MS` in `routes/chat.js:499`. If you see the watchdog firing on slow but valid model responses, the same line is where to look.

**Server-level systemd unit fixes (out of repo).** Two issues on BIG that are server-environment, not 1230UI code:

- **Dual systemd unit conflict.** A user-level `hermes-gateway.service` was racing with the system `hermes-api.service`; every 5 minutes the gateway signalled a reload, which caused `hermes-api` to restart and kill in-flight HTTP connections. Removed with `systemctl --user disable --now hermes-gateway.service`.
- **`TimeoutStopSec` too short.** `/etc/systemd/system/hermes-api.service` had `TimeoutStopSec=90s`, but the API server's `drain_timeout` is 120 s. On graceful stop, systemd SIGKILLed the process at 90 s while requests were still in flight. Bumped to `TimeoutStopSec=210s` (3.5× drain timeout).

These are tracked in [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) under "Gateway restarts every 5 minutes".

### Dual Database Architecture

Opening two handles to the Hermes DB is intentional:

```
db            readonly    — all SELECTs (sessions, messages, models)
hermesDbWrite WAL mode    — DELETE sessions only
uiDb          WAL mode    — all UI state (providers, assistants, cache, …)
```

Benefits: no interference with Hermes write transactions; Hermes upgrades never touch UI state; UI DB can be safely backed up independently.

If `uiDb` fails to open, `db` and `hermesDbWrite` are explicitly closed before `process.exit(1)` to leave WAL files clean.

### Security Middleware (`middleware/security.js`)

`sanitizeBody` recursively traverses the request body:
- Strings → sanitized via `xss` (no HTML tags, script/style bodies stripped)
- Arrays → each element processed recursively
- Objects → each value processed recursively
- Depth cap: `MAX_SANITIZE_DEPTH = 10` — prevents DoS via deeply-nested payloads

Rate-limit profiles (all use `express-rate-limit`):

| Profile | Limit | Window |
|---|---|---|
| `apiLimiter` | 100 req | 1 min |
| `chatLimiter` | 30 req | 1 min |
| `execLimiter` | 5 req | 5 min |
| `providerLimiter` | 10 req | 1 min |
| `likeLimiter` | 5 req | 1 hr (per IP) |

### Assistant Fork-on-Edit

Editing an assistant that already has sessions creates a fork (atomic SQLite transaction):
1. Existing row → `is_archived = 1` (existing sessions keep their reference)
2. New row inserted with updated fields
3. Session creation from this point uses the new ID

This preserves the "what assistant was this session started with" audit trail.

### Code Splitting

All pages lazy-loaded (`React.lazy` + `Suspense` + `PageSkeleton`). Approximate gzipped chunk sizes:

| Chunk | Size (gzip) |
|---|---|
| Dashboard | ~6 KB |
| NewSession | ~8 KB |
| Assistants | ~9 KB |
| AssistantEdit | ~9 KB |
| Providers | ~9 KB |
| Settings | ~22 KB |
| Sessions | ~20 KB (native scroll + SessionCard + useSwipe) |
| Chat | ~350 KB (highlight.js dominates) |
| TududiApp + views | ~30 KB (Tasks / Notes / Projects / TaskDetail) |

### Mobile Adaptation (v0.5.2+)

Three mechanisms handle the mobile experience:

1. **Tailwind responsive utilities** — `hidden md:flex` (sidebar), `p-3 sm:p-4 md:p-6` (padding), `flex-wrap` (chat header), `flex-col sm:flex-row` (bulk action bar). `MobileNav` is `md:hidden`.

2. **`useSwipe` hook** — native `touchstart/touchmove/touchend` listeners. 6 px movement threshold prevents misclassified taps. `data-swipe-ignore` attribute on nested buttons (pin, archive) lets them receive taps while a swipe gesture is being tracked.

3. **Safe-area insets** — `MobileNav` uses `pb-[env(safe-area-inset-bottom)]`; ChatPage input uses `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`.

Touch targets: `min-h-[44px] min-w-[44px]` on all interactive icon buttons (WCAG / Apple HIG minimum). Fluid font size: `clamp(14px, 0.5vw + 13px, 16px)`.

---

## Next Steps

- [API Documentation](API.md) — REST API reference
- [Configuration](CONFIGURATION.md) — environment variables reference
- [Workspace](WORKSPACE.md) — the `/sessions` shell, dual-mount, and deep-link resolution
- [Executor Adapters](EXECUTOR_ADAPTERS.md) — how to add a third chat backend
- [Tududi Integration](TUDUDI_INTEGRATION.md) — Tududi proxy + app developer notes
- [Web UI Guidelines](WEB-UI-GUIDELINES.md) — design tokens, i18n, mobile rules
- [Development Guide](DEVELOPMENT.md) — development setup and contribution guidelines
- [Troubleshooting](../TROUBLESHOOTING.md) — common bugs and how to diagnose them
- [Changelog](../CHANGELOG.md) — version history
