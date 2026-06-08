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

const router = Router();

const HERMES_API_URL = config.hermesApiUrl;
const HERMES_API_KEY = config.hermesApiKey;
const HERMES_AGENT_PATH = config.hermesAgentPath;
const CACHE_TTL = 3_600_000; // 1 hour in ms

// ── GET /api/system/status ─────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    // Hermes API connectivity
    let hermesStatus = 'disconnected';
    try {
      const response = await fetch(`${HERMES_API_URL}/health`, {
        headers: { 'Authorization': `Bearer ${HERMES_API_KEY}` },
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
    const response = await fetch(`${HERMES_API_URL}/health`, {
      headers: { 'Authorization': `Bearer ${HERMES_API_KEY}` },
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
    hermesApiUrl: HERMES_API_URL,
    timestamp: Date.now(),
  });
}

router.get('/health', getHealthHandler);

export default router;
