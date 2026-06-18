# Development Guide

## Local Development Setup

```bash
# Clone repository
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui

# Install dependencies
npm install

# Create configuration
cp .env.example .env
# Edit .env with your settings (see docs/CONFIGURATION.md)

# Start development server
npm run dev
```

Dev server runs on `http://localhost:5173` with a Vite proxy to the backend on port 3001.
The backend must be started separately: `node server.js` (or via PM2).

## Available Scripts

```bash
npm run dev          # Vite dev server (port 5173) with HMR
npm run build        # Production build: tsc -b && vite build → dist/
npm run typecheck    # Type-check all TypeScript (frontend + middleware), no emit
npm run lint         # ESLint across src/ and middleware/
npm test             # Vitest — run test suite once
npm run test:watch   # Vitest — watch mode
npm run preview      # Preview production build locally
```

## Project Structure

```
1230-ui/
├── src/                          # Frontend (React 19 + TypeScript 6 + Vite 8)
│   ├── applications/             # Application plugins (right split-pane)
│   │   ├── registry.ts           #   key → React component map
│   │   ├── types.ts              #   ApplicationComponentProps
│   │   ├── file-preview/         #   FilePreviewApp
│   │   ├── file-manager/         #   FileManagerApp
│   │   ├── cloud-connect/        #   CloudConnectApp (WebDAV browser)
│   │   ├── tududi/               #   TududiApp (Tasks / Notes / Projects)
│   │   │   ├── TududiApp.tsx
│   │   │   └── views/
│   │   │       ├── TasksView.tsx
│   │   │       ├── TaskDetail.tsx
│   │   │       ├── NotesView.tsx
│   │   │       └── ProjectsView.tsx
│   │   └── placeholder/          #   PlaceholderApp (default for unknown keys)
│   ├── components/               # UI components
│   │   ├── ApplicationsPane.tsx  # Right split-pane container
│   │   ├── ApiKeyInput.tsx       # Password input with show/hide toggle
│   │   ├── AgentFileCard.tsx     # In-message download card
│   │   ├── AssistantCard.tsx     # Legacy horizontal card (superseded by AssistantManageTile)
│   │   ├── AssistantManageTile.tsx # Tile for /assistants management page (portal dropdown)
│   │   ├── AssistantTile.tsx     # Tile for /new session page; "via OpenCode" badge
│   │   ├── ColorPicker.tsx       # 8-color radio palette for assistant editor
│   │   ├── ErrorBoundary.tsx     # Catches React component errors
│   │   ├── ErrorMessage.tsx      # Structured API error display
│   │   ├── HermesStatusIndicator.tsx # Header status icon (green/red/gray) + tooltip
│   │   ├── OpenCodeStatusIndicator.tsx # OpenCode executor status dot
│   │   ├── OpenCodeProviderCard.tsx    # OpenCode-specific provider row
│   │   ├── IconPicker.tsx        # 30-emoji picker for assistant editor
│   │   ├── Layout.tsx            # Main layout (Navbar + Sidebar + Content)
│   │   ├── MarkdownRenderer.tsx  # Markdown + syntax highlighting
│   │   ├── MobileNav.tsx         # Bottom nav for mobile (hidden on md+, iOS safe-area)
│   │   ├── Modal.tsx             # Reusable modal with focus-trap
│   │   ├── Navbar.tsx            # Top bar (search + status + apps pane toggle + user menu)
│   │   ├── PageSkeleton.tsx      # Skeleton for lazy-loaded pages
│   │   ├── ProviderCard.tsx      # Single provider row in Providers page
│   │   ├── SessionCard.tsx       # Session card: 3-row layout, right-side checkbox (zero layout shift), swipe-to-delete, long-press bulk
│   │   ├── Sidebar.tsx           # Left rail nav — desktop only (hidden md:flex)
│   │   ├── Toast.tsx             # Toast notifications with queue and auto-dismiss
│   │   ├── ToolCall.tsx          # Collapsible tool-call visualization
│   │   └── settings/             # Shared sub-components for /settings/* pages
│   ├── pages/                    # Application pages (all lazy-loaded via React.lazy)
│   │   ├── AssistantEditPage.tsx # /assistants/:id, /assistants/new — create/edit + executor picker
│   │   ├── AssistantsPage.tsx    # /assistants — tile grid, tab filters, context menus
│   │   ├── ApplicationsPage.tsx  # /applications — enable / reorder applications
│   │   ├── ChatPage.tsx          # /chat/:id — streaming chat, markdown, tool calls, apps pane
│   │   ├── CloudSettingsPage.tsx # /settings/cloud — Cloud Connect CRUD
│   │   ├── DashboardPage.tsx     # / — greeting, Quick Chat, Assistants tiles, Recent Sessions
│   │   ├── HermesSettingsPage.tsx # /settings/executors/hermes-agent
│   │   ├── NewSessionPage.tsx    # /new — assistant tiles + standard model tile
│   │   ├── OpenCodeSettingsPage.tsx # /settings/executors/opencode — URL / username / password
│   │   ├── ProvidersPage.tsx     # /settings/providers — API key management
│   │   ├── SessionsPage.tsx      # /sessions — virtualised list, search, bulk actions
│   │   ├── SettingsPage.tsx      # /settings — main settings hub
│   │   └── TududiSettingsPage.tsx # /settings/tududi — Tududi connection status
│   ├── hooks/                    # React hooks
│   │   ├── useDocumentVisibility.ts
│   │   ├── useExecutorConfig.ts  # Read / write /api/system/executor-config
│   │   ├── useHermesStatusPoll.ts # Polls /api/system/status every 60 s
│   │   ├── useKeyboardShortcuts.ts # Ctrl+K / Ctrl+N / Ctrl+Enter
│   │   ├── useMobile.ts          # < 768 px
│   │   ├── useNotifications.ts   # Browser Notification API helpers
│   │   ├── useOpenCodeStatusPoll.ts # Polls /api/system/executors every 60 s
│   │   ├── useSwipe.ts           # Native touch: swipe-left + long-press (no deps)
│   │   ├── useTimeBracketColor.ts
│   │   └── useToast.ts           # Toast queue API
│   ├── lib/                      # Utilities
│   │   ├── api.ts                # API client (fetch, retry, SSE streaming)
│   │   ├── api/                  # Per-domain API clients
│   │   │   └── tududi.ts         #   Tududi proxy client + types + TududiApiError
│   │   ├── assistantColors.ts    # Color → Tailwind class map + FALLBACK_COLOR
│   │   ├── fileUtils.ts          # formatFileSize
│   │   └── time.ts               # formatTimeAgo, formatFullDateTime, formatRelativeTimestamp
│   ├── store/                    # Zustand stores (all persisted to localStorage)
│   │   ├── applicationsStore.ts  #   application registry, fetch / update
│   │   ├── appsPaneStore.ts      #   right split-pane toggle
│   │   ├── assistantsStore.ts    #   assistants list, fetch / upsert / remove
│   │   ├── chatInputStore.ts     #   draft message text, attached files
│   │   ├── cloudConnectStore.ts  #   cloud connections, current path, selection
│   │   ├── filePreviewStore.ts   #   selected file id, viewer mode
│   │   ├── hermesStatusStore.ts  #   Hermes status cache (5-min staleness guard)
│   │   ├── notificationsStore.ts #   Browser notification toggle
│   │   ├── openCodeStatusStore.ts #  OpenCode executor health
│   │   ├── searchStore.ts        #   global session search query (URL-synced)
│   │   ├── sessionStore.ts       #   session state
│   │   ├── sessionsSortStore.ts  #   created | lastMessage sort mode
│   │   ├── sidebarStore.ts       #   sidebar open/closed
│   │   └── themeStore.ts         #   dark/light mode
│   ├── i18n/                     # 4-language translations (en, ru, es, de)
│   ├── types/                    # TypeScript type definitions
│   │   ├── api.ts                #   Session, Message, Assistant, Application, CloudConnection, IssuedLink API shapes
│   │   ├── assistant.ts          #   ASSISTANT_PALETTE, ASSISTANT_ICONS, EXECUTOR_OPTIONS, AssistantColorId, AssistantExecutorId
│   │   └── session.ts
│   ├── assets/                   # SVG illustrations (empty states)
│   ├── styles/                   # markdown.css (prose styles for chat)
│   ├── App.tsx                   # Root component (routes, lazy pages, ErrorBoundary)
│   ├── index.css                 # Design tokens (@theme), dark mode vars, base styles
│   └── main.tsx                  # Entry point
│
├── server.js                     # Entry point: open DBs → migrate → seed → load executor config → cleanup expired files → listen
├── app.js                        # Express app: middleware + route mounting
├── config.js                     # Zod-validated config loader (env + system_settings override)
│
├── db/                           # Database layer
│   ├── connections.js            # Open db / hermesDbWrite / uiDb; export closeAll()
│   ├── migrate.js                # initSchema(): CREATE TABLE + idempotent ALTER TABLE
│   ├── seed.js                   # seedStarterAssistants() + seedStarterApplications() (4 apps)
│   ├── helpers.js                # rowToAssistant, getDefaultModelId, getProviderFromModel, getProviderForModelId
│   └── fileTypes.js              # Shared MIME map, ALLOWED_EXTENSIONS
│
├── lib/                          # Backend libraries
│   ├── adapters/                 # Executor adapters (v0.9.2+)
│   │   ├── base.js               #   ExecutorAdapter abstract class + ChatContext / ChatEvent typedefs
│   │   ├── hermes.js             #   HermesAdapter — subprocess + NDJSON bridge to run_chat.py
│   │   ├── opencode.js           #   OpenCodeAdapter — HTTP + SSE to opencode serve
│   │   └── index.js              #   ADAPTERS registry (slug → instance)
│   ├── cloud/
│   │   └── crypto.js             # AES-256-GCM encrypt/decrypt + HMAC-SHA256 signed URL tokens
│   └── opencode.js               # Legacy OpenCodeClient REST wrapper (used by lib/adapters/opencode.js)
│
├── routes/                       # Express route modules (one per domain)
│   ├── applications.js           # /api/applications
│   ├── assistants.js             # /api/assistants
│   ├── chat.js                   # /api/chat (executor dispatcher + SSE)
│   ├── cloudConnections.js       # /api/cloud-connections
│   ├── cloudFiles.js             # /api/cloud
│   ├── files.js                  # /api/sessions/:id/files
│   ├── globalFiles.js            # /api/files (File Manager app)
│   ├── likes.js                  # /api/like
│   ├── models.js                 # /api/models
│   ├── opencode.js               # /api/opencode (small OpenCode-facing router)
│   ├── providers.js              # /api/providers
│   ├── sessions.js               # /api/sessions, /api/messages
│   ├── system.js                 # /api/system, /api/health
│   └── tududi.js                 # /api/tududi/* proxy
│
├── middleware/
│   ├── security.js               # Rate limiters + recursive XSS sanitization
│   ├── logger.js                 # Request logging (SSE/stream-aware)
│   └── errorHandler.js           # Central { error } envelope for unhandled errors
│
├── scripts/                      # Python helpers (interface to Hermes)
│   ├── save_messages.py          # Save messages to Hermes DB
│   ├── sync_providers.py         # Sync providers/models from Hermes → UI DB
│   ├── list_bundled_providers.py # Enumerate Hermes api_key providers with metadata
│   └── manage_provider_key.py    # Atomic set/remove of ~/.hermes/.env key
│
├── run_chat.py                   # Per-request Hermes wrapper (spawned by routes/chat.js)
│
├── tests/                        # Backend tests (Vitest)
│   ├── adapters-hermes.test.js
│   ├── adapters-opencode.test.js
│   ├── adapters-registry.test.js
│   ├── opencode-client.test.js
│   ├── opencode-parseSseChunk.test.js
│   └── security.test.js
├── .github/
│   └── workflows/
│       └── ci.yml                # CI: lint + typecheck + test + build on push/PR
├── data/                         # Runtime data (git-ignored)
│   ├── 1230-ui.db                # UI database (SQLite, auto-created on first run)
│   └── uploads/                  # User-uploaded files
├── dist/                         # Production build output (git-ignored)
├── public/                       # Static files served as-is
├── docs/                         # Developer documentation
├── screenshots/                  # README screenshots
├── install.sh                    # One-command install script
├── package.json                  # Dependencies and npm scripts
├── ecosystem.config.json         # PM2 configuration
├── vite.config.ts                # Vite + Tailwind v4 + Vitest config
├── tsconfig.json                 # TypeScript project references root
├── tsconfig.app.json             # Frontend (src/) TypeScript config
├── tsconfig.node.json            # Node TypeScript config (vite.config + middleware/)
├── eslint.config.js              # ESLint flat config
├── .env.example                  # Configuration template
└── .gitignore
```

