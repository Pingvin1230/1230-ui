/**
 * routes/opencode.js
 *
 * Endpoints that proxy the OpenCode `serve` daemon (read-only views
 * suitable for the 1230UI Settings page).
 *
 *   GET /api/opencode/providers
 *     Calls GET /config on the opencode daemon. Returns a slim
 *     per-provider view the UI can render directly:
 *       - id, name, source
 *       - env (env-var names the provider needs)
 *       - connected (boolean — derived from /config.connected)
 *       - hasApiKey / baseUrl from the provider options
 *       - modelCount
 *     The 1230UI page never mutates opencode config from here — keys
 *     and base URLs are owned by the daemon's own config / env.
 *
 * The 1230UI-side visibility model (which models are hidden in the
 * 1230UI picker) is owned by the local SQLite db and will live in a
 * future iteration; this endpoint only surfaces the daemon's view.
 */

import { Router } from 'express';
import { opencodeClient, OpenCodeError } from '../lib/opencode.js';
import { apiLimiter } from '../middleware/security.js';

const router = Router();

// ── GET /api/opencode/providers ────────────────────────────────────────────
router.get('/providers', apiLimiter, async (_req, res) => {
  try {
    const data = await opencodeClient.getProviders();

    // `/provider` shape (opencode v1.15.4):
    //   { all:      [{ id, name, source, env, options, models }, ...],
    //     default:  { [providerID]: modelID },
    //     connected:[providerID, ...] }
    const all = Array.isArray(data?.all) ? data.all : [];
    const connectedSet = new Set(Array.isArray(data?.connected) ? data.connected : []);
    const defaultMap = (data?.default && typeof data.default === 'object') ? data.default : {};

    const providers = all.map((p) => {
      const envArr = Array.isArray(p?.env) ? p.env : [];
      const opts = (p?.options && typeof p.options === 'object') ? p.options : {};
      const models = (p?.models && typeof p.models === 'object') ? p.models : {};
      return {
        id: p.id,
        name: p.name ?? p.id,
        source: p.source ?? 'unknown',
        env: envArr,
        // Surface apiKey presence only — never the secret itself.
        hasApiKey: Boolean(opts.apiKey && String(opts.apiKey).length > 0),
        baseUrl: typeof opts.baseURL === 'string' ? opts.baseURL : null,
        connected: connectedSet.has(p.id),
        modelCount: Object.keys(models).length,
        defaultModel: typeof defaultMap[p.id] === 'string' ? defaultMap[p.id] : null,
      };
    });

    providers.sort((a, b) => {
      // connected first, then alpha by name
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });

    res.json({
      providers,
      connectedCount: providers.filter((p) => p.connected).length,
      totalCount: providers.length,
    });
  } catch (err) {
    if (err instanceof OpenCodeError) {
      return res.status(err.status ?? 502).json({
        error: 'OpenCode daemon returned an error',
        details: err.message,
      });
    }
    // Network / connection error — daemon unreachable.
    console.error('[opencode/providers] failed to reach daemon:', err.message);
    res.status(502).json({
      error: 'OpenCode daemon is unreachable',
      details: err.message,
    });
  }
});

export default router;
