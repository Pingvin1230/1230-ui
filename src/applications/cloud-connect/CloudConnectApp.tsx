import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Loader2, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCloudConnectStore } from '../../store/cloudConnectStore';
import { ConnectionChips } from './components/ConnectionChips';
import { EntryList } from './components/EntryList';
import type { ApplicationComponentProps } from '../types';

export function CloudConnectApp({ sessionId }: ApplicationComponentProps) {
  const { t } = useTranslation();
  const connections = useCloudConnectStore((s) => s.connections);
  const selectedConnectionId = useCloudConnectStore((s) => s.selectedConnectionId);
  const disconnectedIds = useCloudConnectStore((s) => s.disconnectedIds);
  const loading = useCloudConnectStore((s) => s.loading);
  const error = useCloudConnectStore((s) => s.error);
  const fetchConnections = useCloudConnectStore((s) => s.fetchConnections);
  const selectConnection = useCloudConnectStore((s) => s.selectConnection);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  if (loading && connections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Cloud className="w-10 h-10 text-fg-muted mb-3" />
        <p className="text-sm font-medium text-fg-primary">{t('cloudConnect.empty.noConnections')}</p>
        <p className="text-xs text-fg-muted mt-1 mb-4">{t('cloudConnect.empty.noConnectionsDesc')}</p>
        <Link
          to="/settings/cloud"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {t('cloudConnect.addConnection')}
        </Link>
      </div>
    );
  }

  const isDisconnected = selectedConnectionId !== null && disconnectedIds.has(selectedConnectionId);

  if (error && !isDisconnected) {
    return (
      <div className="flex flex-col h-full">
        <ConnectionChips />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
          <p className="text-sm text-fg-muted mb-2">{error}</p>
          <button
            type="button"
            onClick={() => { if (selectedConnectionId) selectConnection(selectedConnectionId); }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ConnectionChips />

      {isDisconnected ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-fg-muted">
          <Cloud className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">{t('cloudConnect.disconnected', 'Disconnected')}</p>
        </div>
      ) : (
        <EntryList sessionId={sessionId} />
      )}
    </div>
  );
}
