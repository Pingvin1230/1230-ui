/**
 * routes/files.js
 *
 * Endpoints (mounted at /api/sessions, so the full path includes :id):
 *   POST   /api/sessions/:id/files           — upload a file (multipart/form-data, field "file")
 *   GET    /api/sessions/:id/files           — list files for a session
 *   DELETE /api/sessions/:id/files/:fileId   — remove a single file (DB row + disk)
 *
 * Storage: data/uploads/<session_id>/<uuid>.<ext>
 *   - stored_name is always server-generated (UUID + lowercased extension);
 *     the original filename is never used as a path component.
 *   - Files are cleaned up when a session is deleted (single + bulk);
 *     see routes/sessions.js for the cleanup logic.
 *
 * Limits:
 *   - Max 50 MB per file (enforced by multer + checked again here)
 *   - Whitelisted extensions and MIME types (see ALLOWED_EXTENSIONS / ALLOWED_MIME)
 *
 * Rate limiting: apiLimiter (100 req/min, mounted in app.js on the parent
 * sessions router — this module re-applies it for upload POST so the limit
 * cannot be bypassed by hitting it directly via /api/sessions/:id/files).
 */

import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { apiLimiter } from '../middleware/security.js';
import { getMimeTypeForPath, ALLOWED_EXTENSIONS } from '../db/fileTypes.js';
import { fixFilenameEncoding } from '../lib/fileUtils.js';
import { db, uiDb } from '../db/connections.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const router = Router({ mergeParams: true });

// ── Project root + uploads dir ─────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..');
const uploadsDir  = path.join(projectRoot, 'data', 'uploads');
const tempDir     = path.join(os.tmpdir(), '1230-ui-uploads');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(tempDir,    { recursive: true });

// ── Whitelist — MIME types accepted from the browser ──────────────────────
// ALLOWED_EXTENSIONS is imported from db/fileTypes.js (shared with chat.js).

const ALLOWED_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-python',
  'text/javascript',
  'application/javascript',
  'text/x-typescript',
  'text/html',
  'text/css',
  'text/xml',
  'application/xml',
  'application/json',
  'text/csv',
  'application/csv',
  'text/yaml',
  'application/x-yaml',
  'text/x-shellscript',
  'application/x-sh',
  'application/sql',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/octet-stream',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function getExtension(filename) {
  if (!filename) return '';
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

// ── multer config (temp dir; renamed on success) ────────────────────────────
const upload = multer({
  dest: tempDir,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('UNSUPPORTED_EXTENSION'));
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_MIME'));
    }
    cb(null, true);
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────

function rowToFile(row, projectRootAbs) {
  return {
    id: row.id,
    sessionId: row.session_id,
    filename: fixFilenameEncoding(row.filename),
    storedName: row.stored_name,
    mimeType: row.mime_type,
    size: row.size,
    uploadedAt: row.uploaded_at,
    path: path.join(projectRootAbs, 'data', 'uploads', row.session_id, row.stored_name),
  };
}

function ensureSessionExists(sessionId, res) {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return false;
  }
  return true;
}

// Multer error handler (file too large, extension/MIME not allowed, etc.)
function handleUploadError(err, res) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File exceeds 50 MB limit' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && (err.message === 'UNSUPPORTED_EXTENSION' || err.message === 'UNSUPPORTED_MIME')) {
    return res.status(400).json({ error: 'File type not supported' });
  }
  return null;
}

