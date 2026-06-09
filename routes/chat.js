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
import { chatLimiter } from '../middleware/security.js';
import { getProviderFromModel } from '../db/helpers.js';
import { getMimeTypeForPath, hasAllowedExtension } from '../db/fileTypes.js';
import { uiDb } from '../db/connections.js';
import config from '../config.js';

const router = Router();

const HERMES_API_URL = config.hermesApiUrl;
const HERMES_API_KEY = config.hermesApiKey;

// Backtick-wrapped absolute path, used to detect files the agent created.
const PATH_PATTERN = /`(\/[^\s`]{1,500})`/g;

// Fallback: any absolute path that "looks like" a file (has a known extension
// from the whitelist) and is not wrapped in backticks. Hermes does not always
// wrap paths in backticks; sometimes it just writes "создан: /root/weather.md".
// Without this fallback, those messages get no download card.
const BARE_PATH_PATTERN = /(\/[A-Za-z0-9_./-]{2,500})/g;

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

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${HERMES_API_KEY}`,
  };
  if (session_id) headers['X-Hermes-Session-Id'] = session_id;
  if (model)      headers['X-Hermes-Model'] = model;

  try {
    const response = await fetch(`${HERMES_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'hermes-agent', messages, stream }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hermes API error:', response.status, errorText);

      let parsedError = {};
      try { parsedError = JSON.parse(errorText); } catch { parsedError = { error: { message: errorText } }; }

      const errorObj     = parsedError.error || {};
      const errorMessage = errorObj.message || 'Unknown provider error';
      const errorCode    = errorObj.code || '';

      let errorType  = 'provider_error';
      let retryable  = false;
      let suggestion = '';

      if (response.status === 429) {
        errorType  = 'rate_limit';
        retryable  = true;
        suggestion = `Rate limit exceeded (code: ${response.status} ${errorCode || 'rate_limited'}). Please try again in a few seconds.`;
      } else if (response.status === 400) {
        if (errorMessage.includes('DataInspectionFailed') || errorMessage.includes('inappropriate content')) {
          errorType  = 'content_moderation';
          retryable  = false;
          suggestion = `Request blocked by provider security filter (code: ${errorCode || response.status}). Try rephrasing or choose a different model.`;
        } else {
          errorType  = 'invalid_request';
          retryable  = false;
          suggestion = `Invalid request format (code: ${errorCode || response.status}).`;
        }
      } else if (response.status >= 500) {
        errorType  = 'server_error';
        retryable  = true;
        suggestion = `Server-side error (code: ${response.status}). Please try again.`;
      } else if (response.status === 401 || response.status === 403) {
        errorType  = 'auth_error';
        retryable  = false;
        suggestion = `Authentication error (code: ${response.status}). Check API key settings.`;
      }

      return res.status(response.status).json({
        error: {
          type: errorType,
          message: 'Provider error',
          provider: model ? getProviderFromModel(model) : 'unknown',
          model: model || 'unknown',
          details: errorMessage,
          code: errorCode,
          retryable,
          suggestion,
        },
      });
    }

    if (stream) {
      const reader  = response.body.getReader();
      const decoder = new TextDecoder();

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      res.write(`data: ${JSON.stringify({ type: 'status', status: 'thinking' })}\n\n`);

      let isFirstChunk    = true;
      const activeToolCalls = new Map();
      let currentEventType  = null;
      let responseText      = ''; // Task #24: accumulate for file detection

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          if (isFirstChunk) {
            res.write(`data: ${JSON.stringify({ type: 'status', status: 'generating' })}\n\n`);
            isFirstChunk = false;
          }

          // Parse SSE lines to extract tool-call events and accumulate text
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              if (currentEventType === 'hermes.tool.progress') {
                try {
                  const toolEvent  = JSON.parse(line.slice(6).trim());
                  const toolCallId = toolEvent.toolCallId;
                  const toolName   = toolEvent.tool;
                  const status     = toolEvent.status;

                  if (status === 'running') {
                    activeToolCalls.set(toolCallId, { id: toolCallId, toolName, label: toolEvent.label || '' });
                    res.write(`data: ${JSON.stringify({
                      type: 'tool_call_start',
                      id: toolCallId,
                      toolName,
                      label: toolEvent.label,
                    })}\n\n`);
                  } else if (status === 'completed') {
                    res.write(`data: ${JSON.stringify({ type: 'tool_call_end', id: toolCallId })}\n\n`);
                    activeToolCalls.delete(toolCallId);
                  }
                } catch (_) { /* ignore parse errors */ }
                currentEventType = null;
                continue;
              }
              // Task #24: capture assistant text for path detection
              try {
                const payload = line.slice(6).trim();
                if (payload && payload !== '[DONE]') {
                  const parsed = JSON.parse(payload);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) responseText += delta;
                }
              } catch (_) { /* ignore */ }
              currentEventType = null;
            }
          }

          // Always proxy the original chunk
          res.write(chunk);
        }
      } catch (streamError) {
        console.error('Stream error:', streamError);
        const cause          = streamError.cause || streamError;
        const isNetworkError = cause.code === 'ECONNREFUSED' || cause.code === 'ENOTFOUND' || streamError.name === 'FetchError';

        res.write(`data: ${JSON.stringify({
          error: {
            type: isNetworkError ? 'network' : 'server_error',
            message: isNetworkError ? 'Hermes API unavailable' : 'Connection interrupted',
            details: streamError.message || cause.message || 'Unknown error',
            retryable: true,
            suggestion: isNetworkError
              ? 'Hermes API Server is restarting. Please try again in a few seconds.'
              : 'Please try again.',
          },
        })}\n\n`);
      } finally {
        // Task #24: detect files the agent wrote, record metadata, and emit
        // an `agent_files` event so the frontend can render download cards.
        if (session_id && responseText) {
          try {
            const detected = detectAgentFiles(session_id, responseText);
            if (detected.length > 0) {
              res.write(`data: ${JSON.stringify({
                type: 'agent_files',
                files: detected,
              })}\n\n`);
            }
          } catch (detectErr) {
            console.error('Agent file detection failed:', detectErr.message);
          }
        }
        res.end();
      }

      return;
    }

    // Non-streaming response
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error proxying to Hermes API:', error);

    const cause          = error.cause || error;
    const isNetworkError = cause.code === 'ECONNREFUSED' || cause.code === 'ENOTFOUND' || error.name === 'FetchError';
    const isTimeout      = error.name === 'AbortError' || cause.code === 'ETIMEDOUT';
    const errorCode      = cause.code || error.code || 'UNKNOWN';

    res.status(502).json({
      error: {
        type: isTimeout ? 'timeout' : isNetworkError ? 'network' : 'server_error',
        message: isTimeout
          ? 'Response timeout exceeded'
          : isNetworkError
            ? 'Hermes API unavailable'
            : 'Internal server error',
        details: `${error.message} (code: ${errorCode})`,
        code: errorCode,
        retryable: isNetworkError || isTimeout,
        suggestion: isNetworkError
          ? 'Check that Hermes API Server is running.'
          : isTimeout
            ? 'Please try again or simplify the request.'
            : 'Please try again.',
      },
    });
  }
});

export default router;
