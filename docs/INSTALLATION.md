# Installation Guide

## Requirements

- Node.js 18+
- Python 3.x
- Hermes Agent (installed and configured)
- PM2 or systemd (for production, optional)

## Quick Start

```bash
# Clone repository
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui

# Run installation script
./install.sh
```

The script automatically:
- Checks for Node.js 18+, Python 3.x, and Hermes
- Installs dependencies and builds frontend
- Creates `.env` file with interactive parameter input
- Optionally configures systemd service

## Manual Installation

```bash
# 1. Clone repository
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui

# 2. Install dependencies
npm install

# 3. Create configuration
cp .env.example .env
# Edit .env for your configuration (see docs/CONFIGURATION.md)

# 4. Build frontend
npm run build

# 5. Run
node server.js
```

Application will be available on port 3001.

## Production Deployment

### Option 1: PM2

```bash
# Build frontend
npm run build

# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name 1230-ui

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Option 2: systemd (Recommended)

More reliable option for production: auto-start on boot, automatic restart on crash.

```bash
# Create systemd service file
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

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable 1230-ui
sudo systemctl start 1230-ui

# Check status
sudo systemctl status 1230-ui
```

**Useful commands:**
```bash
systemctl status 1230-ui    # Service status
systemctl restart 1230-ui   # Restart
systemctl stop 1230-ui      # Stop
journalctl -u 1230-ui -f    # Real-time logs
```

## Nginx Reverse Proxy (Optional)

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

## Cloud Connect (WebDAV) — Optional

Cloud Connect allows users to browse WebDAV cloud storage and insert file links into chat. Requires an encryption key:

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Add to .env
CLOUD_CONNECT_KEY=<generated-key>
```

**Nginx configuration** — if running behind Authelia, add a bypass for `/api/cloud/`:

```nginx
location /api/cloud/ {
    # Signed proxy URLs — no Authelia needed (HMAC + TTL protected)
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## OpenCode Executor (optional)

OpenCode is an AI coding assistant that can be used as an executor in 1230-UI, allowing the assistant to run code tasks via OpenCode's web API.

### Prerequisites

- `opencode` binary installed — see [opencode.ai](https://opencode.ai) for installation instructions.

### The systemd unit

The unit does not ship with this repository. Create it manually:

```bash
sudo tee /etc/systemd/system/opencode-1230ui.service > /dev/null <<EOF
[Unit]
Description=OpenCode AI Coding Assistant (1230-UI)
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/opencode web --hostname 127.0.0.1 --port 4097
Restart=always
RestartSec=5
Environment=HOME=/root
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/opt/1230-ui/.env

[Install]
WantedBy=multi-user.target
EOF
```

The unit uses port **4097** to avoid clashing with a user's `opencode web` on 4096. It also loads `/opt/1230-ui/.env` so the daemon picks up `OPENCODE_URL` / `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` without exporting them in the unit file.

### Environment variables

Add the following to your `.env` file:

```bash
# OpenCode executor
OPENCODE_URL=http://127.0.0.1:4097

# Optional — only if the OpenCode daemon requires HTTP basic auth
# OPENCODE_SERVER_USERNAME=your-username
# OPENCODE_SERVER_PASSWORD=your-password
```

The same values can be edited at runtime from `/settings/executors/opencode` (URL, username, password). The password is AES-256-GCM encrypted at rest, using the same `CLOUD_CONNECT_KEY` as Cloud Connect.

### Verify

After starting the service, confirm it is healthy:

```bash
curl http://127.0.0.1:4097/global/health
# Expected: {"healthy":true,...}
```

The 1230-UI Settings → Executor Configuration page surfaces the same probe as a coloured dot in the top bar. A 2 s timeout is used by the `GET /api/system/executors` endpoint.

### Enable

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now opencode-1230ui.service

# Check status
sudo systemctl status opencode-1230ui.service

# View logs
journalctl -u opencode-1230ui -f
```

### In the UI

Open an assistant, then select **OpenCode** in the executor picker to route tasks through the OpenCode daemon. The executor is locked for the session's lifetime — editing an assistant after sessions exist forks it, and existing sessions keep their original binding.

---

## Tududi Application (optional)

Tududi is a self-hosted task / notes manager. The 1230-UI Tududi app lives in the right split-pane and proxies a Tududi instance through the 1230-UI backend, so the bearer token never reaches the browser.

### Prerequisites

- A running Tududi instance reachable from the 1230-UI server (this install uses `https://todo.thinkout.ru`).
- A Tududi API token (`tt_<hex>`), created in the Tududi UI under **Profile → Settings → API Keys**, or via `POST /api/profile/api-keys` with a session cookie.

### Environment variables

Add the following to your `.env` file:

```bash
# Tududi proxy
TUDUDI_API_URL=https://todo.thinkout.ru
TUDUDI_API_TOKEN=tt_your_token_here

# Optional — request timeout in ms (default 15000)
# TUDUDI_TIMEOUT_MS=15000
```

`TUDUDI_API_TOKEN` is optional — the rest of 1230-UI keeps working without it. When unset, the Tududi app shows a red status dot and the proxy returns `503 tududi_not_configured`.

### Verify

After restarting 1230-UI, confirm the connection from the browser:

```
/settings/tududi
```

The page shows connection status (green = connected, red = not configured or unreachable), the proxy URL (`/api/tududi/*`) and the upstream URL. A "Re-test connection" button re-probes `/api/profile` on the Tududi instance.

Or from the shell:

```bash
curl http://localhost:3001/api/tududi/health
# { "configured": true, "reachable": true, "status": 200 }
```

### Nginx / Authelia

The Tududi proxy is on the same origin as 1230-UI (`/api/tududi/*`), so no Authelia bypass is needed — the existing SSO rules cover it.

### In the UI

Open any session, click the **Applications** tab in the right split-pane (desktop only, ≥ 1024 px), and select **Tududi**. The app has three tabs:

- **Tasks** — grouped by project, filterable by status, with a TaskDetail view for inline editing, status, priority, due date, and subtasks.
- **Notes** — 2-column card grid with inline Markdown editor, 1 s auto-save, colour picker, search and sort.
- **Projects** — card grid with progress bars and navigation to the filtered Tasks / Notes view.

If the status dot is red, open `/settings/tududi` to diagnose. See [TUDUDI_INTEGRATION.md](TUDUDI_INTEGRATION.md) for the proxy contract, Tududi API quirks (singular vs plural paths, `parent_task_id` numeric only, bare objects on write), and remaining work.

---

## Next Steps

- [Configuration](CONFIGURATION.md) — configure environment variables
- [Architecture](ARCHITECTURE.md) — understand the system design
- [API Documentation](API.md) — REST API reference
- [Executor Adapters](EXECUTOR_ADAPTERS.md) — how to add a third chat backend
- [Tududi Integration](TUDUDI_INTEGRATION.md) — Tududi proxy + app developer notes
