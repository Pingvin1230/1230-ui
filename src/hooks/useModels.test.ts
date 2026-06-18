import { describe, it, expect } from 'vitest';
import { buildModelMap, flattenModels, type ModelsResponse } from './useModels';

function makeModels(overrides: Partial<ModelsResponse> = {}): ModelsResponse {
  return {
    default: { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    providers: {
      openai: {
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-4o', name: 'GPT-4o' },
          { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
        ],
      },
      anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        models: [{ id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' }],
      },
    },
    ...overrides,
  };
}

describe('buildModelMap', () => {
  it('returns an empty map for null/undefined input', () => {
    expect(buildModelMap(null).size).toBe(0);
    expect(buildModelMap(undefined).size).toBe(0);
  });

  it('maps every model id to its display name', () => {
    const map = buildModelMap(makeModels());
    expect(map.get('gpt-4o')).toBe('GPT-4o');
    expect(map.get('gpt-4o-mini')).toBe('GPT-4o mini');
    expect(map.get('claude-3-5-sonnet')).toBe('Claude 3.5 Sonnet');
    expect(map.size).toBe(3);
  });

  it('handles a models response with no providers', () => {
    const map = buildModelMap({ default: null, providers: {} });
    expect(map.size).toBe(0);
  });

  it('later duplicate ids overwrite earlier ones (last-write-wins)', () => {
    const map = buildModelMap({
      default: null,
      providers: {
        a: { id: 'a', name: 'A', models: [{ id: 'shared', name: 'From A' }] },
        b: { id: 'b', name: 'B', models: [{ id: 'shared', name: 'From B' }] },
      },
    });
    expect(map.get('shared')).toBe('From B');
  });
});

describe('flattenModels', () => {
  it('returns an empty array for null/undefined input', () => {
    expect(flattenModels(null)).toEqual([]);
    expect(flattenModels(undefined)).toEqual([]);
  });

  it('flattens models with their provider display name', () => {
    const flat = flattenModels(makeModels());
    expect(flat).toEqual([
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI' },
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
    ]);
  });

  it('preserves provider and intra-provider order', () => {
    const flat = flattenModels({
      default: null,
      providers: {
        z: { id: 'z', name: 'Zed', models: [{ id: 'z1', name: 'Z1' }] },
        a: { id: 'a', name: 'Ay', models: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }] },
      },
    });
    expect(flat.map((m) => m.id)).toEqual(['z1', 'a1', 'a2']);
  });
});
