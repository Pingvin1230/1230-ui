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
│  │  Zustand stores │ React Router v7 │ Tailwind v4 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↕ HTTP/REST + SSE
┌─────────────────────────────────────────────────────────┐
│          Node.js Backend (Express 5, ESM)                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/sessions │ /api/chat (SSE) │ /api/models   │  │
│  │  /api/assistants │ /api/providers │ /api/system  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌────────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │  Hermes DB     │ │   UI DB      │ │  Python      │  │
│  │  (read-only +  │ │  (read-write)│ │  scripts     │  │
│  │  delete)       │ │              │ │              │  │
│  └────────────────┘ └──────────────┘ └──────────────┘  │
│  middleware/security.ts — rate limiting + XSS (recursive)│
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│              Hermes Agent (CLI)                          │
│  ~/.hermes/state.db │ ~/.hermes/.env │ hermes commands  │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS v4 — design-token-based styling
- Zustand 5 — state management (8 persisted stores)
- React Router v7 — client-side routing
- Lucide React — icons
- react-markdown + remark-gfm + rehype-highlight — markdown rendering
- highlight.js — code syntax highlighting
- react-virtuoso — virtualised session list

### Backend
- Node.js (ESM) + Express 5 — REST API + SSE streaming
- better-sqlite3 — synchronous SQLite (two separate DB files)
- xss — recursive input sanitization (see `middleware/security.ts`)
- helmet — security headers (CSP, HSTS, X-Frame-Options, …)
- express-rate-limit — five rate-limit profiles

### Testing
- Vitest 4 — unit test runner (`npm test`)
- 22 tests across 2 files: `tests/security.test.js`, `src/lib/time.test.ts`

### CI/CD
- GitHub Actions — `.github/workflows/ci.yml`
- Pipeline: **Lint → Typecheck → Test → Build** on every push/PR to `main`

### Infrastructure
- PM2 — process manager (`ecosystem.config.json`)
- Nginx — reverse proxy
- Authelia — SSO / authentication
- Let's Encrypt — HTTPS certificates

### External Dependencies
- Hermes Agent — AI agent (CLI)
- Python 3.x — for Hermes DB operations and provider key management
- geoip-lite — **optional** (~30 MB MaxMind data); used only for the `/api/like` country field; server starts fine without it

---

## Components

### Frontend Pages (all lazy-loaded via `React.lazy`)

| Page | Route | Description |
|---|---|---|
| `DashboardPage` | `/` | Time-based greeting, Quick Chat (pill model picker + fixed Send), Assistants quick-start grid (up to 3 tiles), Recent Sessions with preview |
| `SessionsPage` | `/sessions` | Virtualised list, search, date groups with `<hr>` separators, bulk actions; Refresh button removed |
| `ChatPage` | `/chat/:id` | Streaming chat, markdown, tool calls, avatars |
| `NewSessionPage` | `/new` | Assistant tiles + standard model tile |
| `SettingsPage` | `/settings` | Models, system commands, Hermes status, About |
| `ProvidersPage` | `/settings/providers` | API key management (add / remove per provider) |
| `AssistantsPage` | `/assistants` | Tile grid, tab filters (Active/Archived + counts), context menus |
| `AssistantEditPage` | `/assistants/:id`, `/assistants/new` | Create/edit with sticky action bar; clone mode via `?from=<id>` |

### Frontend Components (selected)

| Component | Description |
|---|---|
| `HermesStatusIndicator` | Header icon (green/red/gray) + localized tooltip with running version |
| `SessionCard` | 3-row layout: title / preview / meta+actions. Checkbox column always in DOM (right side, `opacity-0`→`opacity-100` in bulk mode, zero layout shift). Swipe-to-delete, long-press bulk. |
| `AssistantManageTile` | Context menu via `createPortal`, colored border, archived treatment |
| `AssistantTile` | Clickable tile on `/new`, model label, hover "Create" indicator |
| `ToolCall` | Collapsible block showing tool name, input, output, timing |
| `AgentFileCard` | Download card inside assistant messages; filename + size + Download button; `404`-safe |
| `AgentFileGroup` | Groups multiple `AgentFileCard`s from one message in a collapsible container |
| `Modal` | Focus-trapped modal; used for confirm dialogs and command output |
| `Toast` | Queued notifications with auto-dismiss |
| `MobileNav` | Bottom nav (4 routes); iOS safe-area aware |

