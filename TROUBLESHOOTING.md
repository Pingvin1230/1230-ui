# Troubleshooting

A field guide to the bugs that have hit BIG (185.145.126.91) during the
v0.9.x rollout, with the diagnostic commands that pinpoint the root cause
and the fix that landed. If you hit a chat problem on a fresh install,
this is the first place to look.

For the design that motivated these fixes, see
[docs/ARCHITECTURE.md — Two-Process Model](docs/ARCHITECTURE.md#two-process-model).
For the bug-by-bug writeup as it was merged, see the [v0.9.2 Model Routing
Overhaul section of CHANGELOG.md](CHANGELOG.md#092---2026-06-10-cloud-connect--webdav-file-picker--inline-content-expansion).

---

## Index

1. [`Network error: STREAM_ABORTED` on a successful turn](#1-network-error-stream_aborted-on-a-successful-turn)
2. [User-selected model ignored, LLM uses `config.yaml` default](#2-user-selected-model-ignored-llm-uses-configyaml-default)
3. [Duplicate user messages / 4 turns in `agent.log` for one click](#3-duplicate-user-messages--4-turns-in-agentlog-for-one-click)
4. [`hermes-api` (or `hermes-gateway`) restarts every 5 minutes](#4-hermes-api-or-hermes-gateway-restarts-every-5-minutes)
5. [Orphan `python run_chat.py` processes after browser disconnect](#5-orphan-python-run_chatpy-processes-after-browser-disconnect)
6. [Wrapper exits with `ModuleNotFoundError: No module named 'run_agent'`](#6-wrapper-exits-with-modulenotfounderror-no-module-named-run_agent)
7. [Long silence then burst of events at the end of a turn](#7-long-silence-then-burst-of-events-at-the-end-of-a-turn)
8. [OpenCode session shows empty messages after reload / opening the Applications pane](#8-opencode-session-shows-empty-messages-after-reload--opening-the-applications-pane)
9. [OpenCode daemon unreachable — executor picker is empty](#9-opencode-daemon-unreachable--executor-picker-is-empty)
10. [Tool card stuck after `tool_start` — no `tool_complete` event arrives](#10-tool-card-stuck-after-tool_start--no-tool_complete-event-arrives)
11. [Hermes agent loses context (`history=0`) and every user message appears twice in the chat](#11-hermes-agent-loses-context-history0-and-every-user-message-appears-twice-in-the-chat)

---

## 1. `Network error: STREAM_ABORTED` on a successful turn

### Symptoms

- The browser shows a red toast: `Network error: STREAM_ABORTED` / "Connection
  interrupted" / "Server may have restarted".
- The agent actually answered — the message is in `agent.log` and the
  `state.db.messages` table.
- The chat bubble does **not** appear in the UI.

### Cause

Two coupled bugs:

1. The Node side (`routes/chat.js`) emits a `type: 'done'` event with
   `final_response` and `usage`, but the frontend's SSE parser did not
   handle that event type — it only looked for the OpenAI-style `data: [DONE]`
   sentinel. Successful responses were misclassified as aborted.
2. The wrapper sometimes closes stdout before the Node side writes
   `data: [DONE]\n\n`, so the parser's "stream closed without [DONE]" branch
   fired `STREAM_ABORTED` even when `fullContent` had thousands of
   accumulated chars.

### Fix

In v0.9.2 both layers were patched:

- `routes/chat.js:733-750` — emits `type: 'done'` with the authoritative
  `final_response` and `usage`, **and** a literal `data: [DONE]\n\n` sentinel
  for OpenAI-spec SSE consumers.
- `src/lib/api.ts:266-283` — handler for `type: 'done'` that fires `onDone`
  with the server payload's `final_response` (falling back to accumulated
  deltas).
- `src/lib/api.ts:345-353` — rescue path: if the connection closes with
  accumulated `fullContent` but no `done` event arrived, fire
  `onDone(fullContent)` instead of erroring with `STREAM_ABORTED`.

### Diagnostic

```bash
# 1. Did the wrapper actually finish?
tail -n 200 /home/pingvin1230/.hermes/agent.log | grep -E "session_id|completed|done"
#    Look for a "turn complete" line for the session_id in question.

# 2. What exit code did run_chat.py return?
journalctl -u hermes-api --since "5 min ago" | grep -E "run_chat|exit"
#    0 = success (done event was emitted).

# 3. Did the browser receive the [DONE] sentinel?
#    Open DevTools → Network → click the /api/chat request → EventStream tab.
#    Scroll to the end; the last frame should be:
#      data: [DONE]
```

If the `agent.log` shows a completed turn and the EventStream tab shows a
`data: [DONE]` frame, the fix is in place and the symptom should not recur.

---

## 2. User-selected model ignored, LLM uses `config.yaml` default

### Symptoms

- The model picker shows "MiniMax-M3" (or whatever the user chose).
- The assistant's answer is clearly from a different model (different
  style, knowledge cutoff, refusal style).
- `state.db.sessions.model` may or may not match the UI selection,
  depending on when the persistence happened.
- `agent.log` shows the wrong model field in the request payload.

### Cause

The previous chat path proxied to Hermes's `api_server` at
`HERMES_API_URL` with a hardcoded `model: 'hermes-agent'`. The
`api_server` resolves the actual model via `_resolve_gateway_model()` and
ignores per-request model fields. So no matter what 1230UI sent, the LLM
always used `config.yaml.model.default`.

A secondary cause: `getProviderFromModel()` was a string heuristic that
returned `unknown` for any model whose name didn't contain a known
substring (e.g. an OpenAI model whose model_id had no "gpt" or "openai"
in it), which made `resolve_runtime_provider` fall back to the wrong
provider.

### Fix

v0.9.2 replaces the HTTP proxy with a direct Python subprocess:

- `run_chat.py` constructs `AIAgent(model=<user-chosen>, provider=...,
  base_url=..., api_key=...)` with explicit kwargs. The
  `config.yaml.model.default` lookup is never invoked.
- `db/helpers.js:79-93` — `getProviderFromModel()` now does a `JOIN
  models m ON providers p` first; the substring heuristic is a
  last-resort fallback.
- `run_chat.py:184-194` — persists the chosen model to
  `state.db.sessions.model` immediately so the dashboard reflects the
  user's choice.

### Diagnostic

```bash
# 1. What model does the UI think the user picked?
#    Open DevTools → Network → POST /api/chat request → Payload tab.
#    Look for the `model` field in the JSON body.

# 2. What model did the LLM actually use?
tail -n 200 /home/pingvin1230/.hermes/agent.log | grep "model=" | tail -n 1
#    The two values must match.

# 3. What does state.db think?
sqlite3 /home/pingvin1230/.hermes/state.db \
    "SELECT id, model FROM sessions WHERE id = '<session_id>';"
#    The model column should match the UI selection.

# 4. If 1 and 2 disagree, the wrapper is not being invoked. Check that
#    routes/chat.js spawn()s run_chat.py and not the old HTTP proxy.
grep -n "spawn\|fetch" /opt/1230-ui/routes/chat.js | head
#    Expect: spawn(HERMES_PYTHON, …) — NOT fetch(${HERMES_API_URL}…).
```

---

## 3. Duplicate user messages / 4 turns in `agent.log` for one click

### Symptoms

- The user clicks Send once.
- Four user bubbles appear in the chat (all with the same text).
- `agent.log` shows four consecutive `conversation turn` lines for the
  same `session_id` within 1–2 seconds.

### Cause

The frontend's `api.sendMessage` defaulted to `maxRetries: 3` and retried
on any error classified as `retryable` (network errors, 5xx, 429). When
the LLM took longer than the SSE consumer's patience to send the first
byte, the consumer's error handler fired, the retry kicked in, and the
cycle repeated three more times — each retry spawning a fresh
`run_chat.py` instance and a fresh turn in `agent.log`.

### Fix

v0.9.2 disables the auto-retry at two layers:

- `src/pages/ChatPage.tsx:406` — passes `maxRetries: 0` to
  `api.sendMessage`. The user must click the manual Retry button to
  resend.
- `routes/chat.js:322-406` — server-side `INFLIGHT` dedup map keyed by
  `${session_id}:${hash(lastUserMessage)}` with a 30 s TTL. Duplicate
  requests return HTTP 409 with `code: 'DUPLICATE_INFLIGHT'`. This is
  the safety net for old clients, hand-rolled `fetch()` calls, and
  network blips that fire multiple sends before the first is
  acknowledged.

### Diagnostic

```bash
# Count turn starts for the session in question over a time window.
grep "<session_id>" /home/pingvin1230/.hermes/agent.log | \
    grep "conversation turn" | \
    awk '{print $1, $2}' | \
    uniq -c
#    If the count is > 1 within 5 seconds, the bug is back.
#    The expected count is 1 per user click.

# Did the Node side return 409 for the duplicates?
journalctl -u hermes-api --since "5 min ago" | grep -E "dedupe|DUPLICATE_INFLIGHT"
#    Expect: at least one "dedupe: dropping duplicate request" line per burst.
```

### Workaround (if it happens on a fresh install before the fix is deployed)

Add a one-line `req.body.maxRetries = 0` patch in `routes/chat.js`
before the spawn, and deploy a new build. The INFLIGHT dedup will then
catch the rest.

---

## 4. `hermes-api` (or `hermes-gateway`) restarts every 5 minutes

### Symptoms

- `journalctl -u hermes-api` shows the service restarting on a tight
  5-minute cadence.
- In-flight HTTP connections from the browser die mid-stream; the user
  sees `STREAM_ABORTED` (see issue #1) on every long turn.
- `curl http://127.0.0.1:8642/v1/models` succeeds, but the connection
  drops randomly.

### Cause

Two issues, both server-level (not in the 1230UI repo):

1. **Dual systemd unit conflict.** A user-level `hermes-gateway.service`
   (residual from an earlier setup) was racing with the system
   `hermes-api.service`. Every 5 minutes the gateway signalled a reload
   to the api service, which dutifully restarted and dropped all
   in-flight HTTP connections — including the long-lived SSE streams
   from `/api/chat`.
2. **`TimeoutStopSec` shorter than the API server's `drain_timeout`.**
   `/etc/systemd/system/hermes-api.service` had
   `TimeoutStopSec=90s`, but the API server's `drain_timeout` is 120 s.
   On a graceful stop, systemd SIGKILLed the process at 90 s while
   requests were still being drained, producing the same restart loop.

### Fix

Server-level (BIG, `/etc/systemd/system/`):

```bash
# 1. Disable the user-level unit
systemctl --user disable --now hermes-gateway.service
systemctl --user mask hermes-gateway.service

# 2. Raise TimeoutStopSec on the api service
sudo sed -i 's/^TimeoutStopSec=.*/TimeoutStopSec=210s/' \
    /etc/systemd/system/hermes-api.service
sudo systemctl daemon-reload
sudo systemctl restart hermes-api.service

# 3. Verify the cadence has stopped
journalctl -u hermes-api --since "30 min ago" | grep -c "Started hermes-api"
#    Should print 1 (one start, from the restart above).
```

### Diagnostic

```bash
# 1. Is the rogue unit running?
systemctl --user status hermes-gateway.service
#    Expect: "Unit hermes-gateway.service could not be found." or "inactive (dead)".

# 2. What is the current TimeoutStopSec?
systemctl show hermes-api.service | grep -E "^TimeoutStopSec"
#    Expect: TimeoutStopSec=2min 30s   (or 210s)

# 3. Restart count over the last hour.
journalctl -u hermes-api --since "1 hour ago" | grep -c "Started hermes-api"
#    Expect: <= 2 (one for the deploy, one for the fix).
```

If the count is climbing on a 5-minute cadence, the rogue unit is back
or another service is signalling reloads. Run `systemctl list-dependencies
hermes-api.service` to see what else can trigger a restart.

---

## 5. Orphan `python run_chat.py` processes after browser disconnect

### Symptoms

- `ps -ef | grep run_chat` shows multiple `python run_chat.py` processes
  running long after the user closed the tab.
- Memory usage on BIG climbs over hours.
- Eventually `ulimit -u` (process limit) is hit and new requests start
  failing with `OSError: Resource temporarily unavailable`.

### Cause

Pre-v0.9.2: the chat route did not register a `req.on('close')` handler.
When the browser disconnected, the Node process kept its handle on the
child, and the child kept running until it finished or hit the
hard-coded 30-second `child.stdout` timeout (whichever came first).

### Fix

v0.9.2 (`routes/chat.js:516-522`):

```js
req.on('close', () => {
  killedByClient = true;
  clearHardTimeout();
  if (firstOutputTimer) { clearTimeout(firstOutputTimer); firstOutputTimer = null; }
  killChild('SIGTERM');
  killTimer = setTimeout(() => killChild('SIGKILL'), 5000);
});
```

The child receives `SIGTERM` immediately on disconnect, with a `SIGKILL`
escalation 5 s later if it has not exited. The hard 10-min timeout
(`routes/chat.js:506`) is the upper bound.

### Diagnostic

```bash
# 1. Between requests, the process list must be empty.
ps -ef | grep -E "run_chat|python.*run_chat" | grep -v grep
#    Expect: empty (or only the current ps itself).

# 2. If non-empty, how long have they been running?
ps -eo pid,etime,cmd | grep -E "run_chat" | grep -v grep
#    A child older than the longest in-flight turn is orphaned.

# 3. The frontend's stream consumer does not see a "done" event for any
#    of these. They will accumulate agent.log turns when they finally
#    finish (or get killed).
tail -n 200 /home/pingvin1230/.hermes/agent.log | grep "conversation turn" | tail -n 5
#    Compare the count against the number of user messages sent.
```

### Manual cleanup

If orphans are accumulating and the fix is not yet deployed:

```bash
# Kill any run_chat.py process older than 10 minutes.
pgrep -f "run_chat.py" | while read pid; do
    age=$(ps -o etimes= -p "$pid" | tr -d ' ')
    if [ "$age" -gt 600 ]; then
        echo "killing orphan pid=$pid age=${age}s"
        kill -KILL "$pid"
    fi
done
```

The 10-minute threshold matches the `HARD_TIMEOUT_MS` upper bound in
`routes/chat.js:506` — any process older than that is by definition
untracked.

---

## 6. Wrapper exits with `ModuleNotFoundError: No module named 'run_agent'`

### Symptoms

- `POST /api/chat` returns HTTP 502 with `details: "Failed to import
  Hermes modules …"`.
- The 1230UI log shows the wrapper's stderr:
  ```
  [run_chat] Failed to import Hermes modules from /usr/bin/python3: No
  module named 'run_agent'. Make sure you launched this script with
  /usr/local/lib/hermes-agent/venv/bin/python.
  ```
- `journalctl -u hermes-api` shows `SPAWN_FAILED` or `Provider error`.

### Cause

`HERMES_PYTHON_PATH` is unset, or set to system `python3` (the
`config.js` default). The wrapper imports `run_agent`, `hermes_cli`, and
`hermes_state` from the Hermes Agent venv; those modules are **not** on
the system Python's `sys.path`.

### Fix

Set `HERMES_PYTHON_PATH` in `.env` to the absolute path of the venv
interpreter. The path must match the shebang on line 1 of `run_chat.py`:

```bash
# Find the venv interpreter
ls -l /usr/local/lib/hermes-agent/venv/bin/python
# Should resolve to a real file.

# In /opt/1230-ui/.env:
HERMES_PYTHON_PATH=/usr/local/lib/hermes-agent/venv/bin/python
```

Restart the 1230UI process (`systemctl restart hermes-api` or kill +
re-run `node server.js`).

### Diagnostic

```bash
# 1. What is config.js loading?
node -e "import('/opt/1230-ui/config.js').then(m => console.log(m.default.hermesPythonPath))"
# Expect: /usr/local/lib/hermes-agent/venv/bin/python (or wherever your venv lives).

# 2. Can that interpreter import the modules?
HERMES_PYTHON_PATH=$(node -e "import('/opt/1230-ui/config.js').then(m => console.log(m.default.hermesPythonPath))")
"$HERMES_PYTHON_PATH" -c "import run_agent, hermes_cli.runtime_provider, hermes_state; print('ok')"
# Expect: ok
# If you get ModuleNotFoundError, the venv is broken or the path is wrong.

# 3. Is the venv intact?
ls -l /usr/local/lib/hermes-agent/venv/bin/python
ls -l /usr/local/lib/hermes-agent/venv/lib/python*/site-packages/run_agent.py
# Both should exist.
```

---

## 7. Long silence then burst of events at the end of a turn

### Symptoms

- The browser shows "thinking…" for 10–30 seconds, then the entire
  assistant answer appears at once instead of streaming in.
- The wrapper's stdout was correctly line-buffered in isolation (test
  with `python -u run_chat.py` directly), but not when spawned from Node.

### Cause

Python buffers stdout in C stdio when the output is a pipe (not a TTY)
unless told not to. The Node `child_process.spawn` gives the wrapper a
pipe, so the buffering is on by default. Without `-u` /
`PYTHONUNBUFFERED=1`, the child can hold up to ~8 KB of stdout in the C
buffer until it fills, the process exits, or an explicit `flush()` is
called.

### Fix

Three layers of belt-and-suspenders in `routes/chat.js:451-471` and
`run_chat.py:38-48`:

1. `sys.stdout.reconfigure(line_buffering=True)` at import time in the
   wrapper.
2. `-u` flag in the argv.
3. `PYTHONUNBUFFERED=1` and `PYTHONIOENCODING=utf-8` in the child env.

If you launch the Node process directly (not under systemd), make sure
your shell does not pipe its stdout to another process without
`unbuffer`/`stdbuf -oL`.

### Diagnostic

```bash
# 1. Is the fix in place?
grep -n "PYTHONUNBUFFERED\|line_buffering\|'-u'" /opt/1230-ui/routes/chat.py /opt/1230-ui/run_chat.py
# Expect: at least three matches (one in run_chat.py, two in routes/chat.js).

# 2. Direct test — should stream line by line.
echo '{"session_id":"sess_diag","model":"MiniMax-M3","provider":"minimax","message":"count to 5"}' \
    | /usr/local/lib/hermes-agent/venv/bin/python -u /opt/1230-ui/run_chat.py --session-id sess_diag --model MiniMax-M3
# Expect: one JSON line per LLM chunk, immediately as it arrives.

# 3. If you have to launch outside systemd, make the buffering visible.
PYTHONUNBUFFERED=0 stdbuf -o0 /usr/local/lib/hermes-agent/venv/bin/python -u /opt/1230-ui/run_chat.py …
# Then compare the timing against `stdbuf -oL` (line-buffered) — the
# unbuffered version must not stall.
```

---

## Quick reference: where to look first

| Symptom | First file to grep | First log to read |
|---|---|---|
| Wrong model answering | `routes/chat.js` (line 411) | `agent.log` |
| `STREAM_ABORTED` on success | `routes/chat.js` (lines 733, 749) | browser DevTools EventStream |
| Duplicate user bubbles | `src/pages/ChatPage.tsx` (line 406) | `agent.log` (count `conversation turn`) |
| 5-minute restarts | `/etc/systemd/system/hermes-api.service` | `journalctl -u hermes-api` |
| Orphan `run_chat.py` | `routes/chat.js` (lines 516-522) | `ps -ef \| grep run_chat` |
| `ModuleNotFoundError: run_agent` | `/opt/1230-ui/.env` (`HERMES_PYTHON_PATH`) | `journalctl -u hermes-api` |
| Long silence, burst at end | `run_chat.py` (line 38) + `routes/chat.js` (lines 453, 470) | direct `python -u run_chat.py …` test |

If the symptom you are seeing is not on this list, capture: the request
body (from DevTools), the response stream (EventStream tab), the
`agent.log` for the session, and the `journalctl -u hermes-api` output
for the same window. With those four in hand, the root cause is usually
identifiable in a few minutes.

---

## 8. OpenCode session shows empty messages after reload / opening the Applications pane

### Symptoms

- User sends a message in an `opencode-1230` assistant session. The
  chat streams back a full assistant response and the user sees the
  conversation.
- The user opens the Applications pane, navigates away, or reloads the
  page — **all messages disappear from the chat**.
- `GET /api/sessions/:id/messages` returns `[]`.
- `state.db` for that session has `message_count = 0`.
- OpenCode's own session (e.g. `ses_14963ada8ffeVCYdU8gQFinzD8`) is
  fully populated with the conversation, the tool calls, the file the
  agent wrote, etc.

### Cause

The Hermes executor path (`run_chat.py` + `hermes_agent.AIAgent`)
persists messages to `state.db.messages` automatically as the agent
runs. The OpenCode executor path (`handleOpenCodeChat` in
`routes/chat.js`) is a pure SSE proxy — it forwards OpenCode's
`/event` stream to the browser, but **never writes to Hermes**. The
React `messages` state holds the conversation in memory; on reload
`GET /api/sessions/:id/messages` returns `[]` (Hermes is empty) and
the chat appears empty.

Worse, `api.sendMessage` in `src/lib/api.ts` also never calls
`POST /api/messages` (the existing endpoint that delegates to
`save_messages.py`), so even the user message itself is never
persisted for OpenCode sessions.

### Diagnostic

```bash
# 1. Confirm Hermes has no messages for the session
sqlite3 /root/.hermes/state.db \
  "SELECT COUNT(*) FROM messages WHERE session_id='1781180149780_ea141b6b';"

# 2. Confirm OpenCode has the conversation
curl -sS http://127.0.0.1:4097/session/<ses_xxx>/message | python3 -m json.tool | head -40

# 3. Confirm session_meta has the opencode_session_id
sqlite3 /opt/1230-ui/data/1230-ui.db \
  "SELECT * FROM session_meta WHERE session_id='1781180149780_ea141b6b';"
```

If (1) returns 0 and (2) returns a populated array, this is the bug.

### Fix

Two-part fix, both landed in `routes/chat.js` and `routes/sessions.js`:

1. **Persist on send** — `handleOpenCodeChat` now writes the user
   message to Hermes `state.db.messages` before firing `prompt_async`,
   and the final assistant response in the `finally` block. Uses the
   existing `hermesDbWrite` connection (no Python subprocess — direct
   SQLite, much faster and race-free). Dedup window of 60 s on
   `(role, content)` to absorb the auto-retry storm the OpenCode path
   can still produce.

2. **Recover on read** — `GET /api/sessions/:id/messages` now also
   fetches from OpenCode's `/session/:id/message` endpoint for any
   session with an `opencode_session_id` and merges the result with
   the Hermes rows. Dedup on `(role, content, ±60 s timestamp)` so the
   recovered OpenCode history and the new Hermes-persisted turns do
   not produce duplicates. The merge is additive (not fallback) so
   the moment the user sends a new turn in an affected session, the
   original history does not disappear again.

### Why the fix works

The user message and the assistant's streamed text are both already
in our process at the point the SSE event fires — the chat route
already has the data, the SSE consumer already accumulates it, the
file-detect helper already inspects it. The only missing step was
writing it to the same database the rest of the UI reads from. The
`hermesDbWrite` connection was already opened in
`db/connections.js` for session delete, so the fix reuses it instead
of spawning a Python subprocess per message.

The recovery layer means the user's existing 14-message conversation
on session `1781180149780_ea141b6b` (and any other OpenCode session
that lost its history under the bug) becomes visible the moment the
fix is deployed, with no migration step and no data loss.

### Similar issues to watch for

- **`POST /api/messages` is now dead code for OpenCode sessions.**
  The new direct-SQL writes bypass the Python `save_messages.py`
  script. The script is still used by the older Hermes path (none
  currently) and by any future executor that needs subprocess-style
  writes. Do not delete it.
- **Token counts on recovered messages are accurate** (OpenCode
  reports them per-message) but they are *not* aggregated into the
  session's `input_tokens`/`output_tokens` columns by the recovery
  path. Only newly-persisted turns update those columns. The session
  list view may therefore under-report totals for affected sessions
  until the next turn is sent.
- **The OpenCode message endpoint uses `parts` arrays**, not flat
  `content` strings. The new `normalizeOpenCodeMessage` helper in
  `routes/sessions.js` flattens them. If OpenCode adds a new part
  type in a future release, the helper will silently drop it. Watch
  the `console.warn` from `mergeAndDedupMessages` and the empty
  assistant bubbles.

---

## See also

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — full system design
- [CHANGELOG.md](CHANGELOG.md) — release notes
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — environment variables

---

## 9. OpenCode daemon unreachable — executor picker is empty

### Symptoms

- The assistant editor shows only the **Hermes** radio button; the **OpenCode** radio is either absent or disabled with the hint *"OpenCode daemon is not reachable."*
- Top bar status dot is grey or red (never green) for the OpenCode indicator.
- `curl http://127.0.0.1:4097/global/health` from the 1230UI host returns nothing or refuses connection.
- `GET /api/system/executors` from inside 1230UI returns `{"executors":["hermes"]}` (no `opencode-1230`).

### Cause

The `OpenCodeAdapter.health()` check (`lib/adapters/opencode.js`) probes the daemon at `OPENCODE_URL` (default `http://127.0.0.1:4097`) with a 2-second timeout. If the probe times out, throws, or returns `healthy: false`, the dispatcher excludes `opencode-1230` from the available executors list — which means the assistant editor hides the option entirely.

The most common underlying causes are:

1. The `opencode-1230ui.service` systemd unit is **not running** (`systemctl status opencode-1230ui.service` shows `inactive (dead)`).
2. The unit **failed at startup** because port `4097` is already in use by something else (the user's own `opencode web` on 4096 doesn't conflict, but other processes might).
3. The unit is running but `OPENCODE_URL` in `.env` (or the encrypted `system_settings` row) points to a wrong host/port — e.g. a stale `http://localhost:4097` that doesn't resolve.
4. The OC daemon crashed mid-session and systemd's `RestartSec=5` is in the middle of the backoff window (5 s after the last crash).
5. Basic auth is configured on the daemon but the credentials in 1230UI are wrong — the health probe itself doesn't use Basic auth (it hits `/global/health` which is typically unauthenticated), but a wrong `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` will cause `POST /session` to fail with 401 the moment a chat starts.

### Diagnostic

```bash
# 1. Is the daemon process running?
systemctl status opencode-1230ui.service

# 2. Can we reach the health endpoint?
curl -sS --max-time 3 http://127.0.0.1:4097/global/health
# Expect: {"healthy":true,"version":"1.15.4"}
# If "connection refused" → daemon not listening (crashed or wrong port)
# If "timeout" → firewall / wrong host

# 3. Is the port actually bound?
ss -tlnp 2>/dev/null | grep 4097
# Expect: opencode process listening

# 4. Is the unit enabled (survives reboot)?
systemctl is-enabled opencode-1230ui.service
# Expect: enabled

# 5. What does 1230UI think?
curl -sS http://127.0.0.1:3001/api/system/executors
# Expect: {"executors":["hermes","opencode-1230"]}
# If only ["hermes"] → the 2 s health probe inside 1230UI is failing
```

### Fix

| Cause | Fix |
|---|---|
| Unit not enabled | `sudo systemctl enable --now opencode-1230ui.service` |
| Unit crashed | `sudo systemctl restart opencode-1230ui.service`; tail the log: `journalctl -u opencode-1230ui -n 100 --no-pager` |
| Port 4097 in use | `ss -tlnp 'sport = :4097'` to find the squatter; either stop it or change `OPENCODE_URL` in 1230UI to a free port (and the daemon's `--port` arg) |
| Wrong URL in settings | Settings → Executor Configuration → set the correct URL → Save → click **Test connection** |
| Wrong Basic auth | Same panel — fix username/password, save, retry |
| Daemon in backoff window | Wait 5 s and refresh; the top-bar dot turns green on the next poll cycle |

### Prevention

The `opencode-1230ui.service` unit is created by `install.sh:setup_opencode()` during install. If the install script reported the unit was created but skipped enabling, run `sudo systemctl enable opencode-1230ui.service` manually. To check the unit survives a reboot, run `sudo systemctl reboot-test opencode-1230ui.service` (if available) or schedule a one-shot reboot for a maintenance window.

---

## 10. Tool card stuck after `tool_start` — no `tool_complete` event arrives

### Symptoms

- The user sends a prompt that requires a tool call (e.g. *"read the file `/etc/os-release`"*).
- An assistant turn starts; a **tool card** appears in the chat with a spinner / "running" indicator and a tool name.
- The card never closes. The assistant message eventually arrives, but the tool card is still showing as in-flight.
- A reload of the page leaves the tool card in the same state (frontend has no `tool_call_end` to mark it complete).

### Cause

`startOpenCodeStream` in `lib/opencode.js` tracks every `message.part.updated (type=tool)` event in a per-part `Map<partId, stateType>`. The adapter emits:

- `tool_start` — the first time it sees a new `partId`.
- `tool_complete` — when the same `partId` transitions to a terminal state (`complete` / `error` / `success`).
- `tool_complete` for **every still-in-flight tool** on `session.idle` — the safety net that closes cards whose terminal event was never emitted by the daemon.

The card-stuck symptom means **one of two things**:

1. **OpenCode daemon never emitted the terminal `state.type` transition** for the tool part — only the initial `state.type` like `pending` or `running` ever arrived. The v0.9.2 spike had this bug; fixed by the `toolStates` map + the `session.idle` safety net.
2. **`session.idle` itself never arrives** — the daemon crashed mid-tool, the SSE consumer was disconnected before the terminal frame, or the watchdog killed the response. In that case the dispatcher writes the assistant text it has buffered via the **rescue path** in `lib/adapters/opencode.js` (`if (responseText) yield done`), but the in-flight tool cards remain in `tool_start` state because no `session.idle` ever fired the safety net.

The frontend `ToolCall` component renders an open `<details>` card; without a `tool_call_end` event the card stays in the "running" visual.

### Diagnostic

```bash
# 1. Was the daemon healthy during the stuck turn?
journalctl -u opencode-1230ui --since "10 minutes ago" --no-pager

# 2. Did SSE actually deliver the events? Tail 1230UI's log:
pm2 logs 1230-ui --lines 200 | grep -E "tool_start|tool_complete|session.idle|session.error"

# 3. Replay the session through the OC daemon directly:
curl -sS http://127.0.0.1:4097/session/<ses_xxx>/message | python3 -m json.tool | head -60
# Look at each message's parts: tool parts have a `state` object. If the
# last `state.type` is "pending" / "running" / "in_progress" and never
# reached "complete" / "error" / "success", that's the symptom at source.
```

### Fix (workaround until the root cause is addressed)

The simplest workaround in the spike is to **re-trigger the assistant turn**: edit the user's message slightly and resend. The new turn creates a fresh assistant response; the `tool_start` / `tool_complete` cycle restarts, and the card closes correctly. The old stuck card can be hidden by clicking the caret to collapse the `<details>`.

For the root cause, the only durable fix is for the OpenCode daemon to guarantee a terminal `state.type` for every tool part it started. If a tool is cancelled or the daemon crashes, the daemon should emit a `state.type = 'error'` part-update before terminating, so the SSE consumer can pair the `tool_start` with a `tool_complete`. 1230UI already handles all three known terminal state strings (`complete` / `error` / `success`) and the `session.idle` safety net covers the rest; further hardening requires upstream changes in OpenCode.

### Similar issues to watch for

- **OC daemon restart during a chat turn** — the SSE consumer is dropped, `reader.read()` returns `done`, the catch block emits `OpenCode stream error`. The user sees an error toast. The session is still resumable on the next send because `session_meta.opencode_session_id` survives.
- **Multiple parallel tool calls in one turn** — the v0.9.2 `toolStates` map keys by `partId`, so parallel tool calls are tracked independently. If a future OpenCode release batches tools into a single part id, the safety net still works (one `tool_complete` per still-in-flight part on `session.idle`).

---

## 11. Hermes agent loses context (`history=0`) and every user message appears twice in the chat

### Symptoms

- The user sends a message in a Hermes session. The assistant replies — but the reply has no recollection of any prior turn. On the next user turn the agent again acts as if it has never spoken to the user before.
- In `~/.hermes/logs/agent.log` every `conversation turn` line shows `history=0`, regardless of how many turns are in the session:
  ```
  ... [1781520667452_55e655d6] agent.conversation_loop: conversation turn: session=1781520667452_55e655d6 model=MiniMax-M3 provider=minimax platform=1230ui history=0 msg='...'
  ```
- In the UI, **every user message and many assistant messages appear twice** in the same chat scroll. `GET /api/sessions/:id/messages` returns N×2 messages where N is the number of actual user turns.

### Root causes (two, both required for the visible symptom)

**A. Stale closure in `src/pages/ChatPage.tsx` — the frontend sends only the current user message (no history).**

The `chat:send` / `chat:stop` window listeners are registered ONCE on mount inside a `useEffect` with `[]` deps. They capture the first-render `doSend` closure, where `messages` is `[]`. Every subsequent `doSend` is a new function (not wrapped in `useCallback`), so the listener never picks up the fresh `messages` state. Result: `[...messages, userMessage]` evaluates to `[userMessage]`, and `POST /api/chat` ships with `messages: [userMessage]`. The dispatcher then computes `history = messages.slice(0, lastUserIdx) = []`, hands that to the Hermes adapter, which pipes it to `run_chat.py` via stdin, which passes `[]` to `agent.run_conversation(conversation_history=...)` — hence `history=0`.

Server-side log proof:
```
[chat] session_id=1781520667452_55e655d6 model=MiniMax-M3 provider=minimax adapter.slug=hermes stream=true msgs=1
```

**B. Two writers to `state.db.messages` for Hermes sessions — the message is persisted twice.**

The `hermes` executor path is `POST /api/chat` → spawn `run_chat.py` → `AIAgent.run_conversation()` → `_session_db.append_message()` (writes user **and** assistant). Historically `1230-ui.service` ran as the `pingvin1230` user and wrote to a different `state.db` (`/home/pingvin1230/.hermes/state.db`), so the Node-side `persistHermesMessage()` in `routes/chat.js:528,680` was a deliberate "safety net" for the **OpenCode** path only — but the gate was missing. After the systemd migration to root, both writers target the same `/root/.hermes/state.db`, so the same row lands twice (typically 30–60 s apart).

### Fix (v0.9.3)

Three changes; all landed; the testsuite is green (110/110) and `npm run lint` / `npm run typecheck` are clean.

1. **`src/pages/ChatPage.tsx`** — register `chat:send` / `chat:stop` listeners with the latest `doSend` / `handleStop` through refs:
   ```ts
   const doSendRef = useRef<(content: string) => void>(() => {});
   const handleStopRef = useRef<() => void>(() => {});

   useEffect(() => { doSendRef.current = doSend; handleStopRef.current = handleStop; });
   // window.addEventListener('chat:send', e => doSendRef.current(...))
   ```
   The listener is still registered once, but it now dispatches through a ref that is reassigned on every render. Classic React stale-closure fix; uses no extra deps.

2. **`routes/chat.js`** — gate the Node-side `persistHermesMessage` on `adapterSlug !== 'hermes'`. Hermes is now the **single source of truth** for messages in Hermes sessions; the OpenCode path keeps the Node-side writer (OpenCode never writes to Hermes on its own). Both the user persist (around line 528) and the assistant persist in the `finally` block (~line 680) are gated identically.

3. **`routes/chat.js` — `persistHermesMessage` helper** — replaced the racy 60-second time-window dedup with a true `(session_id, role, content)` existence check. Cheap (one indexed lookup) and correct across process restarts. Defence in depth for the OpenCode path and any future caller.

### One-time data cleanup

The fix prevents new duplicates, but the affected sessions (`1781523515719_878049fb`, `1781520667452_55e655d6`) already had ~10 duped user rows in `state.db`. Backed up and removed in place:

```bash
cp /root/.hermes/state.db /root/.hermes/state.db.backup_dedup_$(date +%Y%m%d_%H%M%S)
sqlite3 /root/.hermes/state.db <<'SQL'
BEGIN;
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id, role, content ORDER BY id) AS rn
  FROM messages
  WHERE session_id IN ('<sid_a>','<sid_b>')
)
DELETE FROM messages WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
UPDATE sessions SET message_count = (SELECT COUNT(*) FROM messages WHERE session_id = sessions.id)
WHERE id IN ('<sid_a>','<sid_b>');
COMMIT;
SQL
```

### Diagnostic (regression check after deploy)

```bash
# 1. Frontend now ships full history.
journalctl -u 1230-ui.service -n 50 --no-pager | grep "msgs="
# Expect: msgs matches the conversation length (not "msgs=1").

# 2. agent.log shows non-zero history on turn > 1.
grep "history=" /root/.hermes/logs/agent.log | tail -5
# Expect: history=0 only on the very first turn of a fresh session.

# 3. No new duplicate rows in state.db.
sqlite3 /root/.hermes/state.db \
  "SELECT session_id, role, COUNT(*) FROM messages
   WHERE session_id IN ('<sid_a>','<sid_b>')
   GROUP BY session_id, role;"
# Expect: each (session, role) count is a small integer (1 per real turn), not 2× N.

# 4. Service health.
curl -sS http://127.0.0.1:3001/api/health
# Expect: {"status":"ok", ...}
```

### Why this works

`doSendRef` is a `useRef` cell that is rewritten on every render. The `chat:send` listener — registered once with `[]` deps, exactly to avoid re-subscribing on every render — invokes `doSendRef.current(...)`, which always points at the latest `doSend`, which closes over the current `messages` state. The same pattern is used for `handleStop`. Combined with the writer-gate in `routes/chat.js`, every POST /api/chat now carries the full conversation and only one writer appends to `state.db.messages` per executor.
