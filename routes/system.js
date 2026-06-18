/**
 * routes/system.js
 *
 * Endpoints:
 *   GET  /api/system/status  — Hermes version, providers, session count, GitHub latest
 *   POST /api/system/exec    — Run `hermes update` or `hermes doctor --fix`
 *   GET  /api/health         — Simple liveness check
 */

import { Router } from 'express';
import { execLimiter } from '../middleware/security.js';
import { db, uiDb } from '../db/connections.js';
import config from '../config.js';
import { encrypt, decrypt } from '../lib/cloud/crypto.js';
import { getSetting, upsertSetting } from '../lib/systemSettings.js';
import { reconfigureOpencodeClient } from '../lib/opencode.js';

const router = Router();

const HERMES_AGENT_PATH = config.hermesAgentPath;
const CACHE_TTL = 3_600_000; // 1 hour in ms

// In-memory cache for the executor availability probe. The OpenCode daemon
// is on localhost; a 5 s cache is plenty to absorb page-reload storms.
let _executorsCache = { at: 0, value: ['hermes'] };
const EXECUTORS_CACHE_MS = 5_000;

// ── GET /api/system/status ─────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    // Hermes API connectivity
    let hermesStatus = 'disconnected';
    try {
      const response = await fetch(`${config.hermesApiUrl}/health`, {
        headers: { 'Authorization': `Bearer ${config.hermesApiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) hermesStatus = 'connected';
    } catch (error) {
      console.error('Hermes API health check failed:', error.message);
    }

    // Hermes version (async, non-blocking)
    let hermesVersion = 'Unknown';
    let updateAvailable = null;
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const { stdout: versionOutput } = await execFileAsync('hermes', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const versionMatch = versionOutput.match(/Hermes Agent (v[\d.]+(?:\s*\([\d.]+\))?)/);
      if (versionMatch) hermesVersion = versionMatch[1];
      const updateMatch = versionOutput.match(/Update available:\s*(\d+)\s*commits behind/);
      if (updateMatch) updateAvailable = parseInt(updateMatch[1]);
    } catch (error) {
      console.error('Failed to get Hermes version:', error.message);
    }

    // Connected providers
    const providers = uiDb.prepare(`
      SELECT name, display_name, sync_status, last_synced_at
      FROM providers ORDER BY name
    `).all();

    // Total sessions count
    const sessionsCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get();

    // Latest Hermes release from GitHub (cached 1h)
    let latestVersion = null;
    try {
      const cacheKey = 'latest_hermes_version';
      const cached = uiDb.prepare('SELECT value, updated_at FROM cache WHERE key = ?').get(cacheKey);
      const now = Date.now();
      if (cached && now - cached.updated_at < CACHE_TTL) {
        latestVersion = cached.value;
      } else {
        const githubResponse = await fetch(
          'https://api.github.com/repos/NousResearch/hermes-agent/releases/latest',
          {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': '1230-ui/1.0' },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (githubResponse.ok) {
          const data = await githubResponse.json();
          latestVersion = data.tag_name || data.name;
          uiDb.prepare('INSERT OR REPLACE INTO cache (key, value, updated_at) VALUES (?, ?, ?)')
            .run(cacheKey, latestVersion, now);
        }
      }
    } catch (error) {
      console.error('Failed to fetch latest version from GitHub:', error.message);
    }

    res.json({
      hermes: { status: hermesStatus, version: hermesVersion, updateAvailable, latestVersion },
      providers: providers.map((p) => ({
        name: p.name,
        displayName: p.display_name,
        syncStatus: p.sync_status,
        lastSyncedAt: p.last_synced_at,
      })),
      stats: { totalSessions: sessionsCount.count },
    });
  } catch (error) {
    console.error('Error fetching system status:', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

// ── POST /api/system/exec ──────────────────────────────────────────────────
router.post('/exec', execLimiter, async (req, res) => {
  const { command } = req.body;

  if (!['update', 'doctor'].includes(command)) {
    return res.status(400).json({ error: 'Invalid command' });
  }

  try {
    const { spawn } = await import('child_process');
    const args = command === 'update' ? ['update', '--yes'] : ['doctor', '--fix'];

    const child = spawn('hermes', args, {
      cwd: HERMES_AGENT_PATH,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      const output = stdout + stderr;
      const summary = output.split('\n').filter((l) => l.trim()).slice(-10).join('\n');
      res.json({ success: code === 0, exitCode: code, output: summary, fullOutput: output });
    });

    child.on('error', (error) => {
      res.status(500).json({ success: false, error: error.message });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /api/health ────────────────────────────────────────────────────────
// Exported separately so app.js can mount it at /api/health (legacy path).
export async function getHealthHandler(req, res) {
  let hermesApiStatus = 'unknown';
  try {
    const response = await fetch(`${config.hermesApiUrl}/health`, {
      headers: { 'Authorization': `Bearer ${config.hermesApiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    hermesApiStatus = response.ok ? 'ok' : 'error';
  } catch {
    hermesApiStatus = 'unreachable';
  }

  res.json({
    status: 'ok',
    dbConnected: !!db,
    hermesApi: hermesApiStatus,
    hermesApiUrl: config.hermesApiUrl,
    timestamp: Date.now(),
  });
}

router.get('/health', getHealthHandler);

// ── GET /api/system/executors ──────────────────────────────────────────────
// Probe OpenCode and return the list of executors currently usable.
// Hermes is always available as long as run_chat.py is on disk (we don't
// probe Hermes here — the chat handler falls back to Hermes on any
// OpenCode failure anyway). Cached for 5 s in-process.
router.get('/executors', async (req, res) => {
  if (Date.now() - _executorsCache.at < EXECUTORS_CACHE_MS) {
    return res.json({ executors: _executorsCache.value });
  }
  const executors = ['hermes'];
  const headers = { Accept: 'application/json' };
  if (config.opencodeUsername && config.opencodePassword) {
    const creds = Buffer.from(`${config.opencodeUsername}:${config.opencodePassword}`).toString('base64');
    headers.Authorization = `Basic ${creds}`;
  }
  try {
    const r = await fetch(`${config.opencodeUrl}/global/health`, {
      headers,
      signal: AbortSignal.timeout(2_000),
    });
    if (r.ok) {
      const body = await r.json().catch(() => null);
      if (body?.healthy) executors.push('opencode-1230');
    }
  } catch {
    // OpenCode unreachable — leave it out of the list.
  }
  _executorsCache = { at: Date.now(), value: executors };
  res.json({ executors });
});

// ── GET /api/system/executor-config/:slug ─────────────────────────────────
// Returns current executor configuration (secret masked).
// (getSetting/upsertSetting live in lib/systemSettings.js — shared with routes/tududi.js.)

router.get('/executor-config/:slug', (req, res) => {
  const { slug } = req.params;
  try {
    if (slug === 'hermes-agent') {
      const pythonPath = getSetting('executor_hermes_python_path') || config.hermesPythonPath;
      const apiUrl = getSetting('executor_hermes_api_url') || config.hermesApiUrl;
      const apiKeyCt = getSetting('executor_hermes_api_key_ct');
      const apiKeyIv = getSetting('executor_hermes_api_key_iv');
      const apiKeyTag = getSetting('executor_hermes_api_key_tag');
      const hasApiKey = Boolean(apiKeyCt && apiKeyIv && apiKeyTag);
      return res.json({ slug: 'hermes-agent', pythonPath, apiUrl, hasApiKey });
    }
    if (slug === 'opencode-1230') {
      const url = getSetting('executor_opencode_url') || config.opencodeUrl;
      const username = getSetting('executor_opencode_username') || config.opencodeUsername || '';
      const passwordCt = getSetting('executor_opencode_password_ct');
      const passwordIv = getSetting('executor_opencode_password_iv');
      const passwordTag = getSetting('executor_opencode_password_tag');
      const hasPassword = Boolean(passwordCt && passwordIv && passwordTag);
      return res.json({ slug: 'opencode-1230', url, username, hasPassword });
    }
    return res.status(404).json({ error: `Unknown executor slug: ${slug}` });
  } catch (error) {
    console.error('Failed to get executor config:', error);
    res.status(500).json({ error: 'Failed to get executor configuration' });
  }
});

// ── POST /api/system/executor-config/:slug ────────────────────────────────
// Saves executor configuration to system_settings. Encrypts secret at rest.
router.post('/executor-config/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const now = Date.now();

    if (slug === 'hermes-agent') {
      const { pythonPath, apiUrl, apiKey } = req.body || {};
      if (!pythonPath || typeof pythonPath !== 'string') {
        return res.status(400).json({ error: 'pythonPath is required' });
      }
      if (!apiUrl || typeof apiUrl !== 'string') {
        return res.status(400).json({ error: 'apiUrl is required' });
      }
      try {
        new URL(apiUrl);
      } catch {
        return res.status(400).json({ error: 'apiUrl must be a valid URL' });
      }

      let apiKeyEncrypted = null;
      if (typeof apiKey === 'string' && apiKey.length > 0) {
        try {
          apiKeyEncrypted = encrypt(apiKey);
        } catch (encErr) {
          console.error('Failed to encrypt Hermes API key:', encErr);
          return res.status(500).json({ error: 'Failed to encrypt secret — check CLOUD_CONNECT_KEY configuration' });
        }
      }

      const saveSettings = uiDb.transaction(() => {
        upsertSetting('executor_hermes_python_path', pythonPath.trim(), now);
        upsertSetting('executor_hermes_api_url', apiUrl.trim(), now);

        if (apiKeyEncrypted) {
          upsertSetting('executor_hermes_api_key_ct', apiKeyEncrypted.ct, now);
          upsertSetting('executor_hermes_api_key_iv', apiKeyEncrypted.iv, now);
          upsertSetting('executor_hermes_api_key_tag', apiKeyEncrypted.tag, now);
        } else if (apiKey === '') {
          upsertSetting('executor_hermes_api_key_ct', '', now);
          upsertSetting('executor_hermes_api_key_iv', '', now);
          upsertSetting('executor_hermes_api_key_tag', '', now);
        }
      });
      saveSettings();

      config.hermesPythonPath = pythonPath.trim();
      config.hermesApiUrl = apiUrl.trim();
      if (typeof apiKey === 'string' && apiKey.length > 0) {
        config.hermesApiKey = apiKey;
      } else if (apiKey === '') {
        config.hermesApiKey = null;
      }

      return res.json({ success: true });
    }

    if (slug === 'opencode-1230') {
      const { url, username, password } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }

      let passwordEncrypted = null;
      if (typeof password === 'string' && password.length > 0) {
        try {
          passwordEncrypted = encrypt(password);
        } catch (encErr) {
          console.error('Failed to encrypt OpenCode password:', encErr);
          return res.status(500).json({ error: 'Failed to encrypt secret — check CLOUD_CONNECT_KEY configuration' });
        }
      }

      const saveSettings = uiDb.transaction(() => {
        upsertSetting('executor_opencode_url', url.trim(), now);
        upsertSetting('executor_opencode_username', (username || '').trim(), now);

        if (passwordEncrypted) {
          upsertSetting('executor_opencode_password_ct', passwordEncrypted.ct, now);
          upsertSetting('executor_opencode_password_iv', passwordEncrypted.iv, now);
          upsertSetting('executor_opencode_password_tag', passwordEncrypted.tag, now);
        } else if (password === '') {
          upsertSetting('executor_opencode_password_ct', '', now);
          upsertSetting('executor_opencode_password_iv', '', now);
          upsertSetting('executor_opencode_password_tag', '', now);
        }
      });
      saveSettings();

      config.opencodeUrl = url.trim();
      config.opencodeUsername = (username || '').trim() || null;

      if (typeof password === 'string' && password.length > 0) {
        config.opencodePassword = password;
      } else if (password === '') {
        config.opencodePassword = null;
      }

      reconfigureOpencodeClient();

      _executorsCache = { at: 0, value: ['hermes'] };

      return res.json({ success: true });
    }

    return res.status(404).json({ error: `Unknown executor slug: ${slug}` });
  } catch (error) {
    console.error('Failed to save executor config:', error);
    res.status(500).json({ error: 'Failed to save executor configuration' });
  }
});

export default router;
