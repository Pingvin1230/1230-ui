# 1230-UI — Hermes Web Interface

> **⚠️ ALPHA VERSION** — This is an early-stage project. Features may be incomplete or unstable. Use at your own risk.

Modern web interface for managing sessions and interacting with Hermes Agent through a browser.

## Purpose

1230-UI provides a convenient web interface for working with Hermes Agent, allowing you to:
- View and manage session history
- Interact with AI through chat with streaming responses
- Manage available models and providers
- Execute Hermes system commands (update, diagnostics)
- Monitor system and connection status

The project solves the problem of the lack of a native web interface for Hermes Agent by providing a modern UI with markdown support, syntax highlighting, and responsive design.

## Features

### Core Features
- **Dashboard** — main page with system overview, recent sessions, and quick chat access
- **Session list** — virtualization (react-virtuoso), infinite scroll, date grouping, client-side search
- **Chat** — real-time streaming responses, markdown rendering, syntax highlighting, avatars, copy/regenerate
- **Model management** — enable/disable models in Settings, select default model, sync with Hermes
- **System commands** — execute `hermes update` and `hermes doctor --fix` from Settings with confirm modal
- **Multi-line input** — textarea with automatic height adjustment (up to 200px)
- **Themes** — dark and light themes with saved preference
- **Responsive design** — bottom-nav for mobile (768px breakpoint), adaptive typography

### Technical Features
- **Streaming SSE** — real-time response delivery from Hermes API
- **Markdown rendering** — full GFM (GitHub Flavored Markdown) support, JetBrains Mono for code
- **Syntax highlighting** — for code blocks (highlight.js) with copy button
- **Tool calls visualization** — collapsible blocks for tool calls
- **Process indicator** — "Agent is thinking..." → "Generating response..."
- **Auto-save** — messages to DB after receiving response
- **Caching** — GitHub API requests (1 hour)
- **Code splitting** — lazy loading for all pages (separate chunks)
- **Virtualization** — render only visible sessions (performance with 1000+ sessions)
- **Toast notifications** — notification system with queue and auto-dismiss
- **Token count + latency** — display token count and response time

