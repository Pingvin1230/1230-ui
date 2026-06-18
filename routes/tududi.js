/**
 * routes/tududi.js
 *
 * Proxy + config endpoints for the Tududi REST API.
 *
 * Why a proxy:
 *   - Tududi listens on 127.0.0.1:3002 on the VPS and is not fronted by Authelia.
 *   - The browser must not hold the bearer token (tt_*).
 *   - The token lives encrypted in the system_settings table (key
 *     tududi_api_token_ct/iv/tag) and is attached server-side on every proxied
 *     request. Initial defaults come from .env (TUDUDI_API_URL/TOKEN) and can
 *     be overridden at runtime via POST /api/tududi/config.
 *
 * Endpoints:
 *   GET  /api/tududi/health        → connectivity probe against saved config
 *   GET  /api/tududi/config        → { apiUrl, hasToken } (token masked)
 *   POST /api/tududi/config        → save { apiUrl, apiToken } (encrypted at rest)
 *   POST /api/tududi/test          → probe arbitrary { apiUrl?, apiToken? } without saving
 *   ALL  /api/tududi/*             → https://<tududi>/api/<rest>  (generic pass-through)
 *   ALL  /api/tududi/v1/*          → https://<tududi>/api/v1/<rest>
 *
 * Notes:
 *   - The tududi UI base path is `/api/*` (not `/api/v1/*` as the docs hint).
 *     Both prefixes are forwarded verbatim, so Swagger, /api/profile, etc. work.
 *   - The body is forwarded as-is (JSON or empty).
 *   - We only forward safe/standard headers (Content-Type, Accept). We strip
 *     cookies/authorization that the browser may attach to our own origin.
 *   - Streaming responses (SSE) are not currently used by tududi.
 */

import { Router } from 'express';
import config from '../config.js';
import { apiLimiter, providerLimiter } from '../middleware/security.js';
import { encrypt } from '../lib/cloud/crypto.js';
import { upsertSetting, transaction } from '../lib/systemSettings.js';
import { probeTududi } from '../lib/tududi.js';

const router = Router();

const TUDUDI_TIMEOUT_MS = config.tududiTimeoutMs || 15000;

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'cookie',
  'authorization',
]);

function pickForwardHeaders(req) {
  const out = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    out[k] = v;
  }
  out['authorization'] = `Bearer ${config.tududiApiToken}`;
  out['accept'] = out['accept'] || 'application/json';
  out['user-agent'] = out['user-agent'] || '1230-ui-tududi-proxy/1.0';
  return out;
}

