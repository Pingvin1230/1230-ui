import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Download, Wrench, Loader2, CheckCircle, XCircle, AlertTriangle, Sun, Moon, Bell, BellOff, Calendar, MessageCircle } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useThemeStore } from '../store/themeStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useSessionsSortStore } from '../store/sessionsSortStore';

interface Model {
  id: number;
  model_id: string;
  display_name: string;
  enabled: number;
}

interface Provider {
  id: number;
  name: string;
  display_name: string;
  env_var: string;
  base_url: string;
  sync_status: string;
  last_synced_at: string | null;
  models: Model[];
  enabledCount: number;
  totalCount: number;
}

export function SettingsPage() {
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { enabled: notificationsEnabled, setEnabled: setNotificationsEnabled } = useNotificationsStore();
  const sortMode = useSessionsSortStore((s) => s.sortMode);
  const setSortMode = useSessionsSortStore((s) => s.setSortMode);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<'update' | 'doctor' | null>(null);
  const [execResult, setExecResult] = useState<{
    command: string;
    success: boolean;
    output: string;
  } | null>(null);
  const [modelsData, setModelsData] = useState<Awaited<ReturnType<typeof api.getModels>> | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('selectedModel') ?? ''
  );
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const handleNotificationsToggle = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === 'granted') setNotificationsEnabled(true);
    } else if (Notification.permission === 'granted') {
      setNotificationsEnabled(!notificationsEnabled);
    } else {
      setNotificationsEnabled(false);
    }
  };

  useEffect(() => {
    loadProviders();
    loadModels();
  }, []);

  async function loadModels() {
    try {
      const data = await api.getModels();
      setModelsData(data);
      const saved = localStorage.getItem('selectedModel');
      if (saved && Object.values(data.providers).some((p) => p.models.some((m) => m.id === saved))) {
        setSelectedModel(saved);
      } else if (data.default) {
        setSelectedModel(data.default.id);
      }
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  }

  async function loadProviders() {
    try {
      setLoading(true);
      const data = await api.getModelProviders();
      setProviders(data);
      setError(null);
    } catch (err) {
      setError('Failed to load model providers');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);
      const result = await api.syncModelProviders();
      
      if (result.success) {
        await loadProviders();
      } else {
        setError(result.error || 'Sync failed');
      }
    } catch (err) {
      setError('Failed to sync providers');
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleModel(modelId: number) {
    try {
      const result = await api.toggleModel(modelId);
      if (result.success) {
        await loadProviders();
      }
    } catch (err) {
      console.error('Failed to toggle model:', err);
    }
  }

  async function handleExecCommand(command: 'update' | 'doctor') {
    try {
      setExecuting(command);
      setExecResult(null);
      const result = await api.execSystemCommand(command);
      setExecResult({
        command,
        success: result.success,
        output: result.output || result.error || 'No output'
      });
    } catch (err) {
      setExecResult({
        command,
        success: false,
        output: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setExecuting(null);
    }
  }

  function formatTimestamp(ts: string | null): string {
    if (!ts) return 'Never';
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  return (
    <div className="h-full flex flex-col px-4 md:px-6 py-4">
      <div className="max-w-3xl w-full mx-auto mb-6">
        <h1 className="text-xl font-semibold text-fg-primary">Settings</h1>
        <p className="text-sm text-fg-muted mt-1">Web UI configuration</p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* General Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="font-medium text-sm text-fg-primary mb-3">General</h3>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-default">
              <div>
                <p className="text-sm text-fg-primary">Appearance</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  {isDarkMode ? 'Dark mode' : 'Light mode'}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-default bg-bg-secondary hover:bg-bg-muted transition-colors text-sm text-fg-secondary"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4" />}
                {isDarkMode ? 'Dark' : 'Light'}
              </button>
            </div>

            {/* Notifications Toggle */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-default">
              <div>
                <p className="text-sm text-fg-primary">Notifications</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  {notificationPermission === 'denied'
                    ? 'Blocked by browser'
                    : notificationsEnabled
                      ? 'Enabled — alerts when tab is inactive'
                      : 'Disabled'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleNotificationsToggle}
                disabled={notificationPermission === 'denied'}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-default transition-colors text-sm ${
                  notificationPermission === 'denied'
                    ? 'opacity-50 cursor-not-allowed text-fg-muted'
                    : notificationsEnabled
                      ? 'text-blue-600 dark:text-blue-400 hover:bg-bg-muted'
                      : 'text-fg-secondary hover:bg-bg-muted'
                }`}
              >
                {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                {notificationsEnabled ? 'On' : 'Off'}
              </button>
            </div>

            {/* Sessions Sort Mode */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-default">
              <div>
                <p className="text-sm text-fg-primary">Sessions sort order</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  {sortMode === 'lastMessage'
                    ? 'Last message — most recently active first'
                    : 'Created — most recently started first'}
                </p>
              </div>
              <div
                role="group"
                aria-label="Sort sessions by"
                className="inline-flex rounded-lg border border-border-default overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setSortMode('created')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                    sortMode === 'created'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-fg-secondary hover:bg-bg-muted'
                  }`}
                  aria-pressed={sortMode === 'created'}
                  title="Sort by session creation date"
                >
                  <Calendar className="w-4 h-4" />
                  Created
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('lastMessage')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-border-default ${
                    sortMode === 'lastMessage'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-fg-secondary hover:bg-bg-muted'
                  }`}
                  aria-pressed={sortMode === 'lastMessage'}
                  title="Sort by last message date"
                >
                  <MessageCircle className="w-4 h-4" />
                  Last message
                </button>
              </div>
            </div>

            <p className="text-xs text-fg-muted mb-3">
              Default model used when creating new sessions
            </p>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              Default model
            </label>
            {modelsData ? (
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  localStorage.setItem('selectedModel', e.target.value);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(modelsData.providers).map(([providerId, provider]) => (
                  <optgroup key={providerId} label={provider.name}>
                    {provider.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {modelsData.default?.id === m.id ? ' (default)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <div className="text-sm text-fg-muted">Loading models…</div>
            )}
          </div>

          {/* Model Providers Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg">
            <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
              <div>
                <h3 className="font-medium text-fg-primary">Model Providers</h3>
                <p className="text-xs text-fg-muted mt-0.5">
                  Manage available models for chat sessions
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing || loading}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors disabled:cursor-not-allowed"
              >
                {syncing ? 'Syncing...' : 'Sync All'}
              </button>
            </div>

            {loading ? (
              <div className="px-4 py-8 flex items-center justify-center">
                <div className="spinner"></div>
              </div>
            ) : error ? (
              <div className="px-4 py-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                  <p className="text-sm text-red-500">{error}</p>
                  <button
                    onClick={loadProviders}
                    className="mt-2 px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : providers.length === 0 ? (
              <div className="px-4 py-8 text-center text-fg-muted">
                <p className="text-sm">No providers configured</p>
                <p className="text-xs mt-1">Click "Sync All" to fetch providers from Hermes</p>
              </div>
            ) : (
              <div className="divide-y divide-border-default">
                {providers.map((provider) => (
                  <div key={provider.id}>
                    <button
                      onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-bg-secondary transition-colors"
                    >
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg-primary">
                            {provider.display_name || provider.name}
                          </span>
                          {provider.sync_status === 'ok' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              Synced
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                              {provider.sync_status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-fg-muted">
                          <span>{provider.enabledCount}/{provider.totalCount} models enabled</span>
                          <span>•</span>
                          <span>Synced {formatTimestamp(provider.last_synced_at)}</span>
                        </div>
                      </div>
                        <svg
                          className={`w-5 h-5 text-fg-muted transition-transform ${
                            expandedProvider === provider.id ? 'rotate-180' : ''
                          }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedProvider === provider.id && (
                      <div className="px-4 pb-3 space-y-1">
                        {provider.models.length === 0 ? (
                          <p className="text-sm text-fg-muted py-2">
                            No models available
                          </p>
                        ) : (
                          provider.models.map((model) => (
                            <label
                              key={model.id}
                              className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-bg-secondary cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={model.enabled === 1}
                                onChange={() => handleToggleModel(model.id)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:bg-gray-700 dark:border-gray-600"
                              />
                              <span className={`text-sm ${model.enabled ? 'text-fg-primary' : 'text-fg-muted'}`}>
                                {model.display_name || model.model_id}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hermes Commands Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="font-medium text-sm text-fg-primary mb-3">Hermes Commands</h3>
            <p className="text-xs text-fg-muted mb-3">
              Execute Hermes system commands
            </p>
            <div className="space-y-2">
              <button
                onClick={() => setPendingCommand('update')}
                disabled={executing !== null}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {executing === 'update' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{executing === 'update' ? 'Updating...' : 'Hermes Update'}</span>
              </button>
              <button
                onClick={() => setPendingCommand('doctor')}
                disabled={executing !== null}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {executing === 'doctor' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wrench className="w-4 h-4" />
                )}
                <span>{executing === 'doctor' ? 'Running...' : 'Hermes Doctor Fix'}</span>
              </button>
            </div>
          </div>

          {/* Connection Status Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="font-medium text-sm text-fg-primary mb-2">Connection status</h3>
            <p className="text-sm text-fg-muted">
              Hermes Agent: <span className="text-green-500">Connected</span>
            </p>
          </div>

          {/* About Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="font-medium text-sm text-fg-primary mb-2">About</h3>
            <p className="text-sm text-fg-muted">
              1230.UI v0.1.0 (Phase 2)
            </p>
          </div>

        </div>
      </div>

      {/* Confirm Modal */}
      <Modal
        isOpen={pendingCommand !== null}
        onClose={() => setPendingCommand(null)}
        size="md"
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-fg-primary">
                {pendingCommand === 'update' ? 'Hermes Update' : 'Hermes Doctor Fix'}
              </h3>
              <p className="text-sm text-fg-secondary mt-1">
                This will restart the Hermes server. Active sessions will be interrupted.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setPendingCommand(null)}
              className="px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const cmd = pendingCommand;
                setPendingCommand(null);
                if (cmd) handleExecCommand(cmd);
              }}
              className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </Modal>

      {/* Command Result Modal */}
      <Modal
        isOpen={execResult !== null}
        onClose={() => setExecResult(null)}
        size="xl"
        title={
          execResult
            ? `${execResult.command === 'update' ? 'Hermes Update' : 'Hermes Doctor Fix'}${
                execResult.success ? '' : ' (failed)'
              }`
            : ''
        }
      >
        {execResult && (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-2 mb-3">
                {execResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className="text-sm text-fg-secondary">
                  {execResult.success ? 'Completed successfully' : 'Command failed'}
                </span>
              </div>
              <pre className="text-sm text-fg-primary whitespace-pre-wrap font-mono bg-bg-secondary p-3 rounded">
                {execResult.output}
              </pre>
            </div>
            <div className="p-4 border-t border-border-default">
              <button
                type="button"
                onClick={() => setExecResult(null)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
