#!/usr/local/lib/hermes-agent/venv/bin/python
"""
run_chat.py — Subprocess wrapper for 1230UI to call Hermes AIAgent directly.

Purpose
-------
This script is invoked by 1230UI's ``routes/chat.js`` once per user message
(``POST /api/chat``). It constructs a ``hermes_agent.run_agent.AIAgent`` with
the EXACT ``model`` / ``provider`` / ``base_url`` / ``api_key`` the user chose
in the UI, runs the conversation turn synchronously, and streams the result
back as NDJSON on stdout so the Node side can translate it to SSE.

Why this exists
---------------
Hermes's ``api_server`` (``gateway/platforms/api_server.py``) resolves its
model via ``_resolve_gateway_model()`` and **ignores the per-request model**
sent by 1230UI. The UI could display "MiniMax-M3" while the LLM answered as
whatever was in ``config.yaml.model.default``. This wrapper bypasses that
path by constructing an ``AIAgent`` directly with explicit kwargs. The DB
JOIN in ``db/helpers.js:getProviderFromModel`` resolves the provider slug
(``minimax``, ``opencode-go``, …) the wrapper passes to
``resolve_runtime_provider`` — that function is the same one ``api_server``
uses, but keyed on the *requested* provider, not the config default.

Relationship to 1230UI
----------------------
Caller:  ``routes/chat.js`` (see ``POST /api/chat``)
Spawn:   ``child_process.spawn(HERMES_PYTHON, ['-u', 'run_chat.py', …])``
Stdin:   JSON blob ``{message, history, provider, model, session_id}`` then EOF.
Stdout:  NDJSON, one event per line.
Lifecycle: parent kills the child with SIGTERM on browser disconnect
           (escalating to SIGKILL after 5 s). See ``routes/chat.js:516-522``.

Argv
----
``--session-id ID``  (required)
    Hermes session id; reused as ``agent.session_id`` and persisted to
    ``state.db.sessions.model`` immediately so the dashboard reflects the
    user's choice.
``--model MODEL``  (required)
    Model identifier (e.g. ``MiniMax-M3``, ``qwen3.6-plus``). Passed as
    ``AIAgent(model=...)`` and as ``target_model`` to
    ``resolve_runtime_provider``.
``--provider PROVIDER``
    Optional. Hermes provider slug (``minimax``, ``opencode-go``, …).
    Resolved automatically from the model via the ``models`` + ``providers``
    DB tables on the Node side, so this is only needed when running
    ``run_chat.py`` standalone.
``--message TEXT``
    The user's current message. If omitted, read from stdin JSON.
``--history JSON``
    Optional prior conversation in OpenAI message format
    (``[{"role": "user", "content": "..."}, ...]``).
``--max-iterations N``  (default 10)
    Cap on tool-calling iterations per turn. Keep low for chat UIs.
``--platform TAG``  (default ``1230ui``)
    Stored on the session; identifies the client platform.
``--no-tools``
    Disable every toolset — pure chat completion. Recommended for 1230UI
    chat. Belt-and-suspenders: also sets ``disabled_toolsets=['_all']``.

Stdin JSON schema
-----------------
If ``--message`` and ``--history`` are not on argv, the wrapper reads a
single JSON object from stdin and uses its fields. ``argv`` wins on
conflict.

.. code-block:: json

    {
      "session_id": "sess_1718096400000",
      "model": "MiniMax-M3",
      "provider": "minimax",
      "message": "Hello, who are you?",
      "history": [
        {"role": "user", "content": "Previous question"},
        {"role": "assistant", "content": "Previous answer"}
      ]
    }

Output (NDJSON, one event per line on stdout)
--------------------------------------------
``{"event": "delta", "text": "..."}``
    Token-level text chunk from the assistant. Many of these per turn.
``{"event": "reasoning", "text": "..."}``
    Reasoning content (when the model exposes it). Independent channel.
``{"event": "tool_start", "id": "call_xxx", "name": "web_search", "args": {...}}``
    A tool is being called. ``args`` is normalized to an object even if
    the LLM produced a malformed string.
``{"event": "tool_complete", "id": "call_xxx", "name": "web_search", "result": {...}}``
    The tool returned. ``result`` is JSON-parsed in the wrapper so the UI
    gets a structured object (falling back to ``{"_raw": "..."}`` on parse
    failure).
``{"event": "done", "final_response": "...", "usage": {...}, "session_id": "...", "model": "...", "provider": "...", "message_count": N}``
    Terminal event. Emitted exactly once per successful run. ``usage`` is
    ``{input: N, output: M}``; ``final_response`` is the assistant's
    authoritative final text.
``{"event": "error", "message": "...", "exception_type": "...", "traceback": "..."}``
    Terminal error. Emitted on stderr (not stdout). ``traceback`` is the
    last 4 KB of the formatted exception.

Exit codes
----------
``0`` — success (``done`` event was emitted).
``1`` — any failure: argument error, import error, provider resolution
       failure, ``AIAgent`` construction failure, ``run_conversation``
       exception, JSON parse failure on ``--history`` or stdin.

Buffering
---------
``sys.stdout.reconfigure(line_buffering=True)`` and ``sys.stderr.reconfigure(
line_buffering=True)`` are called at import time so each ``_emit()`` reaches
the parent process's pipe immediately. The Node side also passes ``-u`` and
sets ``PYTHONUNBUFFERED=1`` + ``PYTHONIOENCODING=utf-8`` in the child env
(``routes/chat.js:453-470``). All three layers are belt-and-suspenders —
without them, a child whose stdout is a pipe can buffer up to 8 KB of
output until the process exits, which makes the browser see a long silence
followed by a burst of events at the end of the run.

Example invocations
-------------------
Direct (debug):

.. code-block:: bash

    /usr/local/lib/hermes-agent/venv/bin/python run_chat.py \\
        --session-id sess_debug_001 \\
        --model MiniMax-M3 \\
        --provider minimax \\
        --message "In one sentence, what is Hermes Agent?"

Via stdin (matches what ``routes/chat.js`` sends):

.. code-block:: bash

    echo '{"session_id":"sess_debug_001","model":"MiniMax-M3","provider":"minimax","message":"Hello"}' \\
        | /usr/local/lib/hermes-agent/venv/bin/python -u run_chat.py --session-id sess_debug_001 --model MiniMax-M3

Disable tools for a pure chat-completion test:

.. code-block:: bash

    /usr/local/lib/hermes-agent/venv/bin/python run_chat.py \\
        --session-id sess_chat_001 \\
        --model MiniMax-M3 \\
        --no-tools \\
        --message "Hi"

See also
--------
- ``routes/chat.js`` — Node-side caller (search for ``RUN_CHAT_SCRIPT``).
- ``db/helpers.js`` — provider resolution from the model name.
- ``docs/ARCHITECTURE.md`` — full two-process design.
- ``TROUBLESHOOTING.md`` — diagnostic recipes for the bugs this wrapper
  was created to fix.
"""

