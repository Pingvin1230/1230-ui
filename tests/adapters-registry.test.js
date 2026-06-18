// 1.14 — vitest coverage: ADAPTERS registry
import { describe, it, expect } from 'vitest';
import { ADAPTERS, ExecutorAdapter } from '../lib/adapters/index.js';
import { HermesAdapter } from '../lib/adapters/hermes.js';
import { OpenCodeAdapter } from '../lib/adapters/opencode.js';

describe('ADAPTERS registry', () => {
  it('contains both hermes and opencode-1230 slugs', () => {
    expect(ADAPTERS).toHaveProperty('hermes');
    expect(ADAPTERS).toHaveProperty('opencode-1230');
  });

  it('exposes exactly 2 adapters (no more, no less)', () => {
    expect(Object.keys(ADAPTERS)).toHaveLength(2);
  });

  it('hermes adapter is an instance of ExecutorAdapter (and HermesAdapter)', () => {
    expect(ADAPTERS['hermes']).toBeInstanceOf(ExecutorAdapter);
    expect(ADAPTERS['hermes']).toBeInstanceOf(HermesAdapter);
  });

  it('opencode-1230 adapter is an instance of ExecutorAdapter (and OpenCodeAdapter)', () => {
    expect(ADAPTERS['opencode-1230']).toBeInstanceOf(ExecutorAdapter);
    expect(ADAPTERS['opencode-1230']).toBeInstanceOf(OpenCodeAdapter);
  });

  it('hermes adapter reports correct slug and displayName', () => {
    expect(ADAPTERS['hermes'].slug).toBe('hermes');
    expect(ADAPTERS['hermes'].displayName).toBe('Hermes');
  });

  it('opencode-1230 adapter reports correct slug and displayName', () => {
    expect(ADAPTERS['opencode-1230'].slug).toBe('opencode-1230');
    expect(ADAPTERS['opencode-1230'].displayName).toBe('OpenCode 1230');
  });

  it('all slugs are unique', () => {
    const slugs = Object.values(ADAPTERS).map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('registry keys match adapter slugs', () => {
    for (const [key, adapter] of Object.entries(ADAPTERS)) {
      expect(adapter.slug).toBe(key);
    }
  });

  it('all adapters expose a chat() async generator method', () => {
    for (const adapter of Object.values(ADAPTERS)) {
      expect(typeof adapter.chat).toBe('function');
      // Calling chat() returns an async generator (an object with .next)
      const gen = adapter.chat({
        session_id: 's1',
        model: 'm',
        provider: 'p',
        currentMessage: 'hi',
        history: [],
        messages: [],
        dedupKey: 'k',
        req: null,
        res: null,
      });
      expect(typeof gen.next).toBe('function');
      // Don't drain — this just verifies the shape
      // (calling .return() cleans up the generator)
      gen.return?.(undefined);
    }
  });
});
