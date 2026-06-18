/**
 * db/connections.js
 *
 * Opens the three SQLite connections used throughout the application and
 * exposes them as named exports.  Import this module once (Node caches it)
 * and destructure whatever you need:
 *
 *   import { db, uiDb, hermesDbWrite } from '../db/connections.js';
 *
 * Connection roles
 * ─────────────────────────────────────────────────────────────────────────
 *  db            — Hermes DB, read-only.  Used for all SELECTs against
 *                  Hermes-managed tables (sessions, messages, models…).
 *                  Opening in readonly mode lets SQLite share WAL
 *                  checkpointing with the Hermes API process without
 *                  interfering with its write transactions.
 *
 *  hermesDbWrite — Hermes DB, writable.  Opened separately in WAL mode so
 *                  that the UI can delete sessions from the Hermes DB
 *                  (Hermes has no delete endpoint).  Non-critical: if this
 *                  open fails the server starts anyway with delete disabled.
 *
 *  uiDb          — UI DB (1230-ui.db), writable.  Stores UI-only state:
 *                  session_meta (pin/archive/assistant), providers, models
 *                  cache, likes, assistants.  Completely separate from the
 *                  Hermes DB so a Hermes upgrade never touches UI state.
 *
 * Startup failure policy
 * ─────────────────────────────────────────────────────────────────────────
 *  If the Hermes DB (readonly) fails to open, the process exits immediately.
 *  If uiDb fails, both Hermes connections are closed before exit so the
 *  SQLite WAL files are left in a clean state.
 *  hermesDbWrite failures are non-fatal (logged as warnings).
 */

import Database from 'better-sqlite3';
import config from '../config.js';

const HERMES_DB_PATH = config.hermesDbPath;
const UI_DB_PATH = config.uiDbPath;
const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

let db, uiDb, hermesDbWrite;

// ── Hermes DB (readonly) ───────────────────────────────────────────────────
try {
  db = new Database(HERMES_DB_PATH, { readonly: true });
  console.log(`Connected to Hermes DB: ${HERMES_DB_PATH}`);
} catch (error) {
  if (!isTest) {
    console.error(`Failed to connect to Hermes DB: ${error}`);
    process.exit(1);
  }
  console.warn(`[db] Hermes DB not opened in test mode: ${error}`);
}

// ── Hermes DB (writable, non-critical) ────────────────────────────────────
try {
  hermesDbWrite = new Database(HERMES_DB_PATH);
  hermesDbWrite.pragma('journal_mode = WAL');
  hermesDbWrite.pragma('busy_timeout = 1000');
  console.log(`Connected to Hermes DB (writable): ${HERMES_DB_PATH}`);
} catch (error) {
  console.warn(`Failed to open writable Hermes DB connection (delete disabled): ${error}`);
}

// ── UI DB (writable) ──────────────────────────────────────────────────────
try {
  uiDb = new Database(UI_DB_PATH);
  console.log(`Connected to UI DB: ${UI_DB_PATH}`);
} catch (error) {
  if (!isTest) {
    console.error(`Failed to connect to UI DB: ${error}`);
    try { hermesDbWrite?.close(); } catch (_) { /* ignore */ }
    try { db?.close(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
  console.warn(`[db] UI DB not opened in test mode: ${error}`);
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
export function closeAll() {
  db?.close();
  hermesDbWrite?.close();
  uiDb?.close();
}

export { db, uiDb, hermesDbWrite };