function buildTargetUrl(req) {
  const original = req.originalUrl.replace(/^\/api\/tududi/, '');
  const base = config.tududiApiUrl.replace(/\/$/, '');
  return `${base}/api${original}${req.url.includes('?') && !original.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
}

// ── system_settings helpers ────────────────────────────────────────────────
// getSetting/upsertSetting live in lib/systemSettings.js (shared with routes/system.js).

// ── GET /api/tududi/health ─────────────────────────────────────────────────
// Connectivity probe against the currently saved config. Used by the status
// indicator on the settings page and inside the Tududi app pane.
router.get('/health', apiLimiter, async (_req, res) => {
  if (!config.tududiApiToken) {
    return res.json({ configured: false, reachable: false });
  }
  const probe = await probeTududi(config.tududiApiUrl, config.tududiApiToken);
  res.json({
    configured: true,
    reachable: probe.ok,
    status: probe.status,
    error: probe.error,
  });
});

// ── GET /api/tududi/config ─────────────────────────────────────────────────
// Returns the current API URL plus a boolean indicating whether a token is
// stored. The token itself never leaves the server.
router.get('/config', apiLimiter, (_req, res) => {
  res.json({
    apiUrl: config.tududiApiUrl,
    hasToken: Boolean(config.tududiApiToken),
  });
});

// ── POST /api/tududi/config ────────────────────────────────────────────────
// Body: { apiUrl: string, apiToken?: string }
//   - apiUrl is required and must be a valid URL.
//   - apiToken is optional:
//       string with length > 0 → encrypt and store (overwrites previous)
//       '' (empty string)      → clear the stored token
//       undefined / not sent   → leave the stored token untouched
//
// After a successful save the in-memory `config` is mutated so the proxy picks
// up the new values immediately — no service restart needed. NOTE: this relies
// on the single-worker systemd unit (1230-ui.service). If the app ever moves
// to a multi-worker setup (PM2 / cluster), the in-memory override must be
// replaced with a per-request DB read.
router.post('/config', providerLimiter, (req, res) => {
  const { apiUrl, apiToken } = req.body || {};

  if (!apiUrl || typeof apiUrl !== 'string') {
    return res.status(400).json({ error: 'apiUrl is required' });
  }
  try {
    new URL(apiUrl);
  } catch {
    return res.status(400).json({ error: 'apiUrl must be a valid URL' });
  }

  const trimmedUrl = apiUrl.trim();
  const touchToken = typeof apiToken === 'string';
  const now = Date.now();

  if (touchToken && apiToken.length > 0 && !config.cloudConnectKey) {
    return res
      .status(503)
      .json({ error: 'CLOUD_CONNECT_KEY is not set. Add it to .env and restart 1230-UI.' });
  }

  try {
    const saveSettings = transaction(() => {
      upsertSetting('tududi_api_url', trimmedUrl, now);

      if (!touchToken) return;
      if (apiToken.length > 0) {
        const { ct, iv, tag } = encrypt(apiToken);
        upsertSetting('tududi_api_token_ct', ct, now);
        upsertSetting('tududi_api_token_iv', iv, now);
        upsertSetting('tududi_api_token_tag', tag, now);
      } else {
        upsertSetting('tududi_api_token_ct', '', now);
        upsertSetting('tududi_api_token_iv', '', now);
        upsertSetting('tududi_api_token_tag', '', now);
      }
    });
    saveSettings();
  } catch (err) {
    console.error('[tududi] failed to save config:', err);
    return res.status(500).json({ error: 'Failed to save Tududi configuration' });
  }

  config.tududiApiUrl = trimmedUrl;
  if (touchToken) {
    config.tududiApiToken = apiToken.length > 0 ? apiToken : null;
  }

  res.json({ success: true });
});

// ── POST /api/tududi/test ──────────────────────────────────────────────────
// Body: { apiUrl?: string, apiToken?: string }
//   - If both fields are omitted / empty, the currently saved config is probed.
//   - Otherwise the supplied values are probed WITHOUT being saved — lets the
//     UI run a "Test connection" against unsaved form state.
router.post('/test', apiLimiter, async (req, res) => {
  const apiUrl =
    (typeof req.body?.apiUrl === 'string' && req.body.apiUrl.trim()) || config.tududiApiUrl;
  const apiToken =
    typeof req.body?.apiToken === 'string' && req.body.apiToken.length > 0
      ? req.body.apiToken
      : config.tududiApiToken;

  const probe = await probeTududi(apiUrl, apiToken);
  res.json(probe);
});

// ── generic proxy pass-through ─────────────────────────────────────────────
async function proxyRequest(req, res) {
  if (!config.tududiApiToken) {
    return res.status(503).json({
      error: {
        type: 'tududi_not_configured',
        message: 'TUDUDI_API_TOKEN is not set. Configure it in Settings → Tududi.',
      },
    });
  }

  const targetUrl = buildTargetUrl(req);

  const init = {
    method: req.method,
    headers: pickForwardHeaders(req),
    redirect: 'manual',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
      init.body = req.body;
    } else {
      init.body = JSON.stringify(req.body);
    }
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TUDUDI_TIMEOUT_MS);
  init.signal = ac.signal;

  try {
    const upstream = await fetch(targetUrl, init);
    clearTimeout(timer);

    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (HOP_BY_HOP.has(lower)) return;
      if (lower === 'set-cookie') return;
      if (lower === 'content-encoding') return;
      res.setHeader(key, value);
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.warn(`[tududi] timeout after ${TUDUDI_TIMEOUT_MS}ms: ${req.method} ${targetUrl}`);
      return res.status(504).json({
        error: { type: 'tududi_timeout', message: 'Tududi did not respond in time' },
      });
    }
    console.error(`[tududi] proxy error: ${err.message} (${req.method} ${targetUrl})`);
    return res.status(502).json({
      error: { type: 'tududi_unreachable', message: 'Cannot reach Tududi instance' },
    });
  }
}

router.all('/{*splat}', apiLimiter, proxyRequest);

export default router;