import argparse
import json
import os
import sys
import traceback

# Force line-buffered stdout/stderr so each ``_emit()`` reaches the parent
# process's pipe immediately. ``PYTHONUNBUFFERED=1`` and ``python -u`` also
# work, but reconfiguring in-process is the most robust option: it works
# regardless of how the script is launched, and the parent never has to
# know about Python's buffering semantics. Without this, a child whose
# stdout is a pipe (non-TTY) can sit on up to 8 KB of buffered output
# until the buffer fills or the process exits, which makes the browser
# see a long silence followed by a burst of events at the end.
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except (AttributeError, OSError):
    # reconfigure() requires Python 3.7+; on older interpreters fall back
    # to reopening the file descriptor in line-buffered mode.
    try:
        sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
        sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)
    except Exception:
        pass


def _emit(event: str, **payload) -> None:
    """Write one NDJSON event line to stdout, flushed immediately."""
    payload.setdefault("event", event)
    try:
        sys.stdout.write(json.dumps(payload, default=str) + "\n")
        sys.stdout.flush()
    except Exception as exc:  # noqa: BLE001
        # If we can't even write JSON (broken pipe etc), give up silently —
        # the parent process is gone.
        sys.stderr.write(f"[run_chat] stdout write failed: {exc}\n")
        sys.stderr.flush()


def _emit_error(message: str, exc: BaseException | None = None) -> None:
    """Write an error event to stderr as NDJSON; parent reads it from there."""
    payload = {"event": "error", "message": str(message)}
    if exc is not None:
        payload["exception_type"] = type(exc).__name__
        payload["traceback"] = "".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__)
        )[-4000:]
    try:
        sys.stderr.write(json.dumps(payload, default=str) + "\n")
        sys.stderr.flush()
    except Exception:  # noqa: BLE001
        pass


