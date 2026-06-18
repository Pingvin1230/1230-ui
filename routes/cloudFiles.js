/**
 * routes/cloudFiles.js
 *
 * List directory contents, issue signed proxy URLs, stream files,
 * and download cloud files directly into session_files (upload pipeline).
 */

import { Router } from 'express';
import { createClient } from 'webdav';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mime from 'mime-types';
import { decrypt, signToken, verifyToken } from '../lib/cloud/crypto.js';
import { uiDb, db } from '../db/connections.js';
import { getMimeTypeForPath } from '../db/fileTypes.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const uploadsDir  = path.join(projectRoot, 'data', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const router = Router();

function getConnection(req, res) {
  const row = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Connection not found' });
    return null;
  }
  return row;
}

function getClient(row) {
  const password = decrypt({ ct: row.credentials_ct, iv: row.credentials_iv, tag: row.credentials_tag });
  return createClient(row.url, {
    username: row.username,
    password,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
}

function entryToCloudEntry(item) {
  const basename = path.basename(item.filename || item.href || '');
  return {
    path: item.filename || item.href || '',
    name: basename,
    isDirectory: item.type === 'directory' || item.mime === 'inode/directory',
    size: item.size ?? null,
    modifiedAt: item.lastmod ? new Date(item.lastmod).getTime() : null,
    mimeType: item.mime || null,
  };
}

// ── GET /api/cloud-connections/:id/list?path=/ ──────────────────────────
router.get('/cloud-connections/:id/list', async (req, res) => {
  const row = getConnection(req, res);
  if (!row) return;

  try {
    const client = getClient(row);
    const dirPath = req.query.path || '/';
    const items = await client.getDirectoryContents(dirPath, { details: false });
    const entries = (items || []).map(entryToCloudEntry);
    res.json({ entries });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to list directory' });
  }
});

// ── GET /api/cloud-connections/:id/stat?path=/file ──────────────────────
router.get('/cloud-connections/:id/stat', async (req, res) => {
  const row = getConnection(req, res);
  if (!row) return;

  try {
    const client = getClient(row);
    const item = await client.stat(req.query.path, { details: false });
    res.json({ entry: entryToCloudEntry(item) });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to stat file' });
  }
});

// ── POST /api/cloud-connections/:id/issue-link ──────────────────────────
router.post('/cloud-connections/:id/issue-link', async (req, res) => {
  const row = getConnection(req, res);
  if (!row) return;

  const { paths, ttlSeconds } = req.body;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'paths array is required' });
  }

  const ttl = ttlSeconds || 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  const links = paths.map((p) => {
    const token = signToken(String(row.id), p, expiresAt);
    const encodedPath = encodeURIComponent(p);
    return {
      path: p,
      urlPath: `/api/cloud/${row.id}/${token}/${expiresAt}/${encodedPath}`,
      filename: path.basename(p),
    };
  });

  res.json({ links, expiresAt });
});

// ── GET /api/cloud/:connectionId/:token/:expiresAt/:encodedPath ─────────
router.get('/cloud/:id/:token/:expiresAt/:encodedPath', async (req, res) => {
  const row = uiDb.prepare('SELECT * FROM cloud_connections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Connection not found' });

  const encodedPath = req.params.encodedPath;
  const decodedPath = decodeURIComponent(encodedPath);
  const expiresAt = parseInt(req.params.expiresAt, 10);

  if (!expiresAt) {
    return res.status(400).json({ error: 'Missing expiration parameter' });
  }

  const valid = verifyToken(req.params.token, String(row.id), decodedPath, expiresAt);
  if (!valid) {
    return res.status(403).json({ error: 'Invalid or expired link' });
  }

  try {
    const client = getClient(row);
    const stat = await client.stat(decodedPath, { details: false });
    const filename = path.basename(decodedPath);
    const mimeType = stat.mime || mime.lookup(filename) || 'application/octet-stream';
    const size = stat.size || null;

    const stream = await client.createReadStream(decodedPath);

    // RFC 5987 encoding for non-ASCII filenames
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    if (size) res.setHeader('Content-Length', String(size));

    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to stream file from cloud' });
      } else {
        res.end();
      }
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: err.message || 'Failed to fetch file' });
    }
  }
});

