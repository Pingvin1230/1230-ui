/**
 * routes/models.js
 *
 * Endpoints:
 *   GET   /api/models                        — enabled models grouped by provider
 *   GET   /api/models/providers              — all providers with model counts
 *   POST  /api/models/sync                   — sync providers via Python script
 *   PATCH /api/models/models/:id/toggle      — toggle model enabled/disabled
 */

import { Router } from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { apiLimiter } from '../middleware/security.js';
import { uiDb } from '../db/connections.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const HERMES_PYTHON_PATH  = config.hermesPythonPath;
const SYNC_PROVIDERS_SCRIPT = config.scripts.syncProviders;
const UI_DB_PATH = config.uiDbPath;

// ── GET /api/models ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const providers = uiDb.prepare('SELECT id, name, display_name FROM providers ORDER BY name').all();

    const providersMap = {};
    let defaultModel = null;

    for (const provider of providers) {
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
          models: models.map((m) => ({ id: m.model_id, name: m.display_name || m.model_id })),
        };
        if (!defaultModel) {
          defaultModel = {
            id: models[0].model_id,
            name: models[0].display_name || models[0].model_id,
            provider: provider.name,
          };
        }
      }
    }

    res.json({ default: defaultModel, providers: providersMap });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// ── GET /api/models/providers ──────────────────────────────────────────────
router.get('/providers', (req, res) => {
  try {
    const providers = uiDb.prepare(`
      SELECT id, name, display_name, env_var, base_url, sync_status, last_synced_at
      FROM providers ORDER BY name
    `).all();

    const result = providers.map((provider) => {
      const models = uiDb.prepare(`
        SELECT id, model_id, display_name, enabled
        FROM models WHERE provider_id = ? ORDER BY model_id
      `).all(provider.id);

      return {
        ...provider,
        models,
        enabledCount: models.filter((m) => m.enabled).length,
        totalCount: models.length,
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// ── POST /api/models/sync ──────────────────────────────────────────────────
router.post('/sync', apiLimiter, async (req, res) => {
  try {
    const pythonProcess = spawn(HERMES_PYTHON_PATH, [SYNC_PROVIDERS_SCRIPT], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, UI_DB_PATH },
    });

    let stdout = '';
    let stderr = '';
    pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          res.json({ success: true, ...JSON.parse(stdout) });
        } catch {
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

// ── PATCH /api/models/models/:id/toggle ───────────────────────────────────
router.patch('/models/:id/toggle', (req, res) => {
  try {
    const model = uiDb.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const newEnabled = model.enabled ? 0 : 1;
    uiDb.prepare('UPDATE models SET enabled = ? WHERE id = ?').run(newEnabled, req.params.id);

    res.json({ success: true, id: req.params.id, enabled: newEnabled });
  } catch (error) {
    console.error('Error toggling model:', error);
    res.status(500).json({ error: 'Failed to toggle model' });
  }
});

export default router;