### Adding a new executor (one-file change)

The dispatcher in `routes/chat.js` looks up the executor by slug from `lib/adapters/index.js`. Adding a third backend is a one-file change — see [EXECUTOR_ADAPTERS.md](EXECUTOR_ADAPTERS.md) for the full step-by-step guide, the `ExecutorAdapter` contract, and a worked `claude-direct` example.

### Adding a new application (three-file change)

To add a new right-pane app, you need to:

1. **Backend** — register the app in `db/seed.js` with `INSERT OR IGNORE INTO applications (key, name, icon, …)`. Run `npm test` to confirm the seed is idempotent on existing installs.
2. **Frontend** — create `src/applications/<key>/` with `<Key>App.tsx` and an `index.ts` re-export, then add an entry to `src/applications/registry.ts`. The component must accept `ApplicationComponentProps` (`{ sessionId, config }`).
3. **Routing** — none. The Applications pane reads the enabled apps list from `GET /api/applications` and resolves each one through the registry. No code in `App.tsx`, `Layout.tsx`, or `ApplicationsPane.tsx` needs to change.

If the app needs a server-side proxy (like Tududi), add a new router under `routes/` and mount it in `app.js`.

## Code Style

### TypeScript
- **Frontend:** 100% TypeScript. New files go in `src/`.
- **Backend:** plain JavaScript (ESM). Security/rate-limit/XSS middleware lives in `middleware/security.js`; `middleware/logger.js` (request logging) and `middleware/errorHandler.js` (central error envelope) alongside it. `server.js` / `app.js` / `routes/*` / `lib/*` are all JS.
- Strict mode is on: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- API shapes belong in `src/types/api.ts`.

