# Configuration

1230-UI uses environment variables for configuration. Create a `.env` file based on `.env.example`.
All variables are validated with a Zod schema at startup — the server will not start if required values are missing or invalid.

## Variables Reference

### Server

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `3001` |

### Hermes Integration

| Variable | Description | Example |
|---|---|---|
| `HERMES_DB_PATH` | Path to Hermes `state.db` | `/home/user/.hermes/state.db` |
| `HERMES_API_URL` | Hermes API base URL | `http://127.0.0.1:8642` |
| `HERMES_API_KEY` | Bearer token for Hermes API | `your-secret-key` |
| `HERMES_AGENT_PATH` | Directory containing the `hermes` binary | `/usr/local/lib/hermes-agent` |
| `HERMES_PYTHON_PATH` | Python binary used by helper scripts | `python3` |

### UI Database

| Variable | Description | Default |
|---|---|---|
| `UI_DB_PATH` | Path to the UI SQLite database (auto-created) | `./data/1230-ui.db` |

### Security

| Variable | Description | Default |
|---|---|---|
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3001` |

### Likes (optional)

| Variable | Description | Default |
|---|---|---|
| `LIKES_WEBHOOK_URL` | Incoming-webhook URL (Mattermost-compatible). Leave empty to disable the feature entirely. | _(unset)_ |
| `LIKES_COOLDOWN_SEC` | Per-user like cooldown in seconds | `3600` |

### GeoIP (optional)

| Variable | Description | Default |
|---|---|---|
| `DISABLE_GEOIP` | Set to `true` to skip IP→country lookup in the `/api/like` handler. The server starts normally if `geoip-lite` is not installed regardless of this flag. | _(unset / false)_ |

### Cloud Connect (optional)

| Variable | Description | Default |
|---|---|---|
| `CLOUD_CONNECT_KEY` | 32-byte base64 key for AES-256-GCM credential encryption and HMAC-signed proxy URLs. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Required for creating cloud connections. | _(unset)_ |

### OpenCode Executor (optional)

The OpenCode executor is a second chat backend (see [EXECUTOR_ADAPTERS.md](EXECUTOR_ADAPTERS.md)). The URL, username and password can be set in `.env` or overridden at runtime from `/settings/executors/opencode` (encrypted at rest with `CLOUD_CONNECT_KEY`).

| Variable | Description | Default |
|---|---|---|
| `OPENCODE_URL` | Base URL of the `opencode serve` daemon. | `http://127.0.0.1:4097` |
| `OPENCODE_SERVER_USERNAME` | Optional Basic Auth username. | _(unset)_ |
| `OPENCODE_SERVER_PASSWORD` | Optional Basic Auth password. | _(unset)_ |
| `OPENCODE_AUTO_APPROVE_TOOLS` | Whether the OpenCode adapter auto-approves tool permission requests (`bash`, `edit`, …). Truthy values: `1`, `true`, `yes`, `on` (case-insensitive). | `1` |

**Security note on `OPENCODE_AUTO_APPROVE_TOOLS`.** When enabled (the default), the model can run `bash` / `edit` / other tools as the daemon user inside the worktree without per-turn confirmation. This is convenient for an agent loop but means a prompt-injection or a confused model can write files or run commands unattended. Set `OPENCODE_AUTO_APPROVE_TOOLS=0` to require manual approval of each tool permission request instead. See [EXECUTOR_ADAPTERS.md](EXECUTOR_ADAPTERS.md) § "Tool permission handling".

If `OPENCODE_URL` is not reachable, the OpenCode option is hidden in the assistant executor picker (`GET /api/system/executors` returns the visibility map).

