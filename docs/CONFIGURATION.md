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