// ── POST /api/cloud-connections/:id/fetch-to-session ────────────────────
//
// Downloads one or more cloud files into the session upload pipeline.
// Body: { paths: string[], sessionId: string }
// Returns: { files: SessionFile[] }  — same shape as POST /api/sessions/:id/files
//
router.post('/cloud-connections/:id/fetch-to-session', async (req, res) => {
  const row = getConnection(req, res);
  if (!row) return;

  const { paths, sessionId } = req.body;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'paths array is required' });
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  // Verify session exists in Hermes DB
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const sessionDir = path.join(uploadsDir, sessionId);
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create session upload dir:', err);
    return res.status(500).json({ error: 'Failed to create upload directory' });
  }

  const client = getClient(row);
  const results = [];
  const errors = [];

  for (const cloudPath of paths) {
    const filename = path.basename(cloudPath);
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
    const storedName = `${crypto.randomUUID()}${ext}`;
    const finalPath = path.join(sessionDir, storedName);

    try {
      // Stat first to get size and check it doesn't exceed limit
      let size = null;
      let mimeType = getMimeTypeForPath(filename); // reliable: uses our own extension map
      try {
        const stat = await client.stat(cloudPath, { details: false });
        size = stat.size ?? null;
        // Only override with WebDAV mime if it's more specific than octet-stream
        if (stat.mime && stat.mime !== 'application/octet-stream') {
          mimeType = stat.mime;
        }
      } catch {
        // keep mimeType from extension lookup
      }

      if (size !== null && size > MAX_FILE_SIZE) {
        errors.push({ path: cloudPath, error: 'File exceeds 50 MB limit' });
        continue;
      }

      // Stream from WebDAV → disk
      const stream = await client.createReadStream(cloudPath);
      await new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(finalPath);
        let bytesWritten = 0;
        stream.on('data', (chunk) => {
          bytesWritten += chunk.length;
          if (bytesWritten > MAX_FILE_SIZE) {
            dest.destroy();
            stream.destroy();
            fs.unlink(finalPath, () => {});
            reject(new Error('File exceeds 50 MB limit'));
          }
        });
        stream.on('error', reject);
        dest.on('error', reject);
        dest.on('finish', resolve);
        stream.pipe(dest);
      });

      // Get actual size from disk if stat didn't provide it
      if (size === null) {
        try { size = fs.statSync(finalPath).size; } catch { /* ignore */ }
      }

      const uploadedAt = Date.now();
      const expiresAt = config.fileRetentionDays > 0
        ? uploadedAt + (config.fileRetentionDays * 24 * 60 * 60 * 1000)
        : null;

      const insertResult = uiDb.prepare(`
        INSERT INTO session_files (session_id, filename, stored_name, mime_type, size, uploaded_at, expires_at, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
      `).run(sessionId, filename, storedName, mimeType, size, uploadedAt, expiresAt);

      const fileRow = uiDb.prepare('SELECT * FROM session_files WHERE id = ?').get(insertResult.lastInsertRowid);
      results.push({
        id: fileRow.id,
        sessionId: fileRow.session_id,
        filename: fileRow.filename,
        storedName: fileRow.stored_name,
        mimeType: fileRow.mime_type,
        size: fileRow.size,
        uploadedAt: fileRow.uploaded_at,
        path: path.join(projectRoot, 'data', 'uploads', fileRow.session_id, fileRow.stored_name),
      });
    } catch (err) {
      // Clean up partial file if it exists
      try { fs.unlinkSync(finalPath); } catch { /* ignore */ }
      console.error(`Failed to fetch cloud file ${cloudPath}:`, err.message);
      errors.push({ path: cloudPath, error: err.message || 'Failed to fetch file' });
    }
  }

  if (results.length === 0 && errors.length > 0) {
    return res.status(502).json({ error: errors[0].error, errors });
  }

  res.status(201).json({ files: results, errors });
});

export default router;
