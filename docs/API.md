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
- `executor` — filter to one executor: `hermes` | `opencode-1230`. Unknown values are ignored (no filter applied). Derived server-side from the session's assistant; free-chat sessions (no assistant) resolve to `hermes`.

Response:
```json
{
  "sessions": [
    {
      "id": "abc123",
      "title": "My session",
      "source": "webui",
      "model": "qwen3.6-plus",
      "executor": "hermes",
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

Returns the single session (same shape as the list item), including the `executor` field (`'hermes' | 'opencode-1230'`, derived from the assistant; free-chat = `hermes`) and the linked `assistant` object. The Workspace's `/chat/:id` resolver uses this `executor` to open the correct tab.

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

> **Internal (not part of this API):** `POST /session/:id/permissions/:id` is an adapter→`opencode serve` call the OpenCode executor makes to auto-approve tool permission requests (`{ response: 'once' }`, gated by `OPENCODE_AUTO_APPROVE_TOOLS`). It is not exposed by 1230UI; see [EXECUTOR_ADAPTERS.md](EXECUTOR_ADAPTERS.md) § "Tool permission handling".

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

Named bundles (name, description, color, icon, model, style, depth, system prompt, executor) used as session presets.

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
    "style": "concise",
    "depth": "thorough",
    "systemPrompt": null,
    "executor": "hermes",
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
  "modelId": "qwen3.6-plus",
  "style": "concise",
  "depth": "standard",
  "systemPrompt": "Optional system prompt (≤ 4000 chars)",
  "executor": "hermes"
}
```

Validation: `name` 1–60 chars; `description` ≤ 200 chars; `color` must be in the supported 8-color palette; `icon` ≤ 8 chars; `modelId` must reference an enabled model (or `null` for the global default); `style` ∈ {`friendly`, `formal`, `concise`, `creative`}; `depth` ∈ {`quick`, `standard`, `thorough`}; `executor` ∈ {`hermes`, `opencode-1230`} (allowlist enforced server-side, unknown values are rejected with `400`).

### Update Assistant
```
PATCH /api/assistants/:id
```

Same body as Create. If the assistant already has sessions referencing it, the update **forks** it: the existing row is archived (existing sessions retain their reference) and a new row is created with the updated fields. The fork happens atomically in a SQLite transaction. The per-session executor binding is structural — `session_meta.assistant_id` is set once at session creation and never changes, so the executor is effectively locked for the session's lifetime.

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

## Applications

The Applications pane is a pluggable registry of UI apps that live in the right split-pane. The four shipped apps are File Preview, File Manager, Cloud Connect, and Tududi.

### List Applications
```
GET /api/applications
```

Query parameters:
- `enabled` — `1` to show only enabled apps, `0` for disabled; omit for all

Response:
```json
{
  "applications": [
    {
      "id": 1,
      "key": "file_preview",
      "name": "File Preview",
      "icon": "Eye",
      "description": "Preview session files inline",
      "enabled": 1,
      "sortOrder": 0,
      "desktopOnly": 1,
      "config": {},
      "createdAt": 1781180149780,
      "updatedAt": 1781180149780
    },
    {
      "id": 4,
      "key": "tududi",
      "name": "Tududi",
      "icon": "ListChecks",
      "description": "Tasks, notes and inbox from Tududi",
      "enabled": 1,
      "sortOrder": 3,
      "desktopOnly": 1,
      "config": {},
      "createdAt": 1781180149780,
      "updatedAt": 1781180149780
    }
  ]
}
```

### Update Application
```
PATCH /api/applications/:id
```

Body (all fields optional):
```json
{
  "enabled": 1,
  "sortOrder": 2,
  "name": "New Name",
  "icon": "FileText",
  "description": "Optional description",
  "config": { "key": "value" }
}
```

`enabled: 0` hides the app from the Applications pane (and from `/applications`). The `desktopOnly` column is read-only from this endpoint; it's set at seed time.

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

### Executor Visibility

```
GET /api/system/executors
```

Returns the liveness map for the assistant executor picker. The frontend uses this to hide executors whose daemon is unreachable.

