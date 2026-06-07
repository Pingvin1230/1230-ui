# Changelog

All notable changes to this project will be documented in this file.

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
