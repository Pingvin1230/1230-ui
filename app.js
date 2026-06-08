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

import systemRouter, { getHealthHandler }       from './routes/system.js';
import sessionsRouter, { postMessageHandler }   from './routes/sessions.js';
import chatRouter       from './routes/chat.js';
import modelsRouter     from './routes/models.js';
import assistantsRouter from './routes/assistants.js';
import providersRouter  from './routes/providers.js';
import likesRouter      from './routes/likes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

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
app.use(express.static(path.join(__dirname, 'dist')));

// ── Request logging middleware ─────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const duration = Date.now() - start;
    const logEntry = {
      level: res.statusCode >= 400 ? 'warn' : 'info',
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    };
    if (res.statusCode >= 400) {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
    return originalJson(body);
  };
  next();
});

// ── API routes ─────────────────────────────────────────────────────────────
// Stand-alone endpoints first (exact paths, no prefix stripping)
app.get('/api/health',   getHealthHandler);
app.post('/api/messages', apiLimiter, postMessageHandler);

// Routers mounted at their prefix
app.use('/api/system',      systemRouter);
app.use('/api/sessions',    sessionsRouter);
app.use('/api/chat',        chatRouter);
app.use('/api/models',      modelsRouter);
app.use('/api/assistants',  assistantsRouter);
app.use('/api/providers',   providersRouter);
app.use('/api/like',        likesRouter);

// ── SPA fallback ───────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

export default app;
