/**
 * server.js — application entry point
 *
 * Responsibility: open DB connections, run schema migrations, seed data,
 * then start the HTTP listener.  All route logic lives in app.js and the
 * routes/ directory.
 */

import config from './config.js';

// 1. Open DB connections (exits process on fatal error)
import './db/connections.js';

// 2. Run schema migrations
import { uiDb } from './db/connections.js';
import { initSchema } from './db/migrate.js';
initSchema(uiDb);

// 3. Seed starter data
import { seedStarterAssistants, seedStarterApplications } from './db/seed.js';
seedStarterAssistants(uiDb);
seedStarterApplications(uiDb);

// 4. Cleanup expired files (Task #38)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'data', 'uploads');

function cleanupExpiredFiles() {
  if (config.fileRetentionDays <= 0) return;

  const now = Date.now();
  const expired = uiDb.prepare(`
    SELECT id, session_id, stored_name, source FROM session_files
    WHERE expires_at IS NOT NULL AND expires_at < ?
  `).all(now);

  for (const file of expired) {
    try {
      if (file.source === 'agent') {
        fs.unlinkSync(file.stored_name);
      } else {
        fs.unlinkSync(path.join(uploadsDir, file.session_id, file.stored_name));
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('Failed to delete expired file:', err);
    }
    uiDb.prepare('DELETE FROM session_files WHERE id = ?').run(file.id);
  }

  if (expired.length > 0) {
    console.log(`Cleaned up ${expired.length} expired file(s)`);
  }
}

cleanupExpiredFiles();
setInterval(cleanupExpiredFiles, 60 * 60 * 1000);

// 5. Start HTTP server
import app from './app.js';
import { closeAll } from './db/connections.js';

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`1230.UI backend running on port ${PORT}`);
  console.log(`Hermes DB: ${config.hermesDbPath}`);
  console.log(`UI DB:     ${config.uiDbPath}`);
  console.log(`Hermes API: ${config.hermesApiUrl}`);
});

server.on('error', (err) => {
  console.error(`Failed to start server: ${err.message}`);
  closeAll();
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    closeAll();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
