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
import { seedStarterAssistants } from './db/seed.js';
seedStarterAssistants(uiDb);

// 4. Start HTTP server
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
