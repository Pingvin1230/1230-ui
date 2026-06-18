import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeft, Zap, Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useOpenCodeStatusStore } from '../store/openCodeStatusStore';
import { ExecutorPageHeader } from '../components/settings/ExecutorPageHeader';
import { BlockSection } from '../components/settings/BlockSection';
import { OpenCodeProviderCard, type OpenCodeProviderData } from '../components/OpenCodeProviderCard';
import { useExecutorConfig } from '../hooks/useExecutorConfig';
import { api } from '../lib/api';

export function OpenCodeSettingsPage() {
  const { t } = useTranslation();
  const ocStatus = useOpenCodeStatusStore((s) => s.status);

  const { config, updateField, test, save, testing, saving, testResult, saveStatus, formComplete } =
    useExecutorConfig('opencode-1230');

  const [providers, setProviders] = useState<OpenCodeProviderData[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersCollapsed, setProvidersCollapsed] = useState(true);

  const loadProviders = useCallback(async () => {
    try {
      setProvidersLoading(true);
      const data = await api.getOpenCodeProviders();
      setProviders(data.providers);
    } catch (err) {
      console.error('Failed to load opencode providers:', err);
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

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
          icon={<Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          name={t('executorPage.opencodeTitle', 'OpenCode Settings')}
          description={t('executorPage.opencodeSubtitle', 'Optional second executor running as `opencode serve`.')}
          status={ocStatus}
        />

        <BlockSection
          title={t('blocks.models.title', 'Models')}
          description={t(
            'blocks.models.description',
            'Models the user can pick in the New Session and Chat pages for assistants bound to this executor.'
          )}
          unavailable={t(
            'blocks.models.unavailable',
            'Models for OpenCode are configured inside the `opencode serve` daemon and are not yet editable from 1230UI.'
          )}
        />

        <BlockSection title={t('blocks.providers.title', 'Providers')}>
          <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
            <p className="text-xs text-fg-muted">
              {providersLoading
                ? t('common.loading')
                : providers.length > 0
                  ? `${providers.length} ${t('blocks.providers.count', 'providers configured')}`
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
              ) : providers.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-8">
                  {t('common.noProvidersConfigured')}
                </p>
              ) : (
                providers.map((p) => (
                  <OpenCodeProviderCard key={p.id} provider={p} />
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
                {t('blocks.connection.opencodeUrl', 'OpenCode Daemon URL')}
              </label>
              <input
                type="text"
                value={config.url}
                onChange={(e) => updateField('url', e.target.value)}
                placeholder="http://127.0.0.1:4097"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1">
                {t('blocks.connection.username', 'Username')}
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => updateField('username', e.target.value)}
                autoComplete="username"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1">
                {t('blocks.connection.password', 'Password')}
                {config.hasPassword && !config.password && (
                  <span className="ml-1 text-fg-muted font-normal">(saved)</span>
                )}
              </label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder={config.hasPassword ? '••••••••' : ''}
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

      </div>
    </div>
  );
}
