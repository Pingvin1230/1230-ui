import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type ChatMessage, type ChatError } from '../lib/api';
import type { Message, Session } from '../types/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import ToolCall from '../components/ToolCall';
import { AgentFileGroup } from '../components/AgentFileCard';
import { ErrorMessage } from '../components/ErrorMessage';
import { Copy, Check, RefreshCw, Bot, User, X, ChevronRight, Trash2, Pencil, Loader2, Square, ChevronDown, AlertCircle, Paperclip } from 'lucide-react';
import { useChatInputStore } from '../store/chatInputStore';
import type { ChatInputHandle } from '../components/ChatInput';
import { NoMessagesIllustration } from '../assets/illustrations';
import { formatTimeAgo, formatFullDateTime } from '../lib/time';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useNotifications } from '../hooks/useNotifications';
import { useNotificationsStore } from '../store/notificationsStore';
// highlight.js CSS is loaded lazily in MarkdownRenderer (UX-13)

// ── Task #35: SessionFilesBar moved to ChatInput.tsx ───────────────────────

export function ChatPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const initialMessageRef = useRef((location.state as { initialMessage?: string })?.initialMessage);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [processStatus, setProcessStatus] = useState<'thinking' | 'generating' | 'executing_tool'>('thinking');
  const [executingTool, setExecutingTool] = useState<string | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, { toolName: string; label?: string }>>(new Map());
  const [completedToolCalls, setCompletedToolCalls] = useState<Array<{ id: string; toolName: string; label?: string }>>([]);
  const [showToolCallHistory, setShowToolCallHistory] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<ChatError | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const initialSentRef = useRef(false);
  const lastSentContentRef = useRef<string>('');
  const streamStartedAtRef = useRef<number | null>(null);
  // Task #24: tracks the id of the assistant message currently being streamed,
  // so the `agent_files` SSE event can attach download cards to it.
  const currentAssistantIdRef = useRef<number | null>(null);
  const [isSessionBlocked, setIsSessionBlocked] = useState(
    () => Boolean(id && sessionStorage.getItem(`blocked:${id}`))
  );
  const setChatActive = useChatInputStore((s) => s.setActiveSession);
  const setChatSending = useChatInputStore((s) => s.setSending);
  const setChatBlocked = useChatInputStore((s) => s.setSessionBlocked);
  const inputHasText = useChatInputStore((s) => s.hasAttachedFiles);
  // #35: track session file count for the header indicator
  const sessionFiles = useChatInputStore((s) => s.sessionFiles);
  const sessionFileCount = sessionFiles?.length ?? 0;

  useEffect(() => {
    setChatActive(id ?? null);
    return () => setChatActive(null);
  }, [id, setChatActive]);

  useEffect(() => { setChatSending(sending); }, [sending, setChatSending]);
  useEffect(() => { setChatBlocked(isSessionBlocked); }, [isSessionBlocked, setChatBlocked]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // ChatInput is rendered by Layout (sibling of MobileNav). We reach it via
  // the chatInputStore (which holds ChatInput's imperative handle).
  const chatInputRef = useRef<ChatInputHandle>(null);
  const inputHandle = useChatInputStore((s) => s.handle);
  useEffect(() => { chatInputRef.current = inputHandle; }, [inputHandle]);

  // UX-4: Navigation guard — show confirmation modal when input has unsent text.
  // BrowserRouter does not support useBlocker (data-router only), so we implement
  // the guard manually:
  //  - beforeunload  → native browser dialog on tab close / hard navigation
  //  - popstate      → back/forward button intercept
  //  - click capture → intercept <Link> / <a> clicks before React Router handles them
  // Task #23: also block navigation when there are unsent attached files.
  const [leaveGuardPending, setLeaveGuardPending] = useState(false);
  const pendingUrlRef = useRef<string | null>(null);
  const inputHasTextRef = useRef(inputHasText);
  useEffect(() => { inputHasTextRef.current = inputHasText; }, [inputHasText]);

  // 1. Browser-native guard for tab close / external navigation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (inputHasTextRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // 2. Back/forward button guard
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (!inputHasTextRef.current) return;
      // Push the current state back so the URL doesn't change
      window.history.pushState(e.state, '', window.location.href);
      pendingUrlRef.current = null; // popstate doesn't give us the target URL easily
      setLeaveGuardPending(true);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // 3. Click intercept for in-app <Link> / <a> tags
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!inputHasTextRef.current) return;
      const target = (e.target as Element).closest('a[href]');
      if (!target) return;
      const href = (target as HTMLAnchorElement).getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return;
      // Same page — no guard needed
      const currentPath = window.location.pathname;
      if (href === currentPath) return;
      e.preventDefault();
      e.stopPropagation();
      pendingUrlRef.current = href;
      setLeaveGuardPending(true);
    };
    // Capture phase so we intercept before React Router's Link handler
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  const handleLeaveConfirm = useCallback(() => {
    setLeaveGuardPending(false);
    chatInputRef.current?.clearInput();
    if (pendingUrlRef.current) {
      navigate(pendingUrlRef.current);
      pendingUrlRef.current = null;
    }
  }, [navigate]);

  const handleLeaveCancel = useCallback(() => {
    setLeaveGuardPending(false);
    pendingUrlRef.current = null;
  }, []);

  const { enabled: notificationsEnabled } = useNotificationsStore();
  const { notify, setBadge, clearBadge } = useNotifications({
    enabled: notificationsEnabled,
  });

  // Listen for send/stop events from ChatInput (which lives in Layout).
  useEffect(() => {
    const onSend = (e: Event) => {
      const detail = (e as CustomEvent<{ content: string }>).detail;
      doSend(detail.content);
    };
    const onStop = () => {
      handleStop();
    };
    window.addEventListener('chat:send', onSend);
    window.addEventListener('chat:stop', onStop);
    return () => {
      window.removeEventListener('chat:send', onSend);
      window.removeEventListener('chat:stop', onStop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useKeyboardShortcuts([
    {
      key: 'Enter',
      metaKey: true,
      action: () => {
        if (!isSessionBlocked && !sending) {
          // ChatInput handles its own Ctrl+Enter; this is a no-op fallback.
        }
      },
    },
  ]);

  async function handleDeleteSession() {
    if (!id) return;
    try {
      setIsDeleting(true);
      await api.deleteSession(id);
      navigate('/sessions');
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError({
        type: 'server_error',
        message: t('chat.failedToDeleteSession'),
        retryable: false,
      });
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleSaveTitle() {
    if (!id || !editingTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    try {
      setIsSavingTitle(true);
      const updatedSession = await api.updateSessionTitle(id, editingTitle.trim());
      setSession(updatedSession);
      setIsEditingTitle(false);
    } catch (err) {
      console.error('Failed to update title:', err);
    } finally {
      setIsSavingTitle(false);
    }
  }

  function handleStartEditTitle() {
    setEditingTitle(session?.title || '');
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  const locationState = location.state as { initialMessage?: string } | null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    initialSentRef.current = false;
    
    // Сохраняем initialMessage из location.state, если он есть
    initialMessageRef.current = locationState?.initialMessage;
    
    (async () => {
      try {
        setLoadError(null);
        const sessionData = await api.getSession(id);
        if (cancelled) return;
        setSession(sessionData);
      } catch (err) {
        console.error('Failed to load session:', err);
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t('chat.sessionNotFound'));
      }
      
      try {
        const messagesData = await api.getMessages(id);
        if (cancelled) return;
        setMessages(messagesData);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, retryTrigger, locationState, t]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (messages.length !== prevMessageCountRef.current) {
      const diff = messages.length - prevMessageCountRef.current;
      if (diff > 0) setUnreadCount((prev) => prev + diff);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, streamingContent, clearBadge]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (atBottom !== isAtBottomRef.current) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
        if (atBottom) {
          setUnreadCount(0);
          clearBadge();
        }
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [clearBadge]);

  useEffect(() => {
    const initialMessage = initialMessageRef.current;
    // Отправляем initialMessage только если:
    // 1. Есть initialMessage из location.state
    // 2. Сессия загружена
    // 3. Ещё не отправляли в этой сессии
    // 4. В сессии НЕТ сообщений (значит это первый заход после создания)
    if (!loading && session && initialMessage && !initialSentRef.current && messages.length === 0) {
      initialSentRef.current = true;
      doSend(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSend is intentionally excluded: initialMessage should only be sent once when available, not on every doSend recreation. initialSentRef prevents duplicate sends.
  }, [loading, session, messages.length]);

  function doSend(content: string) {
    const userContent = content.trim();
    if (!userContent || sending) return;

    // Prepend attached file paths (Task #23). Only ready files are included.
    const attached = chatInputRef.current?.getAttachedFiles() ?? [];
    const fileLines = attached
      .filter((f) => f.path)
      .map((f) => `[Attached file: ${f.path}]`)
      .join('\n');
    const fullContent = fileLines
      ? `${fileLines}\n\n${userContent}`
      : userContent;

    const userMessage: Message = {
      id: Date.now(),
      sessionId: id!,
      role: 'user',
      content: fullContent,
      timestamp: Date.now() / 1000,
    };

    setMessages(prev => [...prev, userMessage]);
    chatInputRef.current?.clearInput();
    setSending(true);
    setStreamingContent('');
    setError(null);
    setIsWaitingForResponse(true);
    setProcessStatus('thinking');
    setExecutingTool(null);
    setActiveToolCalls(new Map());
    lastSentContentRef.current = userContent;
    streamStartedAtRef.current = Date.now();

    // Task #24: pre-allocate the assistant message id and append an empty
    // message to the list right away. This way the `agent_files` SSE event
    // (emitted before the stream's [DONE]) can find the message to attach
    // download cards to, and we just update its content when streaming ends.
    const assistantMessageId = Date.now() + 1;
    currentAssistantIdRef.current = assistantMessageId;
    setMessages(prev => [
      ...prev,
      {
        id: assistantMessageId,
        sessionId: id!,
        role: 'assistant',
        content: '',
        timestamp: Date.now() / 1000,
      },
    ]);

    const chatMessages: ChatMessage[] = [...messages, userMessage]
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content || '' }));

    const controller = api.sendMessage(chatMessages, {
      sessionId: id,
      model: session?.model || 'qwen3.6-plus',
      onStatus: (status, toolName) => {
        setProcessStatus(status);
        if (status === 'executing_tool' && toolName) {
          setExecutingTool(toolName);
        } else if (status === 'generating') {
          setExecutingTool(null);
        }
      },
      onChunk: (chunk) => {
        setIsWaitingForResponse(false);
        setStreamingContent(prev => prev + chunk);
      },
      onToolCallStart: (id, toolName, label) => {
        setActiveToolCalls(prev => {
          const next = new Map(prev);
          next.set(id, { toolName, label });
          return next;
        });
      },
      onToolCallEnd: (id) => {
        setActiveToolCalls(prev => {
          const next = new Map(prev);
          const completed = next.get(id);
          if (completed) {
            setCompletedToolCalls(prev => [...prev, { id, ...completed }]);
          }
          next.delete(id);
          return next;
        });
      },
      onAgentFiles: (files) => {
        if (!files || files.length === 0) return;
        // currentAssistantIdRef may already be null if onDone fired first.
        // Fall back to finding the last assistant message in the list.
        const assistantId = currentAssistantIdRef.current;
        setMessages(prev => {
          const targetId = assistantId ?? [...prev].reverse().find(m => m.role === 'assistant')?.id;
          if (targetId == null) return prev;
          return prev.map(m =>
            m.id === targetId
              ? { ...m, agentFiles: [...(m.agentFiles ?? []), ...files] }
              : m
          );
        });
      },
      onDone: async (fullContent) => {
        setIsWaitingForResponse(false);
        setActiveToolCalls(new Map());
        setCompletedToolCalls([]);
        setShowToolCallHistory(false);
        setExecutingTool(null);
        const latencyMs = streamStartedAtRef.current ? Date.now() - streamStartedAtRef.current : undefined;
        streamStartedAtRef.current = null;
        // Update the pre-allocated assistant message in-place with the final
        // content. Clear the ref after a short delay — onAgentFiles fires
        // after onDone (agent_files SSE arrives after [DONE]) and still needs
        // the ref. The fallback in onAgentFiles handles the null case anyway.
        const assistantId = currentAssistantIdRef.current;
        if (assistantId != null) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: fullContent, latencyMs }
              : m
          ));
          setTimeout(() => { currentAssistantIdRef.current = null; }, 2000);
        }
        setStreamingContent('');
        setSending(false);
        abortRef.current = null;

        if (!isAtBottomRef.current) {
          setUnreadCount(prev => prev + 1);
          setBadge(unreadCount + 1);
        }

        const preview = fullContent.slice(0, 100) + (fullContent.length > 100 ? '...' : '');
        notify(t('chat.responseReceived'), preview);
      },
      onError: (chatError) => {
        console.error('[ChatPage] Chat error:', chatError);
        setError(chatError);
        if (chatError.type === 'content_moderation' && !chatError.retryable) {
          setIsSessionBlocked(true);
          if (id) sessionStorage.setItem(`blocked:${id}`, 'true');
        }
        // Remove both the user message and the pre-allocated assistant placeholder.
        setMessages(prev => prev.filter(m => m.id !== userMessage.id && m.id !== currentAssistantIdRef.current));
        currentAssistantIdRef.current = null;
        setIsWaitingForResponse(false);
        setStreamingContent('');
        setSending(false);
        abortRef.current = null;
      },
    });

    abortRef.current = controller;
  }

  function handleRetry() {
    if (!lastSentContentRef.current) return;
    setError(null);
    doSend(lastSentContentRef.current);
  }

  async function handleCopyMessage(msgId: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(msgId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === msgId ? null : current));
      }, 1500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    if (streamingContent) {
      const fullContent = streamingContent + '\n\n*[stopped]*';
      const assistantId = currentAssistantIdRef.current;
      if (assistantId != null) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: fullContent } : m
        ));
        currentAssistantIdRef.current = null;
      } else {
        const assistantMessage: Message = {
          id: Date.now() + 1,
          sessionId: id!,
          role: 'assistant',
          content: fullContent,
          timestamp: Date.now() / 1000,
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    }
    setStreamingContent('');
    setSending(false);
    abortRef.current = null;
  }

  if (!loading && loadError && !session) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-fg-primary mb-2">
            {t('chat.sessionNotFound')}
          </h2>
          <p className="text-sm text-fg-muted mb-6">
            {loadError}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => setRetryTrigger(prev => prev + 1)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-fg-primary rounded-lg transition-colors text-sm font-medium"
            >
              {t('common.tryAgain')}
            </button>
            <Link
              to="/sessions"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {t('common.backToSessions')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 sm:px-4 py-3 border-b border-border-default bg-bg-primary">
          <div className="h-5 w-40 bg-bg-muted rounded animate-pulse" />
          <div className="h-3 w-24 bg-bg-muted rounded mt-2 animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-muted animate-pulse" />
                <div className="flex-1 min-w-0 rounded-lg p-3 sm:p-4 bg-bg-primary border border-border-default animate-pulse space-y-2">
                  <div className="h-3 bg-bg-muted rounded w-full" />
                  <div className="h-3 bg-bg-muted rounded w-5/6" />
                  {i === 0 && <div className="h-3 bg-bg-muted rounded w-2/3" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 min-h-0 flex flex-col relative overflow-y-auto">
      <div className="px-3 sm:px-4 py-3 border-b border-border-default bg-bg-primary">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <nav className="flex items-center gap-1.5 min-w-0 flex-1 basis-full sm:basis-auto" aria-label="Breadcrumb">
            <Link
              to="/sessions"
              className="text-sm text-fg-muted hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0"
            >
              {t('chat.breadcrumbsSessions')}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />

            {isEditingTitle ? (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  disabled={isSavingTitle}
                  className="text-base md:text-lg font-semibold text-fg-primary bg-transparent border-b-2 border-blue-500 outline-none min-w-0 flex-1 disabled:opacity-50"
                  placeholder={t('chat.sessionTitlePlaceholder')}
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle || !editingTitle.trim()}
                  className="p-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 flex-shrink-0"
                  aria-label={t('chat.saveTitle')}
                >
                  {isSavingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  disabled={isSavingTitle}
                  className="p-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded text-fg-muted hover:bg-bg-secondary disabled:opacity-50 flex-shrink-0"
                  aria-label={t('chat.cancelEditing')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-base md:text-lg font-semibold text-fg-primary truncate min-w-0">
                  {session?.title || t('common.session')}
                </h1>
                <button
                  type="button"
                  onClick={handleStartEditTitle}
                  className="p-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded text-fg-muted hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex-shrink-0"
                  aria-label={t('chat.editTitle')}
                  title={t('chat.editTitle')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </nav>

          <div className="flex items-center gap-1 flex-shrink-0 ml-auto sm:ml-0">
            {/* Stop button in header — visible during generation so user doesn't need to scroll down */}
            {sending && (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                aria-label={t('chat.stopGenerating')}
              >
                <Square className="w-3 h-3 fill-current" />
                {t('common.stop')}
              </button>
            )}
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={handleDeleteSession}
                  disabled={isDeleting}
                  className="px-3 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  {t('chat.deleteConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={isDeleting}
                  className="px-3 py-2 min-h-[44px] bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-fg-primary text-sm rounded transition-colors disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isDeleting}
                className="p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded text-fg-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                aria-label={t('chat.deleteSession')}
                title={t('chat.deleteSession')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-fg-muted mt-1 flex-wrap">
          {session?.assistant && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-bg-secondary text-fg-secondary">
              {session.assistant.icon && <span aria-hidden="true">{session.assistant.icon}</span>}
              <span className="truncate max-w-[120px]">{session.assistant.name}</span>
            </span>
          )}
          <span>{session?.model}</span>
          {/* #35: file count indicator */}
          {sessionFileCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-bg-secondary text-fg-secondary"
              title={t('chat.sessionFilesBar', { count: sessionFileCount })}
            >
              <Paperclip className="w-3 h-3" />
              {sessionFileCount}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <NoMessagesIllustration className="w-20 h-20 mb-4 text-fg-muted" />
              <h2 className="text-lg font-semibold text-fg-primary mb-1">
                {t('chat.startConversation')}
              </h2>
              <p className="text-sm text-fg-muted max-w-sm mb-8">
                {t('chat.startConversationDesc')}
              </p>
              {/* Prompt suggestions — click to prefill the chat input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {[
                  t('chat.suggestion1', { defaultValue: 'Объясни простыми словами' }),
                  t('chat.suggestion2', { defaultValue: 'Помоги составить план' }),
                  t('chat.suggestion3', { defaultValue: 'Исправь ошибки в тексте' }),
                  t('chat.suggestion4', { defaultValue: 'Переведи на русский' }),
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('chat:prefill', { detail: { text: suggestion } }))}
                    className="text-left px-4 py-3 rounded-xl border border-border-default bg-bg-primary hover:bg-bg-secondary hover:border-blue-300 dark:hover:border-blue-700 transition-all text-sm text-fg-secondary"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.role === 'tool' && msg.toolName) {
              return (
                <ToolCall
                  key={msg.id}
                  toolName={msg.toolName}
                  content={msg.content || ''}
                  timestamp={msg.timestamp}
                />
              );
            }

            if (msg.role === 'assistant' && (!msg.content || msg.content.trim() === '') && (!msg.agentFiles || msg.agentFiles.length === 0)) {
              return null;
            }

            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex flex-row-reverse gap-3 group">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 relative rounded-lg p-3 sm:p-4 pb-2 bg-bg-secondary border-2 border-blue-500 text-fg-primary">
                    <MarkdownRenderer content={msg.content || ''} className="user-message" />
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="text-xs text-fg-muted" title={formatFullDateTime(msg.timestamp)}>
                        {formatTimeAgo(msg.timestamp)}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                        aria-label={copiedMessageId === msg.id ? t('chat.messageCopied') : t('chat.copyMessage')}
                        title={copiedMessageId === msg.id ? t('chat.messageCopied') : t('chat.copyMessage')}
                        className="p-1 inline-flex items-center justify-center rounded text-fg-muted opacity-60 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 transition-opacity hover:bg-bg-secondary"
                      >
                        {copiedMessageId === msg.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex gap-3 group">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-muted flex items-center justify-center text-fg-secondary">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 relative rounded-lg p-3 sm:p-4 pb-2 bg-bg-primary border border-border-default text-fg-primary">
                  <MarkdownRenderer content={msg.content || ''} className="assistant-message" />
                  {msg.agentFiles && msg.agentFiles.length > 0 && id && (
                    <div className="mt-2 space-y-2">
                      <AgentFileGroup files={msg.agentFiles} sessionId={id} />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 gap-2">
                    {/* Timestamp — always visible. Latency/tokens hidden until hover */}
                    <div className="flex items-center gap-2 text-xs text-fg-muted min-w-0">
                      <span title={formatFullDateTime(msg.timestamp)} className="flex-shrink-0">
                        {formatTimeAgo(msg.timestamp)}
                      </span>
                      {msg.latencyMs !== undefined && (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          · {(msg.latencyMs / 1000).toFixed(1)}s
                          {msg.tokenCount !== undefined && ` · ${msg.tokenCount} tok`}
                        </span>
                      )}
                    </div>
                    {/* Action buttons: visible on mobile, hover-only on desktop */}
                    <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                        aria-label={copiedMessageId === msg.id ? t('chat.messageCopied') : t('chat.copyMessage')}
                        title={copiedMessageId === msg.id ? t('chat.messageCopied') : t('chat.copyMessage')}
                        className="p-1.5 inline-flex items-center justify-center rounded text-fg-muted hover:bg-bg-secondary hover:text-fg-primary transition-colors"
                      >
                        {copiedMessageId === msg.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={sending}
                        aria-label={t('chat.regenerateResponse')}
                        title={t('chat.regenerateResponse')}
                        className="p-1.5 inline-flex items-center justify-center rounded text-fg-muted hover:bg-bg-secondary hover:text-fg-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {activeToolCalls.size > 0 && (
            <div key="active-tools" className="max-w-3xl space-y-2">
              {Array.from(activeToolCalls.entries()).map(([tcId, tc]) => (
                <div
                  key={tcId}
                  className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-mono px-2 py-0.5 bg-blue-200 dark:bg-blue-700 rounded text-blue-900 dark:text-blue-100">
                        {tc.toolName}
                      </span>
                      {tc.label && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">{tc.label}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {completedToolCalls.length > 0 && (
            <div key="completed-tools" className="max-w-3xl">
              <button
                type="button"
                onClick={() => setShowToolCallHistory(prev => !prev)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default bg-bg-secondary hover:bg-bg-muted transition-colors text-sm text-fg-secondary"
              >
                <span className={`transition-transform ${showToolCallHistory ? 'rotate-45' : ''}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                {t('chat.completedTools', { count: completedToolCalls.length })}
              </button>

              {showToolCallHistory && (
                <div className="mt-2 space-y-1">
                  {completedToolCalls.map(tc => (
                    <div
                      key={tc.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-fg-muted"
                    >
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      <span className="font-mono px-1.5 py-0.5 rounded bg-bg-muted">{tc.toolName}</span>
                      {tc.label && <span>{tc.label}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {streamingContent && (
            <div key="streaming" className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-muted flex items-center justify-center text-fg-secondary">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 rounded-lg p-3 sm:p-4 bg-bg-primary border border-border-default text-fg-primary">
                <MarkdownRenderer content={streamingContent} className="assistant-message" />
                {/* Blinking cursor at end of stream */}
                <span className="inline-block w-0.5 h-4 bg-fg-primary align-middle ml-0.5 animate-[blink_1s_step-end_infinite]" aria-hidden="true" />
              </div>
            </div>
          )}
          
          {isWaitingForResponse && !streamingContent && activeToolCalls.size === 0 && (
            <div key="waiting" className="max-w-3xl">
              <div className="bg-bg-primary rounded-lg p-3 sm:p-4 border border-border-default">
                <div className="flex items-center gap-2 text-fg-muted">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-sm">
                    {processStatus === 'thinking' 
                      ? t('chat.agentThinking') 
                      : processStatus === 'executing_tool' && executingTool
                        ? t('chat.executingTool', { toolName: executingTool })
                        : t('chat.generatingResponse')}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {!isAtBottom && (
          <div className="sticky bottom-3 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              aria-label={unreadCount > 0 ? t('chat.scrollToNewMessages', { count: unreadCount }) : t('chat.scrollToBottom', { defaultValue: 'Scroll to bottom' })}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-primary border border-border-default hover:bg-bg-secondary text-fg-primary text-xs font-medium shadow-lg transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              {unreadCount > 0 ? t('chat.newMessagesBadge', { count: unreadCount }) : t('chat.scrollToBottom', { defaultValue: '↓' })}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 sm:px-4 py-3 bg-bg-primary border-t border-border-default">
          <div className="max-w-4xl mx-auto">
            <ErrorMessage
              error={error}
              onRetry={error.retryable ? handleRetry : undefined}
            />
            <button
              onClick={() => setError(null)}
              aria-label={t('chat.closeErrorMessage')}
              className="text-xs text-fg-muted hover:text-fg-secondary mt-2"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {/* UX-4: Navigation guard modal */}
      {leaveGuardPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-bg-primary rounded-xl border border-border-default shadow-xl max-w-sm w-full p-6">
            <h2 className="text-base font-semibold text-fg-primary mb-2">
              {t('chat.leavePageTitle')}
            </h2>
            <p className="text-sm text-fg-secondary mb-5">
              {t('chat.leavePageDesc')}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleLeaveCancel}
                className="px-4 py-2 rounded-lg bg-bg-secondary hover:bg-bg-muted text-fg-primary text-sm font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleLeaveConfirm}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                {t('chat.leavePageConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
