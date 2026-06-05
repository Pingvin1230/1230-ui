# Architecture

## Overview

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
│  │ (sessions     │  │ (read-write) │  │ scripts     │  │
│  │ read + delete)│  │              │  │             │  │
│  └──────────────┘  └──────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│              Hermes Agent (CLI)                          │
│  ~/.hermes/state.db │ ~/.hermes/.env │ hermes commands  │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
- React 18 + TypeScript + Vite
- Tailwind CSS v4 — component styling
- Zustand — state management (sessions, theme)
- React Router v6 — client-side routing
- Lucide React — icons
- react-markdown + remark-gfm + rehype-highlight — markdown rendering
- highlight.js — code syntax highlighting

### Backend
- Node.js + Express — REST API server
- better-sqlite3 — SQLite database handling
- child_process — Python script and Hermes command execution

### Infrastructure
- PM2 — process manager
- Nginx — reverse proxy
- Authelia — authentication
- Let's Encrypt — HTTPS certificates

### External Dependencies
- Hermes Agent — AI agent (CLI)
- Python 3.x — for Hermes DB operations

## Components

### Frontend (React + TypeScript + Vite)
- `DashboardPage` — main page with System Status, Recent Sessions, Quick Chat
- `SessionsPage` — session list with virtualization, search, and date grouping
- `ChatPage` — chat interface with streaming, markdown, tool calls, avatars, copy/regenerate
- `NewSessionPage` — create new session with model selection
- `SettingsPage` — model management (default model), system commands with confirm modal
- `Toast` — notification system with queue and auto-dismiss
- `Modal` — reusable modal component with focus-trap
- `MobileNav` — bottom navigation for mobile devices
- `PageSkeleton` — skeleton loading for lazy-loaded pages

### Backend (Node.js + Express)
- REST API server on port 3001
- Integration with two SQLite databases
- Request proxying to Hermes API
- Python script execution for Hermes DB operations
- Hermes system commands via `child_process`

### Databases (SQLite)
- **Hermes DB** (`~/.hermes/state.db`) — read access to sessions/messages + write for session deletion
- **UI DB** (`./data/1230-ui.db`) — custom DB for:
  - `providers` — list of model providers
  - `models` — list of models with enabled flag
  - `cache` — cache for API responses (GitHub, Hermes)

### Python Scripts
- `save_messages.py` — save messages to Hermes DB
- `create_session.py` — create new session
- `sync_providers.py` — sync providers and models from Hermes

## Implementation Details

### Design Tokens

All UI colors use a unified token system defined in `src/index.css` via Tailwind CSS v4 `@theme`:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `bg-bg-primary` | `#ffffff` | `#1f2937` | Cards, panels, message bubbles |
| `bg-bg-secondary` | `#f9fafb` | `#111827` | Inputs, hover states, page bg |
| `bg-bg-muted` | `#f3f4f6` | `#374151` | Skeletons, badges, avatars |
| `text-fg-primary` | `#111827` | `#f9fafb` | Headings, main content |
| `text-fg-secondary` | `#4b5563` | `#d1d5db` | Labels, descriptions |
| `text-fg-muted` | `#6b7280` | `#9ca3af` | Timestamps, hints |
| `border-border-default` | `#e5e7eb` | `#374151` | Card borders, dividers |
| `border-border-strong` | `#d1d5db` | `#4b5563` | Tables, blockquotes |

Accent colors (blue, red, green, yellow) remain as Tailwind utility classes for status indicators and CTAs.

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
- **Hermes DB** (read + delete) — reads sessions and messages, deletes sessions on user request
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

### Code Splitting

All pages are lazy-loaded via `React.lazy()`:
- Dashboard: ~10KB
- Sessions: ~68KB (with react-virtuoso)
- Settings: ~14KB
- Chat: ~344KB (with highlight.js)
- NewSession: ~4KB

This reduces initial bundle size and speeds up app loading.

## Next Steps

- [API Documentation](API.md) — REST API reference
- [Development Guide](DEVELOPMENT.md) — development setup and guidelines
