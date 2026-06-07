# 1230-UI — Tasks and Progress

**Last updated:** 2026-06-07
**Current version:** 0.5.0
**Release target:** v1.0.0 — friendly web interface for non-technical Hermes Agent users

---

## 🎯 Release v1.0.0 — Goal

A polished, self-contained web interface around [Hermes Agent](https://github.com/anthropics/hermes-agent) that a **non-technical user** can install, log into, and use productively without touching a terminal:

- One-command install (`./install.sh` already done in v0.5.0)
- Zero-config defaults that "just work" after the install script
- Friendly UX for the common workflow: **create a session → chat with a model → attach files → read the answer with previews → come back tomorrow**
- No jargon in the UI: no "API key", no "model id", no "tool call" — describe what the user is doing, not the plumbing
- Mobile-friendly: works the same on a phone as on a desktop

Everything in **🚨 Необходимые для релиза v1.0.0** must be done before tagging v1.0.0. Everything in **🔮 Для дальнейшего развития** is explicitly deferred to a later release.

---

## 🚨 Необходимые для релиза v1.0.0

Tasks that must ship with v1.0.0. Ordered roughly by user-impact priority within each group.

### User-facing features (UX-critical for non-tech users)

#### 📋 19. Mobile Adaptation (improvements)
**Role:** Frontend
**Files:** `src/components/MobileNav.tsx`, `src/pages/ChatPage.tsx`, `src/pages/SessionsPage.tsx`, `src/components/Sidebar.tsx`, `src/index.css`
**Description:** Polish the mobile experience so that a non-technical user on a phone has the same workflow as on a desktop.

**Tasks:**
- [ ] Touch-friendly button sizes (min 44×44 px hit targets)
- [ ] Responsive typography (fluid scaling, no horizontal scroll)
- [ ] Swipe gesture to delete a session in Sessions list
- [ ] Verify all pages at 360 px, 768 px, 1024 px breakpoints
- [ ] No overlapping elements in mobile bottom-nav / sidebar combo

**Priority:** HIGH (promoted from P2 — non-tech users are on mobile)
**Complexity:** Medium
**Dependencies:** None

---

#### 📋 23. File Upload to Session
**Role:** Fullstack
**Status:** 📋 Backlog (P2) — promoted to v1.0.0

**Problem:**
- Users have no way to give the agent a file as context — they can only paste text
- Real workflows (log analysis, code review, document Q&A, data exploration) all require file input
- Hermes Agent accepts file paths in its CLI, but the Web UI has no path to feed them

**Functions needed:**

**Upload UX:**
- Attach files alongside the chat message (drag-and-drop, file picker, paste from clipboard)
- Show "attached files" chips above the input with name, size, type icon, and a remove button
- Per-file upload progress (or batch progress for many small files)
- Reorder / re-attach / detach before sending

**Storage & lifecycle:**
- Decide where files physically live: temp dir per session, persistent per-user, or in UI DB (BLOB)
- Define a retention policy: until session is deleted / N days after last activity / explicit "purge" button / never
- Decide how uploaded files are passed to Hermes: written to a known path, sent via multipart, base64 inlined, or returned as a URL Hermes fetches
- Handle duplicate uploads (same hash) — dedup, re-use reference, or always store a new copy
- When a session is deleted, automatically clean up its files (orphan files are a leak)
- Decide whether files persist across sessions for the same model/task, or are strictly per-session

**Validation & limits:**
- Extension whitelist (`.txt .md .py .json .csv .pdf .png .jpg …`) and blacklist (`.exe .so …`)
- Per-file size cap and per-message aggregate cap
- Server-side MIME sniffing (don't trust the browser)
- Optional virus / malware scan before the file is exposed to the agent
- Quota per user / per server (disk fills up fast)

**Re-use during a session:**
- Once uploaded, the user should be able to refer to a file by name in later messages
- Should the user see a "files in this session" list anywhere? (Sidebar, tab, modal?)

**UX questions (open):**
- Where does the upload UI live: inside the chat input area, a separate "Files" panel in the session, or both?
- Can the user attach files *before* typing a message, or only at send time?
- Image attachments: show an inline thumbnail preview, or just a type-icon chip?
- Pasted images (clipboard) — auto-attach with a "Send" button, or show preview first?
- Where are size limits and allowed types surfaced? (Settings? Inline warning? Help tooltip?)
- What happens when a file fails to upload halfway through a batch — retry the failed ones, or restart the whole batch?
- Should the user be able to rename a file in the UI before it goes to the agent?
- How does the user know which file the agent is currently reading? (Real-time indicator? File reference in the message?)
- After upload, are file chips dismissable, or do they "belong" to the message until sent?
- For multi-file uploads, ordering matters — drag-to-reorder or fixed order?
- Should the user be able to set a file-level annotation / note ("use this as the spec", "ignore the boilerplate")?

**Priority:** HIGH (blocks main use cases for non-tech users)
**Complexity:** High (storage, lifecycle, security, UX)
**Dependencies:** Hermes Agent CLI file-acceptance contract; filesystem layout decision

---

#### 📋 24. File Extraction & Preview from Agent Response
**Role:** Fullstack
**Status:** 📋 Backlog (P2) — promoted to v1.0.0

**Problem:**
- The agent can produce files (writes code, generates reports, saves data, exports artifacts) but the Web UI only shows them as plain text mentions like "I saved it to /tmp/report.md"
- The user has to leave the UI, open a terminal, find the file, and view it — friction kills the workflow
- No way to preview, download, or re-use generated files from inside the conversation

**Functions needed:**

**Detection:**
- Backend needs to capture files the agent wrote/created during the turn
- Two detection strategies (must pick one or combine): (a) parse agent output for explicit file references / paths, (b) watch a designated output directory and diff before/after
- Files must be linked back to the specific assistant message that produced them

**Inline preview in chat:**
- Render a file "card" inside the assistant message (similar to existing ToolCall blocks): file name, type icon, size, "Open" / "Download" / "Copy path"
- For text-like files (`.md .txt .py .json .csv .yml .log .html .css .js .ts …`): show an inline preview with syntax highlighting (we already have highlight.js)
- For Markdown: render as Markdown, not as raw text
- For JSON: pretty-print with collapsible nodes
- For images (`.png .jpg .gif .webp .svg`): show a thumbnail, click to expand in a lightbox
- For PDFs: render in an `<iframe>` or download-only?
- For binary / unknown: no preview, just a "Download" button
- Configurable preview line limit (e.g., first 200 lines, then "Show all")
- Files should be **collapsible** by default (don't blow up the message length) with a clean expand animation

**Download & export:**
- Always-available "Download" button on every file card
- Bulk download (multiple files → zip)
- "Open in new tab" for files the browser can render natively

**Cross-session & re-use:**
- A "Files" tab in the session sidebar listing all files generated in this session
- A global "Files" view (under a top-level menu? or a tab in Sessions?) listing all files across all sessions
- Search across files (by name, by content, by session)
- "Send this file back to the agent" — re-attach a generated file to a new message (combines with Task #23)

**Visual treatment:**
- Distinguish "Generated by agent" files from "User-uploaded" files (different badge, color, or icon)
- Group multiple files from one message into a single collapsible container

**UX questions (open):**
- Should previews be auto-expanded or collapsed by default? (Probably collapsed — long files break scroll)
- For very large files — preview first N lines + "Download full" or force download?
- For Markdown: render it as Markdown, or show source + toggle "Rendered / Raw"?
- For images: lazy-load thumbnails or eager? (Many images → perf)
- Where does "Open" open — modal lightbox, fullscreen, or new browser tab?
- For ambiguous file types (no extension, custom MIME) — what default? (treat as text? download-only?)
- Files produced in a session — do they get their own lifecycle, or follow the session's lifecycle (deleted with the session)?
- How do we handle the agent *modifying* the same file multiple times? (One card per version? Always show latest? History?)
- Should the user be able to edit a file from the UI? (Or strict read-only / download only)
- "Send back to agent" UX: button on file card, or a drag handle into the input?
- Should generated files count toward some user quota?

**Priority:** HIGH (without it, file upload is half-useful)
**Complexity:** High (detection, preview rendering, file storage, search)
**Dependencies:** Task #23 (file storage layer), Hermes Agent output conventions

---

#### 📋 25. Session Presets — "Model + Parameters" Templates
**Role:** Fullstack
**Status:** 📋 Backlog (P2) — promoted to v1.0.0

**Problem:**
- Today, every new session is created with just a model. All other parameters (system prompt, temperature, top_p, max_tokens, response format, stop sequences, etc.) are either hidden or set globally
- Users with established workflows (e.g., "code reviewer", "translator", "data analyst") re-type the same system prompt and tweak the same sliders every time
- No way to share a "this is how I work" configuration across teammates or across machines
- A "preset" is a named bundle of: model + parameter values + (optional) system prompt template

**Functions needed:**

**Preset CRUD:**
- Create / edit / duplicate / delete / archive presets
- Each preset has: name (required, unique), description, model, model parameters, system prompt (optional)
- "Use as default" flag — the default preset is preselected on the New Session page
- "Starter" presets shipped out-of-the-box (e.g., "Balanced", "Creative writer", "Precise coder", "JSON-only") that the user can clone and customize
- Categories or tags (`coding`, `writing`, `analysis`, `vision`) for filtering
- Color or icon per preset for visual recognition
- Versioning of preset changes (history of edits, ability to roll back)
- Import / export preset as JSON (sharing between instances, between users)

**Discovery & selection:**
- New Session page surfaces presets as cards / chips / segmented control
- Filter by provider, category, "recently used", "starred"
- Show the key parameters inline (e.g., "GPT-4o · temp 0.7 · 4k tokens")
- Keyboard shortcuts: `Ctrl+1`, `Ctrl+2` to pick a preset without leaving the keyboard
- "Recently used" list at the top

**Model parameters (v1 scope, what to expose):**
- `temperature` (slider, 0.0–2.0)
- `top_p` (slider, 0.0–1.0)
- `max_tokens` (number input or slider)
- `system_prompt` (textarea, with variable interpolation like `{{date}}`, `{{user_name}}`)
- `response_format` (`text` | `json` | `json_schema` with schema)
- `stop_sequences` (list of strings)

(v2 scope, can be added later: `frequency_penalty`, `presence_penalty`, `seed`, tool restrictions)

**Per-session override:**
- When creating a new session from a preset, the user can tweak any parameter before sending the first message
- The session stores which preset (if any) it was created from — visible in the session header / breadcrumb
- Switching preset mid-session is *not* supported (a new session should be created)

**Storage & sync:**
- Presets stored in UI DB (per-instance, per-user)
- Optional: sync presets across multiple 1230UI instances (federation? — overlaps with Task #21)
- Precedence: instance-level preset > server default > built-in starter preset

**UX questions (open):**
- Where does the user manage presets? (Settings → "Presets" section? A dedicated `/presets` page? Both — list in Settings, edit inline in New Session?)
- Should a preset be **tied to a specific model**, or **model-agnostic** (e.g., "Creative writer — works with any chat model")? (Probably: model-pinned by default, with a "use any compatible model" toggle)
- What happens if a preset's pinned model is removed or disabled? (Auto-archive? Prompt to re-pin? Show a warning badge on the preset card?)
- How many parameters to expose in the *card* view vs the *edit* view? (Don't overwhelm — card shows only the 2-3 most important ones)
- Temperature slider: continuous or stepped (0.0, 0.3, 0.7, 1.0, 1.5)? Provider presets per parameter?
- System prompt template variables — which are exposed? (`{{date}}`, `{{user_name}}`, `{{language}}`, …) — keep it small to start
- How to handle presets with conflicting values (e.g., preset says `max_tokens=4000` but chosen model only supports 2000)? (Block, warn, or auto-clamp?)
- Should "Use as default" be one preset or multiple (e.g., default for coding, default for writing)?
- "Starter" presets — bundled with the app, or downloaded on first run? Who can edit them?
- Should presets have a visual icon (emoji picker) or just a color tag? (Color is faster; emoji is more recognizable)
- How to handle bulk actions: multi-select to export, archive, delete?
- For a federated setup (Task #21), are presets global or per-node?
- Per-session preset badge in chat header — always shown, or only when the session is started from a non-default preset?

**Priority:** HIGH (productivity multiplier for repeat workflows)
**Complexity:** Medium-High (parameter coverage, UX, schema migration)
**Dependencies:** Model metadata (we already have it), per-session model_params storage (new column on session)

---

### Release infrastructure

#### 📋 10. Complete Manual Verification
**Role:** Frontend + Backend
**Description:** End-to-end manual pass to confirm v1.0.0 is shippable.

**Tasks:**
- [ ] All pages and core functions in a clean dev environment
- [ ] Mobile breakpoint (360 px, 768 px)
- [ ] Dark/light themes visually consistent
- [ ] Accessibility: screen reader walkthrough, full keyboard navigation
- [ ] Performance: 1000+ sessions in the list (react-virtuoso)
- [ ] FCP < 1.5 s after code splitting
- [ ] Each of the 4 i18n languages spot-checked on every page
- [ ] Fresh install on a clean VM via `./install.sh`

**Priority:** HIGH
**Complexity:** Medium (3-4 hours)
**Dependencies:** None (can run as features land)

---

#### 📋 17. CI/CD Pipeline
**Role:** Backend (DevOps)
**Files:** `.github/workflows/*.yml` (new)
**Description:** Automated checks on every PR + automated release artefacts.

**Tasks:**
- [ ] GitHub Actions workflow: lint + typecheck + build on every PR
- [ ] Auto-publish release artefact (zip with `dist/` + `.env.example`) on tag
- [ ] (Optional) auto-deploy to a staging server on merge to `main`
- [ ] Status badge in README

**Priority:** HIGH for v1.0.0 (we want to *release* v1.0.0, not just have it)
**Complexity:** Medium
**Dependencies:** None

---

### Code cleanup (carried from old "Known Issues")

#### 📋 26. Lint warnings in ChatPage
**Role:** Frontend
**File:** `src/pages/ChatPage.tsx:152`
**Description:** The `useEffect` on line 152 still emits a `react-hooks/exhaustive-deps` warning (missing `location.state` and `t` in deps). Marked ✅ in task #4, but the warning is still produced on every CI run.

**Tasks:**
- [ ] Add explicit deps or eslint-disable with justification comment
- [ ] Verify no behavioural regression in initial-message-send flow

**Priority:** MEDIUM (CI hygiene)
**Complexity:** Low
**Dependencies:** None

---

#### 📋 27. SettingsPage `formatTimestamp` unification
**Role:** Frontend
**Files:** `src/pages/SettingsPage.tsx:238`, `src/lib/time.ts`
**Description:** SettingsPage has its own `formatTimestamp(ts: string | null): string` helper (lines 233-246) that duplicates the relative-time logic from `lib/time.ts`. Should be replaced with a shared helper.

**Tasks:**
- [ ] Extend `lib/time.ts` with a `formatRelativeTimestamp(ts, now)` API that handles `null` → "Never"
- [ ] Remove the local `formatTimestamp` in SettingsPage and import from `lib/time.ts`
- [ ] Verify visual output is identical in dark/light themes

**Priority:** LOW (refactor, not user-facing)
**Complexity:** Low (30 min)
**Dependencies:** None

---

## 🔮 Для дальнейшего развития (post-1.0)

Tasks explicitly deferred past v1.0.0. Re-prioritized per release after v1.0.0 ships.

### Quality & testing

#### 📋 0. Smart session titles (LLM)
**Role:** Backend + Frontend
- [ ] Endpoint `POST /api/sessions/:id/title/generate` — LLM-suggested title from first user message
- [ ] UI: "Suggest a title" button next to the manual edit pencil
- [ ] Auto-apply if session title is still default after first reply

**Priority:** MEDIUM
**Complexity:** Medium (1-2 hours)

---

#### 📋 11. Backend Unit Tests
**Role:** Backend
- [ ] Set up Vitest or Jest
- [ ] Tests for `/api/sessions`, `/api/chat`, `/api/models`
- [ ] Coverage > 70%

**Priority:** MEDIUM
**Complexity:** Medium

---

#### 📋 12. E2E Tests
**Role:** Frontend
- [ ] Playwright or Cypress
- [ ] Tests: session creation, message sending, model switching, settings flow

**Priority:** LOW
**Complexity:** Medium

---

### UX & features

#### 📋 13. Server-side session search
**Role:** Backend + Frontend
- [ ] FTS5 index in SQLite
- [ ] API endpoint `/api/sessions/search`
- [ ] Integrate with the existing client-side search (debounce, URL sync)

**Priority:** MEDIUM
**Complexity:** Medium

---

#### 📋 15. Session Export
**Role:** Backend + Frontend
- [ ] Export to Markdown / JSON
- [ ] "Export" button in ChatPage
- [ ] Backend endpoint for export generation

**Priority:** LOW
**Complexity:** Low

---

#### 📋 18. Docker Support
**Role:** Backend (DevOps)
- [ ] Multi-stage Dockerfile (build frontend + serve via Node)
- [ ] `docker-compose.yml` with volumes for `data/` and `.env`
- [ ] `.dockerignore` (`node_modules`, `.git`, etc.)
- [ ] Documentation in README for Docker launch

**Priority:** LOW
**Note:** Not critical for MVP — `install.sh` already covers 90% of cases

---

#### 📋 21. Multi-Agent Federation
**Role:** Fullstack
**Description:** Multiple 1230UI instances (one per Hermes node) discover and orchestrate each other. See `FEDERATION_DESIGN.md` for full design.

**Phases:**
- **Phase 1:** Federation identity + health (`/api/federation/*`, `/api/cluster/*`, ClusterPage UI)
- **Phase 2:** Federation sessions (cross-node session browsing)
- **Phase 3:** Federation chat (SSE proxy to remote nodes)
- **Phase 4:** Cluster aggregation (cross-node search, unified dashboard)

**Priority:** LOW (far future, after v1.0.0 stable)
**Complexity:** High (20-40 hours total)
**Dependencies:** Stable v1.0.0, multiple servers with 1230UI deployed

---

### Other ideas (no task number, will get one when picked up)

- **Tags / folders for sessions** — organize by topic
- **Message edit / branch** — edit a sent user message, regenerate the response
- **Reactions to messages** — 👍 / 👎 feedback to the agent's answer
- **Multi-user** — session ownership, user separation
- **Webhooks / Telegram integration** — talk to the agent from outside the browser
- **Backup / restore** — export the whole 1230-UI DB
- **Provider health-check endpoint** — `GET /api/models/health`; green/yellow/red badge in Settings
- **Long-message warning** — UI hint when user is about to send something over the model limit
- **Per-message actions** — copy, regenerate, "explain this", "translate this"

---

## ✅ Завершённые (history)

Done features, kept for reference. Organized by release / category. Last release at the top.

### v0.5.0+ — UI polish & reorganization (2026-06-07)
- ✅ **Sidebar quick controls** — Dark Mode + Notifications toggles moved from header to sidebar. Settings → General keeps them as fallback.
- ✅ **Hermes API status indicator** — `Server` icon in the header, color-coded (green/red/gray) with localized tooltip showing version. Read-only.
- ✅ **Status polling** — `useHermesStatusPoll` hook in `Layout`; `GET /api/system/status` polled every 60 s; persisted Zustand store `hermes-status` with 5-min staleness guard.
- ✅ **Dashboard cleanup** — "System Status" block removed; "Recent Sessions" stretched to `col-span-2`. `getSystemStatus` no longer called on Dashboard.
- ✅ **Settings → "Hermes Agent status"** — connection state + Hermes version + latest + update warning.
- ✅ **i18n** — new keys in `nav.*` and `settings.*` for status strings (en/ru/es/de). Removed obsolete `dashboard.systemStatus` / `hermesVersion` / `latestVersion` / `updateAvailable` keys.

**New files:** `src/store/hermesStatusStore.ts`, `src/hooks/useHermesStatusPoll.ts`, `src/components/HermesStatusIndicator.tsx`.

### v0.5.0 — Internationalization (2026-06-06)
- ✅ i18next infrastructure (`react-i18next` + `i18next-browser-languagedetector`)
- ✅ ~175 UI strings extracted across 4 languages (en, ru, es, de)
- ✅ Proper pluralization (en/es/de: `_one`/`_other`; ru: `_one`/`_few`/`_many`)
- ✅ Interpolation (`{{count}}`, `{{toolName}}`, `{{query}}`, etc.)
- ✅ Language selector dropdown in Settings → General
- ✅ Browser language detection with localStorage fallback
- ✅ 15 files refactored (all pages, components, `api.ts`)
- ✅ Backend API errors stay in English

### v0.5.0 — Provider Key Management (2026-06-06)
- ✅ Dedicated page `/settings/providers` — flat list of 24 Hermes-bundled `api_key` providers
- ✅ Configured providers show "Remove key" with confirm modal; unconfigured show inline "Add key" form
- ✅ Backend: `list_bundled_providers.py`, `manage_provider_key.py`, `sync_providers.py` (fixed env_var bug)
- ✅ Endpoints (rate-limited 10/min): `GET /api/providers/available`, `POST /api/providers/:name/key`, `DELETE /api/providers/:name/key?env_var=…`
- ✅ Schema migration: `description`, `signup_url`, `auth_type` columns
- ✅ Security: API never returns secret values (only `••••last4` mask); `env_var` whitelisted; ASCII printable ≤ 512 chars; uses Hermes' own `save_env_value()` (chmod 600)

**New files:** `src/pages/ProvidersPage.tsx`, `src/components/ProviderCard.tsx`, `src/components/ApiKeyInput.tsx`, `scripts/list_bundled_providers.py`, `scripts/manage_provider_key.py`.

### Core features
- ✅ Dashboard, Sessions (with infinite scroll + date grouping), Chat (streaming, markdown, tool calls)
- ✅ Quick Chat on Dashboard, multi-line textarea with auto-resize
- ✅ New session with model selection; saved model in `localStorage`
- ✅ Settings: enable/disable models, sync providers, system commands (`hermes update`, `hermes doctor --fix`)
- ✅ Markdown rendering + syntax highlighting (highlight.js)
- ✅ Tool calls visualization (collapsible blocks)
- ✅ "Agent is thinking…" / "Generating response…" indicators

### Error handling
- ✅ Structured errors from backend (types: `network`, `timeout`, `content_moderation`, `rate_limit`, `server_error`, `auth_error`, `invalid_request`)
- ✅ ErrorMessage component with icons, suggestions, retry, expandable details
- ✅ SSE status events: `thinking` → `executing_tool` → `generating`
- ✅ Automatic retry (3 attempts, exponential backoff) for network and server errors
- ✅ Toxic-session blocking (`content_moderation` → banner + "create new session")
- ✅ ErrorBoundary catches React crashes
- ✅ Structured JSON server logs (method, path, status, duration)

### Critical bug fixes (2026-06-05)
- ✅ Session creation: `HERMES_DB_PATH` corrected
- ✅ Message duplication: `initialMessage` stored in ref, sent only when session is empty
- ✅ Session visibility: sessions created via API now appear in list immediately
- ✅ React 19 StrictMode compatibility: removed duplicate `useEffect`

### Sessions UX (2026-06-05)
- ✅ Sort order: `sort=created|lastMessage` query param; control in Settings → General; persisted in `hermes-sessions-sort`
- ✅ Last-activity time: `lastMessageAt` with `startedAt` fallback; `groupSessionsByDate` respects sort field
- ✅ Sidebar state persisted in `hermes-sidebar`; removed `resize` clobbering

### P0 — Release blockers
- ✅ **#0.5** Session Management (CRUD) — delete, rename, pin, archive, bulk delete
- ✅ **#0.7** Real-time agent work visualization — SSE tool call parsing on backend, real-time ToolCall rendering on frontend (start/progress/end events), running spinner, counter, auto-collapse
- ✅ **#0.8** UI Internationalization (RU → EN)
- ✅ **#1** Centralized Configuration — `config.js`, `.env.example`, hardcoded paths removed
- ✅ **#2** `.gitignore` for publishing
- ✅ **#3** Setup Script — `install.sh` with Node/Python/Hermes checks, npm install/build, PM2 setup
- ✅ **#4** Fix Lint Errors in ChatPage — most cases (one residual warning → #26 above)

### P1 — Production-ready
- ✅ **#5** Configuration Validation (zod schema, path/URL checks, friendly error messages)
- ✅ **#6** Input Validation & Rate Limiting (xss sanitization, 100 req/min general, 30 req/min chat, 5/5min system commands)
- ✅ **#7** CORS Configuration (whitelist via `CORS_ORIGINS`, credentials for Authelia)
- ✅ **#8** Security Headers (helmet, CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- ✅ **#14** Keyboard Shortcuts (`Ctrl/Cmd+K` search, `Ctrl/Cmd+N` new session, `Ctrl/Cmd+Enter` send)
- ✅ **#16** New Message Notifications (Browser Notification API, tab badge, toggle in Sidebar + Settings)
- ✅ **#20** i18n (see v0.5.0 above)

### Backend
- ✅ Express.js + SQLite (better-sqlite3), two DBs (Hermes read-only + UI read-write)
- ✅ Hermes API integration: proxy + streaming SSE
- ✅ GitHub API response caching (1 hour)
- ✅ Automatic table creation
- ✅ ~15 API endpoints

### UI/UX
- ✅ Responsive layout, dark/light theme switcher, skeleton loading, empty states, lucide-react icons
- ✅ Mobile bottom-nav, design tokens (CSS variables), reduced motion support
- ✅ Toast component with queue and auto-dismiss
- ✅ Confirm modal for destructive actions
- ✅ Copy buttons on code blocks and messages
- ✅ Regenerate for assistant messages
- ✅ Auto-scroll respecting user position
- ✅ Avatars for user/assistant
- ✅ 404 state for non-existent sessions
- ✅ Breadcrumbs in ChatPage
- ✅ Session search (client-side, debounced, URL-synced)
- ✅ Default model in Settings (with optgroup per provider)
- ✅ JetBrains Mono for code, custom scrollbar, ARIA labels + focus-visible
- ✅ Session list virtualization (react-virtuoso)
- ✅ Code splitting (lazy-loaded pages: Dashboard, Sessions, Settings, Chat, NewSession)
- ✅ Token count + latency in messages
- ✅ Empty illustrations (SVG), print styles

### Frontend refactor (2026-06-04, 27/27 tasks)
27 atomic tasks across 3 tiers: copy/regenerate/scroll UX (T1), virtualization/modals/split (T2), empty states (T3). See git history for the per-task breakdown.

### Infrastructure
- ✅ PM2 (`ecosystem.config.json`)
- ✅ Nginx reverse proxy
- ✅ HTTPS (Let's Encrypt)
- ✅ Authelia authentication
- ✅ Systemd service for Hermes API

---

## 📊 Project Metrics

- **Lines of Code:** ~2 500 (backend) + ~3 500 (frontend)
- **TypeScript:** 100% coverage on frontend
- **Test Coverage:** 0% (post-1.0)
- **Bundle Size (gzip):** ~190 KB total; ChatPage is the largest chunk due to highlight.js
- **Code Splitting:** Dashboard 5.8 KB · Sessions 75 KB · Settings 21 KB · Chat 350 KB · NewSession 5 KB · Providers 9 KB
- **i18n:** ~200 strings × 4 languages (en, ru, es, de)
- **Known open tasks for v1.0.0:** 8 (19, 23, 24, 25, 10, 17, 26, 27)

---

## 🔧 Useful Commands

```bash
# PM2 (process manager)
pm2 status                    # Status
pm2 logs 1230-ui              # Logs
pm2 restart 1230-ui           # Restart

# Dev & build
npm run dev                   # Dev server
npm run build                 # Production build (tsc + vite)
npm run lint                  # ESLint

# Quick API checks
curl http://localhost:3001/api/health
curl http://localhost:3001/api/system/status

# Hermes API
systemctl status hermes-api   # Hermes API status
journalctl -u hermes-api -f   # Hermes API logs
```

---

## 📁 Project Structure

```
1230-ui/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/              # Pages (lazy-loaded)
│   ├── store/              # Zustand stores
│   ├── hooks/              # React hooks
│   ├── lib/                # API client, helpers
│   ├── i18n/               # 4-language translation files
│   └── types/              # TypeScript types
├── server.js               # Express backend
├── middleware/             # Security middleware (rate limit, XSS)
├── scripts/                # Python scripts (Hermes DB, providers, sync)
├── data/1230-ui.db         # UI database (providers, models, cache, presets*)
└── docs/                   # Architecture, API, installation
```

\* `presets` table will be added by Task #25.
