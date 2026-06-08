import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import i18n from '../i18n';
import { api } from '../lib/api';
import { formatRelativeTimestamp } from '../lib/time';
import { Download, Wrench, Loader2, CheckCircle, XCircle, AlertTriangle, Sun, Moon, Bell, BellOff, Calendar, MessageCircle, Heart, ArrowRight } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useThemeStore } from '../store/themeStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useSessionsSortStore } from '../store/sessionsSortStore';
import { useHermesStatusStore } from '../store/hermesStatusStore';

const LIKE_STORAGE_KEY = 'hermes-1230-last-like';
const LIKE_DEFAULT_COOLDOWN_SEC = 3600;

type LikeState = 'idle' | 'sending' | 'sent' | 'cooldown';

function formatCooldown(sec: number): string {
  if (sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

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
  const { t } = useTranslation();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { enabled: notificationsEnabled, setEnabled: setNotificationsEnabled } = useNotificationsStore();
  const sortMode = useSessionsSortStore((s) => s.sortMode);
  const setSortMode = useSessionsSortStore((s) => s.setSortMode);
  const hermesStatus = useHermesStatusStore((s) => s.status);
  const hermesVersion = useHermesStatusStore((s) => s.version);
  const hermesLatestVersion = useHermesStatusStore((s) => s.latestVersion);
  const hermesUpdateAvailable = useHermesStatusStore((s) => s.updateAvailable);
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
  // Computed once at mount via useState lazy-initialiser to avoid calling Date.now()
  // directly in the render body (which would be flagged as impure by react-hooks/purity).
  const [likeState, setLikeState] = useState<LikeState>(() => {
    try {
      const raw = localStorage.getItem(LIKE_STORAGE_KEY);
      const last = raw ? Number(raw) : 0;
      if (!last) return 'idle';
      const remainingMs = last + LIKE_DEFAULT_COOLDOWN_SEC * 1000 - Date.now();
      return remainingMs > 0 ? 'cooldown' : 'idle';
    } catch {
      return 'idle';
    }
  });
  const [likeError, setLikeError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(LIKE_STORAGE_KEY);
      const last = raw ? Number(raw) : 0;
      if (!last) return 0;
      const remainingMs = last + LIKE_DEFAULT_COOLDOWN_SEC * 1000 - Date.now();
      return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (likeState !== 'cooldown') return;
    const timer = window.setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setLikeState('idle');
          setLikeError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [likeState]);

  async function handleLike() {
    if (likeState === 'sending' || likeState === 'cooldown') return;
    setLikeState('sending');
    setLikeError(null);
    try {
      const result = await api.sendLike();
      try {
        localStorage.setItem(LIKE_STORAGE_KEY, String(result.sent_at));
      } catch {
        // ignore
      }
      setLikeState('sent');
    } catch (err) {
      const e = err as { type?: string; retry_after?: number; message?: string };
      if (e.type === 'cooldown' && typeof e.retry_after === 'number') {
        const sentAt = Date.now() - (LIKE_DEFAULT_COOLDOWN_SEC - e.retry_after) * 1000;
        try {
          localStorage.setItem(LIKE_STORAGE_KEY, String(sentAt));
        } catch {
          // ignore
        }
        setCooldownRemaining(e.retry_after);
        setLikeState('cooldown');
        return;
      }
      setLikeState('idle');
      setLikeError(e.message || t('settings.failedToSendLike'));
    }
  }

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

  const loadModels = useCallback(async () => {
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
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getModelProviders();
      setProviders(data);
      setError(null);
    } catch (err) {
      setError(t('settings.failedToLoadProviders'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data-fetch on mount; setState inside async callback, not directly in effect body
    loadProviders();
    loadModels();
  }, [loadProviders, loadModels]);

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);
      const result = await api.syncModelProviders();
      
      if (result.success) {
        await loadProviders();
      } else {
        setError(result.error || t('settings.syncFailed'));
      }
    } catch (err) {
      setError(t('settings.failedToSyncProviders'));
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
        output: result.output || result.error || t('settings.noOutput')
      });
    } catch (err) {
      setExecResult({
        command,
        success: false,
        output: err instanceof Error ? err.message : t('settings.unknownError')
      });
    } finally {
      setExecuting(null);
    }
  }

  return (
    <div className="h-full flex flex-col px-4 md:px-6 py-4">
      <div className="max-w-3xl w-full mx-auto mb-6">
        <h1 className="text-xl font-semibold text-fg-primary">{t('settings.title')}</h1>
        <p className="text-sm text-fg-muted mt-1">{t('settings.description')}</p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* General Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="font-medium text-sm text-fg-primary mb-3">{t('settings.general')}</h3>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-default">
              <div>
                <p className="text-sm text-fg-primary">{t('settings.appearance')}</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  {isDarkMode ? t('settings.darkMode') : t('settings.lightMode')}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-default bg-bg-secondary hover:bg-bg-muted transition-colors text-sm text-fg-secondary"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4" />}
                {isDarkMode ? t('settings.dark') : t('settings.light')}
              </button>
            </div>

            {/* Notifications Toggle */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-default">
              <div>
                <p className="text-sm text-fg-primary">{t('settings.notifications')}</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  {notificationPermission === 'denied'
                    ? t('settings.notificationsBlocked')
                    : notificationsEnabled
                      ? t('settings.notificationsEnabled')
                      : t('settings.notificationsDisabled')}
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
                {notificationsEnabled ? t('settings.on') : t('settings.off')}
              </button>
            </div>

            {/* Sessions Sort Mode */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-default">
              <div>
                <p className="text-sm text-fg-primary">{t('settings.sortOrder')}</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  {sortMode === 'lastMessage'
                    ? t('settings.sortLastMessage')
                    : t('settings.sortCreated')}
                </p>
              </div>
              <div
                role="group"
                aria-label={t('settings.sortLabel')}
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
                  {t('settings.sortCreatedBtn')}
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
                  {t('settings.sortLastMessageBtn')}
                </button>
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-default">
              <div>
                <p className="text-sm text-fg-primary">Language</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  Interface language
                </p>
              </div>
              <select
                value={i18n.language}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </div>

            <p className="text-xs text-fg-muted mb-3">
              {t('settings.defaultModelDesc')}
            </p>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              {t('settings.defaultModel')}
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
                        {modelsData.default?.id === m.id ? t('common.defaultSuffix') : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <div className="text-sm text-fg-muted">{t('common.loadingModels')}</div>
            )}
          </div>

          {/* Assistants Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg">
            <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
              <div>
                <h3 className="font-medium text-fg-primary">{t('assistants.title')}</h3>
                <p className="text-xs text-fg-muted mt-0.5">
                  {t('assistants.subtitle')}
                </p>
              </div>
              <Link
                to="/assistants"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border-default bg-bg-primary hover:bg-bg-secondary text-fg-secondary rounded-lg transition-colors min-h-[44px]"
              >
                {t('assistants.manage')}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Model Providers Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg">
            <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
              <div>
                <h3 className="font-medium text-fg-primary">{t('settings.modelProviders')}</h3>
                <p className="text-xs text-fg-muted mt-0.5">
                  {t('settings.modelProvidersDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  to="/settings/providers"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border-default bg-bg-primary hover:bg-bg-secondary text-fg-secondary rounded-lg transition-colors"
                >
                  {t('providers.manageKeys')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <button
                  onClick={handleSync}
                  disabled={syncing || loading}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors disabled:cursor-not-allowed"
                >
                  {syncing ? t('settings.syncing') : t('settings.syncAll')}
                </button>
              </div>
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
                    {t('common.retry')}
                  </button>
                </div>
              </div>
            ) : providers.length === 0 ? (
              <div className="px-4 py-8 text-center text-fg-muted">
                <p className="text-sm">{t('common.noProvidersConfigured')}</p>
                <p className="text-xs mt-1">{t('settings.noProvidersHint')}</p>
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
                              {t('settings.synced')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                              {provider.sync_status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-fg-muted">
                          <span>{t('settings.modelsEnabled', { enabled: provider.enabledCount, total: provider.totalCount })}</span>
                          <span>•</span>
                          <span>{t('settings.syncedAt', { timestamp: formatRelativeTimestamp(provider.last_synced_at, t) })}</span>
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
                            {t('settings.noModelsInProvider')}
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
            <h3 className="font-medium text-sm text-fg-primary mb-3">{t('settings.hermesCommands')}</h3>
            <p className="text-xs text-fg-muted mb-3">
              {t('settings.hermesCommandsDesc')}
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
                <span>{executing === 'update' ? t('settings.updating') : t('settings.hermesUpdate')}</span>
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
                <span>{executing === 'doctor' ? t('settings.running') : t('settings.hermesDoctorFix')}</span>
              </button>
            </div>
          </div>

          {/* Hermes Agent Status Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="font-medium text-sm text-fg-primary mb-3">{t('settings.connectionStatus')}</h3>
            {hermesStatus === 'unknown' ? (
              <p className="text-sm text-fg-muted">{t('settings.loadingStatus')}</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-fg-muted">
                  {t('settings.hermesAgent')}{' '}
                  {hermesStatus === 'connected' ? (
                    <span className="text-green-500">{t('dashboard.connected')}</span>
                  ) : (
                    <span className="text-red-500">{t('dashboard.disconnected')}</span>
                  )}
                </p>
                {hermesVersion && (
                  <p className="text-fg-muted">
                    {t('settings.hermesAgentVersion', { version: hermesVersion })}
                  </p>
                )}
                {hermesLatestVersion && (
                  <p className="text-fg-muted">
                    {t('settings.latestVersion', { version: hermesLatestVersion })}
                  </p>
                )}
                {typeof hermesUpdateAvailable === 'number' && hermesUpdateAvailable > 0 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    {t('settings.updateAvailable', { count: hermesUpdateAvailable })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* About Section */}
          <div className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="font-medium text-sm text-fg-primary mb-2">{t('settings.about')}</h3>
            <p className="text-sm text-fg-muted">
              {t('common.version')}
            </p>
            <div className="mt-3 pt-3 border-t border-border-default">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <a
                    href="https://github.com/Pingvin1230/1230-ui"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View source on GitHub"
                    className="text-fg-secondary hover:text-fg-primary transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5 fill-current"
                      aria-hidden="true"
                    >
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                  </a>
                  <button
                    type="button"
                    onClick={handleLike}
                    disabled={likeState === 'sending' || likeState === 'cooldown'}
                    aria-label={
                      likeState === 'sent'
                        ? t('settings.liked')
                        : likeState === 'cooldown'
                          ? t('settings.likeAvailable', { time: formatCooldown(cooldownRemaining) })
                          : t('settings.sendLike')
                    }
                    title={
                      likeState === 'cooldown'
                        ? t('settings.tryAgainIn', { time: formatCooldown(cooldownRemaining) })
                        : undefined
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                      likeState === 'sent'
                        ? 'border-pink-300 bg-pink-50 text-pink-600 dark:border-pink-800/50 dark:bg-pink-900/20 dark:text-pink-400'
                        : likeState === 'cooldown'
                          ? 'border-border-default bg-bg-secondary text-fg-muted cursor-not-allowed'
                          : 'border-border-default bg-bg-primary text-fg-secondary hover:bg-bg-secondary hover:text-pink-500'
                    }`}
                  >
                    {likeState === 'sending' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : likeState === 'sent' ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : likeState === 'cooldown' ? (
                      <Heart className="w-3.5 h-3.5" />
                    ) : (
                      <Heart className="w-3.5 h-3.5" />
                    )}
                    {likeState === 'sent'
                      ? t('settings.liked')
                      : likeState === 'sending'
                        ? t('settings.sending')
                        : likeState === 'cooldown'
                          ? formatCooldown(cooldownRemaining)
                          : t('settings.like')}
                  </button>
                </div>
                <p className="text-xs text-fg-muted">
                  {t('common.copyright')}
                </p>
              </div>
              {likeError && (
                <p className="mt-2 text-xs text-red-500">{likeError}</p>
              )}
            </div>
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
                {pendingCommand === 'update' ? t('settings.hermesUpdate') : t('settings.hermesDoctorFix')}
              </h3>
              <p className="text-sm text-fg-secondary mt-1">
                {t('settings.confirmCommandDesc')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setPendingCommand(null)}
              className="px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary rounded-lg transition-colors"
            >
              {t('common.cancel')}
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
              {t('common.confirm')}
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
            ? `${execResult.command === 'update' ? t('settings.hermesUpdate') : t('settings.hermesDoctorFix')}${
                execResult.success ? '' : t('settings.failedSuffix')
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
                  {execResult.success ? t('settings.completedSuccessfully') : t('settings.commandFailed')}
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
              {t('common.close')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
