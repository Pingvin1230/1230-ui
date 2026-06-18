import { useMemo } from 'react';
import { api } from '../lib/api';
import { useAsync } from './useAsync';

/** Shape returned by `api.getModels()` (shared so pages stop re-declaring it). */
export interface ModelsResponse {
  default: { id: string; name: string; provider: string } | null;
  providers: Record<string, {
    id: string;
    name: string;
    models: Array<{ id: string; name: string }>;
  }>;
}

/** A model flattened out of its provider group (used by assistants/model pickers). */
export interface FlatModel {
  id: string;
  name: string;
  provider: string;
}

/**
 * Build a `Map<modelId, modelName>` lookup from a models response.
 * Pure helper — used by every page that needs a label for a model id.
 */
export function buildModelMap(models: ModelsResponse | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!models) return map;
  for (const provider of Object.values(models.providers)) {
    for (const m of provider.models) map.set(m.id, m.name);
  }
  return map;
}

/**
 * Flatten a models response into a flat `{ id, name, provider }` list.
 * Pure helper — preserves provider order and model order within a provider.
 */
export function flattenModels(models: ModelsResponse | null | undefined): FlatModel[] {
  const out: FlatModel[] = [];
  if (!models) return out;
  for (const provider of Object.values(models.providers)) {
    for (const m of provider.models) {
      out.push({ id: m.id, name: m.name, provider: provider.name });
    }
  }
  return out;
}

export interface UseModelsResult {
  models: ModelsResponse | null;
  modelLabelMap: Map<string, string>;
  flatModels: FlatModel[];
  defaultModelId: string | null;
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Fetch the models catalogue once and derive the common lookups
 * (`modelLabelMap`, `flatModels`, `defaultModelId`). Replaces the per-page
 * `api.getModels()` + inline flatten/map boilerplate.
 */
export function useModels(): UseModelsResult {
  const { data, loading, error, refetch } = useAsync<ModelsResponse>(
    () => api.getModels(),
    [],
  );
  const models = data;
  const modelLabelMap = useMemo(() => buildModelMap(models), [models]);
  const flatModels = useMemo(() => flattenModels(models), [models]);
  const defaultModelId = models?.default?.id ?? null;
  return { models, modelLabelMap, flatModels, defaultModelId, loading, error, refetch };
}
