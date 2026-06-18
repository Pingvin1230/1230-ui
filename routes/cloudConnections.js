/**
 * routes/cloudConnections.js
 *
 * CRUD for WebDAV connections. Credentials encrypted at rest.
 */

import { Router } from 'express';
import { createClient } from 'webdav';
import { encrypt, decrypt } from '../lib/cloud/crypto.js';
import config from '../config.js';
import { uiDb } from '../db/connections.js';

const router = Router();

function rowToConnection(row) {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    username: row.username,
    status: row.status,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET /api/cloud-connections ──────────────────────────────────────────
router.get('/cloud-connections', (_req, res) => {
  const rows = uiDb.prepare('SELECT * FROM cloud_connections ORDER BY created_at DESC').all();
  res.json({ connections: rows.map(rowToConnection) });
});

// ── POST /api/cloud-connections ─────────────────────────────────────────
router.post('/cloud-connections', (req, res) => {
  if (!config.cloudConnectKey) {
    return res.status(503).json({ error: 'CLOUD_CONNECT_KEY is not set. Set it in .env and restart.' });
  }

  const { label, url, username, password } = req.body;
  if (!url || !username || !password) {
    return res.status(400).json({ error: 'url, username, and password are required' });
  }

  const { ct, iv, tag } = encrypt(password);
  const result = uiDb.prepare(`
    INSERT INTO cloud_connections (label, url, username, credentials_ct, credentials_iv, credentials_tag)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(label || url, url, username, ct, iv, tag);

  const row = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ connection: rowToConnection(row) });
});

// ── PATCH /api/cloud-connections/:id ────────────────────────────────────
router.patch('/cloud-connections/:id', (req, res) => {
  const row = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Connection not found' });

  const { label } = req.body;
  if (label !== undefined) {
    uiDb.prepare('UPDATE cloud_connections SET label = ?, updated_at = strftime(\'%s\',\'now\') * 1000 WHERE id = ?').run(label, req.params.id);
  }

  const updated = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(req.params.id);
  res.json({ connection: rowToConnection(updated) });
});

// ── DELETE /api/cloud-connections/:id ───────────────────────────────────
router.delete('/cloud-connections/:id', (req, res) => {
  const row = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Connection not found' });

  uiDb.prepare('DELETE FROM cloud_connections WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// ── POST /api/cloud-connections/:id/test ────────────────────────────────
router.post('/cloud-connections/:id/test', async (req, res) => {
  const row = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Connection not found' });

  if (!config.cloudConnectKey) {
    return res.json({ ok: false, error: 'CLOUD_CONNECT_KEY is not set' });
  }

  try {
    const password = decrypt({ ct: row.credentials_ct, iv: row.credentials_iv, tag: row.credentials_tag });
    const client = createClient(row.url, {
      username: row.username,
      password,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    await client.getDirectoryContents('/');

    uiDb.prepare(`
      UPDATE cloud_connections
      SET status = 'ok', last_tested_at = strftime('%s','now') * 1000, last_error = NULL
      WHERE id = ?
    `).run(req.params.id);

    res.json({ ok: true });
  } catch (err) {
    const isAuth = err.response?.status === 401 || err.message?.includes('401');
    uiDb.prepare(`
      UPDATE cloud_connections
      SET status = ?, last_tested_at = strftime('%s','now') * 1000, last_error = ?
      WHERE id = ?
    `).run(isAuth ? 'auth_failed' : 'network_error', err.message || 'Unknown error', req.params.id);

    res.json({ ok: false, error: err.message || 'Connection failed' });
  }
});

export default router;
