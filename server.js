import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import helmet from 'helmet';
import cors from 'cors';
import config from './config.js';
import { apiLimiter, chatLimiter, execLimiter, likeLimiter, providerLimiter, sanitizeMiddleware } from './middleware/security.js';
// geoip-lite is an optional heavy dependency (~30 MB of MaxMind data).
// It is imported lazily at runtime so the server starts fine even if the
// package is absent (e.g. in CI or stripped production images).
// Set DISABLE_GEOIP=true to skip the lookup regardless of whether the
// package is installed.
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port;
const HERMES_DB_PATH = config.hermesDbPath;
const UI_DB_PATH = config.uiDbPath;
const HERMES_API_URL = config.hermesApiUrl;
const HERMES_API_KEY = config.hermesApiKey;
const HERMES_PYTHON_PATH = config.hermesPythonPath;
const HERMES_AGENT_PATH = config.hermesAgentPath;
const LIKES_WEBHOOK_URL = config.likesWebhookUrl;
const LIKES_COOLDOWN_SEC = config.likesCooldownSec;
const SAVE_MESSAGES_SCRIPT = config.scripts.saveMessages;
const SYNC_PROVIDERS_SCRIPT = config.scripts.syncProviders;
const MANAGE_PROVIDER_KEY_SCRIPT = path.join(__dirname, 'scripts', 'manage_provider_key.py');
const LIST_BUNDLED_PROVIDERS_SCRIPT = path.join(__dirname, 'scripts', 'list_bundled_providers.py');

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

app.use(express.json());
app.use(sanitizeMiddleware);
app.use(express.static(path.join(__dirname, 'dist')));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    const logEntry = {
      level: logLevel,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    };
    if (res.statusCode >= 400) {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
    return originalJson(body);
  };
  next();
});

// --- Database connections ---
//
// Three SQLite connections are opened at startup:
//
//   db            — Hermes DB, read-only.  Used for all SELECTs against
//                   Hermes-managed tables (sessions, messages, models…).
//                   Opening in readonly mode lets SQLite share the WAL
//                   checkpointing with the Hermes API process without
//                   interfering with its write transactions.
//
//   hermesDbWrite — Hermes DB, writable.  Opened separately in WAL mode so
//                   that the UI can delete sessions from the Hermes DB
//                   (Hermes has no delete endpoint).  Non-critical: if this
//                   open fails the server starts anyway with delete disabled.
//
//   uiDb          — UI DB (1230-ui.db), writable.  Stores UI-only state:
//                   session_meta (pin/archive/assistant), providers, models
//                   cache, likes, assistants.  Completely separate from the
//                   Hermes DB so a Hermes upgrade never touches UI state.
//
// Cleanup: if uiDb fails to open, db and hermesDbWrite are closed before
// process.exit so the SQLite WAL files are left in a clean state.

let db, uiDb, hermesDbWrite;
try {
  db = new Database(HERMES_DB_PATH, { readonly: true });
  console.log(`Connected to Hermes DB: ${HERMES_DB_PATH}`);
} catch (error) {
  console.error(`Failed to connect to Hermes DB: ${error}`);
  process.exit(1);
}

try {
  hermesDbWrite = new Database(HERMES_DB_PATH);
  hermesDbWrite.pragma('journal_mode = WAL');
  hermesDbWrite.pragma('busy_timeout = 1000');
  console.log(`Connected to Hermes DB (writable): ${HERMES_DB_PATH}`);
} catch (error) {
  console.warn(`Failed to open writable Hermes DB connection (delete disabled): ${error}`);
}

try {
  uiDb = new Database(UI_DB_PATH);
  console.log(`Connected to UI DB: ${UI_DB_PATH}`);
  
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
  `);

  // Idempotent column add for session_meta.assistant_id
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

  // Idempotent column migrations for the `providers` table.
  // SQLite has no "ADD COLUMN IF NOT EXISTS" so we check pragma table_info first.
  const existingColumns = new Set(
    uiDb.prepare('PRAGMA table_info(providers)').all().map((c) => c.name)
  );
  const providerColumnAdds = [
    { name: 'description', sql: 'ALTER TABLE providers ADD COLUMN description TEXT' },
    { name: 'signup_url', sql: 'ALTER TABLE providers ADD COLUMN signup_url TEXT' },
    { name: 'auth_type', sql: "ALTER TABLE providers ADD COLUMN auth_type TEXT DEFAULT 'api_key'" },
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

  // Seed starter assistants on first run only.
  seedStarterAssistants();
} catch (error) {
  console.error(`Failed to connect to UI DB: ${error}`);
  // Close the already-opened Hermes DB connections so SQLite WAL files are
  // left in a clean state before the process exits.
  try { hermesDbWrite?.close(); } catch (_) { /* ignore */ }
  try { db?.close(); } catch (_) { /* ignore */ }
  process.exit(1);
}

function seedStarterAssistants() {
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

    const pickWithKeyword = (kws) => enabledModels.find(m =>
      kws.some(k => (m.display_name || m.model_id || '').toLowerCase().includes(k))
    );
    const firstOfDifferentProvider = (excludeIds) => {
      const lastProvider = enabledModels.find(m => excludeIds.includes(m.id))?.provider_name;
      return enabledModels.find(m => !excludeIds.includes(m.id) && m.provider_name !== lastProvider)
        || enabledModels.find(m => !excludeIds.includes(m.id));
    };

    const slot1 = enabledModels[0];
    const slot2 = pickWithKeyword(['code', 'coder', 'deepseek'])
      || firstOfDifferentProvider([slot1.id]);
    const slot3 = pickWithKeyword(['max', 'opus', 'creative'])
      || enabledModels.find(m => m.id !== slot1.id && m.id !== slot2.id);

    const starters = [
      { key: 'general', name: 'General Assistant', color: 'blue',   icon: '🤖', model_id: slot1.model_id, description: 'Free-form chat with the default model.' },
      { key: 'code',    name: 'Code Helper',        color: 'green',  icon: '💻', model_id: slot2.model_id, description: 'Helpful for code reviews, refactoring, and debugging.' },
    ];
    if (slot3) {
      starters.push({ key: 'creative', name: 'Creative Writer', color: 'purple', icon: '✨', model_id: slot3.model_id, description: 'Long-form writing with a more expressive style.' });
    }

    const insert = uiDb.prepare(`
      INSERT INTO assistants (name, description, color, icon, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const tx = uiDb.transaction((rows) => { for (const r of rows) insert.run(r.name, r.description, r.color, r.icon, r.model_id); });
    tx(starters);
    console.log(`Seeded ${starters.length} starter assistant(s).`);
  } catch (err) {
    console.warn(`Failed to seed starter assistants: ${err.message}`);
  }
}

