# Changelog

All notable changes to this project will be documented in this file.

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
