import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import xss from 'xss';

// Rate limiting — general API
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many requests, please try again later.' } },
});

// Rate limiting — chat endpoint (stricter)
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many chat requests, please try again later.' } },
});

// Rate limiting — system commands (very strict)
export const execLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many system commands, please wait before trying again.' } },
});

// Rate limiting — like endpoint (per-IP, soft network cap; DB enforces strict cooldown)
export const likeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { error: { type: 'rate_limit', message: 'Too many like attempts, please try again later.' } },
});

// XSS sanitization for string fields
function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  return xss(value, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  });
}

// Deep sanitize an object's string values
export function sanitizeBody(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => typeof item === 'string' ? sanitizeString(item) : item);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Middleware to sanitize request body
export function sanitizeMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeBody(req.body);
  }
  next();
}
