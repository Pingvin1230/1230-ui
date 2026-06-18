import { useTranslation } from 'react-i18next';

interface ExecutorPageHeaderProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'unknown';
  version?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
}

const STATUS_DOT: Record<ExecutorPageHeaderProps['status'], string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-red-500',
  unknown: 'bg-fg-muted',
};

export function ExecutorPageHeader({
  icon,
  name,
  description,
  status,
  version,
  latestVersion,
  updateAvailable,
}: ExecutorPageHeaderProps) {
  const { t } = useTranslation();
  const statusLabel =
    status === 'connected'
      ? t('dashboard.connected')
      : status === 'disconnected'
        ? t('dashboard.disconnected')
        : t('common.unknown', 'Unknown');

  const versionText = version
    ? latestVersion && updateAvailable
      ? `${version} (${latestVersion} latest)`
      : version
    : null;

  return (
    <div className="bg-bg-primary border border-border-default rounded-lg p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-fg-primary">{name}</h1>
        <p className="text-sm text-fg-muted mt-0.5">{description}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
            {statusLabel}
          </span>
          {versionText && <span>v{versionText}</span>}
        </div>
      </div>
    </div>
  );
}
