/**
 * db/migrate.js
 *
 * Creates all UI DB tables and runs idempotent column migrations.
 * Call initSchema(uiDb) once at startup after the connection is open.
 */

/**
 * @param {import('better-sqlite3').Database} uiDb
 */
export function initSchema(uiDb) {
  // ── Base tables ───────────────────────────────────────────────────────────
  uiDb.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT,
      env_var TEXT,
      base_url TEXT,
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT,
      enabled INTEGER DEFAULT 1,
      UNIQUE(provider_id, model_id),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS session_meta (
      session_id TEXT PRIMARY KEY,
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_hash TEXT NOT NULL,
      user_agent TEXT,
      country TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_likes_user_hash ON likes(user_hash, created_at);

    CREATE TABLE IF NOT EXISTS assistants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      icon TEXT,
      model_id TEXT,
      is_archived INTEGER DEFAULT 0,
      archived_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_assistants_archived ON assistants(is_archived);
    CREATE INDEX IF NOT EXISTS idx_assistants_model ON assistants(model_id);

    CREATE TABLE IF NOT EXISTS session_files (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      filename    TEXT    NOT NULL,
      stored_name TEXT    NOT NULL,
      mime_type   TEXT,
      size        INTEGER NOT NULL,
      uploaded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_files_session ON session_files(session_id);
  `);

  // ── Idempotent column migrations ──────────────────────────────────────────
  // SQLite has no "ADD COLUMN IF NOT EXISTS" so we check PRAGMA table_info first.

  // assistants: style, depth
  const assistantColumns = new Set(
    uiDb.prepare('PRAGMA table_info(assistants)').all().map((c) => c.name)
  );
  const assistantColumnAdds = [
    { name: 'style',         sql: "ALTER TABLE assistants ADD COLUMN style TEXT DEFAULT NULL" },
    { name: 'depth',         sql: "ALTER TABLE assistants ADD COLUMN depth TEXT DEFAULT NULL" },
    { name: 'system_prompt', sql: "ALTER TABLE assistants ADD COLUMN system_prompt TEXT DEFAULT NULL" },
  ];
  for (const col of assistantColumnAdds) {
    if (!assistantColumns.has(col.name)) {
      try {
        uiDb.exec(col.sql);
        console.log(`Added column assistants.${col.name}`);
      } catch (err) {
        console.warn(`Failed to add column assistants.${col.name}: ${err.message}`);
      }
    }
  }

  // session_meta.assistant_id
  const sessionMetaColumns = new Set(
    uiDb.prepare('PRAGMA table_info(session_meta)').all().map((c) => c.name)
  );
  if (!sessionMetaColumns.has('assistant_id')) {
    try {
      uiDb.exec('ALTER TABLE session_meta ADD COLUMN assistant_id INTEGER REFERENCES assistants(id) ON DELETE SET NULL');
      uiDb.exec('CREATE INDEX IF NOT EXISTS idx_session_meta_assistant ON session_meta(assistant_id)');
      console.log('Added column session_meta.assistant_id');
    } catch (err) {
      console.warn(`Failed to add column session_meta.assistant_id: ${err.message}`);
    }
  }

  // session_files: source
  const sessionFilesColumns = new Set(
    uiDb.prepare('PRAGMA table_info(session_files)').all().map((c) => c.name)
  );
  if (!sessionFilesColumns.has('source')) {
    try {
      uiDb.exec("ALTER TABLE session_files ADD COLUMN source TEXT NOT NULL DEFAULT 'user'");
    } catch (err) {
      console.warn(`Failed to add column session_files.source: ${err.message}`);
    }
  }

  // providers: description, signup_url, auth_type
  const existingColumns = new Set(
    uiDb.prepare('PRAGMA table_info(providers)').all().map((c) => c.name)
  );
  const providerColumnAdds = [
    { name: 'description', sql: 'ALTER TABLE providers ADD COLUMN description TEXT' },
    { name: 'signup_url',  sql: 'ALTER TABLE providers ADD COLUMN signup_url TEXT' },
    { name: 'auth_type',   sql: "ALTER TABLE providers ADD COLUMN auth_type TEXT DEFAULT 'api_key'" },
  ];
  for (const col of providerColumnAdds) {
    if (!existingColumns.has(col.name)) {
      try {
        uiDb.exec(col.sql);
        console.log(`Added column providers.${col.name}`);
      } catch (err) {
        console.warn(`Failed to add column providers.${col.name}: ${err.message}`);
      }
    }
  }

  console.log('UI DB tables initialized');
}