app.get('/api/system/status', async (req, res) => {
  try {
    // Check Hermes API connection
    let hermesStatus = 'disconnected';
    let hermesVersion = 'Unknown';
    let updateAvailable = null;
    
    try {
      const response = await fetch(`${HERMES_API_URL}/health`, {
        headers: { 'Authorization': `Bearer ${HERMES_API_KEY}` },
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        hermesStatus = 'connected';
      }
    } catch (error) {
      console.error('Hermes API health check failed:', error.message);
    }

    // Get Hermes version info
    // Use execFile (async) instead of execSync to avoid blocking the event loop
    // while the shell process runs.
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const { stdout: versionOutput } = await execFileAsync('hermes', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const versionMatch = versionOutput.match(/Hermes Agent (v[\d.]+(?:\s*\([\d.]+\))?)/);
      if (versionMatch) {
        hermesVersion = versionMatch[1];
      }
      const updateMatch = versionOutput.match(/Update available:\s*(\d+)\s*commits behind/);
      if (updateMatch) {
        updateAvailable = parseInt(updateMatch[1]);
      }
    } catch (error) {
      console.error('Failed to get Hermes version:', error.message);
    }

    // Get connected providers
    const providers = uiDb.prepare(`
      SELECT name, display_name, sync_status, last_synced_at
      FROM providers
      ORDER BY name
    `).all();

    // Get total sessions count
    const sessionsCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get();

    // Get latest version from GitHub (with caching)
    const CACHE_TTL = 3600000; // 1 hour in milliseconds
    let latestVersion = null;
    
    try {
      const cacheKey = 'latest_hermes_version';
      const cached = uiDb.prepare('SELECT value, updated_at FROM cache WHERE key = ?').get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.updated_at) < CACHE_TTL) {
        latestVersion = cached.value;
      } else {
        const githubResponse = await fetch('https://api.github.com/repos/NousResearch/hermes-agent/releases/latest', {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': '1230-ui/1.0'
          },
          signal: AbortSignal.timeout(10000)
        });
        
        if (githubResponse.ok) {
          const githubData = await githubResponse.json();
          latestVersion = githubData.tag_name || githubData.name;
          
          // Update cache
          uiDb.prepare('INSERT OR REPLACE INTO cache (key, value, updated_at) VALUES (?, ?, ?)').run(cacheKey, latestVersion, now);
        }
      }
    } catch (error) {
      console.error('Failed to fetch latest version from GitHub:', error.message);
    }

    res.json({
      hermes: {
        status: hermesStatus,
        version: hermesVersion,
        updateAvailable: updateAvailable,
        latestVersion: latestVersion
      },
      providers: providers.map(p => ({
        name: p.name,
        displayName: p.display_name,
        syncStatus: p.sync_status,
        lastSyncedAt: p.last_synced_at
      })),
      stats: {
        totalSessions: sessionsCount.count
      }
    });
  } catch (error) {
    console.error('Error fetching system status:', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

// Execute Hermes commands
app.post('/api/system/exec', execLimiter, async (req, res) => {
  const { command } = req.body;
  
  if (!['update', 'doctor'].includes(command)) {
    return res.status(400).json({ error: 'Invalid command' });
  }

  try {
    const { spawn } = await import('child_process');
    
    let cmd, args;
    if (command === 'update') {
      cmd = 'hermes';
      args = ['update', '--yes'];
    } else {
      cmd = 'hermes';
      args = ['doctor', '--fix'];
    }

    const child = spawn(cmd, args, {
      cwd: HERMES_AGENT_PATH,
      env: { ...process.env, PATH: process.env.PATH }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const output = stdout + stderr;
      const lines = output.split('\n').filter(l => l.trim());
      const summary = lines.slice(-10).join('\n'); // Last 10 lines
      
      res.json({
        success: code === 0,
        exitCode: code,
        output: summary,
        fullOutput: output
      });
    });

    child.on('error', (error) => {
      res.status(500).json({
        success: false,
        error: error.message
      });
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/sessions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const includeArchived = req.query.includeArchived === '1';
    const sortRaw = req.query.sort;
    const sort = sortRaw === 'lastMessage' ? 'lastMessage' : 'created';

    const orderBy = sort === 'lastMessage'
      ? 'COALESCE(lastMessageAt, s.started_at) DESC, s.started_at DESC'
      : 's.started_at DESC';

    const sessions = db.prepare(`
      SELECT 
        s.id,
        s.title,
        s.source,
        s.model,
        s.started_at as startedAt,
        s.ended_at as endedAt,
        s.message_count as messageCount,
        s.input_tokens as inputTokens,
        s.output_tokens as outputTokens,
        (SELECT content FROM messages 
         WHERE session_id = s.id AND role = 'user' 
         ORDER BY timestamp ASC LIMIT 1) as preview,
        (SELECT MAX(timestamp) FROM messages 
         WHERE session_id = s.id) as lastMessageAt
      FROM sessions s
      ORDER BY ${orderBy}
    `).all();

    const metaAll = uiDb.prepare('SELECT session_id, pinned, archived, assistant_id FROM session_meta').all();
    const metaMap = {};
    for (const m of metaAll) {
      metaMap[m.session_id] = m;
    }

    const assistantIds = [...new Set(metaAll.map(m => m.assistant_id).filter(id => id != null))];
    const assistantMap = {};
    if (assistantIds.length > 0) {
      const placeholders = assistantIds.map(() => '?').join(',');
      const rows = uiDb.prepare(`SELECT * FROM assistants WHERE id IN (${placeholders})`).all(...assistantIds);
      for (const a of rows) assistantMap[a.id] = a;
    }

    let filtered = sessions.map(s => {
      const meta = metaMap[s.id];
      const assistant = meta?.assistant_id ? assistantMap[meta.assistant_id] : null;
      return {
        ...s,
        lastMessageAt: s.lastMessageAt ?? null,
        pinned: meta?.pinned ?? 0,
        archived: meta?.archived ?? 0,
        assistant: assistant ? rowToAssistant(assistant) : null,
      };
    });

    if (!includeArchived) {
      filtered = filtered.filter(s => s.archived !== 1);
    }

    const total = filtered.length;

    const sortKey = sort === 'lastMessage'
      ? (s) => (s.lastMessageAt != null ? s.lastMessageAt : s.startedAt)
      : (s) => s.startedAt;
    const sortFn = (a, b) => sortKey(b) - sortKey(a);

    const pinned = filtered.filter(s => s.pinned === 1).sort(sortFn);
    const notPinned = filtered.filter(s => s.pinned !== 1).sort(sortFn);
    const sorted = [...pinned, ...notPinned];

    const paged = sorted.slice(offset, offset + limit);

    res.json({ sessions: paged, total, limit, offset });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = db.prepare(`
      SELECT
        id,
        title,
        source,
        model,
        started_at as startedAt,
        ended_at as endedAt,
        message_count as messageCount,
        input_tokens as inputTokens,
        output_tokens as outputTokens
      FROM sessions
      WHERE id = ?
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

    // Fallback: fetch from Hermes API (for newly created sessions not yet in state.db)
    try {
      const response = await fetch(`${HERMES_API_URL}/api/sessions/${req.params.id}`, {
        headers: { 'Authorization': `Bearer ${HERMES_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const s = data.session;
        // Even for fallback path, try to attach assistant from session_meta
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

app.patch('/api/sessions/:id/title', (req, res) => {
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
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const trimmedTitle = title.trim();

    try {
      hermesDbWrite.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(trimmedTitle, sessionId);
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE constraint failed')) {
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

app.delete('/api/sessions/:id', (req, res) => {
  try {
    if (!hermesDbWrite) {
      return res.status(503).json({ error: 'Session deletion unavailable — writable DB connection failed' });
    }

    const sessionId = req.params.id;

    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const run = hermesDbWrite.transaction(() => {
      hermesDbWrite.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      hermesDbWrite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    });
    run();

    uiDb.prepare('DELETE FROM session_meta WHERE session_id = ?').run(sessionId);

    res.json({ success: true, deletedSessionId: sessionId });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

app.patch('/api/sessions/:id/pin', (req, res) => {
  try {
    const sessionId = req.params.id;

    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const meta = uiDb.prepare('SELECT pinned FROM session_meta WHERE session_id = ?').get(sessionId);
    const currentValue = meta ? meta.pinned : 0;
    const newValue = currentValue ? 0 : 1;

    uiDb.prepare('INSERT OR REPLACE INTO session_meta (session_id, pinned) VALUES (?, ?)').run(sessionId, newValue);

    res.json({ success: true, pinned: newValue });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

app.patch('/api/sessions/:id/archive', (req, res) => {
  try {
    const sessionId = req.params.id;

    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const meta = uiDb.prepare('SELECT archived FROM session_meta WHERE session_id = ?').get(sessionId);
    const currentValue = meta ? meta.archived : 0;
    const newValue = currentValue ? 0 : 1;

    uiDb.prepare('INSERT OR REPLACE INTO session_meta (session_id, archived) VALUES (?, ?)').run(sessionId, newValue);

    res.json({ success: true, archived: newValue });
  } catch (error) {
    console.error('Error toggling archive:', error);
    res.status(500).json({ error: 'Failed to toggle archive' });
  }
});

app.delete('/api/sessions/bulk', (req, res) => {
  try {
    if (!hermesDbWrite) {
      return res.status(503).json({ error: 'Bulk deletion unavailable — writable DB connection failed' });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    const run = hermesDbWrite.transaction((sessionId) => {
      hermesDbWrite.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      hermesDbWrite.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      uiDb.prepare('DELETE FROM session_meta WHERE session_id = ?').run(sessionId);
    });

    let deletedCount = 0;
    for (const id of ids) {
      try {
        run(id);
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

app.get('/api/sessions/:id/messages', (req, res) => {
  try {
    const messages = db.prepare(`
      SELECT 
        id,
        session_id as sessionId,
        role,
        content,
        tool_call_id as toolCallId,
        tool_calls as toolCalls,
        tool_name as toolName,
        timestamp,
        token_count as tokenCount
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `).all(req.params.id);

    const parsed = messages.map((msg) => ({
      ...msg,
      toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : null
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/models', (req, res) => {
  try {
    const providers = uiDb.prepare(`
      SELECT 
        id, name, display_name
      FROM providers
      ORDER BY name
    `).all();

    const providersMap = {};
    let defaultModel = null;

    providers.forEach(provider => {
      const models = uiDb.prepare(`
        SELECT model_id, display_name
        FROM models
        WHERE provider_id = ? AND enabled = 1
        ORDER BY model_id
      `).all(provider.id);

      if (models.length > 0) {
        providersMap[provider.name] = {
          id: provider.name,
          name: provider.display_name || provider.name,
          models: models.map(m => ({
            id: m.model_id,
            name: m.display_name || m.model_id
          }))
        };

        if (!defaultModel && models.length > 0) {
          defaultModel = {
            id: models[0].model_id,
            name: models[0].display_name || models[0].model_id,
            provider: provider.name
          };
        }
      }
    });

    res.json({
      default: defaultModel,
      providers: providersMap
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  const { messages, session_id, model, stream = true } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        type: 'invalid_request',
        message: 'Invalid request format',
        details: 'messages array is required',
        retryable: false
      }
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${HERMES_API_KEY}`
  };

  if (session_id) {
    headers['X-Hermes-Session-Id'] = session_id;
  }

  if (model) {
    headers['X-Hermes-Model'] = model;
  }

  try {
    const response = await fetch(`${HERMES_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'hermes-agent',
        messages,
        stream,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hermes API error:', response.status, errorText);

      let parsedError = {};
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = { error: { message: errorText } };
      }

      const errorObj = parsedError.error || {};
      const errorMessage = errorObj.message || 'Unknown provider error';
      const errorCode = errorObj.code || '';

      // Determine error type
      let errorType = 'provider_error';
      let retryable = false;
      let suggestion = '';

      if (response.status === 429) {
        errorType = 'rate_limit';
        retryable = true;
          suggestion = `Rate limit exceeded (code: ${response.status} ${errorCode || 'rate_limited'}). Please try again in a few seconds.`;
      } else if (response.status === 400) {
        if (errorMessage.includes('DataInspectionFailed') || errorMessage.includes('inappropriate content')) {
          errorType = 'content_moderation';
          retryable = false;
          suggestion = `Request blocked by provider security filter (code: ${errorCode || response.status}). Try rephrasing or choose a different model.`;
        } else {
        errorType = 'invalid_request';
        retryable = false;
        suggestion = `Invalid request format (code: ${errorCode || response.status}).`;
        }
      } else if (response.status >= 500) {
        errorType = 'server_error';
        retryable = true;
        suggestion = `Server-side error (code: ${response.status}). Please try again.`;
      } else if (response.status === 401 || response.status === 403) {
        errorType = 'auth_error';
        retryable = false;
        suggestion = `Authentication error (code: ${response.status}). Check API key settings.`;
      }

      return res.status(response.status).json({
        error: {
          type: errorType,
          message: 'Provider error',
          provider: model ? getProviderFromModel(model) : 'unknown',
          model: model || 'unknown',
          details: errorMessage,
          code: errorCode,
          retryable,
          suggestion
        }
      });
    }

    if (stream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Send processing start status
      res.write(`data: ${JSON.stringify({ type: 'status', status: 'thinking' })}\n\n`);

      let isFirstChunk = true;
      let streamFinished = false;
      const activeToolCalls = new Map(); // Track tool calls by toolCallId
      let currentEventType = null; // Track current SSE event type

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          // Send generating status on first chunk
          if (isFirstChunk) {
            res.write(`data: ${JSON.stringify({ type: 'status', status: 'generating' })}\n\n`);
            isFirstChunk = false;
          }

          // Parse SSE lines to extract tool calls
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              
              // Handle Hermes tool progress events
              if (currentEventType === 'hermes.tool.progress') {
                try {
                  const toolEvent = JSON.parse(data);
                  const toolCallId = toolEvent.toolCallId;
                  const toolName = toolEvent.tool;
                  const status = toolEvent.status;
                  
                  if (status === 'running') {
                    // Tool call started
                    activeToolCalls.set(toolCallId, {
                      id: toolCallId,
                      toolName: toolName,
                      label: toolEvent.label || ''
                    });
                    res.write(`data: ${JSON.stringify({
                      type: 'tool_call_start',
                      id: toolCallId,
                      toolName: toolName,
                      label: toolEvent.label
                    })}\n\n`);
                  } else if (status === 'completed') {
                    // Tool call completed
                    res.write(`data: ${JSON.stringify({
                      type: 'tool_call_end',
                      id: toolCallId
                    })}\n\n`);
                    activeToolCalls.delete(toolCallId);
                  }
                } catch (e) {
                  // Ignore parse errors for non-JSON data
                }
                currentEventType = null;
                continue;
              }
              
              currentEventType = null;
            }
          }

          // Always proxy the original chunk
          res.write(chunk);
        }
        streamFinished = true;
      } catch (streamError) {
        console.error('Stream error:', streamError);
        const cause = streamError.cause || streamError;
        const isNetworkError = cause.code === 'ECONNREFUSED' || cause.code === 'ENOTFOUND' || streamError.name === 'FetchError';

        const errorData = JSON.stringify({
          error: {
            type: isNetworkError ? 'network' : 'server_error',
            message: isNetworkError ? 'Hermes API unavailable' : 'Connection interrupted',
            details: streamError.message || cause.message || 'Unknown error',
            retryable: true,
            suggestion: isNetworkError
              ? 'Hermes API Server is restarting. Please try again in a few seconds.'
              : 'Please try again.'
          }
        });
        res.write(`data: ${errorData}\n\n`);
        streamFinished = true;
      } finally {
        res.end();
      }

      // Don't fall into general catch if stream already handled
      return;
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Error proxying to Hermes API:', error);

    const cause = error.cause || error;
    const isNetworkError = cause.code === 'ECONNREFUSED' || cause.code === 'ENOTFOUND' || error.name === 'FetchError';
    const isTimeout = error.name === 'AbortError' || cause.code === 'ETIMEDOUT';
    const errorCode = cause.code || error.code || 'UNKNOWN';

    res.status(502).json({
      error: {
        type: isTimeout ? 'timeout' : isNetworkError ? 'network' : 'server_error',
        message: isTimeout
          ? 'Response timeout exceeded'
          : isNetworkError
            ? 'Hermes API unavailable'
            : 'Internal server error',
        details: `${error.message} (code: ${errorCode})`,
        code: errorCode,
        retryable: isNetworkError || isTimeout,
        suggestion: isNetworkError
          ? 'Check that Hermes API Server is running.'
          : isTimeout
            ? 'Please try again or simplify the request.'
            : 'Please try again.'
      }
    });
  }
});

function getProviderFromModel(model) {
  const modelLower = model.toLowerCase();
  if (modelLower.includes('minimax')) return 'minimax';
  if (modelLower.includes('qwen')) return 'opencode-go';
  if (modelLower.includes('kimi')) return 'opencode-go';
  if (modelLower.includes('glm')) return 'opencode-go';
  if (modelLower.includes('deepseek')) return 'opencode-go';
  if (modelLower.includes('claude')) return 'opencode-go';
  if (modelLower.includes('gpt')) return 'opencode-go';
  if (modelLower.includes('gemini')) return 'opencode-go';
  return 'unknown';
}

app.get('/api/health', async (req, res) => {
  let hermesApiStatus = 'unknown';
  try {
    const response = await fetch(`${HERMES_API_URL}/health`, {
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`
      },
      signal: AbortSignal.timeout(3000)
    });
    hermesApiStatus = response.ok ? 'ok' : 'error';
  } catch {
    hermesApiStatus = 'unreachable';
  }

  res.json({ 
    status: 'ok', 
    dbConnected: !!db,
    hermesApi: hermesApiStatus,
    hermesApiUrl: HERMES_API_URL,
    timestamp: Date.now()
  });
});

// Save message to database
app.post('/api/messages', apiLimiter, async (req, res) => {
  const { sessionId, role, content, toolName } = req.body;

  if (!sessionId || !role || !content) {
    return res.status(400).json({ error: 'sessionId, role, and content are required' });
  }

  try {
    const { spawn } = await import('child_process');
    const args = [SAVE_MESSAGES_SCRIPT, sessionId, role, content];
    if (toolName) args.push(toolName);

    const pythonProcess = spawn(HERMES_PYTHON_PATH, args, {
      cwd: __dirname,
      env: { ...process.env, HERMES_DB_PATH }
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

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
});

// Create new session
app.post('/api/sessions', apiLimiter, async (req, res) => {
  let { model, title, assistantId } = req.body;

  // If an assistantId is provided, resolve the model from the assistant.
  // assistant.model_id is optional — if null/empty we fall back to the
  // global default (first enabled model in the UI DB).
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
      const modelRow = uiDb.prepare(
        'SELECT 1 FROM models WHERE model_id = ? AND enabled = 1'
      ).get(assistant.model_id);
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

  if (!model) {
    model = getDefaultModelId();
  }

  if (!model) {
    return res.status(400).json({ error: 'model is required and no default model is available' });
  }

  try {
    const sessionId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const response = await fetch(`${HERMES_API_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: sessionId, model, title, source: '1230UI' })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hermes API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to create session', 
        details: errorText 
      });
    }

    const data = await response.json();
    const returnedId = data.session?.id;

    if (!returnedId) {
      return res.status(500).json({ error: 'No session ID in response' });
    }

    // Wait for Hermes to sync session to state.db (up to 5 seconds)
    for (let attempt = 0; attempt < 10; attempt++) {
      const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
      if (session) break;
      await new Promise(r => setTimeout(r, 500));
    }

    // Persist the assistant link in session_meta so we can show the badge
    // and resolve the name even if the assistant is later archived/edited.
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

app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await fetch(`${HERMES_API_URL}/api/sessions/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hermes API delete error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to delete session', 
        details: errorText 
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;

  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title is required and must be a string' });
  }

  try {
    const response = await fetch(`${HERMES_API_URL}/api/sessions/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hermes API update error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to update session title', 
        details: errorText 
      });
    }

    const data = await response.json();
    res.json(data.session);
  } catch (error) {
    console.error('Error updating session title:', error);
    res.status(500).json({ error: 'Failed to update session title' });
  }
});

// Get all providers with their models
app.get('/api/models/providers', (req, res) => {
  try {
    const providers = uiDb.prepare(`
      SELECT 
        id, name, display_name, env_var, base_url, 
        sync_status, last_synced_at
      FROM providers
      ORDER BY name
    `).all();

    const providersWithModels = providers.map(provider => {
      const models = uiDb.prepare(`
        SELECT id, model_id, display_name, enabled
        FROM models
        WHERE provider_id = ?
        ORDER BY model_id
      `).all(provider.id);

      return {
        ...provider,
        models,
        enabledCount: models.filter(m => m.enabled).length,
        totalCount: models.length
      };
    });

    res.json(providersWithModels);
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Sync providers from Hermes
app.post('/api/models/sync', apiLimiter, async (req, res) => {
  try {
    const { spawn } = await import('child_process');
    
    const pythonProcess = spawn(HERMES_PYTHON_PATH, [SYNC_PROVIDERS_SCRIPT], {
      cwd: __dirname,
      env: { ...process.env, UI_DB_PATH }
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          res.json({ success: true, ...result });
        } catch (error) {
          console.error('Error parsing sync result:', error);
          res.json({ success: true, message: stdout.trim() });
        }
      } else {
        console.error('Python sync error:', stderr);
        res.status(500).json({ error: 'Failed to sync providers', details: stderr });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('Failed to spawn Python process:', error);
      res.status(500).json({ error: 'Failed to execute sync script' });
    });

  } catch (error) {
    console.error('Error syncing providers:', error);
    res.status(500).json({ error: 'Failed to sync providers' });
  }
});

// Toggle model enabled/disabled
app.patch('/api/models/models/:id/toggle', (req, res) => {
  try {
    const model = uiDb.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const newEnabled = model.enabled ? 0 : 1;
    uiDb.prepare('UPDATE models SET enabled = ? WHERE id = ?').run(newEnabled, req.params.id);

    res.json({ success: true, id: req.params.id, enabled: newEnabled });
  } catch (error) {
    console.error('Error toggling model:', error);
    res.status(500).json({ error: 'Failed to toggle model' });
  }
});

// =====================================================================
// Assistants (Phase 1 of Task #25 — "Session Presets")
// A named bundle that the user picks when creating a session. Phase 1
// only persists identity (name/color/icon/model). The actual model
// parameters and system prompt integration is Phase 2.
//
// Storage:
//   assistants(id, name, description, color, icon, model_id, is_archived, ...)
//   session_meta(assistant_id → assistants.id)
//
// Edit semantics: when an assistant is PATCHed and at least one session
// already references it, the existing row is archived and a NEW row is
// created with the updated fields. Old sessions keep pointing at the
// archived row. This preserves the "what model was used for this chat"
// history. (Duplicate is a separate explicit operation that does NOT
// archive the source.)
// =====================================================================

const ASSISTANT_PALETTE = new Set(['blue', 'green', 'purple', 'red', 'orange', 'yellow', 'pink', 'gray']);
const MAX_ASSISTANT_NAME = 60;
const MAX_ASSISTANT_DESC = 200;
const MAX_ASSISTANT_ICON_LEN = 8;

function sanitizeAssistantInput({ name, description, color, icon, model_id }) {
  if (typeof name !== 'string') throw new Error('name must be a string');
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_ASSISTANT_NAME) {
    throw new Error(`name must be 1-${MAX_ASSISTANT_NAME} characters`);
  }
  const desc = description == null ? null : String(description);
  if (desc != null && desc.length > MAX_ASSISTANT_DESC) {
    throw new Error(`description must be <= ${MAX_ASSISTANT_DESC} characters`);
  }
  const col = color == null || color === '' ? null : String(color);
  if (col != null && !ASSISTANT_PALETTE.has(col)) {
    throw new Error('color must be one of the supported palette values');
  }
  const ic = icon == null || icon === '' ? null : String(icon);
  if (ic != null && ic.length > MAX_ASSISTANT_ICON_LEN) {
    throw new Error('icon is too long');
  }
  const mid = model_id == null || model_id === '' ? null : String(model_id);
  if (mid != null) {
    const modelRow = uiDb.prepare('SELECT 1 FROM models WHERE model_id = ? AND enabled = 1').get(mid);
    if (!modelRow) throw new Error('model_id references an unknown or disabled model');
  }
  return { name: trimmed, description: desc, color: col, icon: ic, model_id: mid };
}

function rowToAssistant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    modelId: row.model_id,
    isArchived: !!row.is_archived,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getDefaultModelId() {
  const row = uiDb.prepare(`
    SELECT m.model_id
    FROM models m
    JOIN providers p ON p.id = m.provider_id
    WHERE m.enabled = 1
    ORDER BY p.id, m.id
    LIMIT 1
  `).get();
  return row ? row.model_id : null;
}

app.get('/api/assistants', apiLimiter, (req, res) => {
  try {
    const includeArchived = req.query.include_archived === '1';
    const rows = uiDb.prepare(`
      SELECT a.*, m.display_name AS model_display_name, m.enabled AS model_enabled,
             p.name AS provider_name
      FROM assistants a
      LEFT JOIN models m ON m.model_id = a.model_id
      LEFT JOIN providers p ON p.id = m.provider_id
      ${includeArchived ? '' : 'WHERE a.is_archived = 0'}
      ORDER BY a.is_archived ASC, a.id ASC
    `).all();
    res.json({ assistants: rows.map(rowToAssistant) });
  } catch (error) {
    console.error('Error fetching assistants:', error);
    res.status(500).json({ error: 'Failed to fetch assistants' });
  }
});

app.get('/api/assistants/:id', apiLimiter, (req, res) => {
  try {
    const row = uiDb.prepare(`
      SELECT a.*, m.display_name AS model_display_name, m.enabled AS model_enabled,
             p.name AS provider_name
      FROM assistants a
      LEFT JOIN models m ON m.model_id = a.model_id
      LEFT JOIN providers p ON p.id = m.provider_id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Assistant not found' });
    res.json(rowToAssistant(row));
  } catch (error) {
    console.error('Error fetching assistant:', error);
    res.status(500).json({ error: 'Failed to fetch assistant' });
  }
});

app.post('/api/assistants', apiLimiter, (req, res) => {
  try {
    const input = sanitizeAssistantInput(req.body || {});
    const result = uiDb.prepare(`
      INSERT INTO assistants (name, description, color, icon, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(input.name, input.description, input.color, input.icon, input.model_id);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ assistant: rowToAssistant(row), forked: false });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An active assistant with this name already exists' });
    }
    console.error('Error creating assistant:', error);
    res.status(400).json({ error: error.message || 'Failed to create assistant' });
  }
});

app.patch('/api/assistants/:id', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });
    if (existing.is_archived) {
      return res.status(409).json({ error: 'Cannot edit an archived assistant' });
    }

    const input = sanitizeAssistantInput({
      name: req.body.name ?? existing.name,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      color: req.body.color !== undefined ? req.body.color : existing.color,
      icon: req.body.icon !== undefined ? req.body.icon : existing.icon,
      model_id: req.body.model_id !== undefined ? req.body.model_id : existing.model_id,
    });

    const linkedSessions = uiDb.prepare(
      'SELECT COUNT(*) AS n FROM session_meta WHERE assistant_id = ?'
    ).get(existing.id).n;

    const performUpdate = uiDb.transaction(() => {
      if (linkedSessions > 0) {
        // Fork-on-edit: archive existing, create new row with updated fields.
        uiDb.prepare(`
          UPDATE assistants
          SET is_archived = 1, archived_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existing.id);
        const ins = uiDb.prepare(`
          INSERT INTO assistants (name, description, color, icon, model_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(input.name, input.description, input.color, input.icon, input.model_id);
        const created = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(ins.lastInsertRowid);
        return { assistant: rowToAssistant(created), forked: true, previousId: existing.id };
      }
      uiDb.prepare(`
        UPDATE assistants
        SET name = ?, description = ?, color = ?, icon = ?, model_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(input.name, input.description, input.color, input.icon, input.model_id, existing.id);
      const updated = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(existing.id);
      return { assistant: rowToAssistant(updated), forked: false };
    });

    const result = performUpdate();
    res.json(result);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An active assistant with this name already exists' });
    }
    console.error('Error updating assistant:', error);
    res.status(400).json({ error: error.message || 'Failed to update assistant' });
  }
});

app.post('/api/assistants/:id/archive', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });
    if (existing.is_archived) return res.json({ assistant: rowToAssistant(existing) });
    uiDb.prepare(`
      UPDATE assistants SET is_archived = 1, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.id);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(existing.id);
    res.json({ assistant: rowToAssistant(row) });
  } catch (error) {
    console.error('Error archiving assistant:', error);
    res.status(500).json({ error: 'Failed to archive assistant' });
  }
});

app.post('/api/assistants/:id/restore', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });
    if (!existing.is_archived) return res.json({ assistant: rowToAssistant(existing) });
    uiDb.prepare(`
      UPDATE assistants SET is_archived = 0, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existing.id);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(existing.id);
    res.json({ assistant: rowToAssistant(row) });
  } catch (error) {
    console.error('Error restoring assistant:', error);
    res.status(500).json({ error: 'Failed to restore assistant' });
  }
});

app.post('/api/assistants/:id/duplicate', apiLimiter, (req, res) => {
  try {
    const existing = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assistant not found' });
    // Append " (copy)" to the name; rely on UNIQUE active-name constraint
    // and surface 409 to the UI if there's a conflict (caller can rename).
    const baseName = existing.name;
    let candidate = `${baseName} (copy)`;
    let suffix = 1;
    while (uiDb.prepare('SELECT 1 FROM assistants WHERE name = ? AND is_archived = 0').get(candidate)) {
      suffix += 1;
      candidate = `${baseName} (copy ${suffix})`;
      if (suffix > 50) return res.status(409).json({ error: 'Too many copies of this name' });
    }
    const result = uiDb.prepare(`
      INSERT INTO assistants (name, description, color, icon, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(candidate, existing.description, existing.color, existing.icon, existing.model_id);
    const row = uiDb.prepare('SELECT * FROM assistants WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ assistant: rowToAssistant(row) });
  } catch (error) {
    console.error('Error duplicating assistant:', error);
    res.status(500).json({ error: 'Failed to duplicate assistant' });
  }
});



async function runPythonScript(scriptPath, args, env = {}) {
  const { spawn } = await import('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(HERMES_PYTHON_PATH, [scriptPath, ...args], {
      cwd: __dirname,
      env: { ...process.env, UI_DB_PATH, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `script exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`invalid JSON from script: ${stdout.slice(0, 200)}`));
      }
    });
    child.on('error', reject);
  });
}

const ENV_VAR_RE = /^[A-Z][A-Z0-9_]*$/;
const NON_ASCII_RE = /[^\x20-\x7e]/;

function validateEnvVar(name) {
  if (typeof name !== 'string' || !ENV_VAR_RE.test(name)) {
    throw new Error('invalid env_var name');
  }
}

function validateKeyValue(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('value is required');
  }
  if (value.length > 512) {
    throw new Error('value too long');
  }
  if (NON_ASCII_RE.test(value)) {
    throw new Error('value contains non-ASCII characters');
  }
}

async function fetchBundledProviders() {
  const result = await runPythonScript(LIST_BUNDLED_PROVIDERS_SCRIPT, []);
  if (!result.success) {
    throw new Error(result.error || 'list_bundled_providers failed');
  }
  return result.providers;
}

// GET /api/providers/available
// Returns bundled Hermes providers (api_key only) with metadata.
// Optionally filtered by `?configured=1` (true) or `?configured=0` (false).
app.get('/api/providers/available', apiLimiter, async (req, res) => {
  try {
    const providers = await fetchBundledProviders();
    let filtered = providers;
    if (req.query.configured === '1') filtered = providers.filter((p) => p.is_configured);
    if (req.query.configured === '0') filtered = providers.filter((p) => !p.is_configured);
    res.json({ providers: filtered });
  } catch (error) {
    console.error('Error listing available providers:', error.message);
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

// GET /api/providers/configured
// Returns configured providers joined with the local DB metadata.
// POST /api/providers/:name/key
// Body: { env_var, value } — writes a new key to ~/.hermes/.env
app.post('/api/providers/:name/key', providerLimiter, async (req, res) => {
  const { name } = req.params;
  const { env_var, value } = req.body || {};

  try {
    if (!/^[a-z0-9_-]{1,64}$/i.test(name)) {
      return res.status(400).json({ error: 'invalid provider name' });
    }
    try {
      validateEnvVar(env_var);
      validateKeyValue(value);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    // Whitelist env_var against the provider's profile
    const bundled = await fetchBundledProviders();
    const profile = bundled.find((p) => p.name === name);
    if (!profile) {
      return res.status(404).json({ error: 'unknown provider' });
    }
    if (!profile.env_vars.includes(env_var)) {
      return res.status(400).json({ error: 'env_var not allowed for this provider' });
    }

    const result = await runPythonScript(
      MANAGE_PROVIDER_KEY_SCRIPT,
      ['set', name, env_var, value]
    );
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'failed to write key' });
    }

    // The masked value comes from the script — never log the raw value here.
    res.json({
      success: true,
      provider: name,
      env_var: result.env_var,
      masked: result.masked,
    });
  } catch (error) {
    console.error('Error writing provider key:', error.message);
    res.status(500).json({ error: 'Failed to write key' });
  }
});

// DELETE /api/providers/:name/key?env_var=XYZ
// Removes a single env_var line from ~/.hermes/.env
app.delete('/api/providers/:name/key', providerLimiter, async (req, res) => {
  const { name } = req.params;
  const { env_var } = req.query;

  try {
    if (!/^[a-z0-9_-]{1,64}$/i.test(name)) {
      return res.status(400).json({ error: 'invalid provider name' });
    }
    if (!env_var || typeof env_var !== 'string') {
      return res.status(400).json({ error: 'env_var query param is required' });
    }
    try {
      validateEnvVar(env_var);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const bundled = await fetchBundledProviders();
    const profile = bundled.find((p) => p.name === name);
    if (!profile) {
      return res.status(404).json({ error: 'unknown provider' });
    }
    if (!profile.env_vars.includes(env_var)) {
      return res.status(400).json({ error: 'env_var not allowed for this provider' });
    }

    const result = await runPythonScript(
      MANAGE_PROVIDER_KEY_SCRIPT,
      ['remove', name, env_var]
    );
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'failed to remove key' });
    }

    // Drop the local DB rows for this provider so a re-sync doesn't show stale data
    const row = uiDb.prepare('SELECT id FROM providers WHERE name = ?').get(name);
    if (row) {
      uiDb.prepare('DELETE FROM models WHERE provider_id = ?').run(row.id);
      uiDb.prepare('DELETE FROM providers WHERE id = ?').run(row.id);
    }

    res.json({ success: true, provider: name, env_var });
  } catch (error) {
    console.error('Error removing provider key:', error.message);
    res.status(500).json({ error: 'Failed to remove key' });
  }
});

// Send a like to Mattermost
app.post('/api/like', likeLimiter, async (req, res) => {
  try {
    if (!LIKES_WEBHOOK_URL) {
      return res.status(503).json({ error: 'Likes webhook is not configured' });
    }

    const ip = (req.ip || '').replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || '';
    const userHash = crypto
      .createHash('sha256')
      .update(`${ip}|${userAgent}`)
      .digest('hex');
    const cooldownMs = LIKES_COOLDOWN_SEC * 1000;
    const now = Date.now();

    const last = uiDb
      .prepare(
        'SELECT created_at FROM likes WHERE user_hash = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(userHash, now - cooldownMs);

    if (last) {
      const retryAfter = Math.max(1, Math.ceil((last.created_at + cooldownMs - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'cooldown',
        message: `You can like again in ${retryAfter} seconds.`,
        retry_after: retryAfter,
      });
    }

    const country = await (async () => {
      if (process.env.DISABLE_GEOIP === 'true') return null;
      try {
        const { default: geoip } = await import('geoip-lite');
        return geoip.lookup(ip)?.country || null;
      } catch {
        // Package not installed or lookup failed — non-critical
        return null;
      }
    })();

    const lines = [
      '❤️ **New like from 1230-UI!**',
      '',
      `- **IP:** \`${ip || 'unknown'}\``,
      `- **Country:** ${country ? `\`${country}\`` : '`unknown`'}`,
      `- **User-Agent:** \`${userAgent.slice(0, 200) || 'unknown'}\``,
      `- **Time:** \`${new Date(now).toISOString()}\``,
    ];
    const message = lines.join('\n');

    const webhookResponse = await fetch(LIKES_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, username: '1230-UI Likes' }),
      signal: AbortSignal.timeout(5000),
    });

    if (!webhookResponse.ok) {
      const body = await webhookResponse.text().catch(() => '');
      console.error(`Likes webhook failed: ${webhookResponse.status} ${body}`);
      return res.status(502).json({ error: 'Webhook delivery failed' });
    }

    uiDb
      .prepare(
        'INSERT INTO likes (user_hash, user_agent, country, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(userHash, userAgent.slice(0, 500), country, now);

    res.json({ success: true, sent_at: now });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      console.error('Likes webhook timeout');
      return res.status(504).json({ error: 'Webhook timed out' });
    }
    console.error('Error sending like:', error);
    res.status(500).json({ error: 'Failed to send like' });
  }
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`1230.UI backend running on port ${PORT}`);
  console.log(`Hermes DB: ${HERMES_DB_PATH}`);
  console.log(`UI DB: ${UI_DB_PATH}`);
  console.log(`Hermes API: ${HERMES_API_URL}`);
});

process.on('SIGTERM', () => {
  db?.close();
  hermesDbWrite?.close();
  uiDb?.close();
  process.exit(0);
});