def _read_payload_from_stdin() -> dict:
    """Read JSON payload from stdin if --message wasn't given on argv.

    Node.js can pipe a single JSON blob containing {model, provider, message,
    history, session_id} instead of using long argv. We accept it for ergonomics
    but argv takes precedence when both are present.
    """
    try:
        if sys.stdin.isatty():
            return {}
        raw = sys.stdin.read()
        if not raw.strip():
            return {}
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON on stdin: {exc}")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="run_chat.py",
        description="Spawn an AIAgent with explicit model/provider and stream NDJSON.",
    )
    p.add_argument("--session-id", required=True, help="Hermes session id (e.g. test_session_001)")
    p.add_argument("--model", required=True, help="Model name (e.g. MiniMax-M3, qwen3.6-plus)")
    p.add_argument("--provider", default=None,
                   help="Provider key (e.g. minimax, opencode-go). If omitted, resolved from model name.")
    p.add_argument("--message", default=None, help="User message. If omitted, read from stdin JSON.")
    p.add_argument("--history", default=None, help="Optional JSON array of prior OpenAI-format messages.")
    p.add_argument("--max-iterations", type=int, default=10,
                   help="Max tool-calling iterations (default 10; keep low for chat UIs).")
    p.add_argument("--platform", default="1230ui", help="Platform tag stored on the session (default 1230ui).")
    p.add_argument("--no-tools", action="store_true",
                   help="Disable all toolsets — pure chat completion. Recommended for 1230UI chat.")
    return p.parse_args()


