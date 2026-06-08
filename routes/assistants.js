/**
 * routes/assistants.js
 *
 * Endpoints:
 *   GET    /api/assistants              — list assistants
 *   GET    /api/assistants/:id          — get single assistant
 *   POST   /api/assistants              — create assistant
 *   PATCH  /api/assistants/:id          — update assistant (fork-on-edit if sessions linked)
 *   POST   /api/assistants/:id/archive  — archive assistant
 *   POST   /api/assistants/:id/restore  — restore archived assistant
 *   POST   /api/assistants/:id/duplicate — duplicate assistant
 *
 * Edit semantics
 * ─────────────────────────────────────────────────────────────────────────
 * When an assistant is PATCHed and at least one session already references
 * it, the existing row is archived and a NEW row is created with the updated
 * fields. Old sessions keep pointing at the archived row, preserving history.
 * A plain Duplicate does NOT archive the source.
 */

import { Router } from 'express';
import { apiLimiter } from '../middleware/security.js';
import { uiDb } from '../db/connections.js';
import { rowToAssistant } from '../db/helpers.js';

const router = Router();

const ASSISTANT_PALETTE    = new Set(['blue', 'green', 'purple', 'red', 'orange', 'yellow', 'pink', 'gray']);
const ASSISTANT_STYLES     = new Set(['friendly', 'formal', 'concise', 'creative']);
const ASSISTANT_DEPTHS     = new Set(['quick', 'standard', 'thorough']);
const MAX_ASSISTANT_NAME   = 60;
const MAX_ASSISTANT_DESC   = 200;
const MAX_ASSISTANT_ICON_LEN = 8;

// ── Input validation ───────────────────────────────────────────────────────
const MAX_SYSTEM_PROMPT = 4000;

function sanitizeAssistantInput({ name, color, icon, model_id, style, depth, system_prompt }) {
  if (typeof name !== 'string') throw new Error('name must be a string');
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_ASSISTANT_NAME) {
    throw new Error(`name must be 1-${MAX_ASSISTANT_NAME} characters`);
  }
  const col = color == null || color === '' ? null : String(color);
  if (col != null && !ASSISTANT_PALETTE.has(col)) {
    throw new Error('color must be one of the supported palette values');
  }
  const ic = icon == null || icon === '' ? null : String(icon);
  if (ic != null && ic.length > MAX_ASSISTANT_ICON_LEN) {
    throw new Error('icon is too long');
  }
  const mid = model_id == null || model_id === '' ? null : String(model_id);
  if (mid != null) {
    const modelRow = uiDb.prepare('SELECT 1 FROM models WHERE model_id = ? AND enabled = 1').get(mid);
    if (!modelRow) throw new Error('model_id references an unknown or disabled model');
  }
  const sty = style == null || style === '' ? null : String(style);
  if (sty != null && !ASSISTANT_STYLES.has(sty)) {
    throw new Error('style must be one of: friendly, formal, concise, creative');
  }
  const dep = depth == null || depth === '' ? null : String(depth);
  if (dep != null && !ASSISTANT_DEPTHS.has(dep)) {
    throw new Error('depth must be one of: quick, standard, thorough');
  }
  const sp = system_prompt == null || system_prompt === '' ? null : String(system_prompt);
  if (sp != null && sp.length > MAX_SYSTEM_PROMPT) {
    throw new Error(`system_prompt must be <= ${MAX_SYSTEM_PROMPT} characters`);
  }
  // description is derived automatically: first 100 chars of system_prompt
  const desc = sp ? sp.slice(0, 100) : null;
  return { name: trimmed, description: desc, color: col, icon: ic, model_id: mid, style: sty, depth: dep, system_prompt: sp };
}

// ── GET /api/assistants ────────────────────────────────────────────────────
router.get('/', apiLimiter, (req, res) => {
  try {
    const includeArchived = req.query.include_archived === '1';
    const rows = uiDb.prepare(`
      SELECT a.*, m.display_name AS model_display_name, m.enabled AS model_enabled,
             p.name AS provider_name
      FROM assistants a
      LEFT JOIN models m ON m.model_id = a.model_id
      LEFT JOIN providers p ON p.id = m.provider_id
      ${includeArchived ? '' : 'WHERE a.is_archived = 0'}
      ORDER BY a.is_archived ASC, a.id ASC
    `).all();
    res.json({ assistants: rows.map(rowToAssistant) });
  } catch (error) {
    console.error('Error fetching assistants:', error);
    res.status(500).json({ error: 'Failed to fetch assistants' });
  }
});