// ── POST /api/sessions/:id/files ────────────────────────────────────────────
router.post('/:id/files', apiLimiter, (req, res) => {
  const sessionId = req.params.id;
  if (!sessionId) return res.status(400).json({ error: 'Session id is required' });

  if (!ensureSessionExists(sessionId, res)) return;

  upload.single('file')(req, res, (err) => {
    if (err) {
      const handled = handleUploadError(err, res);
      if (handled) return;
      console.error('File upload error:', err);
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const ext = getExtension(req.file.originalname);
    const storedName = `${crypto.randomUUID()}${ext}`;
    const sessionDir = path.join(uploadsDir, sessionId);

    try {
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (mkdirErr) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
      console.error('Failed to create session upload dir:', mkdirErr);
      return res.status(500).json({ error: 'Failed to create upload directory' });
    }

    const finalPath = path.join(sessionDir, storedName);
    try {
      try {
        fs.renameSync(req.file.path, finalPath);
      } catch (renameErr) {
        // EXDEV: temp dir and uploads dir are on different filesystems.
        // Fall back to copy + unlink (slower, but works across mounts).
        if (renameErr.code !== 'EXDEV') throw renameErr;
        fs.copyFileSync(req.file.path, finalPath);
        try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
      }
    } catch (moveErr) {
      try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
      console.error('Failed to move uploaded file:', moveErr);
      return res.status(500).json({ error: 'Failed to save uploaded file' });
    }

    const uploadedAt = Date.now();
    const expiresAt = config.fileRetentionDays > 0
      ? uploadedAt + (config.fileRetentionDays * 24 * 60 * 60 * 1000)
      : null;
    let row;
    try {
      const result = uiDb
        .prepare(
          `INSERT INTO session_files (session_id, filename, stored_name, mime_type, size, uploaded_at, expires_at, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'user')`
        )
        .run(
          sessionId,
          req.file.originalname,
          storedName,
          req.file.mimetype || null,
          req.file.size,
          uploadedAt,
          expiresAt
        );
      row = uiDb
        .prepare('SELECT * FROM session_files WHERE id = ?')
        .get(result.lastInsertRowid);
    } catch (dbErr) {
      try { fs.unlinkSync(finalPath); } catch (_) { /* ignore */ }
      console.error('Failed to persist session_files row:', dbErr);
      return res.status(500).json({ error: 'Failed to save file metadata' });
    }

    res.status(201).json(rowToFile(row, projectRoot));
  });
});

// ── GET /api/sessions/:id/files ─────────────────────────────────────────────
router.get('/:id/files', (req, res) => {
  const sessionId = req.params.id;
  if (!sessionId) return res.status(400).json({ error: 'Session id is required' });

  if (!ensureSessionExists(sessionId, res)) return;

  try {
    const rows = uiDb
      .prepare(
        'SELECT * FROM session_files WHERE session_id = ? ORDER BY uploaded_at ASC, id ASC'
      )
      .all(sessionId);
    res.json({ files: rows.map((r) => rowToFile(r, projectRoot)) });
  } catch (err) {
    console.error('Failed to list session files:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ── GET /api/sessions/:id/files/:fileId/content ─────────────────────────────
//
// Task #37: serves file content inline (Content-Disposition: inline) for preview.
// Unlike /download which forces attachment, this lets the browser render if possible.
router.get('/:id/files/:fileId/content', (req, res) => {
  const sessionId = req.params.id;
  const fileId    = parseInt(req.params.fileId, 10);
  if (!sessionId) return res.status(400).json({ error: 'Session id is required' });
  if (!Number.isInteger(fileId)) return res.status(400).json({ error: 'fileId must be an integer' });

  let row;
  try {
    row = uiDb
      .prepare('SELECT * FROM session_files WHERE id = ?')
      .get(fileId);
  } catch (err) {
    console.error('Failed to fetch session_files row:', err);
    return res.status(500).json({ error: 'Failed to fetch file content' });
  }

  if (!row || row.session_id !== sessionId) {
    return res.status(404).json({ error: 'File not found' });
  }

  const source = row.source || 'user';
  let absolutePath;
  if (source === 'agent') {
    absolutePath = row.stored_name;
  } else {
    absolutePath = path.join(uploadsDir, row.session_id, row.stored_name);
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File no longer available' });
  }

  const stat = fs.statSync(absolutePath);
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  const encodedFilename = encodeURIComponent(row.filename);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFilename}`);
  fs.createReadStream(absolutePath).pipe(res);
});

// ── GET /api/sessions/:id/files/:fileId/download ────────────────────────────
//
// Task #24: serves the file content for both user-uploaded files
// (source = 'user', stored_name is a UUID inside data/uploads/<session>/) and
// agent-generated files (source = 'agent', stored_name IS the full absolute
// path on disk that the agent wrote to).
//
// Streams via Express res.download(absolutePath, filename) so the browser
// gets a Content-Disposition: attachment header and triggers a download.
router.get('/:id/files/:fileId/download', (req, res) => {
  const sessionId = req.params.id;
  const fileId    = parseInt(req.params.fileId, 10);
  if (!sessionId) return res.status(400).json({ error: 'Session id is required' });
  if (!Number.isInteger(fileId)) return res.status(400).json({ error: 'fileId must be an integer' });

  let row;
  try {
    row = uiDb
      .prepare('SELECT * FROM session_files WHERE id = ?')
      .get(fileId);
  } catch (err) {
    console.error('Failed to fetch session_files row:', err);
    return res.status(500).json({ error: 'Failed to download file' });
  }

  if (!row || row.session_id !== sessionId) {
    return res.status(404).json({ error: 'File not found' });
  }

  const source = row.source || 'user';
  let absolutePath;
  if (source === 'agent') {
    // Agent files: stored_name is the agent's full absolute path.
    absolutePath = row.stored_name;
  } else {
    absolutePath = path.join(uploadsDir, row.session_id, row.stored_name);
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File no longer available' });
  }

  res.download(absolutePath, row.filename, (err) => {
    if (err && !res.headersSent) {
      console.error('Download failed:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

// ── DELETE /api/sessions/:id/files/:fileId ──────────────────────────────────
router.delete('/:id/files/:fileId', (req, res) => {
  const sessionId = req.params.id;
  const fileId    = parseInt(req.params.fileId, 10);
  if (!sessionId) return res.status(400).json({ error: 'Session id is required' });
  if (!Number.isInteger(fileId)) return res.status(400).json({ error: 'fileId must be an integer' });

  let row;
  try {
    row = uiDb
      .prepare('SELECT * FROM session_files WHERE id = ?')
      .get(fileId);
  } catch (err) {
    console.error('Failed to fetch session_files row:', err);
    return res.status(500).json({ error: 'Failed to delete file' });
  }

  if (!row) return res.status(404).json({ error: 'File not found' });
  if (row.session_id !== sessionId) {
    return res.status(404).json({ error: 'File not found in this session' });
  }

  try {
    // Task #24: for agent-generated files the on-disk file lives at
    // `stored_name` (the agent's absolute path). The file isn't ours to delete
    // — we only remove the DB row so the chat card no longer offers a download.
    if ((row.source || 'user') !== 'agent') {
      try {
        fs.unlinkSync(path.join(uploadsDir, row.session_id, row.stored_name));
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') {
          console.warn('Failed to unlink file (continuing):', unlinkErr.message);
        }
      }
    }
    uiDb.prepare('DELETE FROM session_files WHERE id = ?').run(fileId);
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete session file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