### Frontend State (Zustand stores, all persisted)

| Store | Key | Contents |
|---|---|---|
| `themeStore` | `hermes-theme` | `isDarkMode` |
| `notificationsStore` | `hermes-notifications` | `enabled` |
| `sidebarStore` | `hermes-sidebar` | `isOpen` |
| `sessionsSortStore` | `hermes-sessions-sort` | `sortMode: 'created' \| 'lastMessage'` |
| `searchStore` | _(session, URL-synced)_ | `query` |
| `hermesStatusStore` | `hermes-status` | status, version, latestVersion, updateAvailable, lastChecked |
| `assistantsStore` | _(session)_ | assistants list, fetch / upsert / remove |

### Hooks

| Hook | Description |
|---|---|
| `useKeyboardShortcuts` | Ctrl+K (search), Ctrl+N (new session), Ctrl+Enter (send) |
| `useNotifications` | Browser Notification API + Badge API |
| `useToast` | Toast queue (show / dismiss) |
| `useHermesStatusPoll` | Polls `/api/system/status` every 60 s with 5-min staleness guard |
| `useSwipe` | Native `touchstart/touchmove/touchend`: `onSwipeLeft`, `onSwipeRight`, `onLongPress`; `data-swipe-ignore` opt-out for nested buttons |

### Backend

The backend is split into focused modules (v0.8.0):

| File | Lines | Responsibility |
|---|---|---|
| `server.js` | 39 | Entry point: open DBs → migrate → seed → listen |
| `app.js` | 87 | Express instance, middleware stack, route mounting |
| `db/connections.js` | 81 | Open `db` / `hermesDbWrite` / `uiDb`; export `closeAll()` |
| `db/migrate.js` | 109 | `initSchema()`: `CREATE TABLE IF NOT EXISTS` + idempotent `ALTER TABLE` migrations |
| `db/seed.js` | 60 | `seedStarterAssistants()`: seeds 2-3 assistants on first run |
| `db/helpers.js` | 62 | Shared pure helpers: `rowToAssistant`, `getDefaultModelId`, `getProviderFromModel` |
| `db/fileTypes.js` | 55 | Shared MIME map, `ALLOWED_EXTENSIONS`, `getMimeTypeForPath`, `hasAllowedExtension` — single source of truth used by `routes/files.js` and `routes/chat.js` |
| `routes/system.js` | 166 | `/api/system/status`, `/api/system/exec`, `/api/health` |
| `routes/sessions.js` | 500 | Full session CRUD + messages (`/api/sessions/*`, `/api/messages`); attaches `agentFiles` to messages on load |
| `routes/chat.js` | 240 | SSE streaming chat (`POST /api/chat`); detects agent-written files after stream ends |
| `routes/files.js` | 360 | File upload / list / delete / download (`/api/sessions/:id/files/*`); multer, whitelist, disk cleanup |
| `routes/models.js` | 148 | `/api/models/*` (list, providers, sync, toggle) |
| `routes/assistants.js` | 235 | `/api/assistants/*` CRUD + fork-on-edit + archive/restore/duplicate |
| `routes/providers.js` | 154 | `/api/providers/*` (list, set key, remove key) |
| `routes/likes.js` | 100 | `POST /api/like` (cooldown, geoip, Mattermost webhook) |

- **`middleware/security.ts`** — TypeScript source for all security middleware; compiled to `security.js` for runtime

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
| `session_meta` | Pin/archive flags + `assistant_id` FK per session |
| `assistants` | Named bundles (name, color, icon, model_id, is_archived, …) |
| `session_files` | User-uploaded (`source='user'`) and agent-created (`source='agent'`) file records. `stored_name` = UUID filename on disk (user uploads) or absolute agent-written path (agent files). Cleaned up on session delete. |

Schema migrations are idempotent: `PRAGMA table_info` checked before each `ALTER TABLE`.

### Python Scripts

| Script | Purpose |
|---|---|
| `save_messages.py` | Save messages to Hermes DB |
| `sync_providers.py` | Sync providers/models from Hermes → UI DB |
| `list_bundled_providers.py` | Enumerate `api_key` providers with metadata; check which env vars are set |
| `manage_provider_key.py` | Atomic set/remove of a key in `~/.hermes/.env` via `save_env_value()` |

### Backend Endpoints

