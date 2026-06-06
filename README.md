# 1230-UI — Hermes Web Interface

> **⚠️ ALPHA VERSION** — Early-stage project. Features may be incomplete or unstable.

Modern web interface for managing sessions and interacting with [Hermes Agent](https://github.com/anthropics/hermes-agent) through a browser.

## Features

- **Dashboard** — system overview, recent sessions, quick chat
- **Session Management** — create, rename, pin, archive, delete, bulk actions
- **Real-time Chat** — streaming responses, markdown rendering, syntax highlighting, tool calls visualization
- **Model Management** — enable/disable models, select default model
- **System Commands** — execute `hermes update` and `hermes doctor --fix`
- **Keyboard Shortcuts** — Ctrl+K (search), Ctrl+N (new session), Ctrl+Enter (send)
- **Browser Notifications** — alerts for new messages
- **Dark/Light Themes** — with saved preference
- **Internationalization** — 4 languages (English, Русский, Español, Deutsch) with auto-detection
- **Responsive Design** — mobile-friendly with bottom navigation
- **Security** — rate limiting, XSS protection, CORS, security headers

## Quick Start

```bash
# Clone repository
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui

# Run installation script
./install.sh
```

Or manually:
```bash
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui
npm install
cp .env.example .env
# Edit .env with your settings
npm run build
node server.js
```

Application will be available on port 3001.

## Documentation

- [Installation Guide](docs/INSTALLATION.md) — detailed installation and deployment
- [Configuration](docs/CONFIGURATION.md) — environment variables reference
- [Architecture](docs/ARCHITECTURE.md) — system design and tech stack
- [API Documentation](docs/API.md) — REST API reference
- [Development Guide](docs/DEVELOPMENT.md) — local development setup
- [Contributing](CONTRIBUTING.md) — contribution guidelines
- [Changelog](CHANGELOG.md) — version history

## Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, Zustand, React Router v6

**Backend:** Node.js, Express, better-sqlite3

**Infrastructure:** PM2, Nginx, Authelia, Let's Encrypt

## Requirements

- Node.js 18+
- Python 3.x
- Hermes Agent (installed and configured)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk.