### Error Handling
- **Automatic retry** — up to 3 attempts for network and server errors
- **Structured errors** — type, code, provider, model, recommendations
- **Toxic session blocking** — on content moderation errors, input field is replaced with banner
- **Error Boundary** — catches React errors, shows UI with reload button
- **Server logging** — JSON logs for each request (status, duration)

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Browser                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │         React SPA (Vite + TypeScript)            │  │
│  │  ┌────────┐ ┌──────────┐ ┌─────┐ ┌──────────┐  │  │
│  │  │Dashboard│ │Sessions │ │Chat │ │Settings  │  │  │
│  │  └────────┘ └──────────┘ └─────┘ └──────────┘  │  │
│  │  Zustand stores │ React Router │ Tailwind CSS   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕ HTTP/REST API
┌─────────────────────────────────────────────────────────┐
│              Node.js Backend (Express)                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  /api/sessions │ /api/chat │ /api/models │ /api  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Hermes DB    │  │  UI DB       │  │ Python      │  │
│  │ (read-only)  │  │ (read-write) │  │ scripts     │  │
│  └──────────────┘  └──────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│              Hermes Agent (CLI)                          │
│  ~/.hermes/state.db │ ~/.hermes/.env │ hermes commands  │
└─────────────────────────────────────────────────────────┘
```

### Components

**Frontend (React + TypeScript + Vite)**
- `DashboardPage` — main page with System Status, Recent Sessions, Quick Chat
- `SessionsPage` — session list with virtualization, search, and date grouping
- `ChatPage` — chat interface with streaming, markdown, tool calls, avatars, copy/regenerate
- `NewSessionPage` — create new session with model selection
- `SettingsPage` — model management (default model), system commands with confirm modal
- `Toast` — notification system with queue and auto-dismiss
- `Modal` — reusable modal component with focus-trap
- `MobileNav` — bottom navigation for mobile devices
- `PageSkeleton` — skeleton loading for lazy-loaded pages

**Backend (Node.js + Express)**
- REST API server on port 3001
- Integration with two SQLite databases
- Request proxying to Hermes API
- Python script execution for Hermes DB operations
- Hermes system commands via `child_process`

**Databases (SQLite)**
- **Hermes DB** (`~/.hermes/state.db`) — read-only access to Hermes sessions and messages
- **UI DB** (`./data/1230-ui.db`) — custom DB for:
  - `providers` — list of model providers
  - `models` — list of models with enabled flag
  - `cache` — cache for API responses (GitHub, Hermes)

**Python Scripts**
- `save_messages.py` — save messages to Hermes DB
- `create_session.py` — create new session
- `sync_providers.py` — sync providers and models from Hermes

## Tech Stack

**Frontend**
- React 18 + TypeScript + Vite
- Tailwind CSS v4 — component styling
- Zustand — state management (sessions, theme)
- React Router v6 — client-side routing
- Lucide React — icons
- react-markdown + remark-gfm + rehype-highlight — markdown rendering
- highlight.js — code syntax highlighting

**Backend**
- Node.js + Express — REST API server
- better-sqlite3 — SQLite database handling
- child_process — Python script and Hermes command execution

**Infrastructure**
- PM2 — process manager
- Nginx — reverse proxy
- Authelia — authentication
- Let's Encrypt — HTTPS certificates

**External Dependencies**
- Hermes Agent — AI agent (CLI)
- Python 3.x — for Hermes DB operations

## Implementation Details

### Streaming Chat (SSE)
Chat is implemented via Server-Sent Events for real-time response delivery:
1. Frontend sends POST `/api/chat` with messages
2. Backend proxies request to Hermes API
3. Hermes returns streaming response (SSE)
4. Backend forwards chunks to frontend
5. Frontend accumulates text and updates UI
6. After completion, message is saved to DB via `/api/messages`

### Two Databases
The project uses separation into two DBs:
- **Hermes DB** (read-only) — only reads sessions and messages
- **UI DB** (read-write) — manages models, providers, cache

This allows:
- Not modifying Hermes data
- Storing UI settings separately
- Easy migration of UI to another server

### Model Management
Models are synced from Hermes via Python script:
1. `sync_providers.py` reads `~/.hermes/.env` and gets provider list
2. For each provider, gets list of available models
3. Saves to UI DB with `enabled=1` flag by default
4. User can enable/disable models in Settings
5. When creating session, only enabled models are shown

### Caching
To reduce load on external APIs, cache is used:
- GitHub API (latest Hermes version) — TTL 1 hour
- Provider and model list — manual update via Sync
- Cache stored in UI DB `cache` table

### System Commands
Hermes command execution via `child_process.exec`:
- `hermes update --yes` — update Hermes (non-interactive)
- `hermes doctor --fix` — diagnose and fix issues
- Command output (last 10 lines) shown in modal
- Commands only available in Settings (not on Dashboard)

### Multi-line Input
Textarea with automatic height adjustment:
- Initial height — 1 line
- Automatically increases on input (up to 200px)
- Enter — send message
- Shift+Enter — new line
- After send, height resets

### Session List Virtualization
Session list uses `react-virtuoso` for performance:
- Render only visible elements (important with 1000+ sessions)
- Sticky group headers (Today, Yesterday, This Week, Older)
- Automatic loading on scroll down
- Relative dates ("2 hours ago", "Yesterday")

### Code Splitting
All pages are lazy-loaded via `React.lazy()`:
- Dashboard: ~10KB
- Sessions: ~68KB (with react-virtuoso)
- Settings: ~14KB
- Chat: ~344KB (with highlight.js)
- NewSession: ~4KB

This reduces initial bundle size and speeds up app loading.

## Installation and Setup

### Requirements
- Node.js 18+
- Python 3.x
- Hermes Agent (installed and configured)
- PM2 or systemd (for production, optional)

### Automatic Installation (Recommended)

For quick installation and setup, use the `install.sh` script:

```bash
# 1. Clone repository
git clone <repo-url>
cd 1230-ui

