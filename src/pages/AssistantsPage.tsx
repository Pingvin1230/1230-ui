import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import type { Assistant } from '../types/api';
import { useToast } from '../hooks/useToast';
import { AssistantManageTile } from '../components/AssistantManageTile';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

type Filter = 'active' | 'archived';

export function AssistantsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Always fetch ALL assistants so counts are accurate for both tabs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [a, m] = await Promise.all([
          api.getAssistants(true),
          api.getModels(),
        ]);
        if (cancelled) return;
        setAssistants(a.assistants);
        const flat: ModelOption[] = [];
        for (const provider of Object.values(m.providers)) {
          for (const model of provider.models) {
            flat.push({ id: model.id, name: model.name, provider: provider.name });
          }
        }
        setModels(flat);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('assistants.errorLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick]);

  const reload = () => setReloadTick((n) => n + 1);

  const modelLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of models) map.set(m.id, m.name);
    return map;
  }, [models]);

  const visible = useMemo(
    () => (filter === 'archived' ? assistants.filter((a) => a.isArchived) : assistants.filter((a) => !a.isArchived)),
    [assistants, filter]
  );

  const activeCount = useMemo(() => assistants.filter((a) => !a.isArchived).length, [assistants]);
  const archivedCount = useMemo(() => assistants.filter((a) => a.isArchived).length, [assistants]);

  const handleArchive = async (assistant: Assistant) => {
    try {
      await api.archiveAssistant(assistant.id);
      toast.success(t('assistants.archivedToast'));
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('assistants.errorArchive'));
    }
  };

  const handleDuplicate = (assistant: Assistant) => {
    navigate(`/assistants/new?from=${assistant.id}`);
  };

  const handleRestore = async (assistant: Assistant) => {
    try {
      await api.restoreAssistant(assistant.id);
      toast.success(t('assistants.restoredToast'));
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('assistants.errorRestore'));
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
      <div className="max-w-4xl w-full mx-auto mb-4">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('assistants.backToSettings')}
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-fg-primary">{t('assistants.title')}</h1>
            <p className="text-sm text-fg-muted mt-1">{t('assistants.subtitle')}</p>
          </div>
          {assistants.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/assistants/new')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              {t('assistants.createNew')}
            </button>
          )}
        </div>

        <div className="mt-4 flex gap-6 border-b border-border-default">
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`pb-2 text-sm font-medium transition-colors min-h-[36px] ${
              filter === 'active'
                ? 'text-fg-primary border-b-2 border-blue-500 -mb-px'
                : 'text-fg-muted hover:text-fg-primary'
            }`}
          >
            {t('assistants.tabActive', { count: activeCount })}
          </button>
          <button
            type="button"
            onClick={() => setFilter('archived')}
            className={`pb-2 text-sm font-medium transition-colors min-h-[36px] ${
              filter === 'archived'
                ? 'text-fg-primary border-b-2 border-blue-500 -mb-px'
                : 'text-fg-muted hover:text-fg-primary'
            }`}
          >
            {t('assistants.tabArchived', { count: archivedCount })}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-fg-muted" />
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {error}
              </p>
              <button
                onClick={reload}
                className="mt-2 px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-fg-muted">
                {filter === 'archived' ? t('assistants.noArchived') : t('assistants.noActive')}
              </p>
              {filter === 'active' && (
                <button
                  type="button"
                  onClick={() => navigate('/assistants/new')}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  {t('assistants.createFirst')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 pb-6">
              {visible.map((a) => (
                <AssistantManageTile
                  key={a.id}
                  assistant={a}
                  modelLabel={a.modelId ? modelLabelMap.get(a.modelId) ?? null : null}
                  onArchive={handleArchive}
                  onDuplicate={handleDuplicate}
                  onRestore={handleRestore}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