def main() -> int:
    args = _parse_args()

    # Allow Node to pass everything via stdin if it prefers.
    stdin_payload = _read_payload_from_stdin()
    message = args.message or stdin_payload.get("message") or ""
    history_raw = args.history or stdin_payload.get("history")
    provider = args.provider or stdin_payload.get("provider")
    model = args.model or stdin_payload.get("model") or ""
    session_id = args.session_id or stdin_payload.get("session_id") or ""

    if not session_id:
        _emit_error("--session-id is required")
        return 1
    if not model:
        _emit_error("--model is required")
        return 1
    if not message:
        _emit_error("--message is required (or pass it via stdin JSON)")
        return 1

    # The Hermes venv python is sys.executable; we are running inside it.
    # The hermes-agent source tree is on sys.path via the venv — we just import.
    try:
        from run_agent import AIAgent  # noqa: WPS433 (intentional import)
        from hermes_cli.runtime_provider import resolve_runtime_provider
        from hermes_state import SessionDB
    except Exception as exc:  # noqa: BLE001
        _emit_error(
            f"Failed to import Hermes modules from {sys.executable}: {exc}. "
            "Make sure you launched this script with /usr/local/lib/hermes-agent/venv/bin/python.",
            exc,
        )
        return 1

    # --- 1. Resolve runtime credentials (api_key, base_url, api_mode) for the
    # provider the user picked. We pass target_model=model so api_mode is
    # derived from the model the user is switching TO (matches the gateway's
    # _resolve_runtime_agent_kwargs contract). ---
    try:
        runtime = resolve_runtime_provider(requested=provider, target_model=model)
    except Exception as exc:  # noqa: BLE001
        _emit_error(f"resolve_runtime_provider failed for provider={provider!r}: {exc}", exc)
        return 1

    if not runtime or not runtime.get("api_key"):
        _emit_error(
            f"No api_key resolved for provider={provider!r} model={model!r}. "
            f"runtime={runtime}",
        )
        return 1

    api_key = runtime.get("api_key")
    base_url = (runtime.get("base_url") or "").rstrip("/")
    resolved_provider = runtime.get("provider") or provider
    api_mode = runtime.get("api_mode")

    # --- 2. Build the agent with EXPLICIT model/provider/base_url/api_key so
    # it bypasses the config.yaml ``model.default`` lookup entirely. ---
    try:
        session_db = SessionDB()  # default: ~/.hermes/state.db
    except Exception as exc:  # noqa: BLE001
        _emit_error(f"Failed to open SessionDB: {exc}", exc)
        return 1

    # Persist the chosen model to the dashboard's session row immediately so
    # /v1/sessions and similar endpoints reflect the user's choice. SessionDB
    # does not expose update_session_model(), so write directly via SQL.
    try:
        def _persist_model(conn):
            conn.execute(
                "UPDATE sessions SET model = ? WHERE id = ?",
                (model, session_id),
            )
        session_db._execute_write(_persist_model)
    except Exception as exc:  # noqa: BLE001
        # Non-fatal — just log; the chat will still work.
        sys.stderr.write(f"[run_chat] session model persist failed: {exc}\n")
        sys.stderr.flush()

    def _on_delta(text: str) -> None:
        if text:
            _emit("delta", text=text)

    def _on_reasoning(text: str) -> None:
        if text:
            _emit("reasoning", text=text)

    def _on_tool_start(tool_call_id: str, name: str, tool_args) -> None:
        # tool_args may be a dict, str (malformed JSON), or None — normalize.
        if isinstance(tool_args, str):
            try:
                tool_args = json.loads(tool_args)
            except Exception:  # noqa: BLE001
                tool_args = {"_raw": tool_args}
        _emit("tool_start", id=tool_call_id, name=name, args=tool_args or {})

    def _on_tool_complete(tool_call_id: str, name: str, tool_args, result: str) -> None:
        # Result is typically a JSON string. Parse so the UI gets a structured object.
        try:
            result_obj = json.loads(result) if isinstance(result, str) else result
        except Exception:  # noqa: BLE001
            result_obj = {"_raw": result}
        _emit("tool_complete", id=tool_call_id, name=name, result=result_obj)

    # Build kwargs incrementally — only set toolsets when caller didn't say --no-tools.
    agent_kwargs = dict(
        model=model,
        provider=resolved_provider,
        base_url=base_url,
        api_key=api_key,
        api_mode=api_mode,
        session_id=session_id,
        platform=args.platform,
        quiet_mode=True,
        verbose_logging=False,
        save_trajectories=False,
        skip_context_files=True,  # 1230UI is a chat surface, not a project workspace
        skip_memory=True,         # memory is managed by Node side / dashboard, not us
        load_soul_identity=False,
        max_iterations=int(args.max_iterations),
        stream_delta_callback=_on_delta,
        reasoning_callback=_on_reasoning,
        tool_start_callback=_on_tool_start,
        tool_complete_callback=_on_tool_complete,
        session_db=session_db,
        # Tell the agent NOT to pass HERMES_SESSION_ID to the model prompt —
        # this is purely a backend storage id for us.
        pass_session_id=False,
    )
    if args.no_tools:
        agent_kwargs["enabled_toolsets"] = []
        agent_kwargs["disabled_toolsets"] = ["_all"]  # belt-and-suspenders; empty list also works

    try:
        agent = AIAgent(**agent_kwargs)
    except TypeError as exc:
        # Surface the exact missing/extra kwarg so 1230UI can patch the call site.
        _emit_error(
            f"AIAgent.__init__ rejected kwargs (likely an API surface mismatch): {exc}. "
            f"kwargs_keys={sorted(agent_kwargs.keys())}",
            exc,
        )
        return 1
    except Exception as exc:  # noqa: BLE001
        _emit_error(f"AIAgent() construction failed: {exc}", exc)
        return 1

    # --- 3. Parse history (OpenAI message format). ---
    history = None
    if history_raw:
        try:
            history = json.loads(history_raw) if isinstance(history_raw, str) else history_raw
            if not isinstance(history, list):
                raise ValueError("history must be a JSON array of message objects")
        except Exception as exc:  # noqa: BLE001
            _emit_error(f"Invalid --history JSON: {exc}", exc)
            return 1

    # --- 4. Run the conversation (synchronous, blocking). ---
    try:
        result = agent.run_conversation(
            user_message=message,
            conversation_history=history,
            task_id=session_id,
        )
    except KeyboardInterrupt:
        _emit_error("Interrupted by signal")
        return 1
    except Exception as exc:  # noqa: BLE001
        _emit_error(f"run_conversation failed: {exc}", exc)
        return 1

    if not isinstance(result, dict):
        result = {"final_response": str(result)}

    final_response = result.get("final_response") or ""
    messages = result.get("messages") or []

    # The agent doesn't always surface usage as a top-level field — pull from
    # the last assistant message or from session-completion counters when present.
    usage = result.get("usage") or {}
    if not usage:
        # Last-resort scrape: AIAgent tracks session-level counters.
        try:
            usage = {
                "input": int(getattr(agent, "session_input_tokens", 0) or 0),
                "output": int(getattr(agent, "session_output_tokens", 0) or 0),
            }
        except Exception:  # noqa: BLE001
            usage = {"input": 0, "output": 0}

    _emit(
        "done",
        final_response=final_response,
        usage=usage,
        session_id=session_id,
        model=model,
        provider=resolved_provider,
        message_count=len(messages) if isinstance(messages, list) else 0,
    )
    return 0


if __name__ == "__main__":
    try:
        rc = main()
    except SystemExit as exc:
        # argparse calls SystemExit on --help / bad args; surface it as a proper error event.
        code = int(exc.code) if isinstance(exc.code, int) else 1
        if code != 0:
            _emit_error(str(exc) or "Argument parsing failed")
        sys.exit(code)
    except BaseException as exc:  # noqa: BLE001
        _emit_error(f"Unhandled exception in run_chat: {exc}", exc)
        sys.exit(1)
    else:
        sys.exit(rc)
