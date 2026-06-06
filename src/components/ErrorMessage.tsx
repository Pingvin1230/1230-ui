import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XCircle, RefreshCw, ChevronDown, ChevronUp, ShieldAlert, Zap, Wifi, Server, Key, AlertTriangle } from 'lucide-react';
import type { ChatError } from '../lib/api';

const ERROR_ICONS: Record<string, React.ReactNode> = {
  content_moderation: <ShieldAlert className="w-5 h-5" />,
  rate_limit: <Zap className="w-5 h-5" />,
  network: <Wifi className="w-5 h-5" />,
  timeout: <AlertTriangle className="w-5 h-5" />,
  server_error: <Server className="w-5 h-5" />,
  auth_error: <Key className="w-5 h-5" />,
};

const ERROR_TYPE_KEYS: Record<string, string> = {
  content_moderation: 'errors.content_moderation',
  rate_limit: 'errors.rate_limit',
  network: 'errors.network',
  timeout: 'errors.timeout',
  server_error: 'errors.server_error',
  auth_error: 'errors.auth_error',
  invalid_request: 'errors.invalid_request',
  provider_error: 'errors.provider_error',
};

export function ErrorMessage({ error, onRetry }: { error: ChatError; onRetry?: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const icon = ERROR_ICONS[error.type] || <XCircle className="w-5 h-5" />;
  const title = t(ERROR_TYPE_KEYS[error.type] || 'errors.fallback');

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 my-2">
      <div className="flex items-start gap-3">
        <div className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-red-900 dark:text-red-100 text-sm">
            {title}
          </h3>

          {error.details && (
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              {error.details}
            </p>
          )}

          {error.provider && error.model && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {error.provider} / {error.model}
            </p>
          )}

          {error.suggestion && (
            <p className="text-sm text-red-700 dark:text-red-300 mt-2 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1">
              {error.suggestion}
            </p>
          )}

          <div className="flex items-center gap-3 mt-3">
            {error.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('common.retry')}
              </button>
            )}

            {error.code && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {t('errors.details')}
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-2 text-xs font-mono bg-red-100 dark:bg-red-900/40 rounded p-2 overflow-x-auto text-red-700 dark:text-red-300">
              <div>Type: {error.type}</div>
              {error.code && <div>Code: {error.code}</div>}
              {error.details && <div className="mt-1 whitespace-pre-wrap">{error.details}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