### React
- Functional components with hooks only.
- Zustand for cross-component state — no prop drilling, no Context for app state.
- All pages are lazy-loaded via `React.lazy()` + `Suspense` + `PageSkeleton`.
- `useCallback` with complete deps for any function passed to `useEffect`.

### CSS
- Tailwind CSS utility classes throughout.
- Colors via design tokens (`text-fg-primary`, `bg-bg-secondary`, etc.) — never raw hex. See [Architecture § Design Tokens](ARCHITECTURE.md#design-tokens).
- Mobile-first: `p-3 sm:p-4 md:p-6`, `hidden md:flex`, `flex-col sm:flex-row`.
- Touch targets: `min-h-[44px] min-w-[44px]` on all icon buttons.

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(assistants): add system prompt to assistant editor
fix(chat): prevent duplicate initial message on StrictMode
docs(api): document /api/assistants endpoints
test(security): add depth-cap test for sanitizeBody
chore(deps): move geoip-lite to optionalDependencies
```

## Testing

```bash
npm test             # Run full suite (Vitest)
npm run test:watch   # Watch mode for TDD
```

Tests live in two places:
- `tests/` — backend unit tests (`*.test.js`)
- `src/**/*.test.ts` — frontend unit tests

When adding a new utility or middleware function, add a corresponding test file. Aim to cover:
1. The happy path
2. Edge cases (null/undefined, empty input, max depth)
3. Immutability (original object must not be mutated)

## CI Pipeline

Every push to `main` and every PR runs:

```
Lint  →  Typecheck  →  Test  →  Build
```

All four steps must pass before merging. The workflow is in `.github/workflows/ci.yml`.

To replicate CI locally:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Debugging

### Backend Logs

```bash
# PM2
pm2 logs 1230-ui

# Direct
node server.js   # logs to stdout as JSON
```

### Frontend

Browser DevTools → Console and Network tabs. Vite HMR in dev mode.

### API Testing

```bash
# Health check
curl http://localhost:3001/api/health

# List sessions
curl http://localhost:3001/api/sessions?limit=5

# System status (Hermes version, providers)
curl http://localhost:3001/api/system/status
```

## Next Steps

- [Architecture](ARCHITECTURE.md) — system design overview
- [API Documentation](API.md) — REST API reference
- [Contributing](../CONTRIBUTING.md) — contribution guidelines
