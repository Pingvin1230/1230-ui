import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cloud, WifiOff, Wifi, Trash2, Loader2, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '../lib/api';
import type { CloudConnection } from '../types/api';
import { useCloudConnectStore } from '../store/cloudConnectStore';

function ConnectionRow({
  conn,
  onDelete,
  onTest,
  testing,
}: {
  conn: CloudConnection;
  onDelete: (id: number) => void;
  onTest: (id: number) => void;
  testing: number | null;
}) {
  const { t } = useTranslation();

  const statusIcon = () => {
    if (conn.status === 'ok') return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (conn.status === 'auth_failed') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (conn.status === 'network_error') return <AlertCircle className="w-4 h-4 text-orange-500" />;
    return <Wifi className="w-4 h-4 text-fg-muted" />;
  };

  const statusText = () => {
    if (conn.status === 'ok') return t('cloudConnect.settings.statusOk', 'Connected');
    if (conn.status === 'auth_failed') return t('cloudConnect.settings.statusAuthFailed', 'Auth failed');
    if (conn.status === 'network_error') return t('cloudConnect.settings.statusNetworkError', 'Network error');
    return t('cloudConnect.settings.statusUnknown', 'Unknown');
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-bg-secondary transition-colors">
      {/* Status icon */}
      <div className="flex-shrink-0">{statusIcon()}</div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-fg-primary truncate">{conn.label}</div>
        <div className="text-xs text-fg-muted truncate">{conn.url}</div>
        {conn.lastError && conn.status !== 'ok' && (
          <div className="text-xs text-red-500 truncate mt-0.5">{conn.lastError}</div>
        )}
      </div>

      {/* Status badge */}
      <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${
        conn.status === 'ok'
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
          : conn.status === 'unknown'
          ? 'bg-bg-muted text-fg-muted'
          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
      }`}>
        {statusText()}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onTest(conn.id)}
          disabled={testing === conn.id}
          className="p-1.5 text-fg-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-40"
          title={t('cloudConnect.settings.test', 'Test connection')}
        >
          {testing === conn.id
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Wifi className="w-4 h-4" />
          }
        </button>
        <button
          type="button"
          onClick={() => onDelete(conn.id)}
          className="p-1.5 text-fg-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          title={t('cloudConnect.settings.delete', 'Remove connection')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const fetchConnections = useCloudConnectStore((s) => s.fetchConnections);
  const selectConnection = useCloudConnectStore((s) => s.selectConnection);

  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !username || !password) return;
    setAdding(true);
    setError(null);
    try {
      const result = await api.createCloudConnection({ label: label || url, url, username, password });
      const testResult = await api.testCloudConnection(result.connection.id);
      if (!testResult.ok) {
        setError(testResult.error || t('cloudConnect.settings.testFailed', 'Connection test failed'));
        setAdding(false);
        return;
      }
      await fetchConnections();
      selectConnection(result.connection.id);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setAdding(false);
    }
  }, [label, url, username, password, fetchConnections, selectConnection, onDone, t]);

  return (
    <div className="border border-border-default rounded-lg bg-bg-primary">
      <div className="px-4 py-3 border-b border-border-default flex items-center gap-2">
        <Cloud className="w-4 h-4 text-fg-muted" />
        <h3 className="text-sm font-medium text-fg-primary">
          {t('cloudConnect.addConnection', 'Add connection')}
        </h3>
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">
              {t('cloudConnect.form.label', 'Label')}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('cloudConnect.form.labelPlaceholder', 'My cloud')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">
              {t('cloudConnect.form.url', 'WebDAV URL')} *
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://webdav.example.com"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">
              {t('cloudConnect.form.username', 'Username')} *
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1">
              {t('cloudConnect.form.password', 'Password')} *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onDone}
            disabled={adding}
            className="px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary rounded-lg transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            disabled={adding || !url || !username || !password}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {adding
              ? t('cloudConnect.form.testing', 'Testing...')
              : t('cloudConnect.form.save', 'Save')
            }
          </button>
        </div>
      </form>
    </div>
  );
}

export function CloudSettingsPage() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const fetchStoreConnections = useCloudConnectStore((s) => s.fetchConnections);
  const disconnectedIds = useCloudConnectStore((s) => s.disconnectedIds);
  const disconnectConnection = useCloudConnectStore((s) => s.disconnectConnection);
  const reconnectConnection = useCloudConnectStore((s) => s.reconnectConnection);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listCloudConnections();
      setConnections(data.connections);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTest = useCallback(async (id: number) => {
    setTesting(id);
    try {
      await api.testCloudConnection(id);
      await load();
    } finally {
      setTesting(null);
    }
  }, [load]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await api.deleteCloudConnection(id);
      // Also clean up store state
      disconnectConnection(id);
      await fetchStoreConnections();
      await load();
    } catch { /* silent */ }
  }, [load, fetchStoreConnections, disconnectConnection]);

  const handleAddDone = useCallback(async () => {
    setShowAddForm(false);
    await load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Header */}
        <div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('common.backToSettings', 'Back to Settings')}
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-fg-primary">
                {t('cloudConnect.settings.title', 'Cloud Connect')}
              </h1>
              <p className="text-sm text-fg-muted">
                {t('cloudConnect.settings.subtitle', 'Manage WebDAV connections for accessing cloud files in chat')}
              </p>
            </div>
          </div>
        </div>

        {/* Connections list */}
        <div className="bg-bg-primary border border-border-default rounded-lg">
          <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
            <h2 className="text-sm font-medium text-fg-primary">
              {t('cloudConnect.settings.connections', 'Connections')}
            </h2>
            {!showAddForm && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('cloudConnect.addConnection', 'Add connection')}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            </div>
          ) : connections.length === 0 && !showAddForm ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <WifiOff className="w-9 h-9 text-fg-muted mb-3 opacity-50" />
              <p className="text-sm text-fg-muted">
                {t('cloudConnect.settings.noConnections', 'No connections yet')}
              </p>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('cloudConnect.addConnection', 'Add connection')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border-default">
              {connections.map((conn) => {
                const isOff = disconnectedIds.has(conn.id);
                return (
                  <div key={conn.id}>
                    <ConnectionRow
                      conn={conn}
                      onDelete={handleDelete}
                      onTest={handleTest}
                      testing={testing}
                    />
                    {/* Connect/Disconnect toggle */}
                    <div className="px-4 pb-3 flex items-center gap-2">
                      <span className="text-xs text-fg-muted">
                        {t('cloudConnect.settings.sessionStatus', 'In chat:')}
                      </span>
                      {isOff ? (
                        <button
                          type="button"
                          onClick={() => reconnectConnection(conn.id)}
                          className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline"
                        >
                          <Wifi className="w-3 h-3" />
                          {t('cloudConnect.settings.connect', 'Connect')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => disconnectConnection(conn.id)}
                          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg-primary hover:underline"
                        >
                          <WifiOff className="w-3 h-3" />
                          {t('cloudConnect.settings.disconnect', 'Disconnect')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add form inline */}
          {showAddForm && (
            <div className="p-4 border-t border-border-default">
              <AddForm onDone={handleAddDone} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
