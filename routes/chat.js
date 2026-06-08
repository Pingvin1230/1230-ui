/**
 * routes/chat.js
 *
 * Endpoints:
 *   POST /api/chat  — Proxy to Hermes API with SSE streaming + tool-call events
 */

import { Router } from 'express';
import { chatLimiter } from '../middleware/security.js';
import { getProviderFromModel } from '../db/helpers.js';
import config from '../config.js';

const router = Router();

const HERMES_API_URL = config.hermesApiUrl;
const HERMES_API_KEY = config.hermesApiKey;

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

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          if (isFirstChunk) {
            res.write(`data: ${JSON.stringify({ type: 'status', status: 'generating' })}\n\n`);
            isFirstChunk = false;
          }

          // Parse SSE lines to extract tool-call events
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
