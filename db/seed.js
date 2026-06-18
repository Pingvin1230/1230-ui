/**
 * db/seed.js
 *
 * Seeds starter assistants and applications on first run.
 * Safe to call on every startup — exits early if data already exists.
 */

/**
 * @param {import('better-sqlite3').Database} uiDb
 */
export function seedStarterAssistants(uiDb) {
  try {
    const count = uiDb.prepare('SELECT COUNT(*) AS n FROM assistants').get().n;
    if (count > 0) return;

    const enabledModels = uiDb.prepare(`
      SELECT m.id, m.model_id, m.display_name, p.name AS provider_name
      FROM models m
      JOIN providers p ON p.id = m.provider_id
      WHERE m.enabled = 1
      ORDER BY p.id, m.id
    `).all();
    if (enabledModels.length === 0) return;

    const pickWithKeyword = (kws) => enabledModels.find((m) =>
      kws.some((k) => (m.display_name || m.model_id || '').toLowerCase().includes(k))
    );
    const firstOfDifferentProvider = (excludeIds) => {
      const lastProvider = enabledModels.find((m) => excludeIds.includes(m.id))?.provider_name;
      return enabledModels.find((m) => !excludeIds.includes(m.id) && m.provider_name !== lastProvider)
        || enabledModels.find((m) => !excludeIds.includes(m.id));
    };

    const slot1 = enabledModels[0];
    const slot2 = pickWithKeyword(['code', 'coder', 'deepseek'])
      || firstOfDifferentProvider([slot1.id]);
    const slot3 = pickWithKeyword(['max', 'opus', 'creative'])
      || enabledModels.find((m) => m.id !== slot1.id && m.id !== slot2?.id);

    const starters = [
      { name: 'General Assistant', color: 'blue',   icon: '🤖', model_id: slot1.model_id, description: 'Free-form chat with the default model.', style: 'friendly', depth: 'standard' },
      { name: 'Code Helper',       color: 'green',  icon: '💻', model_id: slot2?.model_id ?? slot1.model_id, description: 'Helpful for code reviews, refactoring, and debugging.', style: 'concise', depth: 'thorough' },
    ];
    if (slot3) {
      starters.push({ name: 'Creative Writer', color: 'purple', icon: '✨', model_id: slot3.model_id, description: 'Long-form writing with a more expressive style.', style: 'creative', depth: 'standard' });
    }

    const insert = uiDb.prepare(`
      INSERT INTO assistants (name, description, color, icon, model_id, style, depth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const tx = uiDb.transaction((rows) => {
      for (const r of rows) insert.run(r.name, r.description, r.color, r.icon, r.model_id, r.style, r.depth);
    });
    tx(starters);
    console.log(`Seeded ${starters.length} starter assistant(s).`);
  } catch (err) {
    console.warn(`Failed to seed starter assistants: ${err.message}`);
  }
}

/**
 * Seeds the starter applications (file_preview, file_manager) on startup.
 * Safe to call on every startup — skips if already exists.
 * @param {import('better-sqlite3').Database} uiDb
 */
export function seedStarterApplications(uiDb) {
  try {
    const insert = uiDb.prepare(`
      INSERT OR IGNORE INTO applications (key, name, icon, description, enabled, sort_order, desktop_only, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, '{}')
    `);

    const filePreviewExists = uiDb.prepare("SELECT id FROM applications WHERE key = 'file_preview'").get();
    if (!filePreviewExists) {
      insert.run('file_preview', 'File Preview', 'Eye', 'Preview session files inline', 1, 0, 1);
    }

    const fileManagerExists = uiDb.prepare("SELECT id FROM applications WHERE key = 'file_manager'").get();
    if (!fileManagerExists) {
      insert.run('file_manager', 'File Manager', 'FolderOpen', 'Manage all session files', 1, 1, 1);
    }

    const cloudConnectExists = uiDb.prepare("SELECT id FROM applications WHERE key = 'cloud_connect'").get();
    if (!cloudConnectExists) {
      insert.run('cloud_connect', 'Cloud Connect', 'Cloud', 'Insert cloud file links into chat', 1, 2, 1);
    }

    const tududiExists = uiDb.prepare("SELECT id FROM applications WHERE key = 'tududi'").get();
    if (!tududiExists) {
      insert.run('tududi', 'Tududi', 'ListChecks', 'Tasks, notes and projects from Tududi', 1, 3, 1);
    }

    if (!filePreviewExists || !fileManagerExists || !cloudConnectExists || !tududiExists) {
      console.log('Seeded starter application(s).');
    }
  } catch (err) {
    console.warn(`Failed to seed starter applications: ${err.message}`);
  }
}
