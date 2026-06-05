# 1230UI Federation Design

**Date:** 2026-06-05
**Status:** Design / Future
**Priority:** Low (post-v1.0)

---

## Vision

Transform 1230UI from a single-agent WebUI into a multi-agent operating system.
One 1230UI installation can communicate with multiple Hermes agents running on different servers.

**Program minimum:** View status of remote agents (sessions, text) in one UI.
**Program maximum:** Full chat with multiple agents from a single 1230UI installation.

---

## Architecture: Symmetric Federation

Each 1230UI is an equal node. No master/slave. Any node can serve UI and provide data to others.

```
┌─────────────────────────────────────────────────────┐
│  User Browser                                       │
│  (connected to Node A as "home")                    │
└──────────┬──────────────────────────────────────────┘
           │
    ┌──────▼──────┐
    │  Node A     │  ← "Home Node" for user
    │  (BIG)      │     has its own local Hermes
    │  1230UI     │
    └──┬──────┬───┘
       │      │
  federation federation
  protocol   protocol
       │      │
  ┌────▼──┐ ┌─▼────┐
  │Node B │ │Node C│
  │(VPS)  │ │(10K) │
  │Hermes │ │Hermes│
  └───────┘ └──────┘
```

---

## API Design

### Layer 1: Federation API (each node exposes)

Endpoints each 1230UI provides for other nodes. Prefix: `/api/federation/`.

```
# Identity & Health
GET  /api/federation/identity
     → { nodeId, name, version, capabilities, hermesStatus, sessionCount }

GET  /api/federation/health
     → { status, hermesApi, uptime, dbConnected }

# Sessions (read-only for remote)
GET  /api/federation/sessions?limit=20&offset=0
     → { sessions: [...], total, limit, offset }

GET  /api/federation/sessions/:id
     → { id, title, model, startedAt, endedAt, messageCount }

GET  /api/federation/sessions/:id/messages
     → [{ id, role, content, toolCalls, toolName, timestamp }]

# Chat (proxies to local Hermes)
POST /api/federation/chat
     body: { messages, session_id, model, stream }
     → SSE stream or JSON

# System
GET  /api/federation/status
     → { hermes: {status, version}, providers: [...], stats: {...} }

POST /api/federation/exec
     body: { command }
     → { success, output }
```

### Layer 2: Orchestration API (cluster management)

Endpoints on "home" node for UI. Prefix: `/api/cluster/`.

```
# Node Registry
GET    /api/cluster/nodes
       → [{ id, name, url, status, lastSeen, capabilities }]

POST   /api/cluster/nodes
       body: { name, url, apiKey }
       → { id, name, status }

PUT    /api/cluster/nodes/:id
       body: { name?, url?, apiKey? }
       → { success }

DELETE /api/cluster/nodes/:id
       → { success }

# Health monitoring
POST   /api/cluster/nodes/:id/ping
       → { status, latency, hermesStatus }

# Aggregated views
GET    /api/cluster/status
       → { nodes: [...], totalSessions, activeNodes, degradedNodes }

GET    /api/cluster/sessions?nodeId=xxx
       → proxies GET /api/federation/sessions to node :nodeId
       → if nodeId omitted — aggregates from ALL nodes

GET    /api/cluster/sessions/:nodeId/:sessionId/messages
       → proxies to specific node

POST   /api/cluster/chat/:nodeId
       → proxies SSE chat stream through node
```

---

## Database Schema (additions to uiDb)

```sql
CREATE TABLE IF NOT EXISTS remote_nodes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  api_key     TEXT NOT NULL,
  status      TEXT DEFAULT 'unknown',
  capabilities TEXT,
  hermes_version TEXT,
  session_count INTEGER DEFAULT 0,
  last_seen   INTEGER,
  last_error  TEXT,
  created_at  INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS node_cache (
  node_id    TEXT NOT NULL,
  cache_key  TEXT NOT NULL,
  value      TEXT,
  updated_at INTEGER,
  PRIMARY KEY (node_id, cache_key),
  FOREIGN KEY (node_id) REFERENCES remote_nodes(id) ON DELETE CASCADE
);
```

---

## Authentication

```
On 1230UI installation, generate:
  NODE_ID=uuid
  FEDERATION_API_KEY=random(64)

Stored in .env:
  FEDERATION_NODE_ID=abc-123
  FEDERATION_API_KEY=sk-fed-xxxxx

Inter-node request:
  Headers: {
    X-Federation-Node-Id: <requesting node id>
    Authorization: Bearer <requesting node api_key>
  }
```

---

## Implementation Principles

1. **Lazy polling, not WebSocket**
   Node status updates on timer (every 30s). No persistent connections needed.

2. **Stream proxying for chat**
   SSE stream proxied transparently — Node A fetches stream from Node B and pipes to client response.

3. **Graceful degradation**
   If node offline — UI shows gray indicator but doesn't break. Requests return cached data from `node_cache`.

4. **Capability-based routing**
   UI knows each node's capabilities. If node doesn't support `exec` — "Update" button hidden for it.

---

## Chat Streaming: Full Proxy vs Redirect

**A. Full proxy** — Node A streams SSE from Node B to client directly (pipe). Simple, but Node A must hold connection.

**B. Redirect** — Node A gives client Node B's URL, client connects directly. Harder for CORS/auth, but unloads Node A.

**Decision:** Start with **A** (full proxy) — simpler to implement and debug.

---

## Implementation Phases (MVP path)

| Phase | What | Result |
|-------|------|--------|
| **Phase 1** | Federation Identity + Health | See node list and their statuses |
| **Phase 2** | Federation Sessions | See sessions from other nodes |
| **Phase 3** | Federation Chat (SSE proxy) | Chat with agents on other servers |
| **Phase 4** | Cluster Aggregation | Unified view of all sessions, cross-node search |

Phase 1-2 = program minimum. Phase 3 = program maximum.

---

## Alternatives Considered

### Scenario 1: Hermes API for remote access
- Problem: SQLite is local, direct DB access doesn't scale
- Tailscale/VPN solves network layer but not architectural
- If Hermes lacks full REST API — would need to write one
- **Rejected:** too coupled to Hermes internals

### Scenario 2: API between 1230UI installations (CHOSEN)
- Each 1230UI remains a "hub" for its local agent
- Add API layer on top of existing Express server
- One UI can aggregate data from multiple 1230UI instances
- **Benefits:** independent of Hermes API, flexible, path to "OS"