# 2. Run installation script
./install.sh
```

The script automatically:
- Checks for Node.js 18+, Python 3.x, and Hermes
- Installs dependencies and builds frontend
- Creates `.env` file with interactive parameter input
- Optionally configures systemd service

### Manual Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd 1230-ui

# 2. Install dependencies
npm install

# 3. Create configuration
cp .env.example .env
# Edit .env for your configuration

# 4. Build frontend
npm run build

# 5. Run (optionally via PM2)
pm2 start server.js --name 1230-ui && pm2 save
# or directly:
node server.js
```

Application will be available on port 3001.

### Local Development
```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```

Dev server will start on `http://localhost:5173` with proxy to backend on port 3001.

### Production (with PM2)
```bash
# Build frontend
npm run build

# Run via PM2
pm2 start server.js --name 1230-ui

# Save PM2 configuration
pm2 save
```

Application will be available on port 3001.

### Production (with systemd) — Recommended
More reliable option for production: auto-start on boot, automatic restart on crash.

```bash
# 1. Create systemd service file
sudo tee /etc/systemd/system/1230-ui.service > /dev/null <<EOF
[Unit]
Description=1230-UI Hermes Web Interface
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/1230-ui
ExecStart=/usr/bin/node --experimental-modules server.js
Restart=always
RestartSec=5

EnvironmentFile=/opt/1230-ui/.env

[Install]
WantedBy=multi-user.target
EOF

# 2. Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable 1230-ui
sudo systemctl start 1230-ui

# 3. Check status
sudo systemctl status 1230-ui
```

**Useful commands:**
```bash
systemctl status 1230-ui    # Service status
systemctl restart 1230-ui   # Restart
systemctl stop 1230-ui      # Stop
journalctl -u 1230-ui -f    # Real-time logs
```

### Configuration (.env)

Create `.env` file based on `.env.example`:

```bash
# Server port (default 3001)
PORT=3001

# Path to Hermes Agent
HERMES_PATH=/home/user/.hermes
HERMES_API_URL=http://localhost:8765

# Path to Python scripts (relative to project root)
SCRIPTS_PATH=./scripts

# UI database (relative to project root)
DB_PATH=./data/1230-ui.db

# CORS origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,https://your-domain.com

# Rate limiting (requests per minute)
RATE_LIMIT=100
```

All paths support both absolute and relative values.

### Nginx Setup (Optional)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## API Endpoints

### Sessions
- `GET /api/sessions` — session list (with pagination: `?limit=20&offset=0`)
- `GET /api/sessions/:id` — session details
- `GET /api/sessions/:id/messages` — session message history
- `POST /api/sessions` — create new session

### Chat
- `POST /api/chat` — send message (streaming/non-streaming)
- `POST /api/messages` — save message to DB

### Models
- `GET /api/models` — available models list (only enabled)
- `GET /api/models/providers` — providers list with their models
- `POST /api/models/sync` — sync providers from Hermes
- `PATCH /api/models/models/:id/toggle` — enable/disable model

### System
- `GET /api/health` — service status check
- `GET /api/system/status` — system status (Hermes, providers, statistics)
- `POST /api/system/exec` — execute Hermes commands (`update` or `doctor`)

## Commands

### Application Management

**With PM2:**
```bash
pm2 status                    # All processes status
pm2 logs 1230-ui              # Application logs
pm2 restart 1230-ui           # Restart
pm2 stop 1230-ui              # Stop
```

**With systemd:**
```bash
systemctl status 1230-ui      # Service status
journalctl -u 1230-ui -f      # Real-time logs
systemctl restart 1230-ui     # Restart
systemctl stop 1230-ui        # Stop
```

### API Testing
```bash
# Check functionality
curl http://localhost:3001/api/health

# Session list
curl http://localhost:3001/api/sessions?limit=5

# Session messages
curl http://localhost:3001/api/sessions/{id}/messages

# System status
curl http://localhost:3001/api/system/status

# Execute Hermes commands
curl -X POST http://localhost:3001/api/system/exec \
  -H "Content-Type: application/json" \
  -d '{"command":"update"}'

curl -X POST http://localhost:3001/api/system/exec \
  -H "Content-Type: application/json" \
  -d '{"command":"doctor"}'
```

