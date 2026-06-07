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
# Edit .env with your settings

# Start development server
npm run dev
```

Dev server runs on `http://localhost:5173` with proxy to backend on port 3001.

## Project Structure

```
1230-ui/
├── src/                          # Frontend (React + TypeScript + Vite)
│   ├── components/               # UI components
│   │   ├── ApiKeyInput.tsx       # Password input with show/hide toggle
│   │   ├── ErrorBoundary.tsx     # Catches React component errors
│   │   ├── ErrorMessage.tsx      # API error display component
│   │   ├── HermesStatusIndicator.tsx # Header Hermes API status icon
│   │   ├── Layout.tsx            # Main layout (Navbar + Sidebar + Content)
│   │   ├── MarkdownRenderer.tsx  # Markdown + syntax highlighting
│   │   ├── MobileNav.tsx         # Bottom navigation for mobile
│   │   ├── Modal.tsx             # Reusable modal with focus-trap
│   │   ├── Navbar.tsx            # Top bar (search + status + user menu)
│   │   ├── PageSkeleton.tsx      # Skeleton for lazy-loaded pages
│   │   ├── ProviderCard.tsx      # Single provider row in Providers page
│   │   ├── Sidebar.tsx           # Left rail nav (Home / Sessions / etc.)
│   │   ├── Toast.tsx             # Toast notifications
│   │   └── ToolCall.tsx          # Tool calls visualization
│   ├── pages/                    # Application pages (lazy-loaded)
│   │   ├── ChatPage.tsx          # Chat interface (streaming, markdown)
│   │   ├── DashboardPage.tsx     # Main page (Quick Chat + Recent)
│   │   ├── NewSessionPage.tsx    # Create new session
│   │   ├── ProvidersPage.tsx     # /settings/providers — API key management
│   │   ├── SessionsPage.tsx      # Session list (virtualization)
│   │   └── SettingsPage.tsx      # Settings (models, commands, status)
│   ├── hooks/                    # React hooks
│   │   ├── useHermesStatusPoll.ts # Polls Hermes status every 60s
│   │   ├── useKeyboardShortcuts.ts # Ctrl+K, Ctrl+N, Ctrl+Enter
│   │   ├── useNotifications.ts   # Browser notifications
│   │   └── useToast.ts           # Toast API
│   ├── lib/                      # Utilities
│   │   ├── api.ts                # API client (fetch, retry, SSE)
│   │   └── time.ts               # Relative timestamps
│   ├── store/                    # Zustand stores (persisted)
│   │   ├── hermesStatusStore.ts  # Hermes status cache
│   │   ├── notificationsStore.ts # Browser notification toggle
│   │   ├── searchStore.ts        # Global search state
│   │   ├── sessionStore.ts       # Session state
│   │   ├── sessionsSortStore.ts  # Sessions sort order
│   │   ├── sidebarStore.ts       # Sidebar open/closed
│   │   └── themeStore.ts         # Dark/light mode
│   ├── i18n/                     # 4-language translations (en, ru, es, de)
│   ├── types/                    # TypeScript types
│   ├── assets/                   # SVG illustrations
│   ├── App.tsx                   # Root component
│   └── main.tsx                  # Entry point
├── server.js                     # Backend server (Express)
├── config.js                     # Configuration loader (zod-validated)
├── middleware/
│   └── security.js               # Rate limiters + xss sanitization
├── scripts/                      # Python helpers (talk to Hermes)
│   ├── create_session.py         # Create new session in Hermes DB
│   ├── save_messages.py          # Save messages to Hermes DB
│   ├── sync_providers.py         # Sync providers/models from Hermes
│   ├── list_bundled_providers.py # Enumerate Hermes-bundled providers
│   └── manage_provider_key.py    # Atomic set/remove of ~/.hermes/.env key
├── data/                         # Runtime data
│   └── 1230-ui.db                # UI database (SQLite, auto-created)
├── dist/                         # Production build (generated)
├── public/                       # Static files
├── docs/                         # User/developer documentation
├── install.sh                    # One-shot install script
├── package.json                  # Dependencies and npm scripts
├── ecosystem.config.json         # PM2 configuration
├── vite.config.ts                # Vite + Tailwind v4 config
├── tsconfig.json                 # TypeScript configuration
├── .env.example                  # Configuration template
└── .gitignore                    # Git ignore rules
```

## Available Scripts

```bash
npm run dev          # Start dev server (Vite, port 5173) with hot reload
npm run build        # Production build (tsc -b && vite build)
npm run preview      # Preview production build locally
npm run lint         # Run ESLint
```

## Code Style

### TypeScript
- All new code should be in TypeScript
- Use strict mode
- Define types for API responses in `src/types/`

### React
- Use functional components with hooks
- Use Zustand for state management
- Follow React best practices

### CSS
- Use Tailwind CSS utility classes
- Use design tokens for colors (see [Architecture](ARCHITECTURE.md#design-tokens))
- Avoid inline styles

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(chat): add message regeneration button
fix(api): resolve session creation timeout
docs(readme): update installation instructions
```

## Testing

Before submitting changes:
```bash
npm run build        # Ensure build succeeds
npm run lint         # Check for lint errors
npm run typecheck    # Check TypeScript types
```

## Debugging

### Backend Logs
```bash
# PM2
pm2 logs 1230-ui

# systemd
journalctl -u 1230-ui -f
```

### Frontend
Use browser DevTools → Console and Network tabs.

### API Testing
```bash
# Health check
curl http://localhost:3001/api/health

# List sessions
curl http://localhost:3001/api/sessions?limit=5
```

## Next Steps

- [Architecture](ARCHITECTURE.md) — system design overview
- [API Documentation](API.md) — REST API reference
- [Contributing](../CONTRIBUTING.md) — contribution guidelines
