/**
 * routes/sessions.js
 *
 * Endpoints:
 *   GET    /api/sessions                  — list sessions (paginated, sorted)
 *   GET    /api/sessions/:id              — get single session
 *   POST   /api/sessions                  — create session via Hermes API
 *   PATCH  /api/sessions/:id/title        — rename session (direct SQLite)
 *   DELETE /api/sessions/:id             — delete session (direct SQLite)
 *   PATCH  /api/sessions/:id/pin         — toggle pin
 *   PATCH  /api/sessions/:id/archive     — toggle archive
 *   DELETE /api/sessions/bulk            — bulk delete
 *   GET    /api/sessions/:id/messages    — list messages for session
 *   POST   /api/messages                 — save message via Python script
 *
 * Note: PATCH title and DELETE :id are handled directly against the SQLite
 * Hermes DB (hermesDbWrite).  The duplicate Hermes-API-proxy versions that
 * existed further down in the original server.js were dead code (Express
 * short-circuits at the first matching handler) and have been removed.
 */

import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { apiLimiter } from '../middleware/security.js';
import { db, uiDb, hermesDbWrite } from '../db/connections.js';
import { rowToAssistant, getDefaultModelId } from '../db/helpers.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const HERMES_API_URL = config.hermesApiUrl;
const HERMES_API_KEY = config.hermesApiKey;
const HERMES_DB_PATH = config.hermesDbPath;
const HERMES_PYTHON_PATH = config.hermesPythonPath;
const SAVE_MESSAGES_SCRIPT = config.scripts.saveMessages;

const projectRoot = path.resolve(__dirname, '..');
const uploadsDir  = path.join(projectRoot, 'data', 'uploads');

function cleanupSessionUploads(sessionId) {
  const files = uiDb
    .prepare('SELECT stored_name, source FROM session_files WHERE session_id = ?')
    .all(sessionId);
  for (const f of files) {
    // Task #24: skip agent files — they live at `stored_name` (the agent's
    // absolute path), not under data/uploads/, and we don't own them.
    if ((f.source || 'user') === 'agent') continue;
    try { fs.unlinkSync(path.join(uploadsDir, sessionId, f.stored_name)); } catch (_) { /* ignore */ }
  }
  try { fs.rmdirSync(path.join(uploadsDir, sessionId)); } catch (_) { /* ignore */ }
  uiDb.prepare('DELETE FROM session_files WHERE session_id = ?').run(sessionId);
}