### Development
```bash
npm run dev                   # Dev server with hot reload
npm run build                 # Production build
npm run preview               # Preview production build
```

## Project Structure

```
1230-ui/
├── src/                          # Frontend (React)
│   ├── components/               # UI components
│   │   ├── ErrorBoundary.tsx     # Error Boundary for React errors
│   │   ├── ErrorMessage.tsx      # API error display component
│   │   ├── Layout.tsx            # Main layout (Navbar + Sidebar + Content)
│   │   ├── MarkdownRenderer.tsx  # Markdown rendering with highlighting and copy
│   │   ├── Modal.tsx             # Reusable modal with focus-trap
│   │   ├── MobileNav.tsx         # Bottom navigation for mobile
│   │   ├── PageSkeleton.tsx      # Skeleton for lazy-loaded pages
│   │   ├── Toast.tsx             # Toast notifications
│   │   └── ToolCall.tsx          # Tool calls visualization
│   ├── pages/                    # Application pages
│   │   ├── DashboardPage.tsx     # Main page
│   │   ├── SessionsPage.tsx      # Session list (virtualization, search)
│   │   ├── ChatPage.tsx          # Chat interface (streaming, avatars, copy/regenerate)
│   │   ├── NewSessionPage.tsx    # Create new session
│   │   └── SettingsPage.tsx      # Settings (models, commands, confirm modals)
│   ├── hooks/                    # React hooks
│   │   └── useToast.ts           # Toast API
│   ├── lib/                      # Utilities
│   │   ├── api.ts                # API client (fetch wrapper, retry, SSE)
│   │   └── time.ts               # Relative timestamps (formatTimeAgo)
│   ├── store/                    # Zustand stores
│   │   ├── sessionStore.ts       # Session state
│   │   ├── searchStore.ts        # Search state (with URL sync)
│   │   └── themeStore.ts         # Theme state
│   ├── assets/                   # Static resources
│   │   └── illustrations.tsx     # SVG illustrations for empty states
│   ├── types/                    # TypeScript types
│   │   └── api.ts                # Types for API responses
│   ├── App.tsx                   # Root component (ToastProvider, ErrorBoundary)
│   └── main.tsx                  # Entry point
├── server.js                     # Backend server (Express)
├── config.js                     # Configuration loader
├── scripts/                      # Python scripts
│   ├── save_messages.py          # Save messages to Hermes DB
│   ├── create_session.py         # Create new session
│   └── sync_providers.py         # Sync providers
├── data/                         # Application data
│   └── 1230-ui.db                # UI database (SQLite)
├── dist/                         # Production build (generated)
├── public/                       # Static files
├── install.sh                    # Installation script
├── package.json                  # Dependencies and scripts
├── ecosystem.config.json         # PM2 configuration
├── vite.config.ts                # Vite configuration
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── .env.example                  # Configuration template
├── .gitignore                    # Git ignore rules
├── LICENSE                       # MIT License
├── README.md                     # This file
├── TODO.md                       # Roadmap and task tracking
├── FRONTEND_REPORT.md            # Frontend refactoring report
├── PROGRESS_REPORT.md            # Development progress report
└── CONFIGURATION.md              # Configuration documentation
```

## Roadmap

### Alpha (Current)
- [x] Core features (Dashboard, Sessions, Chat, Settings)
- [x] Streaming SSE with real-time tool calls visualization
- [x] Error handling and retry logic
- [x] Multi-language support (English)
- [x] Configuration via .env file
- [x] Installation script

### Beta (Planned)
- [ ] Session management (delete, rename, search)
- [ ] Smart session titles (LLM generation)
- [ ] Message editing and branching
- [ ] Session export (Markdown, JSON)
- [ ] Keyboard shortcuts

### v1.0 (Stable)
- [ ] Comprehensive test coverage
- [ ] Docker support
- [ ] CI/CD pipeline
- [ ] Performance optimizations
- [ ] Documentation improvements

## Contributing

This is an alpha version. If you find bugs or have suggestions, please open an issue on GitHub.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk.
