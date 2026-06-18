/**
 * middleware/logger.js
 *
 * Request logger. Replaces the previous res.json monkey-patch that lived in
 * app.js, which only fired for res.json() responses and therefore missed
 * SSE streams (POST /api/chat) and streamed file downloads.
 *
 * Strategy: record the start time, then log exactly once on the response
 * 'finish' event (covers res.json/send/sendFile/streamed downloads) OR on
 * 'close' (covers client-aborted SSE, where 'finish' never fires). A guard
 * flag guarantees a single log line per request.
 *
 * For the long-lived SSE endpoint we additionally emit a minimal
 * "request_started" line so the request is visible in logs immediately,
 * rather than only when the stream finally closes (which may be minutes
 * later).
 *
 * Log line shape is intentionally identical to the previous implementation
 * so downstream log consumers/parsers stay stable:
 *   { level, timestamp, method, path, status, duration }
 *
 * We deliberately do NOT log request bodies or headers (secrets/PII).
 */

export function requestLogger(req, res, next) {
  const start = Date.now();
  // Capture method/path NOW, before routing enters a mounted Router — Express
  // strips the mount prefix from req.url/req.path while routing inside an
  // app.use('/api/chat', router) sub-app, so re-reading req.path later (when
  // 'finish' fires) would yield a stripped path like "/" instead of the real
  // "/api/chat". Reusing these captured values keeps the log accurate.
  const method = req.method;
  const reqPath = req.path;

  // Immediate audit line for SSE so a long-running chat request is visible
  // before its 'finish' event (which fires when the stream closes).
  if (method === 'POST' && reqPath === '/api/chat') {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      method,
      path: reqPath,
      event: 'request_started',
    }));
  }

  let logged = false;
  const logFinish = () => {
    if (logged) return;
    logged = true;
    const status = res.statusCode;
    const entry = {
      level: status >= 400 ? 'warn' : 'info',
      timestamp: new Date().toISOString(),
      method,
      path: reqPath,
      status,
      duration: `${Date.now() - start}ms`,
    };
    if (status >= 400) console.warn(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
  };

  // 'finish' = response fully sent. 'close' = underlying connection closed
  // (covers client-aborted long-lived SSE where 'finish' never fires).
  res.on('finish', logFinish);
  res.on('close', logFinish);

  next();
}
