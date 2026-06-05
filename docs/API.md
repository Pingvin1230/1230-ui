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

Response:
```json
{
  "sessions": [...],
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
  "title": "My Session"
}
```

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

## Next Steps

- [Architecture](ARCHITECTURE.md) — system design overview
- [Configuration](CONFIGURATION.md) — environment variables
