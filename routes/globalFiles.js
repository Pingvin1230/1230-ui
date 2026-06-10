/**
 * routes/globalFiles.js
 *
 * Global file management endpoints (Task #38):
 *   GET    /api/files              — list all files across all sessions
 *   PATCH  /api/files/:fileId/extend — extend file expiration
 *   DELETE /api/files/:fileId      — delete file globally (disk + DB)
 *   POST   /api/files/:fileId/copy — copy file to another session
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { uiDb, db } from '../db/connections.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fixes double-encoded UTF-8 filenames (mojibake).
 * Some browsers/upload paths send UTF-8 bytes that get re-encoded as UTF-8.
 * E.g. "Снимок" → "Ð¡Ð½Ð¸Ð¼Ð¾Ðº" in the DB.
 */
function fixFilenameEncoding(name) {
  if (!name) return name;
  try {
    // If the string contains characters in the Ð/Ñ range (U+00C0–U+00FF),
    // it's likely double-encoded UTF-8.
    if (/[\u00C0-\u00FF]/.test(name)) {
      return Buffer.from(name, 'latin1').toString('utf8');
    }
  } catch {
    // ignore — return original
  }
  return name;
}

// ── GET /api/files ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const fileRows = uiDb.prepare(`
      SELECT
        f.id,
        f.session_id,
        f.filename,
        f.mime_type,
        f.size,
        f.uploaded_at,
        f.expires_at,
        f.extended_count,
        f.source
      FROM session_files f
      ORDER BY f.uploaded_at DESC
    `).all();

    // Sessions live in Hermes DB (db), files in UI DB (uiDb).
    // Fetch session titles and previews separately and join in memory.
    const sessionIds = [...new Set(fileRows.map((r) => r.session_id))];
    const sessionMap = new Map();
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      const sessions = db.prepare(`
        SELECT
          s.id,
          s.title,
          (SELECT content FROM messages
           WHERE session_id = s.id AND role = 'user'
           ORDER BY timestamp ASC LIMIT 1) AS preview
        FROM sessions s
        WHERE s.id IN (${placeholders})
      `).all(...sessionIds);
      for (const s of sessions) {
        // Use title if exists, otherwise use preview (truncated to 70 chars)
        const displayTitle = s.title || (s.preview ? (s.preview.length > 70 ? s.preview.slice(0, 70) + '...' : s.preview) : null);
        sessionMap.set(s.id, displayTitle);
      }
    }

    const files = fileRows.map((row) => {
      const hasSession = sessionMap.has(row.session_id);
      const rawTitle = sessionMap.get(row.session_id);
      return {
        id: row.id,
        sessionId: row.session_id,
        sessionTitle: hasSession ? (rawTitle || 'Untitled') : null,
        filename: fixFilenameEncoding(row.filename),
        mimeType: row.mime_type,
        size: row.size,
        uploadedAt: row.uploaded_at,
        expiresAt: row.expires_at,
        extendedCount: row.extended_count || 0,
        source: row.source || 'user',
      };
    });

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const stats = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      expiringSoon: files.filter((f) => f.expiresAt && f.expiresAt - now < sevenDaysMs && f.expiresAt > now).length,
    };

    res.json({ files, stats });
  } catch (err) {
    console.error('Failed to list global files:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ── PATCH /api/files/:fileId/extend ─────────────────────────────────────────
router.patch('/:fileId/extend', (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'fileId must be an integer' });
  }

  const file = uiDb.prepare('SELECT * FROM session_files WHERE id = ?').get(fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const extensionMs = config.fileRetentionDays * 24 * 60 * 60 * 1000;
  const newExpiresAt = (file.expires_at || file.uploaded_at) + extensionMs;

  uiDb.prepare(`
    UPDATE session_files
    SET expires_at = ?, extended_count = extended_count + 1
    WHERE id = ?
  `).run(newExpiresAt, fileId);

  res.json({ success: true, expiresAt: newExpiresAt });
});

// ── DELETE /api/files/:fileId ───────────────────────────────────────────────
router.delete('/:fileId', (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'fileId must be an integer' });
  }

  const file = uiDb.prepare('SELECT * FROM session_files WHERE id = ?').get(fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    // Delete from disk for both user and agent files
    if (file.source === 'agent') {
      try {
        fs.unlinkSync(file.stored_name);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn('Failed to delete agent file (continuing):', err.message);
        }
      }
    } else {
      try {
        fs.unlinkSync(path.join(uploadsDir, file.session_id, file.stored_name));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn('Failed to delete user file (continuing):', err.message);
        }
      }
    }

    uiDb.prepare('DELETE FROM session_files WHERE id = ?').run(fileId);
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete global file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// ── POST /api/files/:fileId/copy ────────────────────────────────────────────
// Copy a file from one session to another.
// Creates a physical copy of the file and a new DB record.
router.post('/:fileId/copy', (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  const { targetSessionId } = req.body;

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'fileId must be an integer' });
  }

  if (!targetSessionId) {
    return res.status(400).json({ error: 'targetSessionId is required' });
  }

  // Get source file
  const sourceFile = uiDb.prepare('SELECT * FROM session_files WHERE id = ?').get(fileId);
  if (!sourceFile) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Check target session exists
  const targetSession = db.prepare('SELECT id FROM sessions WHERE id = ?').get(targetSessionId);
  if (!targetSession) {
    return res.status(404).json({ error: 'Target session not found' });
  }

  // Determine source file path
  let sourcePath;
  if (sourceFile.source === 'agent') {
    sourcePath = sourceFile.stored_name;
  } else {
    sourcePath = path.join(uploadsDir, sourceFile.session_id, sourceFile.stored_name);
  }

  // Check source file exists on disk
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'Source file not found on disk' });
  }

  // Generate new stored name
  const ext = path.extname(sourceFile.stored_name).toLowerCase();
  const newStoredName = `${crypto.randomUUID()}${ext}`;

  // Create target directory
  const targetDir = path.join(uploadsDir, targetSessionId);
  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create target directory:', err);
    return res.status(500).json({ error: 'Failed to create upload directory' });
  }

  const targetPath = path.join(targetDir, newStoredName);

  // Copy file
  try {
    fs.copyFileSync(sourcePath, targetPath);
  } catch (err) {
    console.error('Failed to copy file:', err);
    return res.status(500).json({ error: 'Failed to copy file' });
  }

  // Calculate expiration
  const now = Date.now();
  const expiresAt = config.fileRetentionDays > 0
    ? now + (config.fileRetentionDays * 24 * 60 * 60 * 1000)
    : null;

  // Create new DB record
  try {
    const result = uiDb.prepare(`
      INSERT INTO session_files (session_id, filename, stored_name, mime_type, size, uploaded_at, expires_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
    `).run(
      targetSessionId,
      sourceFile.filename,
      newStoredName,
      sourceFile.mime_type,
      sourceFile.size,
      now,
      expiresAt
    );

    const newFile = uiDb.prepare('SELECT * FROM session_files WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      id: newFile.id,
      sessionId: newFile.session_id,
      filename: newFile.filename,
      mimeType: newFile.mime_type,
      size: newFile.size,
      uploadedAt: newFile.uploaded_at,
      expiresAt: newFile.expires_at,
      source: newFile.source,
      path: targetPath,
    });
  } catch (err) {
    console.error('Failed to create file record:', err);
    // Clean up copied file
    try { fs.unlinkSync(targetPath); } catch {}
    return res.status(500).json({ error: 'Failed to create file record' });
  }
});

export default router;
