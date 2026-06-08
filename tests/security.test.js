import { describe, it, expect } from 'vitest';
import { sanitizeBody } from '../middleware/security.js';

describe('sanitizeBody', () => {
  it('sanitizes a top-level string field', () => {
    const result = sanitizeBody({ name: '<script>alert(1)</script>hello' });
    expect(result.name).not.toContain('<script>');
    expect(result.name).toContain('hello');
  });

  it('sanitizes strings inside nested objects', () => {
    const result = sanitizeBody({
      outer: {
        inner: '<img src=x onerror=alert(1)>text',
      },
    });
    expect(result.outer.inner).not.toContain('onerror');
    expect(result.outer.inner).toContain('text');
  });

  it('sanitizes strings inside arrays', () => {
    const result = sanitizeBody({
      tags: ['<b>bold</b>', 'plain', '<script>x</script>end'],
    });
    expect(result.tags[0]).not.toContain('<b>');
    expect(result.tags[1]).toBe('plain');
    expect(result.tags[2]).not.toContain('<script>');
    expect(result.tags[2]).toContain('end');
  });

  it('sanitizes strings inside arrays of objects (nested)', () => {
    const result = sanitizeBody({
      items: [{ label: '<em>hi</em>' }, { label: 'ok' }],
    });
    expect(result.items[0].label).not.toContain('<em>');
    expect(result.items[1].label).toBe('ok');
  });

  it('passes non-string primitives through unchanged', () => {
    const result = sanitizeBody({ count: 42, active: true, ratio: 3.14, nothing: null });
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.ratio).toBe(3.14);
    expect(result.nothing).toBeNull();
  });

  it('returns null/undefined/primitives unchanged at the top level', () => {
    expect(sanitizeBody(null)).toBeNull();
    expect(sanitizeBody(undefined)).toBeUndefined();
    expect(sanitizeBody('raw string')).toBe('raw string');
    expect(sanitizeBody(123)).toBe(123);
  });

  it('does not mutate the original object', () => {
    const original = { msg: '<b>hi</b>' };
    sanitizeBody(original);
    expect(original.msg).toBe('<b>hi</b>');
  });

  it('handles deeply nested objects up to depth cap without throwing', () => {
    // Build an object 15 levels deep — beyond MAX_SANITIZE_DEPTH
    let deep = { val: '<script>deep</script>' };
    for (let i = 0; i < 15; i++) deep = { child: deep };
    expect(() => sanitizeBody(deep)).not.toThrow();
  });

  it('strips <script> tags completely (stripIgnoreTagBody)', () => {
    const result = sanitizeBody({ x: 'before<script>evil()</script>after' });
    expect(result.x).not.toContain('evil');
    expect(result.x).toContain('before');
    expect(result.x).toContain('after');
  });
});
