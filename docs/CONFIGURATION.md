# Configuration

1230-UI uses environment variables for configuration. Create a `.env` file based on `.env.example`.

## Required Variables

### Server

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |

### Hermes Integration

| Variable | Description | Example |
|----------|-------------|---------|
| `HERMES_DB_PATH` | Path to Hermes state.db | `/home/user/.hermes/state.db` |
| `HERMES_API_URL` | Hermes API endpoint | `http://127.0.0.1:8642` |
| `HERMES_API_KEY` | API key for Hermes | `your-secret-key` |
| `HERMES_AGENT_PATH` | Path to Hermes Agent | `/usr/local/lib/hermes-agent` |
| `HERMES_PYTHON_PATH` | Path to Python binary | `python3` |

### UI Database

| Variable | Description | Default |
|----------|-------------|---------|
| `UI_DB_PATH` | Path to UI database | `./data/1230-ui.db` |

### Security

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `http://localhost:3001` |

### Likes (optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `LIKES_WEBHOOK_URL` | Incoming-webhook URL for the "Like" button (Mattermost-compatible). Leave empty to disable the feature. | _(unset)_ |
| `LIKES_COOLDOWN_SEC` | Per-user cooldown for sending likes (in seconds) | `3600` |

## Example .env File

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

# Likes (optional)
LIKES_WEBHOOK_URL=
LIKES_COOLDOWN_SEC=3600
```

## Configuration Validation

On startup, 1230-UI validates all configuration variables using zod schema. If a required variable is missing or invalid, the application will exit with a helpful error message.

Example error:
```
❌ Configuration validation failed:

HERMES_DB_PATH: Required
  → Set HERMES_DB_PATH in .env to the path of Hermes state.db (e.g. /home/user/.hermes/state.db)
```

## Security Features

### Rate Limiting

Built-in rate limiting protects against abuse:
- General API: 100 requests/minute
- Chat API: 30 requests/minute
- System commands: 5 requests/5 minutes
- Likes: 5 requests/hour per IP
- Provider key writes (`POST` / `DELETE`): 10 requests/minute

### CORS

Configure allowed origins via `CORS_ORIGINS`:
```bash
CORS_ORIGINS=http://localhost:3001,https://your-domain.com
```

### Security Headers

The application uses helmet middleware for security headers:
- Content-Security-Policy (disabled in dev mode for HMR)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)
- Referrer-Policy: no-referrer

## Next Steps

- [Installation](INSTALLATION.md) — install and deploy 1230-UI
- [Architecture](ARCHITECTURE.md) — understand the system design
