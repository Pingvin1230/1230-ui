# Changelog

All notable changes to this project will be documented in this file.

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
