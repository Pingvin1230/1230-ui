import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type ChatMessage, type ChatError } from '../lib/api';
import { ErrorMessage } from '../components/ErrorMessage';
import { AlertCircle } from 'lucide-react';
import { useChatInputStore, type LiveMessageStatus } from '../store/chatInputStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import type { ChatInputHandle } from '../components/ChatInput';
import { Modal } from '../components/Modal';
import { MessageList } from '../components/MessageList';
import { committedUserMatchesPending } from '../components/messageListUtils';

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useNotifications } from '../hooks/useNotifications';
import { useNotificationsStore } from '../store/notificationsStore';
import { useChatSession } from '../hooks/useChatSession';
import { useChatScroll } from '../hooks/useChatScroll';
import { useChatNavigationGuard } from '../hooks/useChatNavigationGuard';

interface ChatPageProps {
  sessionId?: string | null;
  isActive?: boolean;
}

export function ChatPage({ sessionId, isActive = true }: ChatPageProps = {}) {
  const { t } = useTranslation();
  const routeId = useParams<{ id: string }>().id;
  const id = sessionId !== undefined ? sessionId : routeId;
  const location = useLocation();
  const locationState = location.state as { initialMessage?: string } | null;
  const initialMessageRef = useRef(locationState?.initialMessage);
  const [error, setError] = useState<ChatError | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const navigate = useNavigate();

  const [isSessionBlocked] = useState(
    () => Boolean(id && sessionStorage.getItem(`blocked:${id}`)),
  );
  const setChatActive = useChatInputStore((s) => s.setActiveSession);
  const setNavMeta = useChatInputStore((s) => s.setNavSessionMeta);
  const setSessionActions = useChatInputStore((s) => s.setSessionActions);
  const inputHasText = useChatInputStore((s) => s.hasAttachedFiles);

  // B11: the store is the single owner of the in-flight stream. ChatPage is a
  // SUBSCRIBER — it renders the active session's live slice and dispatches
  // sends/stops to the store. Navigation therefore never aborts a stream.
  const live = useChatInputStore((s) => (id ? s.liveMessages[id] : undefined));
  const initLive = useChatInputStore((s) => s.initLive);
  const clearLive = useChatInputStore((s) => s.clearLive);

  const liveStatus: LiveMessageStatus = live?.status ?? 'idle';
  const streamingContent = live?.streamingContent ?? '';
  const liveActiveToolCalls = useMemo(() => live?.activeToolCalls ?? [], [live?.activeToolCalls]);
  const liveCompletedToolCalls = useMemo(() => live?.completedToolCalls ?? [], [live?.completedToolCalls]);
  const liveAgentFiles = live?.agentFiles ?? [];
  const pendingUserContent = live?.pendingUserContent ?? null;
  const sending = liveStatus === 'streaming' || liveStatus === 'recovering';
  const isWaiting = sending && !streamingContent && liveActiveToolCalls.length === 0;
  const chatError = error ?? (liveStatus === 'error' ? (live?.error ?? null) : null);
  const sendingRef = useRef(sending);
  useEffect(() => { sendingRef.current = sending; }, [sending]);
  const isActiveRef = useRef(isActive);
  useEffect(() => { isActiveRef.current = isActive; });

  const { enabled: notificationsEnabled } = useNotificationsStore();
  const { notify, setBadge, clearBadge } = useNotifications({
    enabled: notificationsEnabled,
  });

  const { isAtBottom, isAtBottomRef, unreadCount, setUnreadCount, onAtBottomChange } =
    useChatScroll({ clearBadge });

  const { session, setSession, messages, loading, loadError } = useChatSession({
    id,
    retryTrigger,
    isActive,
    locationState,
    liveStatus,
    sendingRef,
    isAtBottomRef,
    unreadCount,
    setUnreadCount,
    clearLive,
    notify,
    setBadge,
  });

  // B11: dedup the in-flight overlay against the committed messages so we
  // never double-render a bubble once the server has persisted the turn.
  const lastCommittedUser = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') return messages[i];
    }
    return null;
  }, [messages]);
  const lastCommittedAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === 'assistant' && m.content) return m;
    }
    return null;
  }, [messages]);
  // C8: exact (trimmed) equality against the last committed user message,
  // tolerating the attached-file prefix — never a fragile suffix match.
  const showPendingUserBubble = !!pendingUserContent
    && pendingUserContent.trim().length > 0
    && !committedUserMatchesPending(lastCommittedUser?.content, pendingUserContent);
  const showStreamingBubble = streamingContent.trim().length > 0
    && !(lastCommittedAssistant?.content?.trim() === streamingContent.trim());

  useEffect(() => {
    if (id) initLive(id);
    // B11: no abort on id-change / unmount. The stream is owned by the
    // store (streamControllers module map) and lives in liveMessages, so
    // switching sessions or navigating away must NOT terminate a running
    // turn. All in-flight state is derived from the store, so there is no
    // per-turn local state to reset here either.
  }, [id, initLive]);

  useEffect(() => {
    if (!isActive) return;
    setChatActive(id ?? null);
    return () => { setChatActive(null); };
  }, [isActive, id, setChatActive]);

  // Sync session metadata to navbar store whenever session loads or title changes
  useEffect(() => {
    if (!isActive) return;
    if (!session) return;
    setNavMeta({
      title: session.title,
      model: session.model,
      assistantName: session.assistant?.name ?? null,
      assistantIcon: session.assistant?.icon ?? null,
    });
    return () => setNavMeta(null);
  }, [isActive, session, setNavMeta]);

  async function handleDeleteSession() {
    if (!id) return;
    try {
      await api.deleteSession(id);
      clearLive(id);
      const ws = useWorkspaceStore.getState();
      const slots = ws.activeSessionByExecutor;
      for (const ex of ['hermes', 'opencode-1230'] as const) {
        if (slots[ex] === id) ws.clearActiveSession(ex);
      }
      ws.setActiveTab('sessions');
      navigate('/sessions');
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError({
        type: 'server_error',
        message: t('chat.failedToDeleteSession'),
        retryable: false,
      });
    }
  }

  // Register session actions for Navbar to invoke
  useEffect(() => {
    if (!isActive) return;
    setSessionActions({
      onStartEditTitle: () => {
        // Navbar handles its own edit state; this is a no-op placeholder
      },
      onSaveTitle: async (title: string) => {
        if (!id || !title.trim()) return;
        try {
          const updated = await api.updateSessionTitle(id, title.trim());
          setSession(updated);
          setNavMeta({
            title: updated.title,
            model: updated.model,
            assistantName: updated.assistant?.name ?? null,
            assistantIcon: updated.assistant?.icon ?? null,
          });
        } catch (err) {
          console.error('Failed to update title:', err);
        }
      },
      onDeleteSession: handleDeleteSession,
      onStop: handleStop,
    });
    return () => setSessionActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isActive, setSessionActions]);

  // ChatInput is rendered by Layout (sibling of MobileNav). We reach it via
  // the chatInputStore (which holds ChatInput's imperative handle).
  const chatInputRef = useRef<ChatInputHandle>(null);
  const inputHandle = useChatInputStore((s) => s.handle);
  useEffect(() => { chatInputRef.current = inputHandle; }, [inputHandle]);

  const initialSentRef = useRef(false);
  const lastSentContentRef = useRef<string>('');

  // C2/UX-4: leave-guard, delegated to useChatNavigationGuard. The hook owns
  // the beforeunload / popstate / click-capture listeners, the pending URL,
  // and the `leaveGuardPending` flag. The Modal below renders off that flag.
  const { leaveGuardPending, handleLeaveConfirm, handleLeaveCancel } =
    useChatNavigationGuard({
      isActiveRef,
      inputHasText,
      clearInput: () => chatInputRef.current?.clearInput(),
      navigate,
    });

  // Refs that always point at the latest doSend / handleStop. The
  // pending-chat-action drain effect is registered ONCE on mount, so the
  // callbacks it captures must read the live closure through these refs
  // — otherwise a stale closure pins `messages = []` from the first render
  // and POST /api/chat is sent with `messages: [userMessage]` (no history),
  // which the Hermes agent sees as `history=0` and cannot maintain context.
  const doSendRef = useRef<(content: string) => void>(() => {});
  const handleStopRef = useRef<() => void>(() => {});

  useEffect(() => {
    doSendRef.current = doSend;
    handleStopRef.current = handleStop;
  });

  // D3: drain the pending chat-action queue (replaces the chat:send /
  // chat:stop window listeners). Registered once; reads the live closures
  // through doSendRef / handleStopRef and the active-session flag through
  // isActiveRef, so only the active ChatPage instance (Workspace mounts one
  // per executor) actually runs doSend / handleStop — exactly like the old
  // listeners' `if (!isActiveRef.current) return` guards. The nonce guard
  // guarantees each request fires once (StrictMode-safe) and preserves
  // ordering for rapid successive sends/stops.
  const pendingChatActions = useChatInputStore((s) => s.pendingChatActions);
  const lastChatNonce = useRef(0);
  useEffect(() => {
    const fresh = pendingChatActions.filter((a) => a.nonce > lastChatNonce.current);
    if (fresh.length === 0) return;
    lastChatNonce.current = fresh[fresh.length - 1].nonce;
    if (isActiveRef.current) {
      for (const action of fresh) {
        if (action.type === 'send') {
          doSendRef.current(action.content);
        } else {
          handleStopRef.current();
        }
      }
    }
    useChatInputStore.setState((s) => ({
      pendingChatActions: s.pendingChatActions.filter((a) => a.nonce > lastChatNonce.current),
    }));
  }, [pendingChatActions]);

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

  // Keep initialMessageRef in sync with location.state, and reset the
  // "already sent" guard whenever the target session / retry changes.
  const initialMessageFromState = locationState?.initialMessage;
  useEffect(() => {
    initialMessageRef.current = initialMessageFromState;
  }, [initialMessageFromState]);
  useEffect(() => {
    initialSentRef.current = false;
  }, [id, retryTrigger]);

  useEffect(() => {
    if (!isActive) return;
    const initialMessage = initialMessageRef.current;
    if (!loading && session && initialMessage && !initialSentRef.current && messages.length === 0) {
      initialSentRef.current = true;
      doSend(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, messages.length, isActive]);

  function doSend(content: string) {
    const userContent = content.trim();
    if (!userContent || sending) return;

    const resolvedModel = session?.model || localStorage.getItem('selectedModel') || null;
    if (!resolvedModel) {
      setError({
        type: 'invalid_request',
        message: 'No model selected for this session',
        retryable: false,
        suggestion: 'Pick a model from the session settings and try again.',
      });
      return;
    }

    const history: ChatMessage[] = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content || '' }));

    const attachedFilePaths = (chatInputRef.current?.getAttachedFiles() ?? [])
      .map((f) => f.path)
      .filter((p): p is string => Boolean(p));

    lastSentContentRef.current = userContent;
    chatInputRef.current?.clearInput();
    setError(null);

    useChatInputStore.getState().startStream(id!, {
      model: resolvedModel,
      history,
      content: userContent,
      attachedFilePaths,
    });
  }

  function handleRetry() {
    if (!lastSentContentRef.current) return;
    setError(null);
    if (id) clearLive(id);
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
    if (id) useChatInputStore.getState().stopStream(id);
  }

  if (!id) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-lg font-semibold text-fg-primary mb-1">{t('chat.noActiveSessionTitle', { defaultValue: 'No active session' })}</h2>
        <p className="text-sm text-fg-muted max-w-sm mb-6">{t('chat.noActiveSessionDesc', { defaultValue: 'Open the Sessions tab and choose a session for this executor.' })}</p>
        <OpenSessionsButton />
      </div>
    );
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
    <div className="flex-1 min-h-0 flex flex-col relative">
      <MessageList
        sessionId={id}
        messages={messages}
        session={session}
        copiedMessageId={copiedMessageId}
        onCopyMessage={handleCopyMessage}
        isAtBottom={isAtBottom}
        isAtBottomRef={isAtBottomRef}
        unreadCount={unreadCount}
        onAtBottomChange={onAtBottomChange}
        overlay={{
          showEmpty: messages.length === 0,
          showPendingUserBubble,
          pendingUserContent,
          liveActiveToolCalls,
          liveCompletedToolCalls,
          showStreamingBubble,
          streamingContent,
          sending,
          liveAgentFiles,
          isWaiting,
        }}
      />

      {chatError && (
        <div className="px-3 sm:px-4 py-3 bg-bg-primary border-t border-border-default">
          <div className="max-w-4xl mx-auto">
            <ErrorMessage
              error={chatError}
              onRetry={chatError.retryable ? handleRetry : undefined}
            />
            <button
              onClick={() => {
                if (error) setError(null);
                else if (id) clearLive(id);
              }}
              aria-label={t('chat.closeErrorMessage')}
              className="text-xs text-fg-muted hover:text-fg-secondary mt-2"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {/* C2/UX-4: Navigation guard modal */}
      <Modal
        isOpen={leaveGuardPending}
        onClose={handleLeaveCancel}
        title={t('chat.leavePageTitle')}
        size="sm"
        closeOnBackdrop={false}
        showCloseButton={false}
      >
        <div className="p-6">
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
      </Modal>
    </div>
  );
}

function OpenSessionsButton() {
  const { t } = useTranslation();
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  return (
    <button
      type="button"
      onClick={() => setActiveTab('sessions')}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
    >
      {t('chat.openSessionsTab', { defaultValue: 'Open Sessions' })}
    </button>
  );
}
