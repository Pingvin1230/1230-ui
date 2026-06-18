import { useTranslation } from 'react-i18next';
import { Zap, Loader2 } from 'lucide-react';
import { useOpenCodeStatusStore } from '../store/openCodeStatusStore';

export function OpenCodeStatusIndicator() {
  const { t } = useTranslation();
  const status = useOpenCodeStatusStore((s) => s.status);
  const isLoading = useOpenCodeStatusStore((s) => s.isLoading);

  const label =
    status === 'connected'
      ? t('nav.opencodeConnected')
      : status === 'disconnected'
        ? t('nav.opencodeDisconnected')
        : t('nav.opencodeChecking');

  const colorClass =
    status === 'connected'
      ? 'text-green-600 dark:text-green-400'
      : status === 'disconnected'
        ? 'text-red-600 dark:text-red-400'
        : 'text-fg-muted';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('nav.opencodeStatus')}
      title={label}
      className={`p-1.5 rounded ${colorClass}`}
    >
      {isLoading && status === 'unknown' ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Zap className="w-5 h-5" />
      )}
    </div>
  );
}
