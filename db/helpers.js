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
 * Heuristic: derive the Hermes provider name from a model ID string.
 * @param {string} model
 * @returns {string}
 */
export function getProviderFromModel(model) {
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
