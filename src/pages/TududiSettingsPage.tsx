import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Shield,
  Save,
  Wifi,
} from 'lucide-react';
import { tududiApi, TududiApiError } from '../lib/api/tududi';

type HealthResult = {
  configured: boolean;
  reachable: boolean;
  status?: number;
  error?: string;
} | null;

type TestResult = 'connected' | 'unreachable' | null;
type SaveStatus = 'idle' | 'saved' | 'error';

export function TududiSettingsPage() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthResult>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthTesting, setHealthTesting] = useState(false);

  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const runHealthCheck = useCallback(async () => {
    setHealthTesting(true);
    try {
      const result = await tududiApi.health();
      setHealth(result);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setHealth({ configured: false, reachable: false, error: msg });
    } finally {
      setHealthTesting(false);
      setHealthLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await tududiApi.getConfig();
      setApiUrl(cfg.apiUrl);
      setHasToken(cfg.hasToken);
    } catch {
      // leave defaults — user can still attempt to save
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
    loadConfig();
  }, [loadConfig, runHealthCheck]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const urlToProbe = apiUrl.trim();
      const tokenToProbe = apiToken.length > 0 ? apiToken : undefined;
      if (!urlToProbe) {
        setTestError('API URL is required');
        setTestResult('unreachable');
        return;
      }
      const result = await tududiApi.testConfig({ apiUrl: urlToProbe, apiToken: tokenToProbe });
      if (result.ok) {
        setTestResult('connected');
      } else {
        setTestResult('unreachable');
        setTestError(result.error || `HTTP ${result.status}`);
      }
    } catch (e) {
      setTestResult('unreachable');
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setTestError(msg);
    } finally {
      setTesting(false);
    }
  }, [apiUrl, apiToken]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const trimmedUrl = apiUrl.trim();
      await tududiApi.saveConfig({
        apiUrl: trimmedUrl,
        apiToken: apiToken.length > 0 ? apiToken : undefined,
      });
      if (apiToken.length > 0) {
        setHasToken(true);
        setApiToken('');
      } else if (apiToken === '') {
        // No-op: leaving the field empty preserves the stored token
      }
      setApiUrl(trimmedUrl);
      setTestResult(null);
      setTestError(null);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
      await runHealthCheck();
    } catch (e) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
      console.error('[tududi] failed to save config:', e);
    } finally {
      setSaving(false);
    }
  }, [apiUrl, apiToken, runHealthCheck]);

  const urlValid = (() => {
    const v = apiUrl.trim();
    if (!v) return false;
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  })();

  const formComplete = urlValid;
  const tokenPlaceholder = hasToken ? '•••••••• (saved — leave blank to keep)' : 'tt_...';

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
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-fg-primary">
                {t('tududi.config.title', 'Tududi')}
              </h1>
              <p className="text-sm text-fg-muted mt-0.5">
                {t('tududi.config.subtitle', 'Task & notes management integration')}
              </p>
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="bg-bg-primary border border-border-default rounded-lg p-4">
          <h3 className="font-medium text-sm text-fg-primary mb-3">
            {t('tududi.config.connectionStatus', 'Connection Status')}
          </h3>

          {healthLoading ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('tududi.config.checkingConnection', 'Checking connection…')}
            </div>
          ) : health ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {health.configured && health.reachable ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        {t('tududi.config.connected', 'Connected')}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {t('tududi.config.connectedHelp', 'Tududi API is reachable and configured')}
                        {health.status ? ` (HTTP ${health.status})` : ''}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">
                        {!health.configured
                          ? t('tududi.config.notConfigured', 'Not configured')
                          : t('tududi.config.unreachable', 'Unreachable')}
                      </p>
                      <p className="text-xs text-fg-muted">
                        {health.error ?? t('tududi.config.checkBelow', 'Check the configuration below')}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={runHealthCheck}
                disabled={healthTesting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border-default text-fg-secondary hover:bg-bg-secondary transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {healthTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {t('tududi.config.retestSaved', 'Re-test saved connection')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">{t('tududi.config.noData', 'No connection data')}</p>
          )}
        </div>

        {/* Configuration */}
        <div className="bg-bg-primary border border-border-default rounded-lg p-4">
          <h3 className="font-medium text-sm text-fg-primary mb-1">
            {t('tududi.config.configuration', 'Configuration')}
          </h3>
          <p className="text-xs text-fg-muted mb-4">
            {t(
              'tududi.config.configurationHelp',
              'The address and API token of your Tududi instance. Both are stored encrypted on the server and never sent to the browser.',
            )}
          </p>

          {configLoading ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('tududi.config.loading', 'Loading configuration…')}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-fg-secondary mb-1">
                  {t('tududi.config.apiUrlLabel', 'Tududi URL')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://todo.thinkout.ru"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-fg-muted mt-1">
                  {t(
                    'tududi.config.apiUrlHelp',
                    'Full base URL of the Tududi instance (no trailing slash). Must be reachable from the 1230UI server.',
                  )}
                </p>
                {apiUrl && !urlValid && (
                  <p className="text-xs text-red-500 mt-1">
                    {t('tududi.config.invalidUrl', 'Enter a valid URL (e.g. https://example.com).')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-fg-secondary mb-1">
                  {t('tududi.config.apiTokenLabel', 'API Token')}
                  {hasToken && apiToken.length === 0 && (
                    <span className="ml-1 text-fg-muted font-normal">({t('common.saved', 'saved')})</span>
                  )}
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={tokenPlaceholder}
                  autoComplete="off"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-fg-muted mt-1">
                  {t(
                    'tududi.config.apiTokenHelp',
                    'Create one in Tududi: Profile → Settings → API Keys (starts with tt_). Leave blank to keep the saved token.',
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || saving || !urlValid}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border-default bg-bg-secondary hover:bg-bg-muted text-fg-secondary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  {t('tududi.config.testConnection', 'Test connection')}
                </button>
                {testResult === 'connected' && (
                  <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    {t('tududi.config.connectedOk', 'Connected')} ✓
                  </span>
                )}
                {testResult === 'unreachable' && (
                  <span className="flex items-center gap-1 text-sm text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    {t('tududi.config.unreachableLabel', 'Unreachable')}{testError ? ` — ${testError}` : ''} ✗
                  </span>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !formComplete}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors min-h-[44px]"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {t('common.save', 'Save')}
                </button>
              </div>
              {saveStatus === 'saved' && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {t('tududi.config.saved', 'Saved')}
                </p>
              )}
              {saveStatus === 'error' && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {t('tududi.config.saveError', 'Failed to save — check server logs')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Open in Tududi */}
        <div className="bg-bg-primary border border-border-default rounded-lg p-4">
          <h3 className="font-medium text-sm text-fg-primary mb-2">
            {t('tududi.config.openInTududi', 'Open Tududi')}
          </h3>
          <p className="text-xs text-fg-muted mb-3">
            {t(
              'tududi.config.openInTududiHelp',
              'Access the full Tududi interface for advanced features like inbox processing, areas, and views.',
            )}
          </p>
          <a
            href={urlValid ? apiUrl : 'https://todo.thinkout.ru'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            {t('tududi.config.openTududiBtn', 'Open Tududi')}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

      </div>
    </div>
  );
}
