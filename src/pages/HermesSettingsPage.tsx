import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, Download, Wrench, Loader2, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { formatRelativeTimestamp } from '../lib/time';
import { useHermesStatusStore } from '../store/hermesStatusStore';
import { ExecutorPageHeader } from '../components/settings/ExecutorPageHeader';
import { BlockSection } from '../components/settings/BlockSection';
import { Modal } from '../components/Modal';
import { ProviderCard, type ProviderCardData } from '../components/ProviderCard';
import { useExecutorConfig } from '../hooks/useExecutorConfig';

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

export function HermesSettingsPage() {
  const { t } = useTranslation();
  const hermesStatus = useHermesStatusStore((s) => s.status);
  const hermesVersion = useHermesStatusStore((s) => s.version);
  const hermesLatestVersion = useHermesStatusStore((s) => s.latestVersion);
  const hermesUpdateAvailable = useHermesStatusStore((s) => s.updateAvailable);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null);

  const [providersCollapsed, setProvidersCollapsed] = useState(true);
  const [providersList, setProvidersList] = useState<ProviderCardData[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  const { config, updateField, test, save, testing, saving, testResult, saveStatus, formComplete } =
    useExecutorConfig('hermes-agent');

  const [executing, setExecuting] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<'update' | 'doctor' | null>(null);
  const [execResult, setExecResult] = useState<{
    command: string;
    success: boolean;
    output: string;
  } | null>(null);

  const { enabledTotal, modelsTotal } = useMemo(() => {
    let enabledTotal = 0;
    let modelsTotal = 0;
    for (const p of providers) {
      enabledTotal += p.enabledCount;
      modelsTotal += p.totalCount;
    }
    return { enabledTotal, modelsTotal };
  }, [providers]);

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
    loadProviders();
  }, [loadProviders]);

  const loadProvidersList = useCallback(async () => {
    try {
      setProvidersLoading(true);
      const data = await api.getAvailableProviders();
      const sorted = [...data.providers].sort((a, b) => a.display_name.localeCompare(b.display_name));
      setProvidersList(sorted);
    } catch (err) {
      console.error('Failed to load providers list:', err);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProvidersList();
  }, [loadProvidersList]);

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
        output: result.output || result.error || t('settings.noOutput'),
      });
    } catch (err) {
      setExecResult({
        command,
        success: false,
        output: err instanceof Error ? err.message : t('settings.unknownError'),
      });
    } finally {
      setExecuting(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">

        <div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('executorPage.back', 'Back to Settings')}
          </Link>
        </div>

        <ExecutorPageHeader
          icon={<Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          name={t('executorPage.hermesTitle', 'Hermes Agent Settings')}
          description={t('executorPage.hermesSubtitle', 'Default executor. Spawns a Python subprocess per chat turn.')}
          status={hermesStatus}
          version={hermesVersion ?? undefined}
          latestVersion={hermesLatestVersion ?? undefined}
          updateAvailable={
            typeof hermesUpdateAvailable === 'number' && hermesUpdateAvailable > 0
          }
        />

        <BlockSection title={t('blocks.models.title', 'Models')}>
          <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
            <p className="text-xs text-fg-muted">
              {loading
                ? t('common.loading')
                : t('blocks.models.summary', { enabled: enabledTotal, total: modelsTotal })}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing || loading}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors disabled:cursor-not-allowed min-h-[44px]"
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
        </BlockSection>

        <BlockSection title={t('blocks.providers.title', 'Providers')}>
          <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
            <p className="text-xs text-fg-muted">
              {providersLoading
                ? t('common.loading')
                : providersList.length > 0
                  ? `${providersList.length} ${t('blocks.providers.count', 'providers configured')}`
                  : t('common.noProvidersConfigured')}
            </p>
            <button
              type="button"
              onClick={() => setProvidersCollapsed(!providersCollapsed)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border-default bg-bg-primary hover:bg-bg-secondary text-fg-secondary rounded-lg transition-colors min-h-[44px]"
            >
              {providersCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              {providersCollapsed ? t('common.expand', 'Expand') : t('common.collapse', 'Collapse')}
            </button>
          </div>
          {!providersCollapsed && (
            <div className="space-y-2">
              {providersLoading ? (
                <div className="px-4 py-8 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-fg-muted" />
                </div>
              ) : providersList.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-8">
                  {t('common.noProvidersConfigured')}
                </p>
              ) : (
                providersList.map((p) => (
                  <ProviderCard key={p.name} provider={p} onChanged={loadProvidersList} />
                ))
              )}
            </div>
          )}
        </BlockSection>

        <BlockSection
          title={t('blocks.connection.title', 'Connection')}
          description={t('blocks.connection.description', 'How 1230UI talks to this executor.')}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1">
                {t('blocks.connection.pythonPath', 'Python path')}
              </label>
              <input
                type="text"
                value={config.pythonPath}
                onChange={(e) => updateField('pythonPath', e.target.value)}
                placeholder="/usr/local/lib/hermes-agent/venv/bin/python"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1">
                {t('blocks.connection.apiUrl', 'Hermes API URL')}
              </label>
              <input
                type="text"
                value={config.apiUrl}
                onChange={(e) => updateField('apiUrl', e.target.value)}
                placeholder="http://127.0.0.1:8642"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1">
                {t('blocks.connection.apiKey', 'Hermes API key')}
                {config.hasApiKey && !config.apiKey && (
                  <span className="ml-1 text-fg-muted font-normal">(saved)</span>
                )}
              </label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => updateField('apiKey', e.target.value)}
                placeholder={config.hasApiKey ? '••••••••' : ''}
                autoComplete="current-password"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={test}
                disabled={testing || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-default bg-bg-secondary hover:bg-bg-muted text-fg-secondary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {t('blocks.connection.testConnection', 'Test connection')}
              </button>
              {testResult === 'connected' && (
                <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  {t('blocks.connection.connected', 'Connected')} ✓
                </span>
              )}
              {testResult === 'unreachable' && (
                <span className="flex items-center gap-1 text-sm text-red-500">
                  <XCircle className="w-4 h-4" />
                  {t('blocks.connection.unreachable', 'Unreachable')} ✗
                </span>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={save}
                disabled={saving || !formComplete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors min-h-[44px]"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {t('blocks.connection.save', 'Save')}
              </button>
            </div>
            {saveStatus === 'saved' && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                {t('blocks.connection.saved', 'Saved')}
              </p>
            )}
            {saveStatus === 'error' && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                {t('blocks.connection.saveError', 'Failed to save')}
              </p>
            )}
          </div>
        </BlockSection>

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

      </div>

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
