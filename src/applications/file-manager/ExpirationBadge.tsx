import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

interface ExpirationBadgeProps {
  expiresAt: number | null;
  now: number;
}

const colorClasses: Record<string, string> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  gray: 'bg-bg-secondary text-fg-muted',
};

export function ExpirationBadge({ expiresAt, now }: ExpirationBadgeProps) {
  const { t } = useTranslation();

  const badge = useMemo(() => {
    if (!expiresAt) {
      return { color: 'gray', text: t('fileManager.expiration.never') };
    }

    const msLeft = expiresAt - now;
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));

    if (msLeft < 0) {
      return { color: 'red', text: t('fileManager.expiration.expired') };
    }
    if (daysLeft === 0) {
      return { color: 'red', text: t('fileManager.expiration.hoursLeft', { count: Math.max(1, hoursLeft) }) };
    }
    if (daysLeft <= 7) {
      return { color: 'orange', text: t('fileManager.expiration.daysLeft', { count: daysLeft }) };
    }
    if (daysLeft <= 14) {
      return { color: 'yellow', text: t('fileManager.expiration.daysLeft', { count: daysLeft }) };
    }
    return { color: 'green', text: t('fileManager.expiration.daysLeft', { count: daysLeft }) };
  }, [expiresAt, now, t]);

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${colorClasses[badge.color]}`}>
      {badge.text}
    </span>
  );
}
