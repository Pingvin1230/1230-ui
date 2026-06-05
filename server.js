import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import helmet from 'helmet';
import cors from 'cors';
import config from './config.js';

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
const SAVE_MESSAGES_SCRIPT = config.scripts.saveMessages;
const SYNC_PROVIDERS_SCRIPT = config.scripts.syncProviders;

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

app.use(express.json());
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
  `);
  console.log('UI DB tables initialized');
} catch (error) {
  console.error(`Failed to connect to UI DB: ${error}`);
  process.exit(1);
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
    try {
      const { execSync } = await import('child_process');
      const versionOutput = execSync('hermes --version', { encoding: 'utf-8' });
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
app.post('/api/system/exec', async (req, res) => {
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
         ORDER BY timestamp ASC LIMIT 1) as preview
      FROM sessions s
      ORDER BY s.started_at DESC
    `).all();

    const metaAll = uiDb.prepare('SELECT session_id, pinned, archived FROM session_meta').all();
    const metaMap = {};
    for (const m of metaAll) {
      metaMap[m.session_id] = m;
    }

    let filtered = sessions.map(s => ({
      ...s,
      pinned: metaMap[s.id]?.pinned ?? 0,
      archived: metaMap[s.id]?.archived ?? 0,
    }));

    if (!includeArchived) {
      filtered = filtered.filter(s => s.archived !== 1);
    }

    const total = filtered.length;

    const pinned = filtered.filter(s => s.pinned === 1);
    const notPinned = filtered.filter(s => s.pinned !== 1);
    pinned.sort((a, b) => b.startedAt - a.startedAt);
    notPinned.sort((a, b) => b.startedAt - a.startedAt);
    const sorted = [...pinned, ...notPinned];

    const paged = sorted.slice(offset, offset + limit);

    res.json({ sessions: paged, total, limit, offset });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

app.get('/api/sessions/:id', (req, res) => {
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

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
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

app.post('/api/chat', async (req, res) => {
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
app.post('/api/messages', async (req, res) => {
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
app.post('/api/sessions', async (req, res) => {
  const { model, title } = req.body;

  if (!model) {
    return res.status(400).json({ error: 'model is required' });
  }

  try {
    const response = await fetch(`${HERMES_API_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, title, source: 'webui' })
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
    const sessionId = data.session?.id;

    if (!sessionId) {
      return res.status(500).json({ error: 'No session ID in response' });
    }

    res.json({ success: true, sessionId });
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
app.post('/api/models/sync', async (req, res) => {
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