**Sessions**
- `GET /api/sessions` — list (paginated, sort, include_archived)
- `GET /api/sessions/:id` — single session (includes linked `assistant` object)
- `GET /api/sessions/:id/messages` — messages; each assistant message includes `agentFiles` array reconstructed from `session_files` by path-matching
- `POST /api/sessions` — create (accepts optional `assistantId`)
- `PATCH /api/sessions/:id/title` — rename
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
- `POST /api/chat` — streaming SSE chat; after stream ends, detects agent-created files and emits `agent_files` SSE event
- `POST /api/messages` — persist message to Hermes DB

**Models**
- `GET /api/models` — enabled models with default
- `GET /api/models/providers` — all providers with models
- `POST /api/models/sync` — sync from Hermes
- `PATCH /api/models/models/:id/toggle` — enable/disable

**Assistants**
- `GET /api/assistants[?include_archived=0|1]` — list
- `GET /api/assistants/:id` — single
- `POST /api/assistants` — create
- `PATCH /api/assistants/:id` — update (fork-on-edit if sessions exist)
- `POST /api/assistants/:id/archive` — archive
- `POST /api/assistants/:id/restore` — restore archived
- `POST /api/assistants/:id/duplicate` — duplicate

**Providers**
- `GET /api/providers/available[?configured=0|1]` — list bundled `api_key` providers
- `POST /api/providers/:name/key` — set key (rate-limited 10/min)
- `DELETE /api/providers/:name/key?env_var=…` — remove key

**System**
- `GET /api/health` — liveness probe
- `GET /api/system/status` — Hermes version (async `execFile`), provider list, stats
- `POST /api/system/exec` — run `hermes update` or `hermes doctor --fix`
- `POST /api/like` — Mattermost webhook like (rate-limited + DB cooldown)

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

### Streaming Chat (SSE)

```
Frontend → POST /api/chat
              ↓
         Backend proxies to Hermes API
              ↓
         Hermes returns SSE stream
         (status events: thinking → executing_tool → generating)
              ↓
          Backend forwards chunks + parses tool-call events
               ↓
          Frontend accumulates text, updates ToolCall blocks in real time
               ↓
          On completion → POST /api/messages to persist
               ↓
          Backend scans response text for backtick-wrapped absolute paths
          → fs.statSync each candidate → surviving files inserted into session_files (source='agent')
               ↓
          Backend emits SSE event: {"type":"agent_files","files":[…]}
               ↓
          Frontend receives event (after [DONE], before stream close)
          → attaches AgentFileCard(s) to the assistant message
```

### Dual Database Architecture

Opening two handles to the Hermes DB is intentional:

```
db            readonly    — all SELECTs (sessions, messages, models)
hermesDbWrite WAL mode    — DELETE sessions only
uiDb          WAL mode    — all UI state (providers, assistants, cache, …)
```

Benefits: no interference with Hermes write transactions; Hermes upgrades never touch UI state; UI DB can be safely backed up independently.

If `uiDb` fails to open, `db` and `hermesDbWrite` are explicitly closed before `process.exit(1)` to leave WAL files clean.

### Security Middleware (`middleware/security.ts`)

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
| Sessions | ~80 KB (react-virtuoso + SessionCard + useSwipe) |
| Chat | ~350 KB (highlight.js dominates) |

### Mobile Adaptation (v0.5.2+)

Three mechanisms handle the mobile experience:

1. **Tailwind responsive utilities** — `hidden md:flex` (sidebar), `p-3 sm:p-4 md:p-6` (padding), `flex-wrap` (chat header), `flex-col sm:flex-row` (bulk action bar). `MobileNav` is `md:hidden`.

2. **`useSwipe` hook** — native `touchstart/touchmove/touchend` listeners. 6 px movement threshold prevents misclassified taps. `data-swipe-ignore` attribute on nested buttons (pin, archive) lets them receive taps while a swipe gesture is being tracked.

3. **Safe-area insets** — `MobileNav` uses `pb-[env(safe-area-inset-bottom)]`; ChatPage input uses `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`.

Touch targets: `min-h-[44px] min-w-[44px]` on all interactive icon buttons (WCAG / Apple HIG minimum). Fluid font size: `clamp(14px, 0.5vw + 13px, 16px)`.

---

## Next Steps

- [API Documentation](API.md) — REST API reference
- [Development Guide](DEVELOPMENT.md) — development setup and contribution guidelines
- [Changelog](../CHANGELOG.md) — version history
