export function formatTimeAgo(timestampSeconds: number): string {
  const now = Date.now();
  const diffMs = now - timestampSeconds * 1000;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestampSeconds * 1000).toLocaleDateString();
}

export function formatFullDateTime(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleString();
}

/**
 * Formats an ISO timestamp string (or null) as a human-readable relative time.
 * Uses i18n translation keys from the `settings.*` namespace.
 *
 * @param ts   ISO timestamp string or null/undefined
 * @param t    i18next translation function
 * @returns    Localised relative time string (e.g. "5 minutes ago") or the
 *             "settings.never" translation when ts is falsy.
 */
export function formatRelativeTimestamp(
  ts: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!ts) return t('settings.never');
  const date = new Date(ts);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t('settings.justNow');
  if (diffMins < 60) return t('settings.minutesAgo', { count: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t('settings.hoursAgo', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t('settings.daysAgo', { count: diffDays });
}