Response (200):
```json
{
  "executors": {
    "hermes": true,
    "opencode-1230": false
  }
}
```

The OpenCode probe is a 2 s `GET /global/health` against the daemon. Returns `false` on timeout, network error, or non-`{ healthy: true }` body.

### Executor Configuration

```
GET /api/system/executor-config
```

Returns the encrypted-at-rest executor config. The password field is masked (`••••last4`).

Response (200):
```json
{
  "opencode": {
    "url": "http://127.0.0.1:4097",
    "username": "admin",
    "hasPassword": true,
    "passwordPreview": "••••wxyz"
  }
}
```

```
POST /api/system/executor-config
```

Body:
```json
{
  "opencode": {
    "url": "http://127.0.0.1:4097",
    "username": "admin",
    "password": "new-password"
  }
}
```

`password` is written AES-256-GCM encrypted, using `CLOUD_CONNECT_KEY` as the key source. An empty `password` clears the stored value. The config is loaded at startup in `server.js` and overrides the corresponding env-var defaults.

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

---

## Tududi Proxy

A server-side HTTP proxy that forwards the browser's Tududi requests to the upstream Tududi instance, attaching the bearer token on the way out. The browser never holds the token.

### Health Check

```
GET /api/tududi/health
```

Probes the upstream with a 5 s timeout on `GET /api/profile`. No token is leaked in the response.

Response (200):
```json
{
  "configured": true,
  "reachable": true,
  "status": 200
}
```

If `TUDUDI_API_TOKEN` is not set, the response is `{ "configured": false, "reachable": false }`. If the upstream is unreachable, `{ "configured": true, "reachable": false, "error": "<message>" }`.

### Generic Proxy

```
* /api/tududi/<path>
```

All methods, all paths under `/api/tududi/*` are forwarded to `${TUDUDI_API_URL}/api/<rest>`. Method, body, and query string are forwarded verbatim; hop-by-hop headers, `set-cookie`, `content-encoding`, and any incoming `authorization` are stripped; `Authorization: Bearer <TUDUDI_API_TOKEN>` is added server-side. 15 s `AbortController` timeout.

| Outcome | HTTP status | Body shape |
|---|---|---|
| Success | mirrors upstream | upstream response |
| Token missing | `503` | `{ "error": { "type": "tududi_not_configured", "message": "..." } }` |
| Upstream timeout (15 s) | `504` | `{ "error": { "type": "tududi_timeout", "message": "..." } }` |
| Network error | `502` | `{ "error": { "type": "tududi_unreachable", "message": "..." } }` |

Both the tududi UI base path (`/api/*`) and the `/api/v1/*` paths are forwarded; the router only strips the `/api/tududi` prefix.

### Path → Tududi mapping examples

| Request | Upstream call |
|---|---|
| `GET /api/tududi/tasks` | `GET https://todo.thinkout.ru/api/tasks` |
| `GET /api/tududi/notes` | `GET https://todo.thinkout.ru/api/notes` |
| `GET /api/tududi/task/abc123` | `GET https://todo.thinkout.ru/api/task/abc123` |
| `POST /api/tududi/task` (body: `{...}`) | `POST https://todo.thinkout.ru/api/task` (body forwarded) |
| `PATCH /api/tududi/task/abc123` (body: `{...}`) | `PATCH https://todo.thinkout.ru/api/task/abc123` |
| `DELETE /api/tududi/note/abc123` | `DELETE https://todo.thinkout.ru/api/note/abc123` |
| `GET /api/tududi/profile` | `GET https://todo.thinkout.ru/api/profile` |

Note Tududi's inconsistent singular/plural: write paths are singular (`/api/task`, `/api/note`), list endpoints are plural (`/api/tasks`, `/api/notes`, `/api/projects`). `createProject` may return `400` depending on the deployed version. The frontend client (`src/lib/api/tududi.ts`) handles all of these — see [TUDUDI_INTEGRATION.md §3.2](TUDUDI_INTEGRATION.md) for the full observed contract.

---

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
