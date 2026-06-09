# API Documentation

Base URL: `http://localhost:3001`

## Sessions

### List Sessions
```
GET /api/sessions
```

Query parameters:
- `limit` — max results (default: 20)
- `offset` — pagination offset (default: 0)
- `includeArchived` — include archived sessions (default: 0)
- `sort` — sort order: `created` (default) | `lastMessage`; `lastMessage` orders by the time of the most recent message (falls back to `startedAt` for empty sessions)

Response:
```json
{
  "sessions": [
    {
      "id": "abc123",
      "title": "My session",
      "source": "webui",
      "model": "qwen3.6-plus",
      "startedAt": 1780486478.49,
      "endedAt": null,
      "messageCount": 64,
      "inputTokens": 188537,
      "outputTokens": 6834,
      "preview": "First user message...",
      "lastMessageAt": 1780686760.93,
      "pinned": 0,
      "archived": 0,
      "assistant": {
        "id": 1,
        "name": "Code Helper",
        "color": "green",
        "icon": "💻",
        "modelId": "qwen3.6-plus",
        "isArchived": false
      }
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### Get Session
```
GET /api/sessions/:id
```

### Get Session Messages
```
GET /api/sessions/:id/messages
```

### Create Session
```
POST /api/sessions
```

Body:
```json
{
  "model": "qwen3.6-plus",
  "title": "My Session",
  "assistantId": 1
}
```

`assistantId` is optional. When provided, the backend resolves the model from the assistant's `model_id` (the `model` field is still required as a fallback). Returns `409` if the assistant is archived or its model is disabled/missing.

Response:
```json
{
  "success": true,
  "sessionId": "api_1234567890_abcdef"
}
```

### Update Session Title
```
PATCH /api/sessions/:id/title
```

Body:
```json
{
  "title": "New Title"
}
```

### Toggle Pin
```
PATCH /api/sessions/:id/pin
```

### Toggle Archive
```
PATCH /api/sessions/:id/archive
```

### Delete Session
```
DELETE /api/sessions/:id
```

### Bulk Delete Sessions
```
DELETE /api/sessions/bulk
```

Body:
```json
{
  "ids": ["session1", "session2"]
}
```

## Session Files

### Upload File
```
POST /api/sessions/:id/files
Content-Type: multipart/form-data
```

Field: `file`. Max size: 50 MB. Max 5 files per request.  
Allowed extensions: `.txt .md .py .js .ts .jsx .tsx .json .csv .yml .yaml .log .html .css .xml .sh .sql .pdf .png .jpg .jpeg .gif .webp`  
Both the extension and the browser-supplied MIME type are validated server-side.  
Files are stored in `data/uploads/<session_id>/<uuid>.<ext>` and cleaned up automatically when the session is deleted.

Response `201`:
```json
{
  "files": [
    {
      "id": 42,
      "sessionId": "abc123",
      "filename": "report.pdf",
      "size": 204800,
      "mimeType": "application/pdf",
      "uploadedAt": 1780926945000
    }
  ]
}
```

The frontend prepends the server-side path to the message text before sending to Hermes:
```
[Attached file: /opt/1230-ui/data/uploads/<session_id>/<uuid>.pdf]

