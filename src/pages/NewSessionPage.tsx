import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Settings2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { useAsync } from '../hooks/useAsync';
import { buildModelMap, type ModelsResponse } from '../hooks/useModels';
import type { Assistant } from '../types/api';
import type { AssistantExecutorId } from '../types/assistant';
import { NoModelsIllustration } from '../assets/illustrations';
import { AssistantTile } from '../components/AssistantTile';

export function NewSessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);
  const [availableExecutors, setAvailableExecutors] = useState<AssistantExecutorId[]>(['hermes']);

  const { loading } = useAsync(async () => {
    const [modelsData, assistantsData, executorsData] = await Promise.all([
      api.getModels(),
      api.getAssistants(false),
      api.getAvailableExecutors().catch(() => ({ executors: ['hermes' as AssistantExecutorId] })),
    ]);

    setModels(modelsData);
    setAssistants(assistantsData.assistants.filter((a) => !a.isArchived));
    const execList = (executorsData.executors || ['hermes']).filter(
      (e): e is AssistantExecutorId => e === 'hermes' || e === 'opencode-1230'
    );
    setAvailableExecutors(execList.length ? execList : ['hermes']);

    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel && Object.values(modelsData.providers).some((p) => p.models.some((m) => m.id === savedModel))) {
      setModel(savedModel);
    } else if (modelsData.default) {
      setModel(modelsData.default.id);
    } else {
      const firstProvider = Object.values(modelsData.providers)[0];
      if (firstProvider && firstProvider.models.length > 0) setModel(firstProvider.models[0].id);
    }
  }, []);

  const modelLabelMap = useMemo(() => buildModelMap(models), [models]);

  const handleStartStandard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model) return;
    await createSession({ model });
  };

  const handleStartAssistant = async (assistant: Assistant) => {
    setCreatingFrom(`assistant:${assistant.id}`);
    try {
      await createSession({ assistantId: assistant.id });
    } finally {
      setCreatingFrom(null);
    }
  };

  const createSession = async (opts: { model?: string; assistantId?: number }) => {
    try {
      if (opts.model) localStorage.setItem('selectedModel', opts.model);
      const sessionId = await api.createSession(opts.model ?? '', undefined, opts.assistantId ?? null);
      navigate(`/chat/${sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('api.failedToCreateSession'));
      setCreatingFrom(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-fg-primary">{t('newSession.title')}</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-bg-primary border border-border-default rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6">
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-fg-primary">{t('newSession.title')}</h1>
        <p className="text-sm text-fg-muted mt-1">{t('newSession.description')}</p>
      </div>

      {/* Assistants section — first */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            {t('newSession.sectionAssistants')}
          </h2>
          {assistants.length > 0 && (
            <Link
              to="/assistants"
              className="text-xs text-fg-muted hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {t('newSession.manageAssistants')}
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {assistants.map((a) => (
            <AssistantTile
              key={a.id}
              assistant={a}
              modelLabel={a.modelId ? modelLabelMap.get(a.modelId) ?? null : null}
              onClick={() => handleStartAssistant(a)}
              loading={creatingFrom === `assistant:${a.id}`}
            />
          ))}
          {assistants.length === 0 && (
            <Link
              to="/assistants/new"
              className="flex flex-col items-center justify-center gap-1 p-4 sm:p-5 rounded-xl border-2 border-dashed border-border-default text-fg-muted hover:text-fg-primary hover:border-blue-300 min-h-[120px] text-center"
            >
              <span className="text-sm font-medium">{t('newSession.createFirstAssistant')}</span>
              <span className="text-xs">{t('newSession.createFirstAssistantHint')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Quick Start section — second */}
      <div>
        <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
          {t('newSession.sectionQuickStart')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <form
            onSubmit={handleStartStandard}
            className="flex flex-col gap-3 p-4 sm:p-5 rounded-xl border-2 border-border-default bg-bg-primary min-h-[120px] focus-within:ring-2 focus-within:ring-blue-500"
          >
            <div className="flex items-center gap-2 w-full">
              <Settings2 className="w-5 h-5 text-fg-secondary flex-shrink-0" />
              <span className="font-semibold text-fg-primary">{t('newSession.standardTile')}</span>
            </div>
            {models ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] text-sm"
              >
                {Object.entries(models.providers).map(([providerId, provider]) => (
                  <optgroup key={providerId} label={provider.name}>
                    {provider.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {models.default?.id === m.id ? ` ${t('common.defaultSuffix')}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <div className="flex flex-col items-center text-center py-2">
                <NoModelsIllustration className="w-10 h-10 text-fg-muted" />
                <p className="text-fg-muted text-xs mt-1">{t('common.noModelsAvailable')}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={!model}
              className="mt-auto w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {t('newSession.create')}
            </button>
          </form>
        </div>
        {/* C4: hint when OpenCode is available but free chats default to Hermes */}
        {availableExecutors.includes('opencode-1230') && (
          <p className="mt-2 text-xs text-fg-muted">
            {t('chat.freeChatExecutorHint')}
          </p>
        )}
      </div>

      {!loading && !models && (
        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          {t('common.noModelsAvailable')}
        </div>
      )}
    </div>
    </div>
  );
}
