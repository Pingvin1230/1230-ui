/**
 * app.js
 *
 * Configures the Express application: middleware, routes, SPA fallback.
 * Separated from server.js so the app can be imported in tests without
 * starting the HTTP listener.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';

import config from './config.js';
import { sanitizeMiddleware, apiLimiter } from './middleware/security.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

import systemRouter, { getHealthHandler }       from './routes/system.js';
import sessionsRouter, { postMessageHandler }   from './routes/sessions.js';
import filesRouter       from './routes/files.js';
import chatRouter       from './routes/chat.js';
import modelsRouter     from './routes/models.js';
import assistantsRouter from './routes/assistants.js';
import providersRouter  from './routes/providers.js';
import likesRouter      from './routes/likes.js';
import applicationsRouter from './routes/applications.js';
import globalFilesRouter  from './routes/globalFiles.js';
import cloudConnectionsRouter from './routes/cloudConnections.js';
import cloudFilesRouter       from './routes/cloudFiles.js';
import opencodeRouter  from './routes/opencode.js';
import tududiRouter    from './routes/tududi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// One nginx HTTP hop terminates TLS and proxies to this app, so trust the
// first proxy hop for correct req.ip / rate-limit key generation.
app.set('trust proxy', 1);

// ── Security / parsing middleware ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

app.use(express.json());
app.use(sanitizeMiddleware);
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    // Never cache HTML — browser must always fetch fresh index.html so it
    // picks up new content-hashed asset filenames after a deploy.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  } else if (req.path.startsWith('/assets/')) {
    // Vite emits content-hashed filenames (e.g. index-AbCdEf12.js).
    // These are immutable — safe to cache for a very long time.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'dist')));

// ── Request logging middleware ─────────────────────────────────────────────
// Hooks res 'finish'/'close' so SSE streams and file downloads are logged
// too (the old res.json monkey-patch missed them). See middleware/logger.js.
app.use(requestLogger);

// ── API routes ─────────────────────────────────────────────────────────────
// Stand-alone endpoints first (exact paths, no prefix stripping)
app.get('/api/health',   getHealthHandler);
app.post('/api/messages', apiLimiter, postMessageHandler);

// Routers mounted at their prefix
app.use('/api/system',      systemRouter);
app.use('/api/sessions',    sessionsRouter);
app.use('/api/sessions',    filesRouter);
app.use('/api/chat',        chatRouter);
app.use('/api/models',      modelsRouter);
app.use('/api/assistants',  assistantsRouter);
app.use('/api/providers',   providersRouter);
app.use('/api/like',        likesRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/files',        globalFilesRouter);
app.use('/api',              cloudConnectionsRouter);
app.use('/api',              cloudFilesRouter);
app.use('/api/opencode',     opencodeRouter);
app.use('/api/tududi',       tududiRouter);

// ── SPA fallback ───────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Central error handler (must be mounted last) ───────────────────────────
// Catches any unhandled error thrown/rejected from a route handler (or the
// SPA fallback's sendFile) and any error forwarded via next(err). Responds
// with { "error": <string> } for full backward compatibility with api.ts.
app.use(errorHandler);

export default app;