// ── GET /api/assistants/:id ────────────────────────────────────────────────
router.get('/:id', apiLimiter, (req, res) => {
  try {
    const row = uiDb.prepare(`
      SELECT a.*, m.display_name AS model_display_name, m.enabled AS model_enabled,
             p.name AS provider_name
      FROM assistants a
      LEFT JOIN models m ON m.model_id = a.model_id
      LEFT JOIN providers p ON p.id = m.provider_id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Assistant not found' });
    res.json(rowToAssistant(row));
  } catch (error) {
    console.error('Error fetching assistant:', error);
    res.status(500).json({ error: 'Failed to fetch assistant' });
  }
});

// ── POST /api/assistants ───────────────────────────────────────────────────
router.post('/', apiLimiter, (req, res) => {
  try {
    const input = sanitizeAssistantInput(req.body || {});
    const result = uiDb.prepare(`
      INSERT INTO assistants (name, description, color, icon, model_id, style, depth, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(input.name, input.description, input.color, input.icon, input.model_id, input.style, input.depth, input.system_prompt);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ assistant: rowToAssistant(row), forked: false });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An active assistant with this name already exists' });
    }
    console.error('Error creating assistant:', error);
    res.status(400).json({ error: error.message || 'Failed to create assistant' });
  }
});

// ── PATCH /api/assistants/:id ──────────────────────────────────────────────
router.patch('/:id', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });
    if (existing.is_archived) return res.status(409).json({ error: 'Cannot edit an archived assistant' });

    const input = sanitizeAssistantInput({
      name:          req.body.name          !== undefined ? req.body.name          : existing.name,
      color:         req.body.color         !== undefined ? req.body.color         : existing.color,
      icon:          req.body.icon          !== undefined ? req.body.icon          : existing.icon,
      model_id:      req.body.model_id      !== undefined ? req.body.model_id      : existing.model_id,
      style:         req.body.style         !== undefined ? req.body.style         : existing.style,
      depth:         req.body.depth         !== undefined ? req.body.depth         : existing.depth,
      system_prompt: req.body.system_prompt !== undefined ? req.body.system_prompt : existing.system_prompt,
    });

    const linkedSessions = uiDb.prepare(
      'SELECT COUNT(*) AS n FROM session_meta WHERE assistant_id = ?'
    ).get(existing.id).n;

    const performUpdate = uiDb.transaction(() => {
      if (linkedSessions > 0) {
        // Fork-on-edit: archive existing, create new row.
        uiDb.prepare(`
          UPDATE assistants
          SET is_archived = 1, archived_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id);
        const ins = uiDb.prepare(`
          INSERT INTO assistants (name, description, color, icon, model_id, style, depth, system_prompt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(input.name, input.description, input.color, input.icon, input.model_id, input.style, input.depth, input.system_prompt);
        const created = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(ins.lastInsertRowid);
        return { assistant: rowToAssistant(created), forked: true, previousId: existing.id };
      }
      uiDb.prepare(`
        UPDATE assistants
        SET name = ?, description = ?, color = ?, icon = ?, model_id = ?, style = ?, depth = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.name, input.description, input.color, input.icon, input.model_id, input.style, input.depth, input.system_prompt, existing.id);
      const updated = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(existing.id);
      return { assistant: rowToAssistant(updated), forked: false };
    });

    res.json(performUpdate());
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An active assistant with this name already exists' });
    }
    console.error('Error updating assistant:', error);
    res.status(400).json({ error: error.message || 'Failed to update assistant' });
  }
});

// ── POST /api/assistants/:id/archive ──────────────────────────────────────
router.post('/:id/archive', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });
    if (existing.is_archived) return res.json({ assistant: rowToAssistant(existing) });
    uiDb.prepare(`
      UPDATE assistants
      SET is_archived = 1, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.id);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(existing.id);
    res.json({ assistant: rowToAssistant(row) });
  } catch (error) {
    console.error('Error archiving assistant:', error);
    res.status(500).json({ error: 'Failed to archive assistant' });
  }
});

// ── POST /api/assistants/:id/restore ──────────────────────────────────────
router.post('/:id/restore', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });
    if (!existing.is_archived) return res.json({ assistant: rowToAssistant(existing) });
    uiDb.prepare(`
      UPDATE assistants
      SET is_archived = 0, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.id);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(existing.id);
    res.json({ assistant: rowToAssistant(row) });
  } catch (error) {
    console.error('Error restoring assistant:', error);
    res.status(500).json({ error: 'Failed to restore assistant' });
  }
});

// ── POST /api/assistants/:id/duplicate ────────────────────────────────────
router.post('/:id/duplicate', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });

    let candidate = `${existing.name} (copy)`;
    let suffix = 1;
    while (uiDb.prepare('SELECT 1 FROM assistants WHERE name = ? AND is_archived = 0').get(candidate)) {
      suffix += 1;
      candidate = `${existing.name} (copy ${suffix})`;
      if (suffix > 50) return res.status(409).json({ error: 'Too many copies of this name' });
    }

    const result = uiDb.prepare(`
      INSERT INTO assistants (name, description, color, icon, model_id, style, depth, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(candidate, existing.description, existing.color, existing.icon, existing.model_id, existing.style, existing.depth, existing.system_prompt);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ assistant: rowToAssistant(row) });
  } catch (error) {
    console.error('Error duplicating assistant:', error);
    res.status(500).json({ error: 'Failed to duplicate assistant' });
  }
});

export default router;
