import { describe, it, expect } from 'vitest';
import { formatCooldown, LIKE_COOLDOWN_SEC, LIKE_STORAGE_KEY } from './useLike';

describe('constants', () => {
  it('uses the shared storage key and a 1h cooldown', () => {
    expect(LIKE_STORAGE_KEY).toBe('hermes-1230-last-like');
    expect(LIKE_COOLDOWN_SEC).toBe(3600);
  });
});

describe('formatCooldown', () => {
  it('returns an empty string for zero or negative values', () => {
    expect(formatCooldown(0)).toBe('');
    expect(formatCooldown(-5)).toBe('');
  });

  it('formats pure seconds below a minute', () => {
    expect(formatCooldown(1)).toBe('1s');
    expect(formatCooldown(45)).toBe('45s');
  });

  it('formats minutes with zero-padded seconds', () => {
    expect(formatCooldown(60)).toBe('1m 00s');
    expect(formatCooldown(65)).toBe('1m 05s');
    expect(formatCooldown(599)).toBe('9m 59s');
  });

  it('switches to hours once reaching 60 minutes', () => {
    expect(formatCooldown(3600)).toBe('1h 0m');
    expect(formatCooldown(3900)).toBe('1h 5m');
    expect(formatCooldown(3600 + 5 * 60)).toBe('1h 5m');
  });
});
