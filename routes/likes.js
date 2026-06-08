/**
 * routes/likes.js
 *
 * Endpoints:
 *   POST /api/like  — Record a like and forward to Mattermost webhook
 *
 * Rate limiting: likeLimiter (defined in middleware/security.js)
 * GeoIP: optional, lazy-imported geoip-lite; skipped if DISABLE_GEOIP=true
 *        or if the package is not installed.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { likeLimiter } from '../middleware/security.js';
import { uiDb } from '../db/connections.js';
import config from '../config.js';

const router = Router();

const LIKES_WEBHOOK_URL  = config.likesWebhookUrl;
const LIKES_COOLDOWN_SEC = config.likesCooldownSec;

// ── POST /api/like ─────────────────────────────────────────────────────────
router.post('/', likeLimiter, async (req, res) => {
  try {
    if (!LIKES_WEBHOOK_URL) {
      return res.status(503).json({ error: 'Likes webhook is not configured' });
    }

    const ip        = (req.ip || '').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || '';
    const userHash  = crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
    const cooldownMs = LIKES_COOLDOWN_SEC * 1000;
    const now = Date.now();

    const last = uiDb
      .prepare(
        'SELECT created_at FROM likes WHERE user_hash = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(userHash, now - cooldownMs);

    if (last) {
      const retryAfter = Math.max(1, Math.ceil((last.created_at + cooldownMs - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'cooldown',
        message: `You can like again in ${retryAfter} seconds.`,
        retry_after: retryAfter,
      });
    }

    // GeoIP lookup (optional dependency, non-critical)
    const country = await (async () => {
      if (process.env.DISABLE_GEOIP === 'true') return null;
      try {
        const { default: geoip } = await import('geoip-lite');
        return geoip.lookup(ip)?.country || null;
      } catch {
        return null;
      }
    })();

    const message = [
      '❤️ **New like from 1230-UI!**',
      '',
      `- **IP:** \`${ip || 'unknown'}\``,
      `- **Country:** ${country ? `\`${country}\`` : '`unknown`'}`,
      `- **User-Agent:** \`${userAgent.slice(0, 200) || 'unknown'}\``,
      `- **Time:** \`${new Date(now).toISOString()}\``,
    ].join('\n');

    const webhookResponse = await fetch(LIKES_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, username: '1230-UI Likes' }),
      signal: AbortSignal.timeout(5000),
    });

    if (!webhookResponse.ok) {
      const body = await webhookResponse.text().catch(() => '');
      console.error(`Likes webhook failed: ${webhookResponse.status} ${body}`);
      return res.status(502).json({ error: 'Webhook delivery failed' });
    }

    uiDb
      .prepare('INSERT INTO likes (user_hash, user_agent, country, created_at) VALUES (?, ?, ?, ?)')
      .run(userHash, userAgent.slice(0, 500), country, now);

    res.json({ success: true, sent_at: now });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      console.error('Likes webhook timeout');
      return res.status(504).json({ error: 'Webhook timed out' });
    }
    console.error('Error sending like:', error);
    res.status(500).json({ error: 'Failed to send like' });
  }
});

export default router;
