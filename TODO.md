# 1230-UI — Tasks and Progress

**Last updated:** 2026-06-04  
**Version:** 1.0 MVP (Alpha release)  
**Goal:** Fully functional MVP that can be deployed on any server with Hermes Agent

---

## 🎯 Roadmap to v1.0

### P0 — Release Blockers (Critical for Publishing)
Tasks that are mandatory for GitHub publication and deployment on any server.

### P1 — Production-Ready (Important for 1.0)
Tasks that make the product production-ready but don't block basic functionality.

### P2 — Enhancements (After 1.0)
Nice-to-have features that can be added in subsequent versions.

---

## ✅ Completed

### Error Handling (Priority 1, 2, 3 — completed)
- ✅ **Fixed endpoint structure** in server.js — moved `/api/system/exec` out of `/api/system/status`
- ✅ **Structured errors from Backend**:
  - Types: `network`, `timeout`, `content_moderation`, `rate_limit`, `server_error`, `auth_error`, `invalid_request`
  - Fields: `type`, `message`, `provider`, `model`, `details`, `code`, `retryable`, `suggestion`
  - All errors contain codes (HTTP status + provider code)
- ✅ **Improved error display in UI**:
  - `ErrorMessage.tsx` component with icons by error type
  - Shows: title, details, provider/model, recommendations
  - "Retry" button for retryable errors
  - Expandable block with technical details
- ✅ **SSE processing status**: `thinking` → `generating` → response
- ✅ **Process display in UI**: "Agent is thinking..." / "Generating response..."
- ✅ **Automatic retry** (up to 3 attempts) for network and server errors with exponential backoff
- ✅ **Toxic session blocking**:
  - On `content_moderation` error, input field replaced with banner
  - State saved in sessionStorage
  - "Create new session" button
- ✅ **Error Boundary** — catches React component errors, shows UI with reload button
- ✅ **Server logging** — JSON logs for each request (method, path, status, duration)

### Core Features
- ✅ Dashboard with System Status, Recent Sessions, Quick Chat
- ✅ Session list with infinite scroll (20 at a time) and date grouping
- ✅ Chat with real-time streaming responses
- ✅ Multi-line input field (textarea with auto-resize up to 200px)
- ✅ Create new sessions with model selection
- ✅ Model management (enable/disable) in Settings
- ✅ Sync providers and models from Hermes
- ✅ Hermes system commands (update, doctor) in Settings
- ✅ Markdown message rendering with syntax highlighting
- ✅ Tool calls visualization (collapsible blocks)
- ✅ Save selected model in localStorage
- ✅ Response waiting indicator ("Agent is thinking..." / "Generating response...")

### Backend
- ✅ Express.js server with SQLite (better-sqlite3)
- ✅ Two DBs: Hermes DB (read-only) + UI DB (read-write)
- ✅ Hermes API integration (proxy, streaming SSE)
- ✅ GitHub API request caching (1 hour)
- ✅ Automatic table creation in DB
- ✅ 12 API endpoints for all functions

### UI/UX
- ✅ Responsive design (mobile-friendly)
- ✅ Dark/Light theme switcher
- ✅ Skeleton loading states
- ✅ Empty states
- ✅ Icons from lucide-react