<user message text>
```

### List Session Files
```
GET /api/sessions/:id/files
```

Returns all files for the session (both `source = 'user'` and `source = 'agent'`).

Response `200`:
```json
{
  "files": [ /* array of file objects — same shape as POST response */ ]
}
```

### Delete Session File
```
DELETE /api/sessions/:id/files/:fileId
```

Deletes the DB record and removes the file from disk. Returns `404` if the file does not belong to the session.  
Response `204 No Content`.

### Download File
```
GET /api/sessions/:id/files/:fileId/download
```

Streams the file via `Content-Disposition: attachment`. Works for both user-uploaded files (`source = 'user'`) and agent-generated files (`source = 'agent'`).  
Returns `404` if the file no longer exists on disk (e.g. agent-created file was deleted externally).

### SSE Event: `agent_files` (Task #24)

Emitted by `POST /api/chat` inside the SSE stream **after `[DONE]`**, before the connection closes. Signals that the agent created or referenced files during its response turn.

```
data: {"type":"agent_files","files":[{"id":14,"filename":"report.md","size":8192,"mimeType":"text/markdown"}]}
```

The frontend renders an `AgentFileCard` per file directly inside the assistant message bubble.  
Detection: the assistant's response text is parsed for backtick-wrapped absolute paths (`` `/path/to/file` ``). Each candidate is verified with `fs.statSync`; only regular files with a whitelisted extension are recorded.  
Deduplication: re-mentioning the same path in a later message reuses the existing `session_files` row (same `id`).

## Chat

### Send Message
```
POST /api/chat
```

Body:
```json
{
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "session_id": "api_1234567890_abcdef",
  "model": "qwen3.6-plus",
  "stream": true
}
```

Response: Server-Sent Events (SSE) stream

### Save Message
```
POST /api/messages
```

Body:
```json
{
  "sessionId": "api_1234567890_abcdef",
  "role": "user",
  "content": "Hello"
}
```

## Models

### List Models
```
GET /api/models
```

Returns enabled models only.

### List Providers
```
GET /api/models/providers
```

Returns all providers with their models.

### Sync Providers
```
POST /api/models/sync
```

Syncs providers and models from Hermes.

### Toggle Model
```
PATCH /api/models/models/:id/toggle
```

Enables/disables a model.

## Providers (key management)

Manage API keys for Hermes model providers. Keys are written to `~/.hermes/.env`
through `scripts/manage_provider_key.py`, which delegates to Hermes' own
`hermes_cli.config.save_env_value()` for `set` (atomic temp+rename, chmod 600,
in-process env cache invalidation) and performs an atomic read-modify-replace
for `remove`. **Secret values are never stored in 1230-UI** — API responses
only return a `••••last4` mask.

### List Bundled Providers
```
GET /api/providers/available
```

Returns all Hermes-bundled providers with `auth_type == "api_key"` and a
flag for which of their `env_vars` are currently set in `~/.hermes/.env`.
OAuth / AWS / Copilot providers are hidden (use `hermes login` from the CLI
for those).

Query parameters (optional):
- `configured=1` — only providers with a key
- `configured=0` — only providers without a key

Response:
```json
{
  "providers": [
    {
      "name": "anthropic",
      "display_name": "anthropic",
      "description": "Claude models via Anthropic API",
      "signup_url": "https://console.anthropic.com/",
      "auth_type": "api_key",
      "env_vars": ["ANTHROPIC_API_KEY", "ANTHROPIC_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"],
      "configured_env_var": "ANTHROPIC_API_KEY",
      "is_configured": true,
      "base_url": "https://api.anthropic.com"
    }
  ]
}
```

`configured_env_var` is the first `env_var` that has a non-empty value in
`~/.hermes/.env` (or `null` if none). `env_vars` is the full list of aliases
the provider accepts.

### Set Provider Key
```
POST /api/providers/:name/key
```

Body:
```json
{
  "env_var": "ANTHROPIC_API_KEY",
  "value": "sk-ant-..."
}
```

Response:
```json
{
  "success": true,
  "provider": "anthropic",
  "env_var": "ANTHROPIC_API_KEY",
  "masked": "••••a1b2"
}
```

Validation:
- `env_var` must match `^[A-Z][A-Z0-9_]*$` and be present in the provider's profile
- `value` must be non-empty, ≤ 512 chars, ASCII printable

After the call, restart Hermes for the new key to take effect (env vars are
loaded at process start).

### Remove Provider Key
```
DELETE /api/providers/:name/key?env_var=ANTHROPIC_API_KEY
```

Removes a single line from `~/.hermes/.env` atomically. The local `uiDb`
rows for that provider (and its models) are also deleted so that a re-sync
doesn't show stale data. Idempotent — returns success even if the line
wasn't there.

## Assistants

Named bundles (name, description, color, icon, model) used as session presets.

### List Assistants
```
GET /api/assistants
```

Query parameters:
- `include_archived` — `1` to include archived assistants (default: `0`)

Response:
```json
[
  {
    "id": 1,
    "name": "Code Helper",
    "description": "Helpful for code reviews and debugging.",
    "color": "green",
    "icon": "💻",
    "modelId": "qwen3.6-plus",
    "isArchived": false,
    "archivedAt": null,
    "createdAt": "2026-06-08T10:00:00Z",
    "updatedAt": "2026-06-08T10:00:00Z"
  }
]
```

### Get Assistant
```
GET /api/assistants/:id
```

### Create Assistant
```
POST /api/assistants
```

Body:
```json
{
  "name": "My Assistant",
  "description": "Optional description",
  "color": "blue",
  "icon": "🤖",
  "modelId": "qwen3.6-plus"
}
```

Validation: `name` 1–60 chars; `description` ≤ 200 chars; `color` must be in the supported 8-color palette; `icon` ≤ 8 chars; `modelId` must reference an enabled model (or `null` for the global default).

### Update Assistant
```
PATCH /api/assistants/:id
```

Same body as Create. If the assistant already has sessions referencing it, the update **forks** it: the existing row is archived (existing sessions retain their reference) and a new row is created with the updated fields. The fork happens atomically in a SQLite transaction.

### Archive Assistant
```
POST /api/assistants/:id/archive
```

### Restore Assistant
```
POST /api/assistants/:id/restore
```

Restores an archived assistant to active status.

### Duplicate Assistant
```
POST /api/assistants/:id/duplicate
```

Creates an immediate copy with name `"<name> (copy)"`. The UI uses the editor prefill flow (`?from=<id>`) instead of this endpoint to avoid writing a DB row before the user confirms.

---

## System

### Health Check
```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "dbConnected": true,
  "hermesApi": "ok",
  "hermesApiUrl": "http://127.0.0.1:8642",
  "timestamp": 1780666787000
}
```

### System Status
```
GET /api/system/status
```

Returns Hermes connection status, providers, and statistics.

Response (200):
```json
{
  "hermes": {
    "status": "connected",        // "connected" | "disconnected"
    "version": "v1.2.3 (4567)",   // current Hermes Agent version
    "updateAvailable": 3,         // commits behind, or null
    "latestVersion": "v1.2.6"     // latest known release, or null
  },
  "providers": [
    {
      "name": "anthropic",
      "displayName": "Anthropic",
      "syncStatus": "ok",         // "ok" | "pending" | "error"
      "lastSyncedAt": "2026-06-07T10:00:00Z"
    }
  ],
  "stats": {
    "totalSessions": 42
  }
}
```

### Execute Command
```
POST /api/system/exec
```

Body:
```json
{
  "command": "update"  // or "doctor"
}
```

## Likes

### Send a Like
```
POST /api/like
```

Sends a "like" webhook to the configured Mattermost channel. Anti-spam is enforced:
- Per-IP rate limit: 5 requests/hour (`likeLimiter`)
- Per-user DB-backed cooldown: 1 hour by default (`LIKES_COOLDOWN_SEC`)
- Returns `429` with `Retry-After` header on cooldown
- Returns `502` on webhook failure
- Returns `503` if `LIKES_WEBHOOK_URL` is not configured

Body: _(empty — uses request IP and User-Agent to identify the user)_

Response (200):
```json
{
  "success": true,
  "sent_at": 1749300000000
}
```

Response (429):
```json
{
  "error": "Like cooldown active",
  "retry_after": 2843
}
```

The webhook payload sent to Mattermost includes: `ip`, `country` (via `geoip-lite` if installed; `null` otherwise — see `DISABLE_GEOIP`), `user_agent`, `timestamp` (ISO 8601).

## Provider Keys

Manage API keys for Hermes-bundled `api_key` providers. All endpoints are rate-limited (`providerLimiter`, 10 writes/min). Secret values are never returned in responses — only `••••last4` masks.

### List Available Providers
```
GET /api/providers/available[?configured=0|1]
```

Query parameters:
- `configured` — `1` to show only configured providers, `0` for unconfigured, omit for all

Response (200):
```json
{
  "providers": [
    {
      "name": "anthropic",
      "display_name": "Anthropic",
      "description": "Claude models from Anthropic",
      "signup_url": "https://console.anthropic.com/",
      "auth_type": "api_key",
      "env_vars": ["ANTHROPIC_API_KEY"],
      "configured_env_var": "ANTHROPIC_API_KEY",
      "is_configured": true,
      "base_url": "https://api.anthropic.com"
    }
  ]
}
```

### Set a Provider Key
```
POST /api/providers/:name/key
```

Body:
```json
{
  "env_var": "ANTHROPIC_API_KEY",
  "value": "sk-ant-..."
}
```

Response (200):
```json
{
  "success": true,
  "provider": "anthropic",
  "env_var": "ANTHROPIC_API_KEY",
  "masked": "••••wxyz"
}
```

Writes atomically via Hermes' `save_env_value()` (chmod 600, cache invalidation). The `env_var` must match one of the provider's allowed `env_vars`; the `value` must be non-empty ASCII printable ≤ 512 characters.

### Remove a Provider Key
```
DELETE /api/providers/:name/key?env_var=ANTHROPIC_API_KEY
```

Response (200):
```json
{
  "success": true,
  "provider": "anthropic",
  "env_var": "ANTHROPIC_API_KEY"
}
```

Removes the `env_var` line from `~/.hermes/.env`. Hermes' `key_required` providers will stop working until a new key is added and Hermes is restarted.

## Error Responses

All errors follow this format:
```json
{
  "error": {
    "type": "server_error",
    "message": "Error description",
    "details": "Additional details",
    "code": "ERROR_CODE",
    "retryable": true,
    "suggestion": "Try again later"
  }
}
```

Error types:
- `network` — connection issues
- `timeout` — request timeout
- `content_moderation` — blocked by security filter
- `rate_limit` — too many requests
- `server_error` — internal server error
- `auth_error` — authentication failed
- `invalid_request` — bad request format

## Rate Limits

- General API: 100 requests/minute
- Chat API: 30 requests/minute
- System commands: 5 requests/5 minutes
- Likes: 5 requests/hour per IP
- Provider key writes (`POST` / `DELETE`): 10 requests/minute

## Next Steps

- [Architecture](ARCHITECTURE.md) — system design overview
- [Configuration](CONFIGURATION.md) — environment variables
