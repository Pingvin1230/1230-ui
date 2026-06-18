/**
 * routes/chat.js
 *
 * Endpoints:
 *   POST /api/chat  — Proxy to Hermes API with SSE streaming + tool-call events
 *
 * Task #24: after the SSE stream from Hermes ends, the buffered assistant
 * response text is scanned for backtick-wrapped absolute paths. Each path
 * that actually exists on disk is recorded in `session_files` (with
 * `source = 'agent'`) and surfaced to the frontend via an `agent_files`
 * SSE event so a download card can be rendered inside the message.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { createClient } from 'webdav';
import { decrypt } from '../lib/cloud/crypto.js';
import { chatLimiter } from '../middleware/security.js';
import { getProviderFromModel } from '../db/helpers.js';
import { getMimeTypeForPath, hasAllowedExtension } from '../db/fileTypes.js';
import { uiDb, hermesDbWrite } from '../db/connections.js';
import config from '../config.js';
import { ADAPTERS } from '../lib/adapters/index.js';

const router = Router();

// ── Message persistence helper ────────────────────────────────────────────
//
// Writes to Hermes state.db so GET /api/sessions/:id/messages returns the
// full conversation after a page reload. Two callers invoke this helper:
//   1. routes/chat.js (the dispatcher), for the OpenCode executor only
//      (the Hermes executor writes via run_chat.py → SessionDB).
//   2. (legacy) routes/chat.js used to call this for the Hermes executor
//      too — that path was the source of the "duplicate user messages"
//      bug. Hermes is now the source of truth for Hermes sessions.
//
// Dedup: skip the INSERT if a row with the same (session_id, role,
// content) already exists. This is a defence-in-depth net for the
// OpenCode path (where Hermes does not write at all) and a safety net
// for any future caller. It replaces the previous 60-second time-window
// dedup, which was racy across process restarts.
//
// Failures are non-fatal (logged, never thrown) so a DB write error never
// breaks the live SSE stream the user is already reading.
function persistHermesMessage(sessionId, role, content, opts = {}) {
  if (!hermesDbWrite) {
    console.warn(`[chat] persistHermesMessage: hermesDbWrite unavailable, dropping message for session=${sessionId}`);
    return;
  }
  if (!sessionId || !role) return;
  try {
    // Defence-in-depth: skip if a row with the same (session, role, content)
    // is already in the DB. Replaces the previous 60s window dedup, which
    // was racy across process restarts and would let an immediate retry
    // through.
    const existing = hermesDbWrite
      .prepare(
        `SELECT id FROM messages
         WHERE session_id = ? AND role = ? AND content IS ?`
      )
      .get(sessionId, role, content ?? null);
    if (existing) {
      return existing.id;
    }

    const insert = hermesDbWrite.prepare(`
      INSERT INTO messages
        (session_id, role, content, tool_name, tool_call_id, tool_calls, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const timestamp = opts.timestamp ?? Date.now() / 1000;
    const info = insert.run(
      sessionId,
      role,
      content ?? null,
      opts.toolName ?? null,
      opts.toolCallId ?? null,
      opts.toolCalls ? JSON.stringify(opts.toolCalls) : null,
      timestamp,
    );
    // Bump message_count on the session row so /api/sessions reflects reality.
    hermesDbWrite.prepare(
      'UPDATE sessions SET message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?) WHERE id = ?'
    ).run(sessionId, sessionId);
    return info.lastInsertRowid;
  } catch (err) {
    console.error(`[chat] persistHermesMessage failed (session=${sessionId} role=${role}): ${err.message}`);
  }
}

// Backtick-wrapped absolute path, used to detect files the agent created.
const PATH_PATTERN = /`(\/[^\s`]{1,500})`/g;

// Fallback: any absolute path that "looks like" a file (has a known extension
// from the whitelist) and is not wrapped in backticks. Hermes does not always
// wrap paths in backticks; sometimes it just writes "создан: /root/weather.md".
// Without this fallback, those messages get no download card.
const BARE_PATH_PATTERN = /(\/[A-Za-z0-9_./-]{2,500})/g;

// Matches cloud proxy URLs: /api/cloud/<id>/<token>/<path>?exp=<ts>
const CLOUD_URL_PATTERN = /\/api\/cloud\/(\d+)\/([A-Za-z0-9_-]+)\/(\d+)\/([^\s\)]+)/g;

// Max file size for inlining (5MB)
const MAX_INLINE_SIZE = 5 * 1024 * 1024;

// Text extensions to inline as text content
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.csv', '.yml', '.yaml', '.js', '.ts', '.py', '.html', '.css', '.xml', '.sh', '.sql', '.log', '.toml', '.ini', '.conf']);

// Image extensions to inline as data URL
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']);

async function expandCloudLinks(messages) {
  const cloudClients = new Map();

  for (const msg of messages) {
    if (msg.role !== 'user' || typeof msg.content !== 'string') continue;

    const links = [...msg.content.matchAll(CLOUD_URL_PATTERN)];
    if (links.length === 0) continue;

    const replacements = [];

    for (const link of links) {
      const [fullMatch, connId, token, expiresAt, encodedPath] = link;
      const decodedPath = decodeURIComponent(encodedPath);
      const ext = path.extname(decodedPath).toLowerCase();

      // Check if already processed
      if (replacements.some(r => r.fullMatch === fullMatch)) continue;

      try {
        // Get connection and create WebDAV client (cached per connection)
        let client = cloudClients.get(connId);
        if (!client) {
          const row = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(connId);
          if (!row) continue;
          const password = decrypt({ ct: row.credentials_ct, iv: row.credentials_iv, tag: row.credentials_tag });
          client = createClient(row.url, {
            username: row.username,
            password,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          });
          cloudClients.set(connId, client);
        }

        // Stat the file
        const stat = await client.stat(decodedPath, { details: false });
        const size = stat.size || 0;

        if (size > MAX_INLINE_SIZE) {
          replacements.push({ fullMatch, replacement: `[File too large to inline: ${path.basename(decodedPath)} (${(size / 1024 / 1024).toFixed(1)} MB)]` });
          continue;
        }

        // Download file
        const stream = await client.createReadStream(decodedPath);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        if (IMAGE_EXTENSIONS.has(ext)) {
          const mimeType = stat.mime || getMimeTypeForPath(decodedPath) || 'application/octet-stream';
          const base64 = buffer.toString('base64');
          replacements.push({
            fullMatch,
            type: 'image',
            mimeType,
            base64,
            filename: path.basename(decodedPath),
          });
        } else if (TEXT_EXTENSIONS.has(ext)) {
          const text = buffer.toString('utf8');
          replacements.push({
            fullMatch,
            type: 'text',
            text: `--- ${path.basename(decodedPath)} ---\n${text}`,
          });
        } else {
          // Other binary: inline as base64 data URL if small enough
          if (size <= 1024 * 1024) {
            const mimeType = stat.mime || getMimeTypeForPath(decodedPath) || 'application/octet-stream';
            const base64 = buffer.toString('base64');
            replacements.push({
              fullMatch,
              type: 'text',
              text: `[Binary file: ${path.basename(decodedPath)} (${mimeType}, ${size} bytes) — data URL available if needed]`,
            });
          } else {
            replacements.push({ fullMatch, replacement: `[Binary file too large: ${path.basename(decodedPath)}]` });
          }
        }
      } catch (err) {
        console.error('Failed to expand cloud link:', decodedPath, err.message);
        replacements.push({ fullMatch, replacement: `[Failed to load cloud file: ${path.basename(decodedPath)}]` });
      }
    }

    // Apply replacements — convert message to content array if there are images
    const hasImages = replacements.some(r => r.type === 'image');

    if (hasImages) {
      const contentParts = [];
      let remainingText = msg.content;

      // Sort replacements by position in original text
      const sorted = replacements.map(r => {
        const idx = remainingText.indexOf(r.fullMatch);
        return { ...r, index: idx };
      }).sort((a, b) => a.index - b.index);

      // Build content array
      let lastEnd = 0;
      for (const r of sorted) {
        if (r.index < 0) continue;
        // Add text before this match
        if (r.index > lastEnd) {
          const textBefore = remainingText.slice(lastEnd, r.index);
          if (textBefore.trim()) {
            contentParts.push({ type: 'text', text: textBefore });
          }
        }

        if (r.type === 'image') {
          contentParts.push({
            type: 'image_url',
            image_url: { url: `data:${r.mimeType};base64,${r.base64}` },
          });
        } else {
          contentParts.push({ type: 'text', text: r.replacement || r.text });
        }

        lastEnd = r.index + r.fullMatch.length;
      }

      // Add remaining text
      if (lastEnd < remainingText.length) {
        const remaining = remainingText.slice(lastEnd);
        if (remaining.trim()) {
          contentParts.push({ type: 'text', text: remaining });
        }
      }

      msg.content = contentParts;
    } else {
      // Simple text replacement
      let newContent = msg.content;
      for (const r of replacements) {
        newContent = newContent.replace(r.fullMatch, r.replacement || r.text);
      }
      msg.content = newContent;
    }
  }
}

// Shared MIME/extension helpers are imported from db/fileTypes.js.

function detectAgentFiles(sessionId, responseText) {
  if (!sessionId || !responseText) return [];
  const seen = new Set();
  const candidates = [];

  // 1) Preferred: backtick-wrapped paths. High signal — these are paths
  //    the agent explicitly meant to point at.
  for (const match of responseText.matchAll(PATH_PATTERN)) {
    const candidate = match[1];
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }
  // 2) Fallback: bare absolute paths with a whitelisted extension. Hermes
  //    sometimes writes paths without backticks; without this fallback the
  //    user gets no card at all (Task #24 follow-up: real-world Hermes does
  //    not always follow the backtick convention described in the brief).
  const bareCandidates = [];
  for (const match of responseText.matchAll(BARE_PATH_PATTERN)) {
    const candidate = match[1];
    if (seen.has(candidate)) continue;
    // Trim trailing punctuation that often clings to inline paths in prose
    // (e.g. "file at /tmp/x.md." or "/tmp/x.md,"). The trim is conservative:
    // only single trailing punctuation chars that don't appear in real paths.
    const trimmed = candidate.replace(/[.,;:!?)]+$/, '');
    if (trimmed !== candidate) {
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
    }
    if (!hasAllowedExtension(trimmed)) continue;
    bareCandidates.push(trimmed);
    seen.add(trimmed);
    candidates.push(trimmed);
  }
  const detected = [];
  for (const candidate of candidates) {
    let stat;
    try {
      stat = fs.statSync(candidate);
    } catch (_) {
      continue;
    }
    if (!stat.isFile()) continue;

    // Dedupe: if a row with this session+path already exists, reuse it so the
    // frontend still gets a download card (the agent may reference the same
    // file in multiple messages — each mention should show the button).
    const existing = uiDb
      .prepare("SELECT * FROM session_files WHERE session_id = ? AND stored_name = ? AND source = 'agent'")
      .get(sessionId, candidate);
    if (existing) {
      detected.push({
        id: existing.id,
        filename: existing.filename,
        size: existing.size,
        mimeType: existing.mime_type,
      });
      continue;
    }

    const filename = path.basename(candidate);
    const mimeType = getMimeTypeForPath(candidate);
    const size = stat.size;
    const uploadedAt = Date.now();

    let row;
    try {
      const result = uiDb
        .prepare(
          `INSERT INTO session_files (session_id, filename, stored_name, mime_type, size, uploaded_at, source)
           VALUES (?, ?, ?, ?, ?, ?, 'agent')`
        )
        .run(sessionId, filename, candidate, mimeType, size, uploadedAt);
      row = uiDb
        .prepare('SELECT * FROM session_files WHERE id = ?')
        .get(result.lastInsertRowid);
    } catch (err) {
      console.error('Failed to persist agent file row:', err.message);
      continue;
    }

    detected.push({
      id: row.id,
      filename: row.filename,
      size: row.size,
      mimeType: row.mime_type,
    });
  }
  return detected;
}

// ── POST /api/chat ─────────────────────────────────────────────────────────
//
// Dispatches to the adapter registered for the session's executor slug.
// Adapters are pure event generators (lib/adapters/). All SSE plumbing
// (headers, watchdog, INFLIGHT, req.on('close'), persistHermesMessage,
// detectAgentFiles) lives here so the adapters stay portable and testable.
//
// Wire protocol (SSE to browser):
//   data: {"type":"status","status":"thinking|generating"}\n\n
//   data: {"type":"delta","text":"..."}\n\n
//   data: {"type":"tool_call_start","id":..,"toolName":..,"label":..}\n\n
//   data: {"type":"tool_call_end","id":..}\n\n
//   data: {"type":"reasoning","text":"..."}\n\n
//   data: {"type":"done","final_response":..,"usage":..,"model":..,"provider":..}\n\n
//   data: [DONE]\n\n

// In-flight request dedup: when the same (session_id, last_user_message)
// arrives while a previous request for that pair is still running, we
// short-circuit to a 409. This prevents the auto-retry storm where a
// single user message would spawn N parallel Python subprocesses and
// create N duplicate turns in agent.log + N duplicate messages in the UI.
// The frontend should never retry automatically on 409; the manual Retry
// button will create a fresh request that goes through normally.
const INFLIGHT = new Map(); // key: `${session_id}:${lastUserHash}` -> { startedAt, res }
const INFLIGHT_TTL_MS = 30_000; // 30s window — auto-retry storms finish in <5s

function inflightKey(sessionId, lastUserMessage) {
  if (!sessionId) return null;
  // hash the message text so we don't keep the full text in memory
  let h = 0;
  const s = (lastUserMessage || '').slice(0, 512);
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `${sessionId}:${h}`;
}

function pruneInflight() {
  const cutoff = Date.now() - INFLIGHT_TTL_MS;
  for (const [k, v] of INFLIGHT.entries()) {
    if (v.startedAt < cutoff) INFLIGHT.delete(k);
  }
}

router.post('/', chatLimiter, async (req, res) => {
  const { messages, session_id, model, stream = true } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        type: 'invalid_request',
        message: 'Invalid request format',
        details: 'messages array is required',
        retryable: false,
      },
    });
  }
  if (!model) {
    return res.status(400).json({
      error: {
        type: 'invalid_request',
        message: 'Invalid request format',
        details: 'model is required',
        retryable: false,
      },
    });
  }

  // Compute the dedup key before resolving provider/model so we can short-
  // circuit the common "frontend auto-retry fired 3 times for the same
  // message" case. We dedupe on the last user message text — for the new-
  // session case where session_id is null, we still catch duplicates within
  // the same burst because the last user message text is the same.
  const lastUserIdxForDedup = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return i;
    }
    return -1;
  })();
  const lastUserTextForDedup = lastUserIdxForDedup >= 0
    ? (typeof messages[lastUserIdxForDedup].content === 'string'
        ? messages[lastUserIdxForDedup].content
        : JSON.stringify(messages[lastUserIdxForDedup].content))
    : '';
  // Use session_id (or 'new' for fresh sessions) so the dedup window works
  // both for existing-session retries AND for the new-session case where
  // the user pressed send and the frontend fired 3 quick retries before
  // the session was created on the backend.
  const dedupKey = inflightKey(session_id || 'new', lastUserTextForDedup);
  if (dedupKey) {
    pruneInflight();
    if (INFLIGHT.has(dedupKey)) {
      // Same (session, message) is already running. Return 409 so the
      // frontend stops retrying. This is the safety net for cases where
      // a network blip caused the frontend to fire 3 retries in <1s —
      // only the first one actually runs the LLM.
      console.log(`[chat] dedupe: dropping duplicate request for ${dedupKey} (in-flight since ${Date.now() - INFLIGHT.get(dedupKey).startedAt}ms ago)`);
      return res.status(409).json({
        error: {
          type: 'duplicate_request',
          message: 'A request for this message is already in progress',
          details: 'The previous request is still streaming — please wait for it to complete or click Retry after it finishes.',
          retryable: false,
          code: 'DUPLICATE_INFLIGHT',
        },
      });
    }
  }

  // Resolve provider from the model. The wrapper needs both because
  // resolve_runtime_provider() keys its credential lookup on the provider
  // slug ("minimax", "opencode-go"), not on the model id.
  const provider = getProviderFromModel(model);

  // Resolve the adapter (Variant B). The adapter is locked for the
  // session's lifetime via session_meta.assistant_id → assistants.executor.
  // The free-chat path (no session_id) and sessions whose assistant has the
  // default 'hermes' value both stay on the Hermes path.
  //
  // Adapter table: maps executor slug → adapter slug. Today this is a
  // 2-element map; future executors (Claude direct, etc.) just append.
  let adapterSlug = 'hermes';
  if (session_id) {
    const row = uiDb.prepare(`
      SELECT a.executor AS executor
      FROM session_meta sm
      LEFT JOIN assistants a ON a.id = sm.assistant_id
      WHERE sm.session_id = ?
    `).get(session_id);
    if (row && row.executor) adapterSlug = row.executor;
  }
  if (adapterSlug !== 'hermes' && adapterSlug !== 'opencode-1230') {
    adapterSlug = 'hermes';
  }

  // Log the resolved model/provider so misroutes are easy to spot in the
  // 1230UI log. Without this, "wrong model answered" issues are silent and
  // very hard to debug (the wrapper log only shows what was passed in argv).
  console.log(`[chat] session_id=${session_id || '(new)'} model=${model} provider=${provider} adapter.slug=${adapterSlug} stream=${stream} msgs=${messages.length}`);

  // Expand cloud links before serialising to stdin (so the Python side
  // gets a fully self-contained message array).
  try {
    await expandCloudLinks(messages);
  } catch (expandErr) {
    console.error('expandCloudLinks failed:', expandErr.message);
  }

  // Pull the last user message out as the "current" message; everything
  // before it is conversation history. The wrapper accepts both via stdin.
  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return i;
    }
    return -1;
  })();
  const currentMessage = lastUserIdx >= 0
    ? (typeof messages[lastUserIdx].content === 'string'
        ? messages[lastUserIdx].content
        : JSON.stringify(messages[lastUserIdx].content))
    : '';
  const history = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : [];

  if (!currentMessage) {
    return res.status(400).json({
      error: {
        type: 'invalid_request',
        message: 'No user message found in messages array',
        retryable: false,
      },
    });
  }

  // ── Dispatch to adapter ────────────────────────────────────────────────
  // ADAPTERS is a registry from lib/adapters/index.js. Fall back to 'hermes'
  // if the slug is unrecognised (same guard as before).
  const adapter = ADAPTERS[adapterSlug] ?? ADAPTERS['hermes'];

  // Register in-flight before any async work so a concurrent duplicate
  // request arriving during adapter startup is correctly rejected.
  if (dedupKey) INFLIGHT.set(dedupKey, { startedAt: Date.now(), res });

  // ── Persist the user message ─────────────────────────────────────────
  // For the Hermes path the AIAgent inside run_chat.py writes the user
  // message to state.db.messages via SessionDB.append_message — Node MUST
  // NOT also write it, or the same row appears twice in the UI (see
  // TROUBLESHOOTING §Duplicate user messages after migrating 1230-ui to
  // /root/.hermes/state.db). For the OpenCode path Hermes is not invoked
  // at all, so Node writes the row itself; this is the safety net from
  // the "messages wiped" fix (TROUBLESHOOTING §8).
  let persistedUserId = null;
  if (session_id && currentMessage && adapterSlug !== 'hermes') {
    const recent = hermesDbWrite?.prepare(
      `SELECT id FROM messages
       WHERE session_id = ? AND role = 'user' AND content = ?
       AND timestamp > ?
       ORDER BY id DESC LIMIT 1`
    ).get(session_id, currentMessage, Date.now() / 1000 - 60);
    if (!recent) {
      persistedUserId = persistHermesMessage(session_id, 'user', currentMessage);
    }
  }

  // ── SSE headers ───────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const writeSse = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  // ── Watchdog timers ───────────────────────────────────────────────────
  const FIRST_OUTPUT_TIMEOUT_MS = 90_000;
  const HARD_TIMEOUT_MS = 10 * 60 * 1000;

  let firstOutputTimer = setTimeout(() => {
    if (res.writableEnded) return;
    console.error(`[chat] no-output watchdog: ${FIRST_OUTPUT_TIMEOUT_MS / 1000}s elapsed (session=${session_id || '(new)'} adapter=${adapterSlug})`);
    writeSse({
      error: {
        type: 'network',
        message: 'Response timeout',
        details: `No event within ${FIRST_OUTPUT_TIMEOUT_MS / 1000}s — killed.`,
        code: 'NO_OUTPUT_TIMEOUT',
        retryable: true,
        suggestion: 'Please try again.',
      },
    });
    res.end();
  }, FIRST_OUTPUT_TIMEOUT_MS);

  const resetWatchdog = () => {
    clearTimeout(firstOutputTimer);
    firstOutputTimer = setTimeout(() => {
      if (res.writableEnded) return;
      writeSse({
        error: {
          type: 'network',
          message: 'Response timeout',
          code: 'NO_OUTPUT_TIMEOUT',
          retryable: true,
        },
      });
      res.end();
    }, FIRST_OUTPUT_TIMEOUT_MS);
  };

  const hardTimeout = setTimeout(() => {
    if (!res.writableEnded) {
      console.error(`[chat] hard timeout: ${HARD_TIMEOUT_MS / 1000}s (session=${session_id || '(new)'} adapter=${adapterSlug})`);
      res.end();
    }
  }, HARD_TIMEOUT_MS);

  const clearHardTimeout = () => clearTimeout(hardTimeout);

  // ── Client-disconnect handler ─────────────────────────────────────────
  let killedByClient = false;
  req.on('close', () => {
    killedByClient = true;
    clearHardTimeout();
    clearTimeout(firstOutputTimer);
    firstOutputTimer = null;
    // For the OpenCode adapter, also abort the daemon-side session.
    if (adapterSlug === 'opencode-1230') {
      const ocAdapter = /** @type {import('../lib/adapters/opencode.js').OpenCodeAdapter} */ (adapter);
      const ocSessionId = ocAdapter.getOpencodeSessionId(session_id);
      if (ocSessionId) ocAdapter.abortSession(ocSessionId).catch(() => {});
    }
  });

  // ── Consume adapter events ────────────────────────────────────────────
  let responseText = '';
  let sentDone = false;
  let endedWithError = false;

  try {
    const adapterCtx = {
      session_id, model, provider, messages, currentMessage, history,
      dedupKey, req, res,
    };
    for await (const evt of adapter.chat(adapterCtx)) {
      if (killedByClient) break;
      resetWatchdog();

      // Accumulate delta text for agent_files detection and rescue-done.
      if (evt.type === 'delta' && evt.text) responseText += evt.text;

      // Write the SSE event.
      writeSse(evt);

      // After 'done', also write the OpenAI-compat [DONE] sentinel.
      if (evt.type === 'done') {
        sentDone = true;
        writeSse('[DONE]');
        break;
      }
      if (evt.type === 'error') { endedWithError = true; break; }
    }
  } catch (err) {
    if (!killedByClient) {
      endedWithError = true;
      console.error(`[chat] adapter(${adapterSlug}) stream error: ${err.message}`);
      writeSse({
        type: 'error',
        message: 'Stream error',
        details: err.message,
        retryable: true,
        code: 'ADAPTER_STREAM_ERROR',
      });
    }
  } finally {
    clearHardTimeout();
    clearTimeout(firstOutputTimer);
    firstOutputTimer = null;
    if (dedupKey) INFLIGHT.delete(dedupKey);

    if (!killedByClient) {
      // Rescue path: stream ended without a 'done' event but we have content.
      if (!sentDone && responseText) {
        writeSse({
          type: 'done',
          final_response: responseText,
          usage: { input: 0, output: 0 },
          model,
          provider,
        });
        writeSse('[DONE]');
      }

      // Task #24: detect agent-created files and emit download cards.
      if (session_id && responseText) {
        try {
          const detected = detectAgentFiles(session_id, responseText);
          if (detected.length > 0) writeSse({ type: 'agent_files', files: detected });
        } catch (detectErr) {
          console.error('Agent file detection failed:', detectErr.message);
        }

        // Persist the assistant response. Hermes adapter writes it inside
        // run_chat.py via SessionDB.append_message, so for the Hermes path
        // Node must NOT also write it (would produce duplicates — see the
        // user-persist comment above). For the OpenCode path the daemon
        // does not write to Hermes, so Node is the only writer.
        if (responseText && adapterSlug !== 'hermes') {
          const dup = hermesDbWrite?.prepare(
            `SELECT id FROM messages
             WHERE session_id = ? AND role = 'assistant' AND content = ?
             AND timestamp > ?
             ORDER BY id DESC LIMIT 1`
          ).get(session_id, responseText, Date.now() / 1000 - 60);
          if (!dup) persistHermesMessage(session_id, 'assistant', responseText);
        }
      }
    }

    if (endedWithError && persistedUserId) {
      try {
        hermesDbWrite?.prepare('DELETE FROM messages WHERE id = ?').run(persistedUserId);
      } catch (e) {
        console.error('[chat] failed to clean up orphan user row:', e.message);
      }
    }

    if (!res.writableEnded) res.end();
  }
});

export default router;