> **Session filtering is a query param, not an env var.** The sessions list can be narrowed to one executor with `GET /api/sessions?executor=hermes|opencode-1230`. There is no env var for this — it is a per-request query parameter (used by the Workspace's `ExecutorToolbar` `…` link).

### Tududi Application (optional)

Tududi is a self-hosted task / notes manager proxied through 1230-UI at `/api/tududi/*`. The bearer token is read from `.env` and never leaves the server.

| Variable | Description | Default |
|---|---|---|
| `TUDUDI_API_URL` | Base URL of the Tududi instance (no trailing slash). | `https://todo.thinkout.ru` |
| `TUDUDI_API_TOKEN` | Bearer token (`tt_<hex>`) for the Tududi proxy. Required for the app to work. When unset, the app shows a red status dot and the proxy returns `503 tududi_not_configured`. | _(unset)_ |
| `TUDUDI_TIMEOUT_MS` | Request timeout in ms (applies to every proxied call). | `15000` |

The token is created in the Tududi UI under **Profile → Settings → API Keys**. Each Tududi user has one token. The proxy does not currently support an override file — set the URL and token in `.env` and restart the service.

## Example `.env` File

```bash
# Server
PORT=3001

# Hermes Integration
HERMES_DB_PATH=/home/user/.hermes/state.db
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_KEY=your-secret-key
HERMES_AGENT_PATH=/usr/local/lib/hermes-agent
HERMES_PYTHON_PATH=/usr/bin/python3

# UI Database
UI_DB_PATH=./data/1230-ui.db

# Security
CORS_ORIGINS=http://localhost:3001,https://your-domain.com

# Likes (optional — leave empty to disable)
LIKES_WEBHOOK_URL=
LIKES_COOLDOWN_SEC=3600

# GeoIP (optional — set to true to skip country lookup)
# DISABLE_GEOIP=true

# Cloud Connect (optional)
# CLOUD_CONNECT_KEY=

# OpenCode executor (optional)
# OPENCODE_URL=http://127.0.0.1:4097
# OPENCODE_SERVER_USERNAME=
# OPENCODE_SERVER_PASSWORD=
# OPENCODE_AUTO_APPROVE_TOOLS=1   # set to 0 to require manual tool approval

# Tududi application (optional)
# TUDUDI_API_URL=https://todo.thinkout.ru
# TUDUDI_API_TOKEN=tt_your_token_here
# TUDUDI_TIMEOUT_MS=15000
```

## Configuration Validation

On startup, all variables are validated with a Zod schema. If a required variable is missing or has an invalid value, the server exits with a clear error:

```
❌ Configuration validation failed:

HERMES_DB_PATH: Required
  → Set HERMES_DB_PATH in .env to the path of Hermes state.db
    (e.g. /home/user/.hermes/state.db)
```

## Security Features

### Rate Limiting

Five independent rate-limit profiles protect against abuse:

| Profile | Endpoints | Limit |
|---|---|---|
| `apiLimiter` | All `/api/*` | 100 req / min |
| `chatLimiter` | `POST /api/chat` | 30 req / min |
| `execLimiter` | `POST /api/system/exec` | 5 req / 5 min |
| `providerLimiter` | `POST/DELETE /api/providers/:name/key` | 10 req / min |
| `likeLimiter` | `POST /api/like` | 5 req / hr (per IP) |

The Tududi proxy (`/api/tududi/*` and `GET /api/tududi/health`) is also gated by `apiLimiter`.

### Input Sanitization

All `req.body` string values are recursively sanitized with `xss` before any handler sees them. Nested objects and arrays are traversed to any depth (capped at 10 to prevent DoS). `<script>` and `<style>` tag bodies are stripped completely.

### CORS

```bash
CORS_ORIGINS=http://localhost:3001,https://your-domain.com
```

Credentials are forwarded (required for Authelia cookie-based SSO).

### Security Headers (helmet)

| Header | Value |
|---|---|
| `Content-Security-Policy` | Enabled in production; disabled in dev (Vite HMR) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | HSTS enabled |
| `Referrer-Policy` | `no-referrer` |

### Provider Key Security

- API keys are written to `~/.hermes/.env` via `scripts/manage_provider_key.py`, which delegates to Hermes' `save_env_value()` (atomic temp+rename, `chmod 600`).
- **Secret values are never stored in 1230-UI** — API responses only return a `••••last4` mask.
- `env_var` names are validated against the provider's allowed list before writing.

## Next Steps

- [Installation](INSTALLATION.md) — install and deploy 1230-UI
- [Architecture](ARCHITECTURE.md) — understand the system design
- [API Documentation](API.md) — REST API reference