// ── GET /api/sessions ──────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const includeArchived = req.query.includeArchived === '1';
    const sort = req.query.sort === 'lastMessage' ? 'lastMessage' : 'created';

    const orderBy = sort === 'lastMessage'
      ? 'COALESCE(lastMessageAt, s.started_at) DESC, s.started_at DESC'
      : 's.started_at DESC';

    const sessions = db.prepare(`
      SELECT
        s.id,
        s.title,
        s.source,
        s.model,
        s.started_at       AS startedAt,
        s.ended_at         AS endedAt,
        s.message_count    AS messageCount,
        s.input_tokens     AS inputTokens,
        s.output_tokens    AS outputTokens,
        (SELECT content FROM messages
         WHERE session_id = s.id AND role = 'user'
         ORDER BY timestamp ASC LIMIT 1)          AS preview,
        (SELECT MAX(timestamp) FROM messages
         WHERE session_id = s.id)                 AS lastMessageAt
      FROM sessions s
      ORDER BY ${orderBy}
    `).all();

    const metaAll = uiDb.prepare('SELECT session_id, pinned, archived, assistant_id FROM session_meta').all();
    const metaMap = {};
    for (const m of metaAll) metaMap[m.session_id] = m;

    const assistantIds = [...new Set(metaAll.map((m) => m.assistant_id).filter((id) => id != null))];
    const assistantMap = {};
    if (assistantIds.length > 0) {
      const placeholders = assistantIds.map(() => '?').join(',');
      const rows = uiDb.prepare(`SELECT * FROM assistants WHERE id IN (${placeholders})`).all(...assistantIds);
      for (const a of rows) assistantMap[a.id] = a;
    }

    // #35: fetch file counts for all sessions in one query
    const fileCountRows = uiDb.prepare(
      'SELECT session_id, COUNT(*) AS cnt FROM session_files GROUP BY session_id'
    ).all();
    const fileCountMap = {};
    for (const r of fileCountRows) fileCountMap[r.session_id] = r.cnt;

    let filtered = sessions.map((s) => {
      const meta = metaMap[s.id];
      const assistant = meta?.assistant_id ? assistantMap[meta.assistant_id] : null;
      return {
        ...s,
        lastMessageAt: s.lastMessageAt ?? null,
        pinned: meta?.pinned ?? 0,
        archived: meta?.archived ?? 0,
        assistant: assistant ? rowToAssistant(assistant) : null,
        fileCount: fileCountMap[s.id] ?? 0,
      };
    });

    if (!includeArchived) filtered = filtered.filter((s) => s.archived !== 1);

    const total = filtered.length;

    const sortKey = sort === 'lastMessage'
      ? (s) => (s.lastMessageAt != null ? s.lastMessageAt : s.startedAt)
      : (s) => s.startedAt;
    const sortFn = (a, b) => sortKey(b) - sortKey(a);

    const pinned    = filtered.filter((s) => s.pinned === 1).sort(sortFn);
    const notPinned = filtered.filter((s) => s.pinned !== 1).sort(sortFn);
    const sorted    = [...pinned, ...notPinned];

    const paged = sorted.slice(offset, offset + limit);
    res.json({ sessions: paged, total, limit, offset });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ── GET /api/sessions/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const session = db.prepare(`
      SELECT id, title, source, model,
             started_at AS startedAt, ended_at AS endedAt,
             message_count AS messageCount,
             input_tokens AS inputTokens, output_tokens AS outputTokens
      FROM sessions WHERE id = ?
    `).get(req.params.id);

    if (session) {
      const meta = uiDb.prepare('SELECT assistant_id FROM session_meta WHERE session_id = ?').get(session.id);
      let assistant = null;
      if (meta?.assistant_id) {
        const a = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(meta.assistant_id);
        if (a) assistant = rowToAssistant(a);
      }
      return res.json({ ...session, assistant });
    }

    // Fallback: fetch from Hermes API (newly created sessions not yet in state.db)
    try {
      const response = await fetch(`${HERMES_API_URL}/api/sessions/${req.params.id}`, {
        headers: { 'Authorization': `Bearer ${HERMES_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        const s = data.session;
        const meta = uiDb.prepare('SELECT assistant_id FROM session_meta WHERE session_id = ?').get(s.id);
        let assistant = null;
        if (meta?.assistant_id) {
          const a = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(meta.assistant_id);
          if (a) assistant = rowToAssistant(a);
        }
        return res.json({
          id: s.id,
          title: s.title || 'Untitled session',
          source: s.source || 'webui',
          model: s.model || 'unknown',
          startedAt: s.created_at || Math.floor(Date.now() / 1000),
          endedAt: null,
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          assistant,
        });
      }
    } catch (apiErr) {
      console.error('Hermes API fallback failed:', apiErr.message);
    }

    return res.status(404).json({ error: 'Session not found' });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ── POST /api/sessions ─────────────────────────────────────────────────────
router.post('/', apiLimiter, async (req, res) => {
  let { model, title, assistantId } = req.body;

  if (assistantId != null) {
    if (!Number.isInteger(assistantId)) {
      return res.status(400).json({ error: 'assistantId must be an integer' });
    }
    const assistant = uiDb.prepare(
      'SELECT id, model_id, is_archived FROM assistants WHERE id = ?'
    ).get(assistantId);
    if (!assistant) return res.status(404).json({ error: 'Assistant not found' });
    if (assistant.is_archived) {
      return res.status(409).json({ error: 'Cannot start a session from an archived assistant' });
    }
    if (assistant.model_id) {
      const modelRow = uiDb.prepare('SELECT 1 FROM models WHERE model_id = ? AND enabled = 1').get(assistant.model_id);
      if (!modelRow) {
        return res.status(409).json({
          error: 'Assistant model is unavailable',
          code: 'assistant_model_unavailable',
          assistantId,
        });
      }
      model = assistant.model_id;
    }
  }

  if (!model) model = getDefaultModelId();
  if (!model) return res.status(400).json({ error: 'model is required and no default model is available' });

  try {
    const sessionId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const response = await fetch(`${HERMES_API_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: sessionId, model, title, source: '1230UI' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hermes API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to create session', details: errorText });
    }

    const data = await response.json();
    const returnedId = data.session?.id;
    if (!returnedId) return res.status(500).json({ error: 'No session ID in response' });

    // Wait for Hermes to sync session to state.db (up to 5 s)
    for (let attempt = 0; attempt < 10; attempt++) {
      const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
      if (session) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (assistantId != null) {
      try {
        uiDb.prepare(`
          INSERT INTO session_meta (session_id, pinned, archived, assistant_id)
          VALUES (?, 0, 0, ?)
          ON CONFLICT(session_id) DO UPDATE SET assistant_id = excluded.assistant_id
        `).run(sessionId, assistantId);
      } catch (err) {
        console.warn(`Failed to link session ${sessionId} to assistant ${assistantId}: ${err.message}`);
      }
    }

    res.json({ success: true, sessionId, model, assistantId: assistantId ?? null });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ── PATCH /api/sessions/:id/title ──────────────────────────────────────────
router.patch('/:id/title', (req, res) => {
  try {
    if (!hermesDbWrite) {
      return res.status(503).json({ error: 'Session rename unavailable — writable DB connection failed' });
    }

    const sessionId = req.params.id;
    const { title } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const trimmedTitle = title.trim();
    try {
      hermesDbWrite.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(trimmedTitle, sessionId);
    } catch (e) {
      if (e.message?.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Session with this title already exists' });
      }
      throw e;
    }

    res.json({ success: true, title: trimmedTitle });
  } catch (error) {
    console.error('Error updating session title:', error);
    res.status(500).json({ error: 'Failed to update session title' });
  }
});

// ── DELETE /api/sessions/bulk ──────────────────────────────────────────────
// Must be declared BEFORE /:id to avoid Express matching "bulk" as an id.
router.delete('/bulk', (req, res) => {
  try {
    if (!hermesDbWrite) {
      return res.status(503).json({ error: 'Bulk deletion unavailable — writable DB connection failed' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const deleteOne = hermesDbWrite.transaction((sessionId) => {
      hermesDbWrite.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      hermesDbWrite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      uiDb.prepare('DELETE FROM session_meta WHERE session_id = ?').run(sessionId);
    });

    let deletedCount = 0;
    for (const id of ids) {
      try {
        deleteOne(id);
        cleanupSessionUploads(id);
        deletedCount++;
      } catch (e) {
        console.error(`Failed to delete session ${id}:`, e);
      }
    }

    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('Error bulk deleting sessions:', error);
    res.status(500).json({ error: 'Failed to bulk delete sessions' });
  }
});

// ── DELETE /api/sessions/:id ───────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    if (!hermesDbWrite) {
      return res.status(503).json({ error: 'Session deletion unavailable — writable DB connection failed' });
    }

    const sessionId = req.params.id;
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const run = hermesDbWrite.transaction(() => {
      hermesDbWrite.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      hermesDbWrite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    });
    run();

    uiDb.prepare('DELETE FROM session_meta WHERE session_id = ?').run(sessionId);
    cleanupSessionUploads(sessionId);
    res.json({ success: true, deletedSessionId: sessionId });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ── PATCH /api/sessions/:id/pin ────────────────────────────────────────────
router.patch('/:id/pin', (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const meta = uiDb.prepare('SELECT pinned FROM session_meta WHERE session_id = ?').get(sessionId);
    const newValue = meta?.pinned ? 0 : 1;

    uiDb.prepare('INSERT OR REPLACE INTO session_meta (session_id, pinned) VALUES (?, ?)').run(sessionId, newValue);
    res.json({ success: true, pinned: newValue });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// ── PATCH /api/sessions/:id/archive ───────────────────────────────────────
router.patch('/:id/archive', (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const meta = uiDb.prepare('SELECT archived FROM session_meta WHERE session_id = ?').get(sessionId);
    const newValue = meta?.archived ? 0 : 1;

    uiDb.prepare('INSERT OR REPLACE INTO session_meta (session_id, archived) VALUES (?, ?)').run(sessionId, newValue);
    res.json({ success: true, archived: newValue });
  } catch (error) {
    console.error('Error toggling archive:', error);
    res.status(500).json({ error: 'Failed to toggle archive' });
  }
});

// ── GET /api/sessions/:id/messages ─────────────────────────────────────────
router.get('/:id/messages', (req, res) => {
  try {
    const sessionId = req.params.id;

    const messages = db.prepare(`
      SELECT
        id,
        session_id    AS sessionId,
        role,
        content,
        tool_call_id  AS toolCallId,
        tool_calls    AS toolCalls,
        tool_name     AS toolName,
        timestamp,
        token_count   AS tokenCount
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `).all(sessionId);

    // Load agent-generated files for this session and attach each file to
    // every assistant message whose content mentions the file's path.
    // This correctly handles repeated references to the same file across
    // multiple messages.
    const agentFiles = uiDb.prepare(`
      SELECT id, filename, stored_name AS storedName, mime_type AS mimeType, size
      FROM session_files
      WHERE session_id = ? AND source = 'agent'
    `).all(sessionId);

    const filesByMessageId = new Map();

    if (agentFiles.length > 0) {
      const assistantMessages = messages.filter(m => m.role === 'assistant' && m.content);
      for (const msg of assistantMessages) {
        const matched = agentFiles.filter(f => msg.content.includes(f.storedName));
        if (matched.length > 0) {
          filesByMessageId.set(msg.id, matched.map(f => ({
            id: f.id,
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
          })));
        }
      }
    }

    const parsed = messages.map((msg) => ({
      ...msg,
      toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : null,
      agentFiles: filesByMessageId.get(msg.id) ?? null,
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ── POST /api/messages ─────────────────────────────────────────────────────
// Exported separately so app.js can mount it at /api/messages directly.
export async function postMessageHandler(req, res) {
  const { sessionId, role, content, toolName } = req.body;

  if (!sessionId || !role || !content) {
    return res.status(400).json({ error: 'sessionId, role, and content are required' });
  }

  try {
    const args = [SAVE_MESSAGES_SCRIPT, sessionId, role, content];
    if (toolName) args.push(toolName);

    const pythonProcess = spawn(HERMES_PYTHON_PATH, args, {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, HERMES_DB_PATH },
    });

    let stdout = '';
    let stderr = '';
    pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true, message: stdout.trim() });
      } else {
        console.error('Python script error:', stderr);
        res.status(500).json({ error: 'Failed to save message', details: stderr });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to spawn Python process:', error);
      res.status(500).json({ error: 'Failed to execute save script' });
    });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
}

router.post('/messages', apiLimiter, postMessageHandler);

export default router;
