import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../hooks/useAsync';
import { ProviderCard, type ProviderCardData } from '../components/ProviderCard';

export function ProvidersPage() {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useAsync(async () => {
    const resp = await api.getAvailableProviders();
    return [...resp.providers].sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    ) as ProviderCardData[];
  }, []);

  const providers = data ?? [];
  const reload = refetch;

  return (
    <div className="h-full flex flex-col px-4 md:px-6 py-4">
      <div className="max-w-3xl w-full mx-auto mb-4">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('providers.backToSettings')}
        </Link>
        <h1 className="text-xl font-semibold text-fg-primary flex items-center gap-2">
          <KeyRound className="w-5 h-5" />
          {t('providers.title')}
        </h1>
        <p className="text-sm text-fg-muted mt-1">{t('providers.description')}</p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="px-4 py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-fg-muted" />
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {error instanceof Error ? error.message : t('providers.errorLoadFailed')}
              </p>
              <button
                onClick={reload}
                className="mt-2 px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-fg-muted text-center py-8">{t('providers.noProviders')}</p>
          ) : (
            <div className="space-y-2">
              {providers.map((p) => (
                <ProviderCard key={p.name} provider={p} onChanged={reload} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
