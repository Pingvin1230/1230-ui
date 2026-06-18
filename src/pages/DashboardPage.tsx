import { useState, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { MessageSquare, Send, ChevronRight, ChevronDown, Loader2, X, Key, Zap, MessageCircle } from 'lucide-react';
import type { Assistant, Session } from '../types/api';
import { formatTimeAgo } from '../lib/time';
import { AssistantTile } from '../components/AssistantTile';
import { useAsync } from '../hooks/useAsync';
import { buildModelMap, type ModelsResponse } from '../hooks/useModels';

/** Returns a time-based greeting key for i18n */
function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'dashboard.greetingMorning';
  if (hour >= 12 && hour < 18) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [sending, setSending] = useState(false);
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  // #29: onboarding — true when no providers are configured
  const [showOnboarding, setShowOnboarding] = useState(false);

  const greetingKey = useMemo(() => getGreetingKey(), []);

  const { loading, error, refetch } = useAsync(async () => {
    const [sessionsData, models, assistantsData] = await Promise.all([
      api.getSessions(3, 0),
      api.getModels(),
      api.getAssistants(false),
    ]);
    setSessions(sessionsData.sessions);
    setModelsData(models);
    setAssistants(assistantsData.assistants.filter((a) => !a.isArchived));

    const savedModel = localStorage.getItem('selectedModel');
    const allModels = Object.values(models.providers).flatMap((p) => p.models);
    if (savedModel && allModels.some((m) => m.id === savedModel)) {
      setModel(savedModel);
    } else if (models.default) {
      setModel(models.default.id);
    } else if (allModels.length > 0) {
      setModel(allModels[0].id);
    }

    // #29: show onboarding when no models are available AND user hasn't dismissed it
    // AND there are no sessions yet (first-time user)
    const dismissed = localStorage.getItem('onboarding_dismissed') === '1';
    const hasModels = allModels.length > 0;
    const hasSessions = sessionsData.sessions.length > 0;
    setShowOnboarding(!dismissed && !hasModels && !hasSessions);
  }, [t]);

  const loadData = refetch;

  const modelLabelMap = useMemo(() => buildModelMap(modelsData), [modelsData]);

  const currentModelLabel = model ? (modelLabelMap.get(model) ?? model) : '';

  async function handleSend() {
    if (!input.trim() || !model || sending) return;

    const content = input.trim();
    const title = content.length > 60 ? content.slice(0, 60) + '...' : content;

    try {
      setSending(true);
      localStorage.setItem('selectedModel', model);
      const sessionId = await api.createSession(model, title);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      navigate(`/chat/${sessionId}`, { state: { initialMessage: content } });
    } catch (err) {
      console.error('Failed to create session:', err);
      setSending(false);
    }
  }

  async function handleStartAssistant(assistant: Assistant) {
    setCreatingFrom(`assistant:${assistant.id}`);
    try {
      const sessionId = await api.createSession('', undefined, assistant.id);
      navigate(`/chat/${sessionId}`);
    } catch (err) {
      console.error('Failed to create session from assistant:', err);
      setCreatingFrom(null);
    }
  }

  if (loading) {
    return (
      <div className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="h-7 bg-bg-muted rounded w-48 animate-pulse" />
        </div>
        <div className="bg-bg-primary border border-border-default rounded-xl p-4 animate-pulse mb-6">
          <div className="h-24 bg-bg-muted rounded mb-3" />
          <div className="h-10 bg-bg-muted rounded" />
        </div>
        <div className="bg-bg-primary border border-border-default rounded-xl p-6 animate-pulse">
          <div className="h-6 bg-bg-muted rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 font-medium">{t('dashboard.failedToLoadDashboard')}</p>
          <button
            onClick={loadData}
            className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto space-y-6">

      {/* Greeting */}
      <h1 className="text-2xl font-semibold text-fg-primary">{t(greetingKey)}</h1>

      {/* #29: Onboarding banner — shown only when no services configured and no sessions */}
      {showOnboarding && (
        <div className="relative rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 sm:p-5">
          <button
            type="button"
            onClick={() => { localStorage.setItem('onboarding_dismissed', '1'); setShowOnboarding(false); }}
            className="absolute top-3 right-3 p-1 rounded text-fg-muted hover:text-fg-primary hover:bg-bg-secondary transition-colors"
            aria-label={t('dashboard.onboardingDismiss')}
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold text-fg-primary mb-1 pr-6">{t('dashboard.onboardingTitle')}</h2>
          <p className="text-sm text-fg-secondary mb-4">{t('dashboard.onboardingDesc')}</p>
          <ol className="space-y-3 mb-4">
            {[
              { icon: Key, step: '1', title: t('dashboard.onboardingStep1'), desc: t('dashboard.onboardingStep1Desc') },
              { icon: Zap, step: '2', title: t('dashboard.onboardingStep2'), desc: t('dashboard.onboardingStep2Desc') },
              { icon: MessageCircle, step: '3', title: t('dashboard.onboardingStep3'), desc: t('dashboard.onboardingStep3Desc') },
            ].map(({ icon: Icon, step, title, desc }) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                  {step}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg-primary flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    {title}
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link
            to="/settings/providers"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            {t('dashboard.onboardingGoToKeys')}
          </Link>
        </div>
      )}

      {/* Quick Chat */}
      <div className="bg-bg-primary border border-border-default rounded-xl p-4">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={t('dashboard.startNewConversation')}
          disabled={sending}
          rows={3}
          className="w-full px-1 py-1 text-fg-primary placeholder-fg-muted focus:outline-none disabled:opacity-50 resize-none overflow-y-auto bg-transparent"
        />
        {/* Footer row: model picker + Send */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-default gap-2">
          {/* Model pill picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelPickerOpen((o) => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-secondary hover:bg-bg-muted text-fg-secondary text-sm font-medium transition-colors max-w-[200px] truncate"
            >
              <span className="truncate">{currentModelLabel || t('dashboard.selectModel')}</span>
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
            </button>
            {modelPickerOpen && modelsData && (
              <div className="absolute bottom-full mb-1 left-0 z-50 w-64 bg-bg-elevated border border-border-default rounded-xl shadow-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto py-1">
                  {Object.entries(modelsData.providers).map(([providerId, provider]) => (
                    <div key={providerId}>
                      <div className="px-3 py-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wide">
                        {provider.name}
                      </div>
                      {provider.models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setModel(m.id);
                            localStorage.setItem('selectedModel', m.id);
                            setModelPickerOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-bg-secondary ${
                            model === m.id ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-fg-primary'
                          }`}
                        >
                          {m.name}
                          {modelsData.default?.id === m.id && (
                            <span className="ml-1 text-xs text-fg-muted">{t('common.defaultSuffix')}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="self-end inline-flex items-center justify-center gap-2 h-[44px] px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
            <span>{t('common.send')}</span>
          </button>
        </div>
      </div>

      {/* Assistants quick-start */}
      {assistants.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-fg-secondary">{t('dashboard.assistants')}</h2>
            <Link
              to="/new"
              className="text-xs text-fg-muted hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {t('common.viewAll')}
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {assistants.slice(0, 3).map((a) => (
              <AssistantTile
                key={a.id}
                assistant={a}
                modelLabel={a.modelId ? (modelLabelMap.get(a.modelId) ?? null) : null}
                onClick={() => handleStartAssistant(a)}
                loading={creatingFrom === `assistant:${a.id}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="bg-bg-primary border border-border-default rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-semibold text-fg-primary">{t('dashboard.recentSessions')}</h2>
          </div>
          <Link
            to="/sessions"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          >
            {t('common.viewAll')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('sessions.noSessionsYet')}</p>
        ) : (
          <div className="divide-y divide-border-default">
            {sessions.map((session) => {
              const title = session.title ||
                (session.preview
                  ? (session.preview.length > 60
                    ? session.preview.slice(0, 60) + '...'
                    : session.preview)
                  : t('common.untitledSession'));

              return (
                <Link
                  key={session.id}
                  to={`/chat/${session.id}`}
                  className="block py-3 first:pt-0 last:pb-0 hover:bg-bg-secondary -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg-primary truncate">{title}</p>
                      {session.preview && session.preview !== title && (
                        <p className="text-xs text-fg-muted truncate mt-0.5">{session.preview}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-fg-muted">
                        {session.model && (
                          <span className="px-1.5 py-0.5 rounded bg-bg-muted">
                            {session.model}
                          </span>
                        )}
                        <span>{t('common.msgsSuffix', { count: session.messageCount })}</span>
                        <span>·</span>
                        <span>{formatTimeAgo(session.lastMessageAt ?? session.startedAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
    </div>
  );
}
