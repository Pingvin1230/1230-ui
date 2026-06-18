// Unit tests for lib/systemSettings.js — uses an in-memory stand-in for uiDb.
//
// better-sqlite3's `.prepare().run()/get()/all()` chain is mimicked via a small
// helper so we don't need a real SQLite handle. The mock is reset between
// tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store: Map<key, { value, updated_at }>
function makeUiDbMock() {
  const store = new Map();
  const db = {
    prepare(sql) {
      return {
        get(key) {
          return store.has(key) ? store.get(key) : undefined;
        },
        all(...args) {
          // Used by getSettings for SELECT key, value ... WHERE key IN (?, ?, ...)
          if (/SELECT key, value/.test(sql)) {
            return Array.from(store.values()).filter((row) => args.includes(row.key));
          }
          return Array.from(store.values());
        },
        run(...args) {
          if (/INSERT OR REPLACE/i.test(sql)) {
            const [key, value, now] = args;
            store.set(key, { key, value, updated_at: now });
            return { changes: 1 };
          }
          return { changes: 0 };
        },
      };
    },
  };
  return { db, store };
}

describe('lib/systemSettings.js', () => {
  let mock;
  let getSetting;
  let upsertSetting;
  let getSettings;

  beforeEach(async () => {
    mock = makeUiDbMock();
    vi.doMock('../db/connections.js', () => ({ uiDb: mock.db, db: mock.db, hermesDbWrite: mock.db }));
    vi.resetModules();
    const mod = await import('../lib/systemSettings.js');
    getSetting = mod.getSetting;
    upsertSetting = mod.upsertSetting;
    getSettings = mod.getSettings;
  });

  it('getSetting returns null for unknown key', () => {
    expect(getSetting('missing')).toBeNull();
  });

  it('upsertSetting inserts a new row, getSetting returns its value', () => {
    upsertSetting('foo', 'bar');
    expect(getSetting('foo')).toBe('bar');
  });

  it('upsertSetting overwrites an existing row', () => {
    upsertSetting('foo', 'one');
    upsertSetting('foo', 'two');
    expect(getSetting('foo')).toBe('two');
  });

  it('upsertSetting defaults updated_at to Date.now() when now is omitted', () => {
    const before = Date.now();
    upsertSetting('foo', 'bar');
    const after = Date.now();
    const row = mock.store.get('foo');
    expect(row.updated_at).toBeGreaterThanOrEqual(before);
    expect(row.updated_at).toBeLessThanOrEqual(after);
  });

  it('upsertSetting uses the provided `now` argument', () => {
    upsertSetting('foo', 'bar', 12345);
    expect(mock.store.get('foo').updated_at).toBe(12345);
  });

  it('getSettings returns only requested keys, missing ones absent from result', () => {
    upsertSetting('a', '1');
    upsertSetting('b', '2');
    upsertSetting('c', '3');
    const out = getSettings(['a', 'c', 'missing']);
    expect(out).toEqual({ a: '1', c: '3' });
    expect(out).not.toHaveProperty('missing');
    expect(out).not.toHaveProperty('b');
  });

  it('getSettings returns {} for an empty key list', () => {
    upsertSetting('a', '1');
    expect(getSettings([])).toEqual({});
  });
});
