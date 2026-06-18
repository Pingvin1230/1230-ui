import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, AlertCircle, Archive } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { flattenModels, type FlatModel, type ModelsResponse } from '../hooks/useModels';
import type { Assistant } from '../types/api';
import {
  ASSISTANT_NAME_MAX,
  STYLE_OPTIONS,
  DEPTH_OPTIONS,
  EXECUTOR_OPTIONS,
  type AssistantColorId,
  type AssistantStyleId,
  type AssistantDepthId,
  type AssistantExecutorId,
} from '../types/assistant';
import { ColorPicker } from '../components/ColorPicker';
import { IconPicker } from '../components/IconPicker';
import { Modal } from '../components/Modal';

export function AssistantEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new';
  const fromParam = isNew ? searchParams.get('from') : null;
  const cloneFromId = fromParam != null ? Number(fromParam) : null;
  const isCloning = cloneFromId != null && !Number.isNaN(cloneFromId);

  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<AssistantColorId | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string>('');
  const [models, setModels] = useState<FlatModel[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [style, setStyle] = useState<AssistantStyleId | null>(null);
  const [depth, setDepth] = useState<AssistantDepthId | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [executor, setExecutor] = useState<AssistantExecutorId>('hermes');
  const [availableExecutors, setAvailableExecutors] = useState<AssistantExecutorId[]>(['hermes']);
  const [isLoadingExecutors, setIsLoadingExecutors] = useState(true);
  const [executorLoadError, setExecutorLoadError] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Probe which executors the backend currently considers usable so we
  // can grey out the OpenCode option when its daemon is down.
  const fetchExecutors = useCallback(() => {
    setIsLoadingExecutors(true);
    setExecutorLoadError(false);
    return api.getAvailableExecutors()
      .then((r) => {
        const list = (r.executors || ['hermes']).filter(
          (e): e is AssistantExecutorId => e === 'hermes' || e === 'opencode-1230'
        );
        setAvailableExecutors(list.length ? list : ['hermes']);
        setExecutorLoadError(false);
      })
      .catch(() => {
        setExecutorLoadError(true);
        /* keep default [hermes] */
      })
      .finally(() => {
        setIsLoadingExecutors(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getAvailableExecutors()
      .then((r) => {
        if (cancelled) return;
        const list = (r.executors || ['hermes']).filter(
          (e): e is AssistantExecutorId => e === 'hermes' || e === 'opencode-1230'
        );
        setAvailableExecutors(list.length ? list : ['hermes']);
        setExecutorLoadError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setExecutorLoadError(true);
        /* keep default [hermes] */
      })
      .finally(() => {
        if (!cancelled) setIsLoadingExecutors(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const tasks: [Promise<unknown>, ...Promise<unknown>[]] = [api.getModels()];
        if (!isNew) tasks.push(api.getAssistant(Number(id)));
        else if (isCloning) tasks.push(api.getAssistant(cloneFromId!));
        const results = await Promise.all(tasks);
        if (cancelled) return;

        const modelsData = results[0] as ModelsResponse;
        setModels(flattenModels(modelsData));
        setDefaultModelId(modelsData.default?.id ?? null);

        if (!isNew) {
          const a = results[1] as Assistant;
          setAssistant(a);
          setName(a.name);
          setColor((a.color as AssistantColorId | null) ?? null);
          setIcon(a.icon ?? null);
          setModelId(a.modelId ?? '');
          setStyle((a.style as AssistantStyleId | null) ?? null);
          setDepth((a.depth as AssistantDepthId | null) ?? null);
          setSystemPrompt(a.systemPrompt ?? '');
          setExecutor((a.executor as AssistantExecutorId) ?? 'hermes');
        } else if (isCloning) {
          const source = results[1] as Assistant;
          setSourceName(source.name);
          setName(t('assistants.cloneNameSuggestion', { name: source.name }));
          setColor((source.color as AssistantColorId | null) ?? null);
          setIcon(source.icon ?? null);
          setModelId(source.modelId ?? '');
          setStyle((source.style as AssistantStyleId | null) ?? null);
          setDepth((source.depth as AssistantDepthId | null) ?? null);
          setSystemPrompt(source.systemPrompt ?? '');
          setExecutor((source.executor as AssistantExecutorId) ?? 'hermes');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('assistants.errorLoadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isCloning ? cloneFromId : null]);

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return t('assistants.errorNameRequired');
    if (trimmed.length > ASSISTANT_NAME_MAX) {
      return t('assistants.errorNameTooLong', { max: ASSISTANT_NAME_MAX });
    }
    return null;
  }, [name, t]);

  const readOnly = !!assistant?.isArchived;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError || saving) return;
    setSaving(true);
    setError(null);
    try {
      // C1: Re-check executor availability immediately before saving
      if (executor === 'opencode-1230') {
        let liveExecutors: AssistantExecutorId[] = ['hermes'];
        try {
          const r = await api.getAvailableExecutors();
          liveExecutors = (r.executors || ['hermes']).filter(
            (e): e is AssistantExecutorId => e === 'hermes' || e === 'opencode-1230'
          );
        } catch {
          // treat fetch failure as unavailable
        }
        if (!liveExecutors.includes('opencode-1230')) {
          setError(t('assistants.executorDownOnSave'));
          setSaving(false);
          return;
        }
      }

      const payload = {
        name: name.trim(),
        color,
        icon,
        modelId: modelId || null,
        style,
        depth,
        systemPrompt: systemPrompt.trim() || null,
        executor,
      };
      if (isNew) {
        await api.createAssistant(payload);
        toast.success(t('assistants.createdToast'));
        navigate('/assistants');
      } else {
        const result = await api.updateAssistant(assistant!.id, payload);
        toast.success(
          result.forked
            ? t('assistants.updatedForkedToast')
            : t('assistants.updatedToast')
        );
        navigate(`/assistants/${result.assistant.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('assistants.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!assistant) return;
    setShowArchiveConfirm(true);
  };

  const confirmArchive = async () => {
    if (!assistant || archiving) return;
    setArchiving(true);
    try {
      await api.archiveAssistant(assistant.id);
      toast.success(t('assistants.archivedToast'));
      navigate('/assistants');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('assistants.errorArchive'));
      setShowArchiveConfirm(false);
    } finally {
      setArchiving(false);
    }
  };

  const pageTitle = isCloning
    ? t('assistants.cloneTitle', { name: sourceName ?? '' })
    : isNew
      ? t('assistants.createNew')
      : t('assistants.editTitle', { name: assistant?.name ?? '' });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-fg-muted" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
      <div className="max-w-2xl w-full mx-auto">
        <Link
          to="/assistants"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('assistants.backToList')}
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-fg-primary">
          {pageTitle}
        </h1>
        {isCloning && (
          <p className="mt-2 text-sm text-fg-muted">{t('assistants.cloneHint')}</p>
        )}
        {readOnly && (
          <p className="mt-2 text-sm text-fg-muted">{t('assistants.archivedReadOnlyHint')}</p>
        )}
      </div>

      <form ref={formRef} onSubmit={handleSave} className="flex-1 overflow-auto mt-4">
        <div className="max-w-2xl mx-auto space-y-5 pb-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {error}
              </p>
            </div>
          )}

          <fieldset disabled={readOnly} className="space-y-5">
            <div>
              <label htmlFor="assistant-name" className="block text-sm font-medium text-fg-primary mb-1">
                {t('assistants.nameLabel')}
              </label>
              <input
                id="assistant-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={ASSISTANT_NAME_MAX}
                placeholder={t('assistants.namePlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                required
              />
              {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
            </div>

            <div>
              <label htmlFor="assistant-system-prompt" className="block text-sm font-medium text-fg-primary mb-1">
                {t('assistants.systemPromptLabel')}
              </label>
              <textarea
                id="assistant-system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                maxLength={4000}
                rows={4}
                placeholder={t('assistants.systemPromptPlaceholder')}
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y text-sm font-mono"
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-fg-muted">{t('assistants.systemPromptHint')}</p>
                <p className="text-xs text-fg-muted">{systemPrompt.length} / 4000</p>
              </div>
            </div>

            {/* Style picker */}
            <div>
              <label className="block text-sm font-medium text-fg-primary mb-2">
                {t('assistants.styleLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStyle(style === opt.id ? null : opt.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all min-h-[36px] ${
                      style === opt.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                        : 'border-border-default text-fg-secondary hover:border-blue-300 hover:text-fg-primary'
                    }`}
                  >
                    <span aria-hidden="true">{opt.emoji}</span>
                    <span>{t(opt.label)}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-muted mt-1">{t('assistants.styleHint')}</p>
            </div>

            {/* Depth picker */}
            <div>
              <label className="block text-sm font-medium text-fg-primary mb-2">
                {t('assistants.depthLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                {DEPTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDepth(depth === opt.id ? null : opt.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all min-h-[36px] ${
                      depth === opt.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                        : 'border-border-default text-fg-secondary hover:border-blue-300 hover:text-fg-primary'
                    }`}
                  >
                    <span className="flex items-center gap-0.5" aria-hidden="true">
                      {[1, 2, 3].map((n) => (
                        <span
                          key={n}
                          className={`w-2 h-2 rounded-full ${n <= opt.dots ? 'bg-current' : 'bg-current opacity-20'}`}
                        />
                      ))}
                    </span>
                    <span>{t(opt.label)}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-muted mt-1">{t('assistants.depthHint')}</p>
            </div>

            <div>
              <label htmlFor="assistant-model" className="block text-sm font-medium text-fg-primary mb-1">
                {t('assistants.modelLabel')}
              </label>
              <select
                id="assistant-model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
              >
                <option value="">
                  {defaultModelId
                    ? t('assistants.modelDefaultOption', { name: models.find((m) => m.id === defaultModelId)?.name ?? defaultModelId })
                    : t('assistants.modelDefaultUnknown')}
                </option>
                {Object.entries(
                  models.reduce<Record<string, FlatModel[]>>((acc, m) => {
                    (acc[m.provider] = acc[m.provider] || []).push(m);
                    return acc;
                  }, {})
                ).map(([providerName, list]) => (
                  <optgroup key={providerName} label={providerName}>
                    {list.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-fg-muted mt-1">{t('assistants.modelHint')}</p>
            </div>

            {/* Executor picker (Variant B) */}
            <div>
              <label className="block text-sm font-medium text-fg-primary mb-2 flex items-center gap-1.5">
                {t('assistants.executorLabel')}
                {isLoadingExecutors && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-fg-muted" aria-label={t('assistants.executorChecking')} />
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                {EXECUTOR_OPTIONS.map((opt) => {
                  const disabled = !availableExecutors.includes(opt.id);
                  const isActive = executor === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setExecutor(opt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all min-h-[36px] ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                          : 'border-border-default text-fg-secondary hover:border-blue-300 hover:text-fg-primary'
                      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <span aria-hidden="true">{opt.emoji}</span>
                      <span>{t(opt.label)}</span>
                    </button>
                  );
                })}
              </div>
              {/* C3: Inline warning when OC is selected/was set but is now unreachable */}
              {!isLoadingExecutors && (executorLoadError || !availableExecutors.includes('opencode-1230')) && executor === 'opencode-1230' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                  <span>{t('assistants.executorDownInline')}</span>
                  <button
                    type="button"
                    onClick={fetchExecutors}
                    className="underline hover:no-underline text-amber-600 dark:text-amber-400 font-medium"
                  >
                    {t('assistants.executorRetry')}
                  </button>
                </p>
              )}
              <p className="text-xs text-fg-muted mt-1">{t('assistants.executorHint')}</p>
            </div>

            <ColorPicker
              label={t('assistants.colorLabel')}
              value={color}
              onChange={setColor}
            />

            <IconPicker
              label={t('assistants.iconLabel')}
              value={icon}
              onChange={setIcon}
            />
          </fieldset>
        </div>
      </form>

      {/* Action bar — outside the scrollable form, fixed to bottom of page */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 pt-3 pb-2 border-t border-border-default bg-bg-primary">
        <div className="max-w-2xl w-full mx-auto">
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={readOnly || saving || !!nameError}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isCloning ? t('assistants.createCopy') : t('common.save')}
          </button>

          {!isNew && assistant && !assistant.isArchived && (
            <button
              type="button"
              onClick={handleArchive}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-default text-sm text-fg-secondary hover:bg-bg-secondary hover:text-red-600 dark:hover:text-red-400 min-h-[44px] ml-2"
            >
              <Archive className="w-4 h-4" />
              {t('assistants.archive')}
            </button>
          )}

          <Link
            to="/assistants"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-fg-muted hover:text-fg-primary min-h-[44px] ml-2"
          >
            {t('common.cancel')}
          </Link>
        </div>
      </div>

      <Modal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        title={t('assistants.confirmArchive')}
        size="sm"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg-secondary">
            {t('assistants.confirmArchive')}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(false)}
              disabled={archiving}
              className="px-4 py-2 rounded-lg border border-border-default text-sm text-fg-secondary hover:bg-bg-secondary min-h-[44px]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmArchive}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 min-h-[44px]"
            >
              {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              {t('assistants.archive')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
