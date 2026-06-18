/**
 * lib/systemSettings.js
 *
 * Thin wrapper around the `system_settings` table (key/value store used for
 * executor config, Tududi config, etc.). Centralises the SELECT/UPSERT pattern
 * that was previously duplicated across routes/system.js and routes/tududi.js.
 *
 * All values are stored as TEXT. Callers are responsible for type coercion
 * (e.g. parsing numbers) and for encrypting secrets before writing them.
 */

import { uiDb } from '../db/connections.js';

export function getSetting(key) {
  const row = uiDb.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function upsertSetting(key, value, now = Date.now()) {
  uiDb.prepare(
    'INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)',
  ).run(key, value, now);
}

export function getSettings(keys) {
  const placeholders = keys.map(() => '?').join(',');
  const rows = uiDb.prepare(`SELECT key, value FROM system_settings WHERE key IN (${placeholders})`).all(...keys);
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * Wrap multiple setting writes in a single SQLite transaction.
 * Thin pass-through to better-sqlite3's `db.transaction(fn)`. Exposed here so
 * callers (e.g. routes/tududi.js, routes/system.js) don't need to import uiDb
 * directly — system_settings stays the single responsibility of this module.
 */
export function transaction(fn) {
  return uiDb.transaction(fn);
}
