import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import xss from 'xss';

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

/** General API: 100 req / min */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many requests, please try again later.' } },
});

/** Chat endpoint: 30 req / min */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many chat requests, please try again later.' } },
});

/** System commands: 5 req / 5 min */
export const execLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many system commands, please wait before trying again.' } },
});

/** Provider key writes (writes to ~/.hermes/.env): 10 req / min */
export const providerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many provider operations, please slow down.' } },
});

/** Like endpoint: 5 req / hr per IP (DB enforces strict per-user cooldown) */
export const likeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  message: { error: { type: 'rate_limit', message: 'Too many like attempts, please try again later.' } },
});

// ---------------------------------------------------------------------------
// XSS sanitization
// ---------------------------------------------------------------------------

const XSS_OPTIONS: Parameters<typeof xss>[1] = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

function sanitizeString(value: string): string {
  return xss(value, XSS_OPTIONS);
}

/**
 * Deep-sanitize an object's string values recursively.
 *
 * Handles:
 *   - Primitive strings  → sanitized
 *   - Arrays             → each element processed recursively
 *   - Plain objects      → each value processed recursively
 *   - Everything else    → passed through unchanged
 *
 * A depth cap (MAX_DEPTH = 10) prevents DoS via deeply-nested payloads.
 */
const MAX_SANITIZE_DEPTH = 10;

export function sanitizeBody(obj: unknown, _depth = 0): unknown {
  if (_depth > MAX_SANITIZE_DEPTH) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeBody(item, _depth + 1));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeBody(value, _depth + 1);
    }
    return result;
  }
  return obj;
}

/** Express middleware that sanitizes all string values in req.body. */
export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeBody(req.body) as Record<string, unknown>;
  }
  next();
}
