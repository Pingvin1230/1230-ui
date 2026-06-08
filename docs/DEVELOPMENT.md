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
│   ├── components/               # UI components
│   │   ├── ApiKeyInput.tsx       # Password input with show/hide toggle
│   │   ├── AssistantCard.tsx     # Legacy horizontal card (superseded by AssistantManageTile)
│   │   ├── AssistantManageTile.tsx # Tile for /assistants management page (portal dropdown)
│   │   ├── AssistantTile.tsx     # Tile for /new session page
│   │   ├── ColorPicker.tsx       # 8-color radio palette for assistant editor
│   │   ├── ErrorBoundary.tsx     # Catches React component errors
│   │   ├── ErrorMessage.tsx      # Structured API error display
│   │   ├── HermesStatusIndicator.tsx # Header status icon (green/red/gray) + tooltip
│   │   ├── IconPicker.tsx        # 30-emoji picker for assistant editor
│   │   ├── Layout.tsx            # Main layout (Navbar + Sidebar + Content)
│   │   ├── MarkdownRenderer.tsx  # Markdown + syntax highlighting
│   │   ├── MobileNav.tsx         # Bottom nav for mobile (hidden on md+, iOS safe-area)
│   │   ├── Modal.tsx             # Reusable modal with focus-trap
│   │   ├── Navbar.tsx            # Top bar (search + Hermes status + user menu)
│   │   ├── PageSkeleton.tsx      # Skeleton for lazy-loaded pages
│   │   ├── ProviderCard.tsx      # Single provider row in Providers page
│   │   ├── SessionCard.tsx       # Session card: swipe-to-delete, long-press bulk mode
│   │   ├── Sidebar.tsx           # Left rail nav — desktop only (hidden md:flex)
│   │   ├── Toast.tsx             # Toast notifications with queue and auto-dismiss
│   │   └── ToolCall.tsx          # Collapsible tool-call visualization
│   ├── pages/                    # Application pages (all lazy-loaded via React.lazy)
│   │   ├── AssistantEditPage.tsx # Create/edit assistant (sticky action bar)
│   │   ├── AssistantsPage.tsx    # /assistants — tile grid, tab filters, context menus
│   │   ├── ChatPage.tsx          # Chat interface (streaming SSE, markdown, tool calls)
│   │   ├── DashboardPage.tsx     # Home (Quick Chat + Recent Sessions)
│   │   ├── NewSessionPage.tsx    # /new — assistant tiles + standard model tile
│   │   ├── ProvidersPage.tsx     # /settings/providers — API key management
│   │   ├── SessionsPage.tsx      # Session list (react-virtuoso, date grouping)
│   │   └── SettingsPage.tsx      # Models, system commands, Hermes status, About
│   ├── hooks/                    # React hooks
│   │   ├── useHermesStatusPoll.ts # Polls GET /api/system/status every 60 s
│   │   ├── useKeyboardShortcuts.ts # Ctrl+K / Ctrl+N / Ctrl+Enter
│   │   ├── useNotifications.ts   # Browser Notification API helpers
│   │   ├── useSwipe.ts           # Native touch: swipe-left + long-press (no deps)
│   │   └── useToast.ts           # Toast queue API
│   ├── lib/                      # Utilities
│   │   ├── api.ts                # API client (fetch, retry, SSE streaming)
│   │   ├── assistantColors.ts    # Color → Tailwind class map + FALLBACK_COLOR
│   │   └── time.ts               # formatTimeAgo, formatFullDateTime,
│   │                             # formatRelativeTimestamp (shared, i18n-aware)
│   ├── store/                    # Zustand stores (all persisted to localStorage)
│   │   ├── assistantsStore.ts    # Assistants fetch / upsert / remove
│   │   ├── hermesStatusStore.ts  # Hermes status cache (5-min staleness guard)
│   │   ├── notificationsStore.ts # Browser notification toggle
│   │   ├── searchStore.ts        # Global session search query (URL-synced)
│   │   ├── sessionStore.ts       # Session state
│   │   ├── sessionsSortStore.ts  # created | lastMessage sort mode
│   │   ├── sidebarStore.ts       # Sidebar open/closed
│   │   └── themeStore.ts         # Dark/light mode
│   ├── i18n/                     # 4-language translations (en, ru, es, de)
│   ├── types/                    # TypeScript type definitions
│   │   ├── api.ts                # Session, Message, Assistant API shapes
│   │   └── assistant.ts          # ASSISTANT_PALETTE, ASSISTANT_ICONS, AssistantColorId
│   ├── assets/                   # SVG illustrations (empty states)
│   ├── styles/                   # markdown.css (prose styles for chat)
│   ├── App.tsx                   # Root component (routes, lazy pages, ErrorBoundary)
│   ├── index.css                 # Design tokens (@theme), dark mode vars, base styles
│   └── main.tsx                  # Entry point
│
├── server.js                     # Entry point (39 lines): open DBs → migrate → seed → listen
├── app.js                        # Express app: middleware + route mounting (87 lines)
├── config.js                     # Zod-validated config loader
│
├── db/                           # Database layer
│   ├── connections.js            # Open db / hermesDbWrite / uiDb; export closeAll()
│   ├── migrate.js                # initSchema(): CREATE TABLE + idempotent ALTER TABLE
│   ├── seed.js                   # seedStarterAssistants()
│   └── helpers.js                # rowToAssistant, getDefaultModelId, getProviderFromModel
│
├── routes/                       # Express route modules (one per domain)
│   ├── system.js                 # /api/system/*, /api/health
│   ├── sessions.js               # /api/sessions/*, /api/messages
│   ├── chat.js                   # /api/chat (SSE streaming)
│   ├── models.js                 # /api/models/*
│   ├── assistants.js             # /api/assistants/*
│   ├── providers.js              # /api/providers/*
│   └── likes.js                  # /api/like
│
├── middleware/
│   ├── security.js               # Runtime: rate limiters + recursive XSS sanitization
│   └── security.ts               # TypeScript source (authoritative, checked by tsc)
│
├── scripts/                      # Python helpers (interface to Hermes)
│   ├── save_messages.py          # Save messages to Hermes DB
│   ├── sync_providers.py         # Sync providers/models from Hermes → UI DB
│   ├── list_bundled_providers.py # Enumerate Hermes api_key providers with metadata
│   └── manage_provider_key.py    # Atomic set/remove of ~/.hermes/.env key
│
├── tests/                        # Backend tests (Vitest)
│   └── security.test.js          # 9 tests for sanitizeBody
├── .github/
│   └── workflows/
│       └── ci.yml                # CI: lint + typecheck + test + build on push/PR
├── data/                         # Runtime data (git-ignored)
│   └── 1230-ui.db                # UI database (SQLite, auto-created on first run)
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

## Code Style

### TypeScript
- **Frontend:** 100% TypeScript. New files go in `src/`.
- **Backend middleware:** Write in `middleware/security.ts`; the compiled output `security.js` stays as the runtime entry (server.js is still plain JS).
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
