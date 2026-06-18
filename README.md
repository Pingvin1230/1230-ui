# 1230-UI — Hermes Web Interface

[![CI](https://github.com/Pingvin1230/1230-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/Pingvin1230/1230-ui/actions/workflows/ci.yml)

> **Status:** `v0.9.3` — **Workspace (multi-session / multi-executor)** (tabbed surface: Sessions / Hermes / OpenCode; each executor runs its own concurrently-active session; switching tabs/pages never interrupts an in-flight turn) · **OpenCode connector overhaul** (several data-loss/crash bugs fixed; inline tool-call support via `OPENCODE_AUTO_APPROVE_TOOLS`) · **Per-session streaming** (streams survive navigation; two concurrent streams coexist) · Multi-Executor Support (Hermes + OpenCode pluggable backends, per-assistant executor, Settings UI for OC config) · Tududi Application (tasks / notes / projects inside the right split-pane, server-side proxy, bearer token never reaches the browser) · Cloud Connect (WebDAV file picker + inline content expansion) · Model Routing Overhaul · Applications architecture · File Preview · File Manager · Mobile layout overhaul · Chat UX improvements · Session file indicators · Onboarding banner · Jargon-free UI terminology · File upload & agent file download · Assistants Phase 2 · Backend modularization · **Code-audit hardening pass** (security fixes, `ChatPage` refactor with message-list virtualization, global event bus → typed store actions, central error handling + SSE-aware logging, completed i18n across 4 locales, soft runtime response validation; 305 tests).

Modern web interface for managing sessions and interacting with [Hermes Agent](https://github.com/anthropics/hermes-agent) through a browser.

## Features

- **Dashboard** — quick chat, recent sessions, Hermes API status
- **Workspace (multi-session, multi-executor)** — the primary area is now a tabbed surface at `/sessions` (Sessions / Hermes / OpenCode) where each executor runs its own concurrently-active session. Both executor chats are mounted simultaneously, so a running stream in one survives switching to the other. Switching sessions, tabs, or pages never interrupts an in-flight turn. `/chat/:id` resolves the session's executor and opens the Workspace on the matching tab. See [docs/WORKSPACE.md](docs/WORKSPACE.md).
- **Session Management** — create, rename, pin, archive, delete, bulk actions, **swipe-to-delete** (mobile), **long-press to enter bulk mode** (mobile). The sessions list lives in the Workspace's Sessions tab; clicking a session opens it in its executor's tab.
- **Applications Pane** — split-pane on desktop (≥ 1024 px) with chat on the left and applications on the right, nested inside the Workspace (alongside the Sessions / executor tabs). Extensible plugin system: add new applications by registering a React component. Toggle pane visibility from the Workspace header. Hidden on mobile. Manage applications from Settings page (enable/disable, reorder). **Shipped apps:** File Preview, File Manager, Cloud Connect, **Tududi** (tasks / notes / projects).
- **Tududi Application** — read/write access to a self-hosted Tududi instance (default `https://todo.thinkout.ru`) inside the right split-pane. Three tabs: **Tasks** (grouped by project, status filter, due date, priority, project filter, recurring-task name fix), **Notes** (project filter chips, 2-column card grid, inline editor with live Markdown preview, auto-save 1 s, 10-colour picker, search + sort), **Projects** (card grid with progress bars and navigation to the filtered Tasks / Notes view). All requests go through the server-side proxy at `/api/tududi/*`; the bearer token is read from `TUDUDI_API_TOKEN` and never reaches the browser. Settings page (`/settings/tududi`) shows connection status, proxy URL, and upstream URL. See [docs/TUDUDI_INTEGRATION.md](docs/TUDUDI_INTEGRATION.md).
- **File Preview** — inline preview for all session files in the Applications pane. Supports images (png, jpg, gif, webp), code files (py, js, ts, jsx, tsx, sh, sql, xml, yml, yaml, css) with syntax highlighting, markdown, JSON, CSV (as table), HTML (sandboxed iframe), PDF. Click file in Navbar dropdown to open preview.
- **File Manager** — global file management across all sessions. View all files with disk usage stats, sort by name/date/size/expiration, filter by type (images, code, documents, expiring soon). Extend file lifetime to prevent auto-deletion. Delete files globally. Click file to navigate to session and open in File Preview.
- **File Retention Policy** — automatic cleanup of expired files. Configurable via `FILE_RETENTION_DAYS` environment variable (default 30 days). Files expire after N days from upload. Expired files deleted on startup and every hour. Extend individual files to keep them longer.
- **Real-time Chat** — streaming responses, markdown rendering, syntax highlighting, tool calls visualization
- **Per-session streaming** — stream ownership moved out of `ChatPage` into `chatInputStore` (module-level `AbortController` map + `liveMessages` slice). Navigating to another session, executor tab, or page (e.g. /settings) no longer aborts an in-flight turn. Two concurrent streams (one per executor) coexist; only the Stop button, turn completion, or a real browser disconnect ends a stream.
- **Multi-Executor Backends** — each assistant picks between **Hermes** (default, in-process Python) and **OpenCode** (separate `opencode serve` daemon, per-tool stream). Executor is locked for the session lifetime; live status dot in the top bar; full Settings → Executor Configuration panel with password encryption. Adding a third backend is a one-file change. See [docs/EXECUTOR_ADAPTERS.md](docs/EXECUTOR_ADAPTERS.md).
- **File Attachments** — attach files to a chat message via the paperclip button or by dragging them onto the chat area. Allowed: `.txt .md .py .js .ts .jsx .tsx .json .csv .yml .yaml .log .html .css .xml .sh .sql .pdf .png .jpg .jpeg .gif .webp`. Limits: 50 MB per file, 5 files per message. Files live in `data/uploads/<session_id>/` and are cleaned up automatically when the session is deleted.
- **Agent File Download** — when the agent creates or writes a file and mentions its absolute path in the response (e.g. `` `/tmp/report.md` ``), a download card appears directly inside the assistant message with the filename, size, and a Download button. Multiple files from one message are grouped in a collapsible container. Download cards persist across page reloads. If the file is deleted from disk, the endpoint returns `404` with a clear message.
- **Model Management** — enable/disable models, select default model
- **Provider Keys** — manage API keys for all bundled `api_key` providers from the UI (no terminal needed)
- **System Commands** — execute `hermes update` and `hermes doctor --fix`
- **Hermes API Status** — header indicator (green/red/gray) with live polling every 60s
- **Assistants** — named bundles (name, color, icon, model, style, depth, system prompt, executor) that show up as tiles on the New Session page. Create / edit / archive / duplicate / restore from `/assistants`. Tile grid (1/2/3 cols), context menu (MoreVertical), tab filters with counts. Style badges (💬 Friendly · 📋 Formal · ✂️ Concise · 🎨 Creative) and depth indicators (●○○ Quick · ●●○ Standard · ●●● Thorough) on tiles. System prompt (≤ 4000 chars) injected into every chat turn. Editing a bundle that already has sessions **forks** it (the old version is archived; existing sessions keep the original reference). Duplicating opens the editor prefilled with the source — nothing is written until you click "Create copy"
- **Keyboard Shortcuts** — Ctrl+K (search), Ctrl+N (new session), Ctrl+Enter (send)
- **Browser Notifications** — alerts for new messages (toggle in sidebar)
- **Dark/Light Themes** — with saved preference (toggle in sidebar)
- **Internationalization** — 4 languages (English, Русский, Español, Deutsch) with auto-detection
- **Mobile-First UX** — 44 × 44 px touch targets, fluid `clamp(14px → 16px)` typography, iOS safe-area insets, icon-only header buttons on `< md`, `flex-wrap` confirm/header rows, no horizontal scroll at 360 px
- **Security** — rate limiting, XSS protection, CORS, security headers, rate-limited provider-key writes

## Architecture

1230UI is a thin Node.js front-end that brokers a chat conversation with [Hermes Agent](https://github.com/anthropics/hermes-agent) by spawning a short-lived Python subprocess (`run_chat.py`) per user message. This is not an HTTP proxy to Hermes — the wrapper constructs an `AIAgent` directly with the exact model/provider the user picked in the UI.

```
   Browser
   │  POST /api/chat  (SSE out)
   ▼
   ┌────────────────────────────────────────────────────────┐
   │  Node.js 1230UI  (Express 5, better-sqlite3)           │
   │  routes/chat.js  ──►  child_process.spawn('python')     │
   │                                  │                      │
   │                                  ▼  NDJSON on stdout    │
   │  ◄── SSE to browser (translates events) ──             │
   └────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌────────────────────────────────────────────────────────┐
   │  Python: run_chat.py  (inside Hermes Agent venv)       │
   │  resolve_runtime_provider(model, provider)              │
   │         │                                              │
   │         ▼                                              │
   │  AIAgent(model=model, provider=provider,               │
   │          base_url=..., api_key=..., session_id=...)    │
   │         │                                              │
   │         ▼  yields delta / reasoning / tool events      │
   │  emit NDJSON line per event                             │
   └────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌────────────────────────────────────────────────────────┐
   │  LLM provider (OpenAI-compatible)                      │
   └────────────────────────────────────────────────────────┘
```

**Why this exists.** Hermes's `api_server` (`gateway/platforms/api_server.py`) resolves its model via `_resolve_gateway_model()` and ignores the per-request model sent by 1230UI. The UI could display "MiniMax-M3" while the LLM answered as whatever was in `config.yaml.model.default`. By spawning `AIAgent(...)` directly we bypass that path entirely.

**Request lifecycle.**

1. Browser sends `POST /api/chat` with `{messages, session_id, model, stream: true}`.
2. `routes/chat.js:343` validates the request, registers an in-flight dedup key (`routes/chat.js:387-406`), then `spawn(HERMES_PYTHON, ['-u', 'run_chat.py', '--model', m, '--provider', p, ...])` (`routes/chat.js:451-471`). The body is sent on stdin as a JSON blob (`{message, history, provider, model, session_id}`).
3. `run_chat.py` resolves the runtime provider, opens the AIAgent with explicit kwargs, and streams NDJSON events back.
4. The Node side reads the pipe line by line, translates each event to an SSE `data: {…}\n\n` frame, and forwards to the browser. `delta` events accumulate text in the chat UI; `tool_start`/`tool_complete` drive the tool-call sidebar; `done` carries `final_response` + `usage`; the `data: [DONE]\n\n` sentinel closes the stream cleanly.
5. On browser disconnect: `req.on('close')` sends SIGTERM, waits 5 s, then SIGKILL. No orphan Python processes.

**Model selection mechanism.** The frontend sends `model: <modelId>` in the request body. The backend calls `getProviderFromModel(model)` (`db/helpers.js:79-93`), which does a `JOIN models m ON providers p` to resolve the provider slug (`minimax`, `opencode-go`, …). That slug is what the Python side passes to `resolve_runtime_provider(requested=provider, target_model=model)`, which is the same function Hermes's own `api_server` calls — but with the explicit `target_model`, the credential lookup keys on the user-selected model, not `config.yaml.default`.

**Operational characteristics.** Subprocess lifetime ≤ 10 min (hard ceiling, `routes/chat.js:506`); 90 s no-output watchdog kills stalled children (`routes/chat.js:499`); in-flight dedup map (`routes/chat.js:322`) prevents duplicate requests within 30 s. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the bug-by-bug writeup that motivated the redesign.

### OpenCode executor (second runtime, opt-in per assistant)

1230UI supports a **second chat executor** alongside Hermes: [OpenCode](https://opencode.ai) running as a separate `opencode serve` daemon. Each assistant carries an `executor` column (`'hermes' | 'opencode-1230'`, default `'hermes'`); the executor is **locked for the session's lifetime** (fork-on-edit preserves the binding).

```
   Browser
   │  POST /api/chat
   ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  Node.js 1230UI — routes/chat.js (the dispatcher / core)        │
   │  ┌──────────────────────────┐   ┌──────────────────────────┐     │
   │  │  ADAPTERS['hermes']      │   │  ADAPTERS['opencode-1230']│    │
   │  │  HermesAdapter           │   │  OpenCodeAdapter         │     │
   │  │  (lib/adapters/hermes.js)│   │  (lib/adapters/opencode.js)│   │
   │  │  spawn run_chat.py +     │   │  HTTP + SSE to           │     │
   │  │  NDJSON on stdio         │   │  opencode serve:4097     │     │
   │  └──────────┬───────────────┘   └──────────┬───────────────┘     │
   │             │                              │                     │
   │  Owns: SSE headers, 90s/10min watchdog,    │                     │
   │  INFLIGHT dedup, persistHermesMessage,     │                     │
   │  detectAgentFiles, [DONE] sentinel         │                     │
   └─────────────┼──────────────────────────────┼─────────────────────┘
                 │                              │
                 ▼                              ▼
   ┌──────────────────────┐      ┌──────────────────────────────┐
   │ Python: run_chat.py  │      │ opencode serve (Go binary)   │
   │ (Hermes Agent venv)  │      │ 127.0.0.1:4097               │
   │ AIAgent(model=...)   │      │ POST /session                │
   │ NDJSON on stdout     │      │ POST /session/:id/prompt_async│
   └──────────────────────┘      │ GET  /event (SSE)            │
                                  │ PATCH /session/:id  (v0.9.3) │
                                 └──────────────────────────────┘
```

The dispatcher (`routes/chat.js`) resolves the executor from `session_meta.assistant_id → assistants.executor` and does a single `for await (const evt of adapter.chat(ctx)) writeSse(evt)` loop — adapters are pure event generators and never touch `req`/`res`, the INFLIGHT map, or persistence. Adding a third executor is a one-file change — see [docs/EXECUTOR_ADAPTERS.md](docs/EXECUTOR_ADAPTERS.md) for the step-by-step guide.

**Configuration** lives in Settings → Executor Configuration (URL, username, password; password is AES-256-GCM encrypted at rest, with the same `CLOUD_CONNECT_KEY` used for Cloud Connect). The OpenCode daemon itself runs as a systemd service — see [docs/INSTALLATION.md §OpenCode](docs/INSTALLATION.md#opencode-executor-optional) for the install steps and [docs/EXECUTOR_ADAPTERS.md](docs/EXECUTOR_ADAPTERS.md) for the dispatcher contract.

**Status indicator.** A small dot in the top bar (next to the existing Hermes indicator) shows live OpenCode health; grey when the daemon is unreachable, green when ready, red on the last failed probe. The polling hook (`src/hooks/useOpenCodeStatusPoll.ts`) hits `GET /api/system/executors` every 60 s.

### Workspace (multi-session / multi-executor)

The primary area is a **Workspace**: a tabbed surface at `/sessions` with three tabs — **Sessions** (the sessions list), **Hermes**, and **OpenCode** (one chat tab per executor). `ChatPage` is **dual-mounted** so both executor chats live simultaneously; a running stream in one executor survives switching to the other tab. `/chat/:id` resolves the session's executor (`src/components/ChatRouteResolver.tsx`) and opens the Workspace on the matching tab, so deep links and the mobile nav keep working.

```
   /sessions                    /chat/:id
       │                           │
       ▼                           ▼
   ┌───────────────────────────────────────────────┐
   │  Workspace  (src/components/Workspace.tsx)     │
   │  ┌────────┬────────┬────────────┐             │
   │  │Sessions│ Hermes │ OpenCode   │  ← tabs     │
   │  └────────┴────────┴────────────┘             │
   │  workspaceStore: activeTab +                  │
   │    activeSessionByExecutor (localStorage)     │
   └───────┬───────────────────┬───────────────────┘
           │                   │
           ▼                   ▼
   sessions list      ChatPage (dual-mounted)
                      │
                      ▼
   chatInputStore (per-session stream store)
     • startStream / stopStream
     • module-level streamControllers: Map<session, AbortController>
     • liveMessages slice (pendingUserContent, agentFiles)
```

Stream ownership lives in `chatInputStore` (`src/store/chatInputStore.ts`), not in `ChatPage` — `ChatPage` is now a subscriber/renderer. Because the `AbortController` is held at module level keyed by session, navigation never aborts an in-flight turn; two concurrent streams (one per executor) coexist, and only the Stop button, turn completion, or a real browser disconnect ends a stream. Per-executor toolbars (`src/components/ExecutorToolbar.tsx`) show the last 3 sessions of that executor as quick-switch pills; executor status dots (`src/components/ExecutorStatusDot.tsx`) live in the tab header; and session controls (assistant/model badges, session files, applications-pane toggle, delete-session) moved from the Navbar into the Workspace header (`src/components/WorkspaceSessionControls.tsx`), shown only when an executor tab has an active session. See [docs/WORKSPACE.md](docs/WORKSPACE.md) for the full design.

### Tududi Application (third-party task / notes manager)

1230UI ships with a **Tududi** application that lives in the right split-pane and proxies a self-hosted Tududi instance through the 1230-UI backend. The browser never holds the bearer token.

```
   Browser  (1230-UI tab)
   │
   │  fetch('/api/tududi/tasks')         (no Authorization header)
   ▼
   Node.js 1230-UI  (Express 5)
   │  routes/tududi.js
   │  • strips hop-by-hop, set-cookie, content-encoding, authorization
   │  • adds Authorization: Bearer <TUDUDI_API_TOKEN>  (read from .env)
   │  • 15 s AbortController timeout
   │  • generic method/body/header pass-through
   ▼
   Tududi  (https://todo.thinkout.ru)
   │  /api/tasks, /api/notes, /api/projects, /api/tags, …
   └  returns JSON → proxied back verbatim
```

The `GET /api/tududi/health` endpoint probes `/api/profile` (5 s timeout) and returns `{ configured, reachable, status }` — the **only** call a curious user needs to verify the wiring. If `TUDUDI_API_TOKEN` is unset, the proxy returns `503 tududi_not_configured` and the app shows a red status dot in the Tududi tab header.

The frontend (`src/applications/tududi/`) covers three tabs — **Tasks** (project filter, status filter, due date / priority, TaskDetail with status control / subtasks / tags), **Notes** (project chips, card grid, inline Markdown editor with 1 s auto-save, colour picker, search + sort), **Projects** (cards with progress bars, navigation to the filtered Tasks / Notes view). Recurring-task names are displayed via `displayName(task)` because Tududi's API returns `"Monthly"` / `"Daily"` on instances and stores the real title in `original_name`. See [docs/TUDUDI_INTEGRATION.md](docs/TUDUDI_INTEGRATION.md) for the full proxy contract, observed Tududi API quirks (singular vs plural paths, `parent_task_id` numeric only, bare objects on write, `due_date` is `YYYY-MM-DD`), and remaining work.

## Configuration

1230UI is configured via `.env` (see `.env.example` for the full list, validated by Zod at startup in `config.js`). The variables that matter for the model-routing path:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `HERMES_PYTHON_PATH` | yes (in practice) | `python3` | Absolute path to the Python interpreter **inside the Hermes Agent venv**. The new `run_chat.py` wrapper imports `run_agent`, `hermes_cli.runtime_provider`, and `hermes_state` — these are only on the venv's `sys.path`, so system `python3` will fail with `ModuleNotFoundError`. Set this to `/usr/local/lib/hermes-agent/venv/bin/python` (or wherever the venv lives in your install). |
| `HERMES_API_URL` | yes (legacy) | `http://127.0.0.1:8642` | URL of the Hermes `api_server`. The chat path no longer uses it (the Python wrapper is invoked directly), but it is still loaded by `config.js` for compatibility and is used by the `/api/system/status` health probe. |
| `OPENCODE_URL` | optional | `http://127.0.0.1:4097` | URL of the `opencode serve` daemon. Can be overridden from `/settings/executors/opencode` at runtime (encrypted password at rest). |
| `TUDUDI_API_URL` | optional | `https://todo.thinkout.ru` | Base URL of the Tududi instance. The Tududi app tab stays hidden behind the red status dot when `TUDUDI_API_TOKEN` is not set. |
| `TUDUDI_API_TOKEN` | optional | _(unset)_ | Bearer token for the Tududi proxy. The `tt_…` token never leaves the server. |

All other variables are listed in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Screenshots

<p align="center">
  <img src="screenshots/1230UI Home light.png" alt="Home" width="640"/>
  <br/>
  <img src="screenshots/1230UI Session light.png" alt="Session chat with split-pane workspace" width="640"/>
  <br/>
  <img src="screenshots/1230UI Session File Preview light.png" alt="File Preview application" width="640"/>
  <br/>
  <img src="screenshots/1230UI Session File Manager light.png" alt="File Manager application" width="640"/>
</p>

<p align="center">
  <em>Home with Quick Chat, Session chat with split-pane workspace (chat + applications), File Preview (inline preview for images, code, markdown, PDF, CSV, HTML), and File Manager (global file management with retention policy). The same pane also hosts Cloud Connect and Tududi (Tasks / Notes / Projects).</em>
</p>

## Quick Start

```bash
# Clone repository
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui

# Run installation script
./install.sh
```

Or manually:
```bash
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui
npm install
cp .env.example .env
# Edit .env with your settings
npm run build
node server.js
```

Application will be available on port 3001.

## Documentation

- [Installation Guide](docs/INSTALLATION.md) — detailed installation and deployment
- [Configuration](docs/CONFIGURATION.md) — environment variables reference
- [Architecture](docs/ARCHITECTURE.md) — system design and tech stack
- [API Documentation](docs/API.md) — REST API reference
- [Executor Adapters](docs/EXECUTOR_ADAPTERS.md) — how to add a third chat backend
- [Workspace architecture](docs/WORKSPACE.md) — multi-session / multi-executor Workspace, dual-mount, per-session streaming
- [Tududi Integration](docs/TUDUDI_INTEGRATION.md) — Tududi proxy + app developer notes
- [Web UI Guidelines](docs/WEB-UI-GUIDELINES.md) — design tokens, i18n, mobile rules
- [Development Guide](docs/DEVELOPMENT.md) — local development setup
- [Troubleshooting](TROUBLESHOOTING.md) — common bugs and how to diagnose them
- [Contributing](CONTRIBUTING.md) — contribution guidelines
- [Changelog](CHANGELOG.md) — version history

## Tech Stack

**Frontend:** React 19, TypeScript 6, Vite 8, Tailwind CSS v4, Zustand, React Router v7

**Backend:** Node.js, Express 5, better-sqlite3, multer

**Testing:** Vitest — `npm test` (305 tests)

**CI/CD:** GitHub Actions — lint + typecheck + test + build on every push/PR

**Infrastructure:** PM2, Nginx, Authelia, Let's Encrypt

## Requirements

- Node.js 22+ (18+ minimum)
- Python 3.x
- Hermes Agent (installed and configured)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk.
