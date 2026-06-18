/**
 * middleware/errorHandler.js
 *
 * Central Express error-handling middleware. Mounted AFTER all routes in
 * app.js so any unhandled error thrown/rejected from a route handler (or
 * forwarded via next(err)) lands here.
 *
 * Response envelope (backward compatible):
 *   { "error": "<safe message string>" }
 *
 *   - Every existing route already uses this exact shape for its *handled*
 *     errors: res.status(4xx|5xx).json({ error: "..." }).
 *   - The frontend reads `data.error` as a STRING everywhere
 *     (src/lib/api.ts: `throw new Error(data.error || i18n.t(...))`).
 *     Keeping `error` a plain string — not an object — preserves that
 *     contract for any error that previously escaped unhandled.
 *
 * Safety:
 *   - Never leak err.stack or the internal message of an UNKNOWN error to
 *     the client. For 5xx we always return a generic message.
 *   - For known client errors (4xx) we forward err.message, which app code
 *     controls and intends to be user-facing (validation, not-found, etc.).
 *   - We log details (message + stack for 5xx) server-side only.
 */

const isProduction = process.env.NODE_ENV === 'production';

export function errorHandler(err, req, res, next) {
  const declared = err && typeof err === 'object' ? (err.status ?? err.statusCode) : undefined;
  const status = Number.isInteger(declared) && declared >= 400 && declared <= 599 ? declared : 500;

  // Server-side log. method/path/message only — never bodies or headers.
  const logEntry = {
    level: 'error',
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    status,
    message: (err && err.message) || String(err),
  };
  if (err && err.code) logEntry.code = err.code;
  if (status >= 500 && err && err.stack) logEntry.stack = err.stack;
  console.error(JSON.stringify(logEntry));

  // Choose a safe client-facing message.
  let message;
  if (status >= 500) {
    // Never leak internals of unexpected server errors in production.
    message = 'Internal server error';
  } else {
    message = (typeof err?.message === 'string' && err.message) || 'Request failed';
  }

  // If the response already started (e.g. mid-SSE), we can't write a JSON
  // body — delegate to Express's default handler, which tears down the socket.
  if (res.headersSent) {
    return next(err);
  }

  res.status(status).json({ error: message });
}
