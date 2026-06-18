import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Check, KeyRound, ExternalLink } from 'lucide-react';

export interface OpenCodeProviderData {
  id: string;
  name: string;
  source: string;
  env: string[];
  hasApiKey: boolean;
  baseUrl: string | null;
  connected: boolean;
  modelCount: number;
  defaultModel: string | null;
}

interface OpenCodeProviderCardProps {
  provider: OpenCodeProviderData;
}

export function OpenCodeProviderCard({ provider }: OpenCodeProviderCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const sourceLabel = t(`opencodeProviders.source.${provider.source}`, provider.source);
  const isEnv = provider.source === 'env';
  const isConfig = provider.source === 'config';
  const hasEnvHint = provider.env.length > 0;

  return (
    <div className="bg-bg-primary border border-border-default rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-bg-secondary transition-colors rounded-lg"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-fg-primary">{provider.name}</h4>
            {provider.connected ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                title={t('opencodeProviders.connectedHint')}
              >
                <Check className="w-3 h-3" />
                {t('opencodeProviders.connected')}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
                title={t('opencodeProviders.notConnectedHint')}
              >
                {t('opencodeProviders.notConnected')}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wide text-fg-muted font-mono">
              {sourceLabel}
            </span>
          </div>
          <p className="text-xs text-fg-muted mt-1">
            {t('opencodeProviders.modelCount', { count: provider.modelCount })}
            {provider.connected && provider.defaultModel && (
              <>
                {' · '}
                <span className="font-mono">
                  {t('opencodeProviders.default', { model: provider.defaultModel })}
                </span>
              </>
            )}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-fg-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-fg-muted flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border-default space-y-2 text-xs">
          {hasEnvHint && (
            <div>
              <span className="text-fg-muted">{t('opencodeProviders.envVars')}: </span>
              <span className="font-mono text-fg-primary">
                {provider.env.join(', ')}
              </span>
            </div>
          )}
          {provider.baseUrl && (
            <div className="break-all">
              <span className="text-fg-muted">baseURL: </span>
              <span className="font-mono text-fg-primary">{provider.baseUrl}</span>
            </div>
          )}
          {provider.hasApiKey && (
            <div className="inline-flex items-center gap-1 text-fg-muted">
              <KeyRound className="w-3 h-3" />
              {t('opencodeProviders.apiKeyDetected')}
            </div>
          )}
          {!provider.connected && (
            <div className="pt-1 text-fg-muted flex items-start gap-1.5">
              <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                {isEnv
                  ? t('opencodeProviders.howToConfigureEnv', { env: provider.env[0] || 'API_KEY' })
                  : isConfig
                    ? t('opencodeProviders.howToConfigureConfig', {
                        path: '~/.config/opencode/opencode.jsonc',
                      })
                    : t('opencodeProviders.howToConfigureCustom')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