### Infrastructure
- ✅ PM2 configuration (ecosystem.config.json)
- ✅ Nginx reverse proxy
- ✅ HTTPS (Let's Encrypt)
- ✅ Authelia authentication
- ✅ Systemd service for Hermes API

### Frontend Refactor (2026-06-04, 27/27 tasks)
**Tier 1 (17 tasks):**
- ✅ Removed gradients (T1.1)
- ✅ Toast component with queue and auto-dismiss (T1.2)
- ✅ Confirm modal for destructive actions (T1.3)
- ✅ Copy button on code blocks (T1.4)
- ✅ Copy button on messages (T1.5)
- ✅ Regenerate for assistant messages (T1.6)
- ✅ Auto-scroll respecting user position (T1.7)
- ✅ Relative timestamps (unified `lib/time.ts` library) (T1.8)
- ✅ Avatars for user/assistant (T1.9)
- ✅ Skeleton loading in ChatPage (T1.10)
- ✅ 404 state for non-existent sessions (T1.11)
- ✅ Breadcrumbs in ChatPage (T1.12)
- ✅ Session search (client-side, with debounce and URL sync) (T1.13)
- ✅ Default model in Settings (with optgroup by providers) (T1.14)
- ✅ JetBrains Mono for code (T1.15)
- ✅ Custom scrollbar (dark/light) (T1.16)
- ✅ ARIA labels + focus-visible (T1.17)

**Tier 2 (7 tasks):**
- ✅ Session list virtualization (react-virtuoso) (T2.1)
- ✅ Reusable Modal with focus-trap and ESC close (T2.2)
- ✅ Code splitting (lazy loading for all pages) (T2.3)
- ✅ Token count + latency in messages (T2.4)
- ✅ Bottom-nav for mobile (T2.5)
- ✅ Design tokens (CSS variables for colors, radii, shadows) (T2.6)
- ✅ Reduced motion support (T2.7)

**Tier 3 (3 tasks):**
- ✅ Empty state for chat (T3.1)
- ✅ Empty illustrations (SVG for no sessions/messages/models) (T3.2)
- ✅ Print styles (T3.3)

**UI fixes:**
- ✅ Dashboard: Quick Chat elevated, textarea improved
- ✅ NewSessionPage: full refactor (textarea + send in Dashboard style)
- ✅ Settings: content centering

---

## 🚨 P0 — Release Blockers (Critical for v1.0)

These tasks are **mandatory** for GitHub publication and deployment on any server.

### ✅ 0.5. Session Management (CRUD)
**Role:** Backend + Frontend  
**Files:** `server.js`, `src/pages/ChatPage.tsx`, `src/lib/api.ts`  
**Description:** Currently user cannot delete session — list gets cluttered with test/failed sessions  
**Problem:**
- No "Delete session" button
- Cannot rename session (related to task #0)
- No archiving or pinning for important sessions

**Tasks:**

**Session deletion:**
- ✅ Endpoint `DELETE /api/sessions/:id` — deletes session + messages from Hermes state.db
- ✅ "Delete" button in ChatPage (Trash2 icon in header, with confirm modal)
- ✅ Redirect to `/sessions` after deletion

**Renaming:**
- ✅ Endpoint `PATCH /api/sessions/:id/title` — updates title in Hermes DB
- ✅ Inline title editing in ChatPage breadcrumbs (click → input → Enter to save, Esc to cancel, blur to save)

**Optional (can be in P1):**
- ✅ Pin important sessions (displayed first in "Pinned" group)
- ✅ Archiving (hide from main list, toggle to show)
- ✅ Bulk actions (select multiple → delete with confirm modal)

**Priority:** HIGH (important for data management)  
**Complexity:** Medium (2-3 hours for basic deletion)  
**Dependencies:** Task #0 (renaming overlaps)  
**Status:** ✅ Full CRUD completed — delete, rename, pin, archive, bulk delete (2026-06-05)

---

### ✅ 0.7. Real-time Agent Work Visualization
**Role:** Backend + Frontend  
**Files:** `server.js`, `src/lib/api.ts`, `src/pages/ChatPage.tsx`, `src/components/ToolCall.tsx`  
**Description:** User doesn't see what agent is doing after sending message — only "Agent is thinking..." → "Generating response..."  
**Problem:**
- Hermes API sends tool calls in SSE stream, but backend just proxies raw chunks
- Frontend parses only text, ignores tool calls during streaming
- ToolCall component only used for already saved messages from history
- User doesn't understand: is agent reading file? executing command? searching? frozen?

**Solution (3 stages):**

**Stage A: Tool calls parsing on Backend**
- ✅ Study SSE events format from Hermes API (what tool calls look like)
- ✅ Parse chunks in `server.js` endpoint `/api/chat` (line 514)
- ✅ Extract tool call events: `{ type: 'tool_call', toolName: 'bash', content: 'ls -la', status: 'running' }`
- ✅ Send separate SSE events for frontend:
  - `{ type: 'tool_call_start', toolName: 'bash', id: 'tc_123' }`
  - `{ type: 'tool_call_progress', id: 'tc_123', content: 'Executing...' }`
  - `{ type: 'tool_call_end', id: 'tc_123', result: 'file1.txt\nfile2.txt' }`
- ✅ Send process statuses: `{ type: 'status', status: 'executing_tool', toolName: 'bash' }`

**Stage B: Real-time rendering on Frontend**
- ✅ Update `api.ts` — add callbacks for tool calls:
  ```typescript
  onToolCallStart?: (toolName: string, id: string) => void;
  onToolCallProgress?: (id: string, content: string) => void;
  onToolCallEnd?: (id: string, result: string) => void;
  ```
- ✅ Add state in ChatPage: `activeToolCalls: Map<string, { toolName: string, status: string, content: string }>`
- ✅ Render ToolCall components in real-time (above streaming content)
- ✅ Update ToolCall component — add `running` state (with spinner animation)
- ✅ Show indicators: "Executing bash command...", "Reading file X...", "Searching in files..."

**Stage C: UI polish**
- ✅ Tool calls counter: "3 of 5 tools completed"
- ✅ Automatic collapsing of completed tool calls (collapsed by default)
- ✅ "Show details" button for each tool call
- ✅ Log all tool calls to console (for debugging)
- ✅ Transition animation between tool calls (smooth appearance)

**Priority:** CRITICAL (blocks understanding of agent work)  
**Complexity:** High (6-8 hours, requires studying Hermes API format)  
**Dependencies:** None (can run in parallel with #0, #0.5)

**Alternatives:**
- Backend parsing only (no UI) — faster, but user still doesn't see progress
- Polling `/api/sessions/:id/messages` every 2 seconds — simple solution, but DB load
- **Real-time streaming tool calls (recommended)** — best UX, but harder to implement

**Technical details:**
- Backend currently just proxies: `res.write(chunk)` (server.js:522)
- Need to add intermediate parser between `reader.read()` and `res.write()`
- Frontend already knows how to parse SSE (api.ts:158-193), need to add handling for new event types

---

### ✅ 0.8. UI Internationalization (Russian → English)
**Role:** Frontend + Backend  
**Files:** `server.js`, `src/lib/api.ts`, `src/pages/ChatPage.tsx`, `src/components/ErrorMessage.tsx`  
**Description:** Error messages and UI text are in Russian, but English needed for open-source project on GitHub  
**Problem:**
- Error messages in `api.ts` in Russian: "Request blocked by security filter", "Network error"
- Backend returns Russian errors: "Hermes API unavailable", "Unknown provider error"
- UI statuses: "Agent is thinking...", "Generating response..."
- Error titles: "Server error", "Authentication error"

**Tasks:**

**Backend (`server.js`):**
- ✅ Translate all error messages in `/api/chat` (lines 449, 465, 533, 567-568)
- ✅ Translate other API endpoints if Russian strings exist

**Frontend (`api.ts`):**
- ✅ Translate content moderation error (lines 173, 179)
- ✅ Translate network error (line 249)
- ✅ Check other fetch calls

**Frontend UI:**
- ✅ `ChatPage.tsx` (line 443): "Agent is thinking..." → "Agent is thinking...", "Generating response..." → "Generating response..."
- ✅ `ErrorMessage.tsx` (lines 19-29): translate ERROR_TITLES dict
- ✅ Check other components for Russian placeholder/labels

**Optional (P1+):**
- [ ] Move all UI strings to `src/i18n/en.json` for future i18n support
- [ ] Add language switcher in Settings

**Priority:** HIGH (important for open-source project)  
**Complexity:** Low-Medium (1-2 hours)  
**Dependencies:** None

---

### ✅ 1. Centralized Configuration
**Role:** Backend  
**Files:** `config.js` (new), `server.js`, `.env.example`, `.env`  
**Description:** Move all hardcoded values to .env file  
**Tasks:**
- ✅ Create `config.js` for loading configuration from env
- ✅ Create `.env.example` with template of all variables
- ✅ Create `.env` with current values for BIG server
- ✅ Update `server.js` to use `config.js`
- ✅ Add `dotenv` to dependencies
- ✅ Remove hardcoded paths (`/home/pingvin1230/.hermes/...`, paths to Python scripts)
- ✅ Update systemd service file to use `EnvironmentFile=/opt/1230-ui/.env`

**Implementation:**
- `config.js` — centralized configuration loader with fallback values
- `.env.example` — template for users with detailed comments
- `.env` — real configuration for BIG server
- `server.js` — imports `config` and uses `config.port`, `config.hermesDbPath`, etc.
- Systemd service — reads variables from `.env` via `EnvironmentFile`

**Testing:**
- ✅ `npm run lint` — 0 errors
- ✅ `npm run build` — successful
- ✅ `systemctl restart 1230-ui` — service running
- ✅ `curl /api/health` — OK
- ✅ `POST /api/sessions` — session creation works
- ✅ `POST /api/system/exec` — hermes doctor executes

**Priority:** CRITICAL  
**Complexity:** Medium (2-3 hours)  
**Dependencies:** None  
**Status:** ✅ COMPLETED (2026-06-04)

---

### ✅ 2. .gitignore for Publishing
**Role:** Backend  
**Files:** `.gitignore`  
**Tasks:**
- ✅ `node_modules/`, `dist/`, `data/*.db`
- ✅ `.env`, `.env.local`, `.env.*.local`
- ✅ Logs (`*.log`, `logs/`)
- ✅ IDE files (`.vscode/`, `.idea/`)
- ✅ OS files (`.DS_Store`, `Thumbs.db`)
- ✅ Python cache (`__pycache__/`, `*.pyc`)

**Priority:** CRITICAL  
**Complexity:** Low (30 minutes)  
**Dependencies:** None

---

### ✅ 3. Setup Script for Installation
**Role:** Backend  
**Files:** `install.sh`, `README.md`  
**Description:** Simplify deployment without Docker  
**Tasks:**
- ✅ Check Node.js 18+, Python 3.x
- ✅ Check installed Hermes Agent
- ✅ `npm install` + `npm run build`
- ✅ PM2 setup (optional)
- ✅ Create `.env` from `.env.example` with interactive input
- ✅ Documentation in README (5 steps)

**Priority:** HIGH  
**Complexity:** Low (1-2 hours)  
**Dependencies:** Task #1

---

### ✅ 4. Fix Lint Errors in ChatPage
**Role:** Frontend  
**Files:** `src/pages/ChatPage.tsx`  
**Description:** 2 known issues with `react-hooks/set-state-in-effect` and `react-hooks/exhaustive-deps`  
**Problem:** False positive in React 19 / eslint-plugin-react-hooks v7 for data loading

**Solution:**
- ✅ Removed `useCallback` wrappers for `loadSession` and `loadMessages`
- ✅ Data loading logic inlined directly into `useEffect` with inline async IIFE
- ✅ Added `cancelled` flag for cleanup (prevents setState after unmount)
- ✅ Added `retryTrigger` state for "Try again" button (instead of direct function calls)
- ✅ Removed `sendInitialMessage` useCallback, replaced with direct `doSend` call
- ✅ Added `eslint-disable-next-line` for useEffect with `doSend` with justification
- ✅ Removed `useCallback` from import (no longer used)

**Priority:** HIGH (blocks CI/CD)  
**Complexity:** Medium (1-2 hours)  
**Dependencies:** None  
**Status:** ✅ COMPLETED (2026-06-04)

---

## 📋 P1 — Production-Ready (Important for v1.0)

These tasks make the product production-ready but don't block basic functionality.

### 5. Configuration Validation
**Role:** Backend  
**File:** `config.js`  
**Tasks:**
- [ ] Check required variables at startup
- [ ] Validate paths (check existence)
- [ ] Validate URLs (Hermes API endpoint)
- [ ] Nice error message with instructions when parameter missing

**Priority:** HIGH  
**Complexity:** Low (1 hour)  
**Dependencies:** Task #1

---

### 6. Input Validation and Rate Limiting
**Role:** Backend  
**Files:** `server.js`, `middleware/` (new)  
**Tasks:**
- [ ] Request body validation via `zod` or `joi`
- [ ] Rate limiting for API endpoints (`express-rate-limit`)
- [ ] Input sanitization (XSS protection)

**Priority:** HIGH  
**Complexity:** Medium (2-3 hours)  
**Dependencies:** None

---

### 7. CORS Configuration
**Role:** Backend  
**Files:** `server.js`  
**Tasks:**
- [ ] Add `cors` middleware
- [ ] Whitelist trusted domains via env (`CORS_ORIGINS`)
- [ ] Support credentials (cookies for Authelia)

**Priority:** MEDIUM  
**Complexity:** Low (30 minutes)  
**Dependencies:** Task #1

---

### 8. Security Headers
**Role:** Backend  
**Files:** `server.js`  
**Tasks:**
- [ ] `helmet` middleware (CSP, X-Frame-Options, X-Content-Type-Options)
- [ ] HSTS (if HTTPS)
- [ ] Referrer-Policy

**Priority:** MEDIUM  
**Complexity:** Low (30 minutes)  
**Dependencies:** None

---

### ✅ 9. Design Tokens Unification
**Role:** Frontend  
**Files:** All pages and components  
**Description:** Migrate old components to new design tokens (T2.6)  
**Tasks:**
- [x] Replace `bg-white dark:bg-gray-800` → `bg-bg-primary`
- [x] Replace `text-gray-900 dark:text-gray-100` → `text-fg-primary`
- [x] Replace `border-gray-200 dark:border-gray-700` → `border-border-default`
- [x] Replace `hover:bg-gray-100 dark:hover:bg-gray-800` → `hover:bg-bg-secondary`
- [x] Migrate all 10 files: MarkdownRenderer, ToolCall, Toast, ErrorBoundary, ChatPage, SessionsPage, NewSessionPage, SettingsPage, DashboardPage

**Token system (10 tokens):**
- Backgrounds: `bg-bg-primary`, `bg-bg-secondary`, `bg-bg-muted`
- Text: `text-fg-primary`, `text-fg-secondary`, `text-fg-muted`
- Borders: `border-border-default`, `border-border-strong`, `divide-border-default`
- Placeholder: `placeholder-fg-muted`

**Priority:** MEDIUM  
**Complexity:** Medium (2-3 hours)  
**Dependencies:** None  
**Status:** ✅ COMPLETED (2026-06-05) — 188 replacements across 10 files

---

### ✅ 7. CORS Configuration
**Role:** Backend  
**Files:** `server.js`, `config.js`, `.env.example`  
**Tasks:**
- [x] Add `cors` middleware
- [x] Whitelist trusted domains via env (`CORS_ORIGINS`)
- [x] Support credentials (cookies for Authelia)

**Priority:** MEDIUM  
**Complexity:** Low (30 minutes)  
**Dependencies:** Task #1  
**Status:** ✅ COMPLETED (2026-06-05)

---

### ✅ 8. Security Headers
**Role:** Backend  
**Files:** `server.js`  
**Tasks:**
- [x] `helmet` middleware (CSP, X-Frame-Options, X-Content-Type-Options)
- [x] HSTS (if HTTPS)
- [x] Referrer-Policy

**Priority:** MEDIUM  
**Complexity:** Low (30 minutes)  
**Dependencies:** None  
**Status:** ✅ COMPLETED (2026-06-05)

---

### 10. Complete Manual Verification
**Role:** Frontend + Backend  
**Description:** Frontend developer didn't manually verify changes (only build + lint)  
**Tasks:**
- [ ] Dev-server: all pages and functions
- [ ] Mobile breakpoint (360px, 768px)
- [ ] Dark/light themes visually
- [ ] Accessibility (screen reader, keyboard navigation)
- [ ] Performance (1000+ sessions in virtuoso)
- [ ] FCP < 1.5s after code splitting

**Priority:** HIGH  
**Complexity:** Medium (3-4 hours)  
**Dependencies:** Task #4

---

## 📋 P2 — Enhancements (After v1.0)

These tasks can be postponed to next versions.

### 0. Smart Session Titles — LLM Generation
**Role:** Backend + Frontend  
**Files:** `server.js`, `scripts/generate_title.py` (new), `src/pages/ChatPage.tsx`  
**Description:** Auto-generate titles via LLM after first assistant response (Stage A only — Stage B manual editing is already done)

**Stage A: LLM title generation (Backend)**
- [ ] Create `scripts/generate_title.py` — script for generating title via Hermes API
- [ ] Logic: after first assistant response completes, send context (user message + assistant response) to LLM with prompt "Generate short title (3-7 words) for this session"
- [ ] Add endpoint `POST /api/sessions/:id/generate-title` — calls script, updates title in DB
- [ ] Automatic call in ChatPage after first streaming response completes (if title is empty or auto-generated)
- [ ] "Generating title..." indicator in UI

**Stage C: UI improvements**
- [ ] Show "Generating title..." skeleton while LLM works
- [ ] Fallback to auto-generation (first 60 characters) if LLM unavailable
- [ ] "Regenerate title" button in ChatPage (RefreshCw icon next to title)

**Priority:** LOW (for v1.1)  
**Complexity:** Medium (2-3 hours)  
**Dependencies:** None (manual title editing already done)

---

### Testing

#### 11. Backend Unit Tests
**Role:** Backend  
- [ ] Set up Vitest or Jest
- [ ] Tests for `/api/sessions`, `/api/chat`, `/api/models`
- [ ] Coverage >70%

**Priority:** MEDIUM (for v1.1)

---

#### 12. E2E Tests
**Role:** Frontend  
- [ ] Playwright or Cypress
- [ ] Tests: session creation, message sending, model switching

**Priority:** LOW (for v1.2)

---

### UX Improvements

#### 13. Session Search (server-side)
**Role:** Backend + Frontend  
- [ ] FTS5 index in SQLite
- [ ] API endpoint `/api/sessions/search`
- [ ] Integration with client-side search (T1.13)

**Priority:** MEDIUM (for v1.1)

---

#### 14. Auto-refresh Session List
**Role:** Frontend  
- [ ] Polling every 30 seconds
- [ ] "New sessions available" indicator

**Priority:** LOW (for v1.2)

---

#### 15. Keyboard Shortcuts
**Role:** Frontend  
- [ ] `Ctrl/Cmd + K` — focus on search
- [ ] `Ctrl/Cmd + N` — new session
- [ ] `Ctrl/Cmd + Enter` — send

**Priority:** LOW (for v1.2)

---

#### 16. Session Export
**Role:** Backend + Frontend  
- [ ] Export to Markdown / JSON
- [ ] "Export" button in ChatPage
- [ ] Backend endpoint for export generation

**Priority:** LOW (for v1.2)

---

#### 17. Title Generation via LLM
**Role:** Backend  
- [ ] Batch job for existing sessions
- [ ] UI button "Generate title"
- [ ] Integration with Hermes API for generation

**Priority:** LOW (for v1.3)

---

### Additional Features

#### 18. New Message Notifications
**Role:** Frontend  
- [ ] Browser notifications (Notification API)
- [ ] Badge on tab icon

**Priority:** LOW (for v1.2)

---

#### 19. CI/CD Pipeline
**Role:** Backend  
- [ ] GitHub Actions workflow
- [ ] Lint + test on PR
- [ ] Auto-build Docker image
- [ ] Auto-deploy on merge (optional)

**Priority:** MEDIUM (for v1.1)

---

#### 20. Docker Support (optional)
**Role:** Backend  
- [ ] Multi-stage Dockerfile (build frontend + serve via Node)
- [ ] `docker-compose.yml` with volumes for data and .env
- [ ] `.dockerignore` (node_modules, .git, etc)
- [ ] Documentation in README for Docker launch

**Priority:** LOW (for v1.2)  
**Note:** Not critical for MVP, as setup script (#3) covers 90% of cases

---

### Mobile Adaptation and Accessibility

#### 21. Mobile Adaptation (improvements)
**Role:** Frontend  
- [ ] Touch-friendly buttons (increase sizes)
- [ ] Responsive typography (fluid scaling)
- [ ] Swipe gestures for session deletion

**Priority:** LOW (for v1.2)

---

#### 22. PWA (Progressive Web App)
**Role:** Frontend  
- [ ] Web App Manifest
- [ ] Service Worker for offline mode
- [ ] Install prompt

**Priority:** LOW (for v1.3)

---

#### 23. Accessibility (a11y) Improvements
**Role:** Frontend  
- [ ] Full keyboard navigation
- [ ] Color contrast (WCAG AA compliance)
- [ ] Screen reader testing
- [ ] ARIA live regions for streaming

**Priority:** LOW (for v1.2)

---

#### 24. Internationalization (i18n)
**Role:** Frontend  
- [ ] react-i18next
- [ ] Russian and English
- [ ] Extract strings from UI

**Priority:** LOW (for v1.3)

---

## 🐛 Known Issues

### Frontend
- **ChatPage lint errors:** 2 issues with `react-hooks/set-state-in-effect` and `react-hooks/exhaustive-deps` (false positive in React 19) — **Task #4**
- **SettingsPage `formatTimestamp`:** not unified with `lib/time.ts` (low priority)

### Backend
- **Hardcoded paths:** `/home/pingvin1230/.hermes/...` in server.js — **Task #1**
- **No validation:** request body not validated — **Task #6**
- **No rate limiting:** API open to abuse — **Task #6**

---

## 📊 Project Metrics

- **Lines of Code:** ~2500 (backend) + ~3500 (frontend, after refactor)
- **Test Coverage:** 0% (need to add tests — Task #11, #12)
- **TypeScript:** 100% coverage
- **Bundle Size:** ~615KB (gzip: ~189KB)
- **Code Splitting:** Dashboard 10KB, Sessions 68KB, Settings 14KB, Chat 344KB, NewSession 4KB
- **New files (after refactor):** 8 components, 1 hook, 2 libraries, 1 store

---

## 👥 Task Distribution by Roles

### Backend Developer
**Critical (P0):**
- #0.5 Session management (endpoints for delete, rename, pin, archive, bulk)
- #1 Centralized configuration
- #2 .gitignore
- #3 Setup script for installation

**Important (P1):**
- #5 Configuration validation
- #6 Input validation and rate limiting
- #7 CORS configuration
- #8 Security headers

**Enhancements (P2):**
- #0 Smart titles (LLM generation, endpoint for generate-title)
- #11 Unit tests
- #19 CI/CD pipeline

### Frontend Developer
**Critical (P0):**
- #0.5 Session management (delete/rename/pin/archive buttons, bulk actions)
- #0.7 Agent work visualization (real-time tool call rendering, indicators)
- #0.8 UI text and error messages internationalization
- #4 Fix lint errors in ChatPage

**Important (P1):**
- #9 Design tokens unification
- #10 Complete manual verification

**Enhancements (P2):**
- #12 E2E tests
- #13-18 UX improvements
- #20-23 Mobile adaptation, PWA, a11y, i18n

### Fullstack / Joint
- #0 Smart titles (backend + frontend integration)
- #0.5 Session management (CRUD operations)
- #0.7 Agent work visualization (streaming tool calls end-to-end)
- #0.8 Internationalization (Russian → English)
- #10 Complete manual verification (frontend + backend)
- #13 Session search (server-side)
- #16 Session export

---

## 🔍 What Else Might Be Missing

### Critical for MVP (check)
1. **✅ Session deletion** — task #0.5 (full CRUD: delete, rename, pin, archive, bulk)
2. **✅ Agent work visualization** — task #0.7 (real-time tool calls)
3. **✅ Internationalization** — task #0.8 (Russian → English)
4. **⚠️ Smart session titles (LLM)** — task #0 (moved to P2, manual editing done)
5. **⚠️ Provider health-check** — currently if provider unavailable, error only when sending message
   - Possibly add endpoint `GET /api/models/health` to check provider availability
   - UI: status indicator in Settings (green/yellow/red)
6. **⚠️ Long message handling** — what happens if user sends very long message?
   - Check Hermes API limits
   - UI: warning if message > N characters

### Can be postponed (P1+)
- Tags/folders for sessions
- Per-session model parameters (model selection for each session separately)
- Message edit/branch (editing sent messages)
- Reactions to messages
- Multi-user (session separation by users)
- Webhooks/Telegram integration
- Backup/restore

---

## 📝 Architecture

```
1230-ui/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── ErrorBoundary.tsx    # Error Boundary
│   │   ├── ErrorMessage.tsx     # Error component
│   │   ├── Layout.tsx
│   │   ├── MarkdownRenderer.tsx
│   │   └── ToolCall.tsx
│   ├── pages/              # Pages
│   │   ├── ChatPage.tsx    # Chat with streaming
│   │   ├── DashboardPage.tsx
│   │   ├── NewSessionPage.tsx
│   │   ├── SessionsPage.tsx
│   │   └── SettingsPage.tsx
│   └── lib/api.ts          # API client (retry, SSE, error handling)
├── server.js               # Express backend (logging, error handling)
├── scripts/                # Python scripts
│   ├── create_session.py
│   ├── save_messages.py
│   └── sync_providers.py
└── data/1230-ui.db         # UI database (providers, models, cache)
```

---

## 🔧 Useful Commands

```bash
pm2 status                    # Status
pm2 logs 1230-ui              # Logs
pm2 restart 1230-ui           # Restart

npm run dev                   # Dev server
npm run build                 # Production build

curl http://localhost:3001/api/health
curl http://localhost:3001/api/system/status

systemctl status hermes-api   # Hermes API status
journalctl -u hermes-api -f   # Hermes API logs
```
