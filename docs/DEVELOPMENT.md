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
├── src/                          # Frontend (React)
│   ├── components/               # UI components
│   │   ├── ErrorBoundary.tsx     # Error Boundary for React errors
│   │   ├── ErrorMessage.tsx      # API error display component
│   │   ├── Layout.tsx            # Main layout (Navbar + Sidebar + Content)
│   │   ├── MarkdownRenderer.tsx  # Markdown rendering with highlighting
│   │   ├── Modal.tsx             # Reusable modal with focus-trap
│   │   ├── MobileNav.tsx         # Bottom navigation for mobile
│   │   ├── PageSkeleton.tsx      # Skeleton for lazy-loaded pages
│   │   ├── Toast.tsx             # Toast notifications
│   │   └── ToolCall.tsx          # Tool calls visualization
│   ├── pages/                    # Application pages
│   │   ├── DashboardPage.tsx     # Main page
│   │   ├── SessionsPage.tsx      # Session list (virtualization)
│   │   ├── ChatPage.tsx          # Chat interface (streaming)
│   │   ├── NewSessionPage.tsx    # Create new session
│   │   └── SettingsPage.tsx      # Settings (models, commands)
│   ├── hooks/                    # React hooks
│   │   ├── useToast.ts           # Toast API
│   │   ├── useKeyboardShortcuts.ts # Keyboard shortcuts
│   │   └── useNotifications.ts   # Browser notifications
│   ├── lib/                      # Utilities
│   │   ├── api.ts                # API client (fetch, retry, SSE)
│   │   └── time.ts               # Relative timestamps
│   ├── store/                    # Zustand stores
│   │   ├── sessionStore.ts       # Session state
│   │   ├── searchStore.ts        # Search state
│   │   ├── themeStore.ts         # Theme state
│   │   └── notificationsStore.ts # Notifications state
│   ├── assets/                   # Static resources
│   │   └── illustrations.tsx     # SVG illustrations
│   ├── types/                    # TypeScript types
│   │   └── api.ts                # API response types
│   ├── App.tsx                   # Root component
│   └── main.tsx                  # Entry point
├── server.js                     # Backend server (Express)
├── config.js                     # Configuration loader
├── middleware/
│   └── security.js               # Security middleware
├── scripts/                      # Python scripts
│   ├── save_messages.py          # Save messages to Hermes DB
│   ├── create_session.py         # Create new session
│   └── sync_providers.py         # Sync providers
├── data/                         # Application data
│   └── 1230-ui.db                # UI database (SQLite)
├── dist/                         # Production build (generated)
├── public/                       # Static files
├── docs/                         # Documentation
├── install.sh                    # Installation script
├── package.json                  # Dependencies and scripts
├── ecosystem.config.json         # PM2 configuration
├── vite.config.ts                # Vite configuration
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── .env.example                  # Configuration template
└── .gitignore                    # Git ignore rules
```

## Available Scripts

### Development
```bash
npm run dev          # Start dev server with hot reload
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript type checking
```

### Production
```bash
npm run build        # Build for production
node server.js       # Start production server
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
