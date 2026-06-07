import { useTranslation } from 'react-i18next';
import { Server, Loader2 } from 'lucide-react';
import { useHermesStatusStore } from '../store/hermesStatusStore';

export function HermesStatusIndicator() {
  const { t } = useTranslation();
  const status = useHermesStatusStore((s) => s.status);
  const isLoading = useHermesStatusStore((s) => s.isLoading);
  const version = useHermesStatusStore((s) => s.version);

  const label =
    status === 'connected'
      ? t('nav.hermesApiConnected')
      : status === 'disconnected'
        ? t('nav.hermesApiDisconnected')
        : t('nav.hermesApiChecking');

  const tooltip = version ? `${label} (${version})` : label;

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
      aria-label={t('nav.hermesApiStatus')}
      title={tooltip}
      className={`p-1.5 rounded ${colorClass}`}
    >
      {isLoading && status === 'unknown' ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Server className="w-5 h-5" />
      )}
    </div>
  );
}
