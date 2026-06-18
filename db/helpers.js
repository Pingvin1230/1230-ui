/**
 * db/helpers.js
 *
 * Shared helper functions used across multiple route modules.
 */

import { uiDb } from './connections.js';

/**
 * Convert a raw assistants DB row to the API shape.
 * @param {object|null} row
 * @returns {object|null}
 */
export function rowToAssistant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    modelId: row.model_id,
    style: row.style ?? null,
    depth: row.depth ?? null,
    systemPrompt: row.system_prompt ?? null,
    executor: row.executor ?? 'hermes',
    isArchived: !!row.is_archived,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Return the model_id of the first enabled model, or null if none exist.
 * @returns {string|null}
 */
export function getDefaultModelId() {
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

/**
 * Look up the Hermes provider name for a model_id by querying the providers
 * + models tables. Returns null if the model is not registered in the UI DB
 * (the caller is expected to fall back to a heuristic).
 * @param {string} modelId
 * @returns {string|null}
 */
export function getProviderForModelId(modelId) {
  if (!modelId) return null;
  try {
    const row = uiDb.prepare(`
      SELECT p.name AS provider_name
      FROM models m
      JOIN providers p ON p.id = m.provider_id
      WHERE m.model_id = ?
      LIMIT 1
    `).get(modelId);
    return row ? row.provider_name : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Hermes provider name for a model. Tries the DB first, then falls
 * back to a string heuristic. Always returns a non-empty string so callers
 * can pass it to the Python wrapper without further checks.
 * @param {string} model
 * @returns {string}
 */
export function getProviderFromModel(model) {
  if (!model) return 'unknown';
  const fromDb = getProviderForModelId(model);
  if (fromDb) return fromDb;
  const m = model.toLowerCase();
  if (m.includes('minimax'))  return 'minimax';
  if (m.includes('qwen'))     return 'opencode-go';
  if (m.includes('kimi'))     return 'opencode-go';
  if (m.includes('glm'))      return 'opencode-go';
  if (m.includes('deepseek')) return 'opencode-go';
  if (m.includes('claude'))   return 'opencode-go';
  if (m.includes('gpt'))      return 'opencode-go';
  if (m.includes('gemini'))   return 'opencode-go';
  return 'unknown';
}
