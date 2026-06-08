import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeAgo, formatFullDateTime, formatRelativeTimestamp } from './time';

// Fixed "now" for deterministic tests
const NOW_MS = new Date('2026-06-08T12:00:00.000Z').getTime();
const NOW_SEC = Math.floor(NOW_MS / 1000);

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for < 1 minute ago', () => {
    expect(formatTimeAgo(NOW_SEC - 30)).toBe('Just now');
  });

  it('returns minutes for < 60 minutes ago', () => {
    expect(formatTimeAgo(NOW_SEC - 5 * 60)).toBe('5m ago');
  });

  it('returns hours for < 24 hours ago', () => {
    expect(formatTimeAgo(NOW_SEC - 3 * 3600)).toBe('3h ago');
  });

  it('returns "Yesterday" for exactly 1 day ago', () => {
    expect(formatTimeAgo(NOW_SEC - 86400)).toBe('Yesterday');
  });

  it('returns days for 2–6 days ago', () => {
    expect(formatTimeAgo(NOW_SEC - 3 * 86400)).toBe('3d ago');
  });

  it('returns a locale date string for >= 7 days ago', () => {
    const result = formatTimeAgo(NOW_SEC - 10 * 86400);
    // Should be a non-empty string from toLocaleDateString
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatFullDateTime', () => {
  it('returns a non-empty locale string', () => {
    const result = formatFullDateTime(NOW_SEC);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatRelativeTimestamp', () => {
  // Minimal i18n stub — mirrors what the settings.* namespace provides
  const t = (key: string, opts?: Record<string, unknown>): string => {
    const map: Record<string, string> = {
      'settings.never':      'Never',
      'settings.justNow':    'Just now',
      'settings.minutesAgo': `${opts?.count}m ago`,
      'settings.hoursAgo':   `${opts?.count}h ago`,
      'settings.daysAgo':    `${opts?.count}d ago`,
    };
    return map[key] ?? key;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Never" for null', () => {
    expect(formatRelativeTimestamp(null, t)).toBe('Never');
  });

  it('returns "Never" for undefined', () => {
    expect(formatRelativeTimestamp(undefined, t)).toBe('Never');
  });

  it('returns "Just now" for < 1 minute ago', () => {
    const ts = new Date(NOW_MS - 30_000).toISOString();
    expect(formatRelativeTimestamp(ts, t)).toBe('Just now');
  });

  it('returns minutes for < 60 minutes ago', () => {
    const ts = new Date(NOW_MS - 7 * 60_000).toISOString();
    expect(formatRelativeTimestamp(ts, t)).toBe('7m ago');
  });

  it('returns hours for < 24 hours ago', () => {
    const ts = new Date(NOW_MS - 2 * 3_600_000).toISOString();
    expect(formatRelativeTimestamp(ts, t)).toBe('2h ago');
  });

  it('returns days for >= 24 hours ago', () => {
    const ts = new Date(NOW_MS - 3 * 86_400_000).toISOString();
    expect(formatRelativeTimestamp(ts, t)).toBe('3d ago');
  });
});
