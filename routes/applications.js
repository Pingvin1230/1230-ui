/**
 * routes/applications.js
 *
 * Endpoints:
 *   GET    /api/applications       — list all applications (optional ?enabled=1)
 *   PATCH  /api/applications/:id   — update application metadata
 */

import { Router } from 'express';
import { apiLimiter } from '../middleware/security.js';
import { uiDb } from '../db/connections.js';

const router = Router();

function rowToApplication(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    icon: row.icon,
    description: row.description,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    desktopOnly: row.desktop_only,
    config: row.config ? JSON.parse(row.config) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── GET /api/applications ──────────────────────────────────────────────────
router.get('/', apiLimiter, (req, res) => {
  try {
    const enabledFilter = req.query.enabled;
    let where = '';
    if (enabledFilter === '1') {
      where = 'WHERE enabled = 1';
    } else if (enabledFilter === '0') {
      where = 'WHERE enabled = 0';
    }
    const rows = uiDb.prepare(`
      SELECT * FROM applications ${where}
      ORDER BY sort_order ASC, id ASC
    `).all();
    res.json({ applications: rows.map(rowToApplication) });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ── PATCH /api/applications/:id ────────────────────────────────────────────
router.patch('/:id', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Application not found' });

    const body = req.body || {};
    const updates = [];
    const values = [];

    if (body.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(body.enabled ? 1 : 0);
    }
    if (body.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(Number(body.sortOrder));
    }
    if (body.name !== undefined) {
      const trimmed = String(body.name).trim();
      if (trimmed.length < 1) return res.status(400).json({ error: 'name is required' });
      updates.push('name = ?');
      values.push(trimmed);
    }
    if (body.icon !== undefined) {
      updates.push('icon = ?');
      values.push(body.icon === '' ? null : String(body.icon));
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description === '' ? null : String(body.description));
    }
    if (body.config !== undefined) {
      updates.push('config = ?');
      values.push(typeof body.config === 'string' ? body.config : JSON.stringify(body.config));
    }

    if (updates.length === 0) {
      return res.json({ application: rowToApplication(existing) });
    }

    updates.push("updated_at = (strftime('%s','now') * 1000)");
    values.push(existing.id);

    uiDb.prepare(`
      UPDATE applications SET ${updates.join(', ')} WHERE id = ?
    `).run(...values);

    const updated = uiDb.prepare('SELECT * FROM applications WHERE id = ?').get(existing.id);
    res.json({ application: rowToApplication(updated) });
  } catch (error) {
    console.error('Error updating application:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An application with this key already exists' });
    }
    res.status(400).json({ error: error.message || 'Failed to update application' });
  }
});

export default router;
