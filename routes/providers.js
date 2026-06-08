/**
 * routes/providers.js
 *
 * Endpoints:
 *   GET    /api/providers/available       — list bundled providers with metadata
 *   POST   /api/providers/:name/key       — set a provider API key
 *   DELETE /api/providers/:name/key       — remove a provider API key
 */

import { Router } from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { apiLimiter, providerLimiter } from '../middleware/security.js';
import { uiDb } from '../db/connections.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const HERMES_PYTHON_PATH          = config.hermesPythonPath;
const UI_DB_PATH                  = config.uiDbPath;
const MANAGE_PROVIDER_KEY_SCRIPT  = path.join(__dirname, '..', 'scripts', 'manage_provider_key.py');
const LIST_BUNDLED_PROVIDERS_SCRIPT = path.join(__dirname, '..', 'scripts', 'list_bundled_providers.py');

const ENV_VAR_RE   = /^[A-Z][A-Z0-9_]*$/;
const NON_ASCII_RE = /[^\x20-\x7e]/;

// ── Helpers ────────────────────────────────────────────────────────────────

function validateEnvVar(name) {
  if (typeof name !== 'string' || !ENV_VAR_RE.test(name)) {
    throw new Error('invalid env_var name');
  }
}

function validateKeyValue(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('value is required');
  if (value.length > 512) throw new Error('value too long');
  if (NON_ASCII_RE.test(value)) throw new Error('value contains non-ASCII characters');
}

function runPythonScript(scriptPath, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(HERMES_PYTHON_PATH, [scriptPath, ...args], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, UI_DB_PATH, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `script exited with code ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`invalid JSON from script: ${stdout.slice(0, 200)}`));
      }
    });
    child.on('error', reject);
  });
}

async function fetchBundledProviders() {
  const result = await runPythonScript(LIST_BUNDLED_PROVIDERS_SCRIPT, []);
  if (!result.success) throw new Error(result.error || 'list_bundled_providers failed');
  return result.providers;
}

// ── GET /api/providers/available ──────────────────────────────────────────
router.get('/available', apiLimiter, async (req, res) => {
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

// ── POST /api/providers/:name/key ──────────────────────────────────────────
router.post('/:name/key', providerLimiter, async (req, res) => {
  const { name } = req.params;
  const { env_var, value } = req.body || {};

  try {
    if (!/^[a-z0-9_-]{1,64}$/i.test(name)) return res.status(400).json({ error: 'invalid provider name' });
    try {
      validateEnvVar(env_var);
      validateKeyValue(value);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const bundled = await fetchBundledProviders();
    const profile = bundled.find((p) => p.name === name);
    if (!profile) return res.status(404).json({ error: 'unknown provider' });
    if (!profile.env_vars.includes(env_var)) {
      return res.status(400).json({ error: 'env_var not allowed for this provider' });
    }

    const result = await runPythonScript(MANAGE_PROVIDER_KEY_SCRIPT, ['set', name, env_var, value]);
    if (!result.success) return res.status(500).json({ error: result.error || 'failed to write key' });

    res.json({ success: true, provider: name, env_var: result.env_var, masked: result.masked });
  } catch (error) {
    console.error('Error writing provider key:', error.message);
    res.status(500).json({ error: 'Failed to write key' });
  }
});

// ── DELETE /api/providers/:name/key ───────────────────────────────────────
router.delete('/:name/key', providerLimiter, async (req, res) => {
  const { name } = req.params;
  const { env_var } = req.query;

  try {
    if (!/^[a-z0-9_-]{1,64}$/i.test(name)) return res.status(400).json({ error: 'invalid provider name' });
    if (!env_var || typeof env_var !== 'string') {
      return res.status(400).json({ error: 'env_var query param is required' });
    }
    try { validateEnvVar(env_var); } catch (e) { return res.status(400).json({ error: e.message }); }

    const bundled = await fetchBundledProviders();
    const profile = bundled.find((p) => p.name === name);
    if (!profile) return res.status(404).json({ error: 'unknown provider' });
    if (!profile.env_vars.includes(env_var)) {
      return res.status(400).json({ error: 'env_var not allowed for this provider' });
    }

    const result = await runPythonScript(MANAGE_PROVIDER_KEY_SCRIPT, ['remove', name, env_var]);
    if (!result.success) return res.status(500).json({ error: result.error || 'failed to remove key' });

    // Drop local DB rows so a re-sync doesn't show stale data.
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

export default router;
