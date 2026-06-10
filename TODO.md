# 1230-UI — Tasks and Progress

**Last updated:** 2026-06-10 (Tasks #36, #37, #38 shipped — applications architecture, file preview, file manager; all v1.0.0 requirements met)
**Current version:** 0.9.1
**Release target:** v1.0.0 — friendly web interface for non-technical Hermes Agent users

---

## 🎯 Release v1.0.0 — Goal

A polished, self-contained web interface around [Hermes Agent](https://github.com/anthropics/hermes-agent) that a **non-technical user** can install, log into, and use productively without touching a terminal:

- One-command install (`./install.sh` already done in v0.5.0)
- Zero-config defaults that "just work" after the install script
- Friendly UX for the common workflow: **create a session → chat with a model → attach files → read the answer with previews → come back tomorrow**
- No jargon in the UI: no "API key", no "model id", no "tool call" — describe what the user is doing, not the plumbing
- Mobile-friendly: works the same on a phone as on a desktop

Everything in **🚨 Required for v1.0.0 release** must be done before tagging v1.0.0. Everything in **🔮 Deferred (post-1.0)** is explicitly deferred to a later release.

---

## 🚨 Required for v1.0.0 release

All required tasks for v1.0.0 have been completed. Ready to tag v1.0.0.

---

## 🔮 Deferred (post-1.0)

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

#### 📋 30. UX-10 — Settings page navigation
**Role:** Frontend
**File:** `src/pages/SettingsPage.tsx`
**Description:** SettingsPage contains General, Models, Commands, Hermes Status, About —
all in one long scroll (~785 lines). Hard to navigate, especially on mobile.

**Options (pick one):**
- Anchor links (`#general`, `#models`, etc.) with a sticky mini-nav at the top
- Sub-routes: `/settings/general`, `/settings/models` (prec. already set by `/settings/providers`)

**Priority:** LOW (P3)
**Complexity:** Medium

---

#### 📋 34. Files — extended functionality (post-1.0)
**Role:** Fullstack
**Status:** 📋 Backlog — deferred from tasks #23 and #24
**Dependencies:** Task #23 (shipped ✅) + Task #24 (shipped ✅ — minimal card + download in v0.9.0)

Functionality gathered from tasks #23 and #24, but intentionally kept out of v1.0.0 in favor of a simple working version. Task #24 already covers the minimum (path detection, file card, download, SSE event, source column).

**Upload (extension of #23):**
- Paste from clipboard (paste image → auto-attach)
- Drag-to-reorder attached files before sending
- Re-send a previously uploaded file in a new message ("Files in this session" list)
- File annotations ("use this as the spec")
- Disk quotas: per-user / per-server
- Virus / malware scan before passing to the agent
- Hash deduplication (one copy per hash per session)
- Retention policy separate from session lifecycle (N days after last activity)

**Agent file preview (extension of #24, main part):**
- Inline preview for text files (first 100 lines, syntax highlight via existing highlight.js)
- Markdown: render instead of raw text
- Images: thumbnail → lightbox on click
- PDF: `<iframe>` or download-only
- Card expand animation
- Bulk download (multiple files → zip)
- "Open in new tab" for natively browser-renderable formats
- Visual distinction "user-uploaded" vs "agent-created" (different badges)
- Global Files view across sessions (`/sessions/:id/files`)
- Handle multiple versions of the same file within a session
- "Send this file back to the agent" (round-trip)

> **Structural slots:** `src/components/AgentFileCard.tsx` already has a `useState(false)` chevron and `AgentFileGroup` wrapper with a header — these are the extension points for bulk-download, preview, and animation from this list. The outer component shell won't need changes.

**Files view:**
- "Files" tab in the session sidebar — list of all files in the current session
- Global Files view — all files across all sessions
- Search across files (name, content, session)
- "Send file back to agent" — button on the file card

**Priority:** MEDIUM (significantly improves the file experience, but doesn't block v1.0.0)
**Complexity:** High

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
- **Assistant marketplace** — import/export assistant configs as JSON; sharing between instances
- **Usage analytics** — per-session stats: token counts, latency histograms, model usage breakdown
- **Numbered DB migrations** — replace ad-hoc `PRAGMA table_info` checks with a versioned migration runner
- **FTS5 full-text search** — search inside message content (depends on Task #13 API endpoint)
- **`skip-to-content` link** — accessibility improvement for keyboard users
- **`prefers-reduced-motion` audit** — verify all animations respect the media query

---

## ❌ Tasks we will not do

Tasks that were considered and explicitly rejected. Kept for reference so we don't revisit the same decision.

#### ~~📋 31. UX-11 — Token counter in chat input~~
**Reason:** Requires model context-window metadata from Hermes (not exposed). Users rarely hit limits with typical prompts. The counter would add visual noise for marginal benefit. If truncation becomes a real problem, a silent server-side clamp is preferable to a UI counter.

#### ~~📋 32. UX-12 — Version indicator in header~~
**Reason:** Version is already shown in Settings → About and in the sidebar copyright line. Adding another badge would clutter the UI for a value that almost no user needs during normal operation.

#### ~~📋 33. IA — Assistants link in Sidebar and MobileNav~~
**Reason:** `/assistants` is a management page, not a primary workflow. Most users create sessions from the New Session page tiles and rarely need to manage assistants. The Settings → Assistants path is sufficient for the occasional admin task. Adding it to the 4-item MobileNav would require removing something more important.

---

## ✅ Completed (history)

Done features, kept for reference. Organized by release / category. Last release at the top.

### v0.9.1 — Applications Architecture + File Preview (2026-06-10)

#### Task #36 — Sessions page split layout with applications architecture
- ✅ **Backend:** `applications` table (idempotent migration in `db/migrate.js`)
- ✅ **Backend:** `GET /api/applications` (+ `?enabled` filter), `PATCH /api/applications/:id`
- ✅ **Backend:** Seed `file_preview` application on startup
- ✅ **Frontend:** Split layout inside `<main>` — 50/50 on desktop (≥ 1024 px), chat-only on mobile
- ✅ **Frontend:** `<ApplicationsPane />` — pill selector (icon + name tabs) + rendered application component
- ✅ **Frontend:** Application registry (`src/applications/registry.ts`) — `key → React component` map
- ✅ **Frontend:** `ApplicationComponentProps { sessionId, config }` contract
- ✅ **Frontend:** Zustand store `applicationsStore` — fetch, select (global via localStorage), update
- ✅ **Frontend:** Placeholder `PlaceholderApp` for File Preview (task #37)
- ✅ **Frontend:** `/applications` standalone management page (toggle enabled, reorder with up/down buttons)
- ✅ **Frontend:** Settings section "Applications" with link to `/applications`
- ✅ **Frontend:** Toggle button in Navbar (PanelRightOpen/PanelRightClose) — hidden on mobile, state persisted in localStorage
- ✅ **i18n:** `applications.*` keys × 4 languages (en, ru, es, de)

**New files:** `routes/applications.js`, `src/applications/types.ts`, `src/applications/registry.ts`, `src/applications/placeholder/PlaceholderApp.tsx`, `src/store/applicationsStore.ts`, `src/store/appsPaneStore.ts`, `src/components/ApplicationsPane.tsx`, `src/pages/ApplicationsPage.tsx`.
**Changed files:** `db/migrate.js`, `db/seed.js`, `server.js`, `app.js`, `src/types/api.ts`, `src/lib/api.ts`, `src/components/Layout.tsx`, `src/components/Navbar.tsx`, `src/pages/SettingsPage.tsx`, `src/App.tsx`, i18n locales (×4).

**Bundle impact:** `ApplicationsPage` chunk 4.40 KB gzip (lazy). No change to other chunks.

#### Task #37 — File Preview application
- ✅ **Backend:** `GET /api/sessions/:id/files/:fileId/content` — inline file serving (`Content-Disposition: inline`)
- ✅ **Backend:** Filename encoding fix — recovers double-encoded UTF-8 (mojibake) in `rowToFile()`
- ✅ **Frontend:** `FilePreviewApp` — main component with file list, auto-select, empty/loading/error states
- ✅ **Frontend:** `FileList` — horizontal pill bar with icon + filename + size
- ✅ **Frontend:** `FilePreview` — mimeType router (switch-based, React 19 compatible)
- ✅ **Frontend:** 9 viewers: `ImageViewer`, `MarkdownViewer`, `CodeViewer`, `JSONViewer`, `TextViewer`, `CSVViewer`, `HTMLViewer`, `PDFViewer`, `UnsupportedViewer`
- ✅ **Frontend:** Navbar file dropdown — clickable items open preview pane (desktop only)
- ✅ **Frontend:** `filePreviewStore` — cross-component state for navbar → preview communication
- ✅ **i18n:** `filePreview.*` keys × 4 languages (en, ru, es, de)
- ✅ **New dependency:** `papaparse` + `@types/papaparse` (CSV parsing)

**New files:** `src/applications/file-preview/FilePreviewApp.tsx`, `src/applications/file-preview/FileList.tsx`, `src/applications/file-preview/FilePreview.tsx`, `src/applications/file-preview/viewers/` (9 viewers), `src/applications/file-preview/index.ts`, `src/store/filePreviewStore.ts`.
**Changed files:** `routes/files.js`, `src/lib/api.ts`, `src/applications/registry.ts`, `src/components/Navbar.tsx`, i18n locales (×4).

**Bundle impact:** `file-preview` chunk ~8 KB gzip (lazy). `papaparse` +3 KB gzip.

#### Task #38 — File Manager application
- ✅ **Backend:** Migration: `expires_at`, `extended_count` columns in `session_files`
- ✅ **Backend:** Config: `FILE_RETENTION_DAYS` in `.env` (default 30)
- ✅ **Backend:** Auto-set `expires_at` on file upload
- ✅ **Backend:** `GET /api/files` — list all files across sessions (with session title/preview join)
- ✅ **Backend:** `PATCH /api/files/:fileId/extend` — extend expiration (+FILE_RETENTION_DAYS)
- ✅ **Backend:** `DELETE /api/files/:fileId` — delete file globally (disk + DB)
- ✅ **Backend:** Startup cleanup: delete expired files on server start
- ✅ **Backend:** Periodic cleanup: `setInterval(cleanupExpiredFiles, 60 * 60 * 1000)` — runs every hour
- ✅ **Backend:** Handles both user files and agent files in cleanup
- ✅ **Frontend:** `FileManagerApp` — main component (desktop-only, in Applications pane)
- ✅ **Frontend:** `FileStatsBar` — total files, total size, expiring soon count
- ✅ **Frontend:** `FileList` — sortable table (name, date, size, expiration), filter (all/expiring/images/code/documents), search
- ✅ **Frontend:** `FileRow` — icon + filename + session title + size + expiration badge + actions
- ✅ **Frontend:** `ExpirationBadge` — color-coded expiration indicator (green/yellow/orange/red/gray)
- ✅ **Frontend:** `ExtendButton` — extend file lifetime (+30 days) with optimistic update
- ✅ **Frontend:** `DeleteConfirmModal` — confirmation dialog
- ✅ **Frontend:** Integration with File Preview: click file → navigate to session + open File Preview
- ✅ **Frontend:** Empty state, loading state, error state
- ✅ **Frontend:** Registry update: `file_manager: FileManagerApp`
- ✅ **Backend:** Seed `file_manager` application in `db/seed.js`
- ✅ **i18n:** `fileManager.*` keys × 4 languages (en, ru, es, de)

**New files:** `routes/globalFiles.js`, `src/applications/file-manager/FileManagerApp.tsx`, `src/applications/file-manager/FileStatsBar.tsx`, `src/applications/file-manager/FileList.tsx`, `src/applications/file-manager/FileRow.tsx`, `src/applications/file-manager/ExpirationBadge.tsx`, `src/applications/file-manager/ExtendButton.tsx`, `src/applications/file-manager/DeleteConfirmModal.tsx`, `src/applications/file-manager/index.ts`.
**Changed files:** `db/migrate.js`, `db/seed.js`, `config.js`, `server.js`, `app.js`, `routes/files.js`, `src/lib/api.ts`, `src/types/api.ts`, `src/applications/registry.ts`, `.env.example`, i18n locales (×4).

**Bug fixes:**
- ✅ Russian filenames in File Manager — `fixFilenameEncoding()` applied to `routes/globalFiles.js`
- ✅ Session title display — shows preview (first user message) when title is null, "Deleted session" if session deleted
- ✅ File filter bug — fixed `emptyMessage` logic in `FileList.tsx`
- ✅ File Preview integration — fixed `useEffect` dependency on `files` array

### v0.9.0 — Required tasks shipped (2026-06-09)

#### Task #35 — Session-level file visualisation
- ✅ ChatPage header: `📎 N` badge next to the model name (uses existing `chatInputStore.sessionFiles`)
- ✅ SessionCard (Sessions list): `📎 N` badge in row 3 alongside message count
- ✅ Backend `GET /api/sessions` returns `fileCount` via single GROUP BY subquery
- ✅ `Session` type gains `fileCount?: number`
- ✅ i18n: `chat.sessionFilesCount` × 4 languages

#### Task #17 — CI/CD Pipeline
- ✅ GitHub Actions CI: lint → typecheck → test → build on every PR/push to main (shipped in v0.7.0)
- ✅ `release.yml` — triggered on `v*.*.*` tag: full CI pass → creates `1230-ui-vX.Y.Z.tar.gz` → extracts CHANGELOG section → publishes GitHub Release with archive attached
- ✅ CI status badge added to README
- ⏳ Deferred: auto-deploy to staging server on merge to main

#### Task #28 — UX-3: Remove technical jargon from UI
- ✅ "Model Providers" → "AI Services" / "Сервисы ИИ" (`settings.modelProviders`)
- ✅ "API key" → "Access key" / "Ключ доступа" (`providers.apiKeyLabel`)
- ✅ "Provider Keys" page title → "Service Keys" (`providers.title`)
- ✅ All related i18n strings updated × 4 languages
- ⏳ Deferred: per-provider one-line description (sourced from `list_bundled_providers.py`) — low priority, post-1.0

#### Task #29 — UX-7: Onboarding / welcome flow
- ✅ Detected via `allModels.length === 0 && sessions.length === 0` (reuses existing `loadData()` data — no extra API call)
- ✅ Dismissable banner on Dashboard with 3 numbered steps (Key → Zap → MessageCircle icons)
- ✅ "Add service key →" button links to `/settings/providers`
- ✅ Dismiss state persisted in `localStorage.onboarding_dismissed`
- ✅ Not shown once user has sessions or models configured
- ✅ Works in dark/light themes and on mobile
- ✅ i18n: 10 new `dashboard.onboarding*` keys × 4 languages

### v0.9.0 — File Upload to Session (2026-06-08)

Task #23 implemented end-to-end. User can now attach one or more files to a chat message; the agent reads them autonomously by path.

**Backend:**
- ✅ `session_files` table + `idx_session_files_session` index in `db/migrate.js` (idempotent)
- ✅ `routes/files.js` — `POST/GET/DELETE /api/sessions/:id/files[/:fileId]`. multer 2.1.1 with 50 MB cap, extension + MIME whitelist, UUID-based `stored_name`, EXDEV-safe temp-to-final move (copyFileSync + unlinkSync fallback). `apiLimiter` on POST. Session ownership verified on GET / DELETE.
- ✅ `routes/sessions.js` — `cleanupSessionUploads` helper, called in `DELETE /:id` and inside the `DELETE /bulk` transaction
- ✅ `app.js` — `filesRouter` mounted at `/api/sessions` (next to `sessionsRouter`)
- ✅ `package.json` — `multer ^2.1.1`

**Frontend:**
- ✅ `src/lib/api.ts` — `SessionFile` type + `uploadFile` / `listSessionFiles` / `deleteSessionFile`
- ✅ `src/pages/ChatPage.tsx` — paperclip button (44×44 touch target), drag-and-drop overlay, file chips (uploading spinner / ready / error+retry), client-side size + extension + 5-file validation, prepend `[Attached file: <path>]` to the message text, navigation-guard update
- ✅ 8 new `chat.*` + 3 new `api.*` i18n keys × 4 languages

**Verification:** lint clean, typecheck clean, 22/22 tests pass, build OK (`ChatPage` chunk +7 KB gzip).

**Open follow-up (Task #35):** session-level visualisation of attached files — once a message is sent the chips disappear, and there is no persistent "this session has N files" indicator. Brief to be written; see `docs/BRIEF-23-file-upload.md` § 8.

**Changed files:** `package.json`, `package-lock.json`, `db/migrate.js`, `routes/files.js`, `routes/sessions.js`, `app.js`, `src/lib/api.ts`, `src/pages/ChatPage.tsx`, `src/i18n/locales/{en,ru,es,de}/translation.json`.

### Task #25 — Session Presets (shipped across v0.6.0 + v0.8.0)
- ✅ Phase 1 (v0.6.0): `assistants` table, 6 API endpoints, tile grid, editor with color/icon/model, fork-on-edit, clone-before-save, 3 starters, per-session badge
- ✅ Phase 2 (v0.8.0): `style`, `depth`, `system_prompt` fields; visual indicators on tiles; system_prompt injected into Hermes chat; description auto-derived
- ✅ i18n: 13 new keys × 4 languages
- ⏳ Deferred (post-1.0): temperature/top_p/max_tokens sliders, response_format, stop_sequences, import/export, "use as default", categories/tags, versioning

### Task #10 — Complete Manual Verification (done before v1.0.0 tag)
- ✅ All pages and core functions verified in clean dev environment
- ✅ Mobile breakpoints (360 px, 768 px) tested
- ✅ Dark/light themes visually consistent
- ✅ Accessibility: keyboard navigation verified
- ✅ Performance: 1000+ sessions in list (react-virtuoso)
- ✅ FCP < 1.5 s after code splitting
- ✅ All 4 i18n languages spot-checked
- ✅ Fresh install on clean VM via `./install.sh`

### Task #27 — SettingsPage `formatTimestamp` unification (done in v0.7.0)
- ✅ `formatRelativeTimestamp(ts, t)` in `lib/time.ts` handles `null` → "Never"
- ✅ Local `formatTimestamp` removed from SettingsPage, replaced with shared helper
- ✅ Visual output identical in dark/light themes

### v0.8.0 — Backend modularization + UX sprint + Assistants Phase 2 (2026-06-08)

**Backend modularization (CODE-1):**
- ✅ **CODE-1** — `server.js` 1911 → 39 lines; split into `app.js`, `db/` (connections, migrate, seed, helpers), `routes/` (system, sessions, chat, models, assistants, providers, likes)
- ✅ Dead-code removal: duplicate `DELETE /api/sessions/:id` and `PATCH /api/sessions/:id/title` routes that were never reachable

**UX improvements:**
- ✅ **UX-4** — Navigation guard in ChatPage: manual 3-layer guard (`beforeunload` + `popstate` + click capture) shows confirmation modal when unsent text exists
- ✅ **UX-6** — New Session page: Assistants section moved above Quick Start; Recent Sessions block removed
- ✅ **UX-8** — "Hold to select" hint on touch devices (shown once until first use, stored in localStorage)
- ✅ **UX-9** — Copy/Regenerate buttons visible at `opacity-40` on desktop (was fully hidden until hover)
- ✅ **UX-13** — Dynamic import of `rehype-highlight`: ChatPage chunk 350 KB → 183 KB gzip
- ✅ **Bugfix** — `/api/health` and `POST /api/messages` broken after CODE-1 refactor; fixed via named exports

**Task #25 Phase 2 — Assistants style / depth / system_prompt:**
- ✅ New DB columns: `assistants.style`, `assistants.depth`, `assistants.system_prompt` (idempotent migrations)
- ✅ `description` field removed from UI — auto-derived from first 100 chars of `system_prompt` on backend
- ✅ `AssistantTile` — style badge (emoji + label) + depth dots (●●○) in assistant colour; spinner in corner; "create" text removed
- ✅ `AssistantEditPage` — new field order: Name → Role/instructions → Style → Depth → Model → Color → Icon
- ✅ Communication style picker: 💬 Friendly · 📋 Formal · ✂️ Concise · 🎨 Creative (pill buttons, toggle)
- ✅ Response depth picker: ●○○ Quick · ●●○ Standard · ●●● Thorough (pill buttons with dot preview)
- ✅ Role / instructions field: monospaced textarea, resize, ≤ 4000 chars, counter, localised placeholder
- ✅ Starter assistants updated: General=friendly/standard · Code Helper=concise/thorough · Creative Writer=creative/standard
- ✅ i18n: 13 new keys × 4 languages (en/ru/es/de)
- ✅ `system_prompt` injected into Hermes chat as `system` message (`routes/chat.js`)

**Changed files:** `db/migrate.js`, `db/seed.js`, `db/helpers.js`, `routes/assistants.js`, `src/types/api.ts`, `src/types/assistant.ts`, `src/lib/api.ts`, `src/components/AssistantTile.tsx`, `src/components/AssistantCard.tsx`, `src/components/AssistantManageTile.tsx`, `src/pages/AssistantEditPage.tsx`, `src/pages/NewSessionPage.tsx`, i18n locales (×4), `server.js`, `app.js`, `db/connections.js`, `routes/system.js`, `routes/sessions.js`, `routes/chat.js`, `routes/models.js`, `routes/providers.js`, `routes/likes.js`, `ChatPage.tsx`, `SessionCard.tsx`, `MarkdownRenderer.tsx`.

---

### v0.7.0 — Code quality sprint (2026-06-08)
- ✅ **CODE-2** — Vitest added; 22 tests (security + time utilities)
- ✅ **CODE-3** — Dual Hermes DB connections documented
- ✅ **CODE-4** — `execSync` → `execFile` async in `/api/system/status`
- ✅ **CODE-5** — DB cleanup on startup failure (close before `process.exit`)
- ✅ **CODE-6** — 5 `useEffect` exhaustive-deps warnings fixed
- ✅ **CODE-7** — `formatTimestamp` deduplication → `formatRelativeTimestamp` in `lib/time.ts`
- ✅ **CODE-8** — `package.json` version synced with release tag
- ✅ **CODE-9** — `geoip-lite` moved to `optionalDependencies`, lazy import
- ✅ **CODE-10** — GitHub Actions CI: lint → typecheck → test → build
- ✅ **CODE-11** — XSS sanitization made recursive (depth cap 10)
- ✅ **CODE-14** — `middleware/security.ts` (TypeScript source for runtime `security.js`)
- ✅ **Task #26** — `useEffect` lint warnings in ChatPage resolved
- ✅ **Task #27** — `formatTimestamp` unified in `lib/time.ts`

---

### v0.6.1 — Assistants UX polish (2026-06-08)
- ✅ **Tile grid on `/assistants`** — management page uses same 1/2/3 column tile grid as `/new`
- ✅ **Context menu (`MoreVertical`)** — Edit / Duplicate / Archive moved to dropdown via `createPortal`
- ✅ **Tab filters with counts** — `Active (N)` / `Archived (M)` with `border-b-2` active indicator
- ✅ **Archived visual treatment** — `line-through` name + yellow warning badge
- ✅ **Restore action** — archived assistants can be restored from context menu
- ✅ **Sticky save bar** — action bar is `flex-shrink-0` at bottom of viewport
- ✅ **New assistant button hidden on empty state**

**New files:** `src/components/AssistantManageTile.tsx`.
**Changed:** `AssistantsPage.tsx`, `AssistantEditPage.tsx`, `server.js`, `src/lib/api.ts`, i18n (4 languages).

### v0.6.0 — Assistants Phase 1 (2026-06-08)
- ✅ **Assistants** — named bundles (name, description, color, icon, model) as tiles on New Session page
- ✅ **Assistants management page** (`/assistants`) — Active / Archived filter, list view with action column
- ✅ **Assistant editor page** (`/assistants/:id`, `/assistants/new`) — name, description, color, icon, model
- ✅ **Clone before save** — Duplicate navigates to editor prefilled; new row written only on "Create copy"
- ✅ **3 starter assistants** — seeded on first run
- ✅ **Fork-on-edit** — editing an assistant with sessions archives the old, creates new
- ✅ **Per-session assistant badge** — sessions list shows assistant pill (icon + name)

**New files:** `src/types/assistant.ts`, `src/lib/assistantColors.ts`, `src/store/assistantsStore.ts`, `src/components/ColorPicker.tsx`, `src/components/IconPicker.tsx`, `src/components/AssistantCard.tsx`, `src/components/AssistantTile.tsx`, `src/pages/AssistantsPage.tsx`, `src/pages/AssistantEditPage.tsx`.
**Backend:** `assistants` table, `session_meta.assistant_id`, 6 new endpoints, 3-assistant seeder.

### v0.5.2 — Mobile adaptation (2026-06-07)
- ✅ **Sidebar hidden on mobile** — `hidden md:flex`; hamburger button in `Navbar` also hidden (`< md` is covered by the bottom `MobileNav`).
- ✅ **Touch-friendly action buttons (44×44 px hit targets)** — every interactive icon in `ChatPage` (Edit / Save / Cancel / Delete session, per-message Copy / Regenerate, Send / Stop), `SessionsPage` (Pin / Archive / bulk checkbox, header buttons, bulk-action bar), and the swipe confirm modal now enforces a minimum 44×44 px touch surface via `min-h-[44px] min-w-[44px]`.
- ✅ **Action buttons visible on touch** — Pin/Archive on session cards and Copy/Regenerate on chat messages used to be `opacity-0 group-hover:opacity-100` only (invisible on touch). They now default to `opacity-100` (or `opacity-60` for chat-message actions) on mobile and `md:opacity-0 md:group-hover:opacity-100` on desktop.
- ✅ **Swipe-to-delete on session cards** — drag a card left to reveal a red "Delete" affordance, release past the threshold to open a confirm modal. New `useSwipe` hook (native `touchstart` / `touchmove` / `touchend` — no new dependencies) with a `data-swipe-ignore` attribute for nested buttons.
- ✅ **Long-press to enter bulk mode** — hold a session card for 500 ms to enable bulk-mode and select that card in one gesture. Shares the same `useSwipe` hook's touch tracker.
- ✅ **Safe-area insets** — `MobileNav` and the ChatPage input area use `env(safe-area-inset-bottom)` so the iOS home indicator doesn't overlap the bottom nav or the textarea.
- ✅ **Fluid typography** — `html { font-size: clamp(14px, 0.5vw + 13px, 16px) }` smoothly scales from 14 px on a 360-px screen to 16 px on a 768-px+ screen.
- ✅ **Responsive page padding** — `p-3 sm:p-4 md:p-6` on `DashboardPage`, `NewSessionPage`, `SessionsPage`, and the inner containers of `ChatPage`.
- ✅ **Responsive header layouts** — `SessionsPage` header buttons collapse to icons-only on mobile; bulk-action bar wraps to two rows on mobile; `ChatPage` header is `flex-wrap` with a `basis-full sm:basis-auto` breadcrumb so the delete-confirm row drops to a second line on 360-px screens.

**New files:** `src/hooks/useSwipe.ts`, `src/components/SessionCard.tsx`.

**Bundle impact:** `SessionsPage` chunk 75 KB → 80.49 KB (+5 KB for the card extraction + hook). No change to other chunks.

**Manual verification still pending (deferred, not required for tagging):** visual check at 360 / 768 / 1024 px in Chrome DevTools, real-device swipe + long-press, iOS safe-area.

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
- ✅ **#4** Fix Lint Errors in ChatPage — most cases (one residual warning → resolved in v0.7.0)

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

- **Lines of Code:** ~2 000 (backend, modular) + ~4 200 (frontend)
- **TypeScript:** 100% coverage on frontend
- **Test Coverage:** 22 tests (security + time utilities); backend routes not yet covered
- **Bundle Size (gzip):** ChatPage 183 KB · Sessions 80 KB · rehype-highlight 53 KB (lazy) · Settings 22 KB · index 66 KB · file-preview ~8 KB (lazy)
- **Code Splitting:** Dashboard 6 KB · NewSession 9 KB · Assistants 9 KB · AssistantEdit 9 KB · Providers 9 KB · Applications 4 KB · Settings 22 KB · Sessions 80 KB · Chat 183 KB + 53 KB lazy · file-preview 8 KB (lazy)
- **i18n:** ~240 strings × 4 languages (en, ru, es, de)
- **Known open tasks for v1.0.0:** 0 — all required tasks shipped ✅ (#36, #37, #38). Ready to tag v1.0.0.

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
│   ├── applications/       # Application plugins (file-preview, placeholder)
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

\* `presets` table added by Task #25 (shipped in v0.6.0 + v0.8.0).
