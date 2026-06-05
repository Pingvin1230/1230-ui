import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { api, type ChatMessage, type ChatError } from '../lib/api';
import type { Message, Session } from '../types/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import ToolCall from '../components/ToolCall';
import { ErrorMessage } from '../components/ErrorMessage';
import { ShieldAlert, Plus, Copy, Check, RefreshCw, Bot, User, AlertCircle, ChevronRight, Trash2, Pencil, Loader2 } from 'lucide-react';
import { NoMessagesIllustration } from '../assets/illustrations';
import { formatTimeAgo, formatFullDateTime } from '../lib/time';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useNotifications } from '../hooks/useNotifications';
import { useNotificationsStore } from '../store/notificationsStore';
import 'highlight.js/styles/github-dark.css';

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const initialMessage = (location.state as { initialMessage?: string })?.initialMessage;
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialSentRef = useRef(false);
  const lastSentContentRef = useRef<string>('');
  const streamStartedAtRef = useRef<number | null>(null);
  const [isSessionBlocked, setIsSessionBlocked] = useState(
    () => Boolean(id && sessionStorage.getItem(`blocked:${id}`))
  );
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
  const { enabled: notificationsEnabled } = useNotificationsStore();
  const { notify, setBadge, clearBadge } = useNotifications({
    enabled: notificationsEnabled,
  });

  useKeyboardShortcuts([
    {
      key: 'Enter',
      metaKey: true,
      action: () => {
        if (!isSessionBlocked && !sending && input.trim()) {
          handleSend();
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
        message: 'Failed to delete session',
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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    
    (async () => {
      try {
        setLoadError(null);
        const sessionData = await api.getSession(id);
        if (cancelled) return;
        setSession(sessionData);
      } catch (err) {
        console.error('Failed to load session:', err);
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Session not found');
      }
      
      try {
        setLoading(true);
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
  }, [id, retryTrigger]);

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
    if (!loading && session && initialMessage && !initialSentRef.current) {
      initialSentRef.current = true;
      setInput(initialMessage);
      setTimeout(() => {
        setInput('');
        doSend(initialMessage);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSend is intentionally excluded: initialMessage should only be sent once when available, not on every doSend recreation. initialSentRef prevents duplicate sends.
  }, [loading, session, initialMessage]);

  async function saveMessage(sessionId: string, role: string, content: string, toolName?: string) {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, role, content, toolName }),
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  }

  function doSend(content: string) {
    const userContent = content.trim();
    if (!userContent || sending) return;

    const userMessage: Message = {
      id: Date.now(),
      sessionId: id!,
      role: 'user',
      content: userContent,
      timestamp: Date.now() / 1000,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setSending(true);
    setStreamingContent('');
    setError(null);
    setIsWaitingForResponse(true);
    setProcessStatus('thinking');
    setExecutingTool(null);
    setActiveToolCalls(new Map());
    lastSentContentRef.current = userContent;
    streamStartedAtRef.current = Date.now();

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
      onDone: async (fullContent) => {
        console.log('[ChatPage] onDone called, content length:', fullContent?.length);
        setIsWaitingForResponse(false);
        setActiveToolCalls(new Map());
        setCompletedToolCalls([]);
        setShowToolCallHistory(false);
        setExecutingTool(null);
        const latencyMs = streamStartedAtRef.current ? Date.now() - streamStartedAtRef.current : undefined;
        streamStartedAtRef.current = null;
        const assistantMessage: Message = {
          id: Date.now() + 1,
          sessionId: id!,
          role: 'assistant',
          content: fullContent,
          timestamp: Date.now() / 1000,
          latencyMs,
        };
        setMessages(prev => [...prev, assistantMessage]);
        setStreamingContent('');
        setSending(false);
        abortRef.current = null;

        if (!isAtBottomRef.current) {
          setUnreadCount(prev => prev + 1);
          setBadge(unreadCount + 1);
        }

        const preview = fullContent.slice(0, 100) + (fullContent.length > 100 ? '...' : '');
        notify('Response received', preview);

        await saveMessage(id!, 'user', userContent);
        await saveMessage(id!, 'assistant', fullContent);
      },
      onError: (chatError) => {
        console.error('[ChatPage] Chat error:', JSON.stringify(chatError, null, 2));
        setError(chatError);
        if (chatError.type === 'content_moderation' && !chatError.retryable) {
          setIsSessionBlocked(true);
          if (id) sessionStorage.setItem(`blocked:${id}`, 'true');
        }
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setIsWaitingForResponse(false);
        setStreamingContent('');
        setSending(false);
        abortRef.current = null;
      },
    });

    abortRef.current = controller;
  }

  function handleSend() {
    doSend(input);
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

  async function handleStop() {
    abortRef.current?.abort();
    if (streamingContent) {
      const fullContent = streamingContent + '\n\n*[stopped]*';
      const assistantMessage: Message = {
        id: Date.now() + 1,
        sessionId: id!,
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now() / 1000,
      };
      setMessages(prev => [...prev, assistantMessage]);
      await saveMessage(id!, 'assistant', fullContent);
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
            Session not found
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
              Try again
            </button>
            <Link
              to="/sessions"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Back to sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border-default bg-bg-primary">
          <div className="h-5 w-40 bg-bg-muted rounded animate-pulse" />
          <div className="h-3 w-24 bg-bg-muted rounded mt-2 animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-muted animate-pulse" />
                <div className="flex-1 min-w-0 rounded-lg p-4 bg-bg-primary border border-border-default animate-pulse space-y-2">
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
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border-default bg-bg-primary">
        <div className="flex items-center justify-between gap-2">
          <nav className="flex items-center gap-1.5 min-w-0 flex-1" aria-label="Breadcrumb">
            <Link
              to="/sessions"
              className="text-sm text-fg-muted hover:text-blue-600 dark:hover:text-blue-400 flex-shrink-0"
            >
              Sessions
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
                  className="text-lg font-semibold text-fg-primary bg-transparent border-b-2 border-blue-500 outline-none min-w-0 flex-1 disabled:opacity-50"
                  placeholder="Session title"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle || !editingTitle.trim()}
                  className="p-1 rounded text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 flex-shrink-0"
                  aria-label="Save title"
                >
                  {isSavingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  disabled={isSavingTitle}
                  className="p-1 rounded text-fg-muted hover:bg-bg-secondary disabled:opacity-50 flex-shrink-0"
                  aria-label="Cancel editing"
                >
                  <AlertCircle className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-fg-primary truncate min-w-0">
                  {session?.title || 'Session'}
                </h1>
                <button
                  type="button"
                  onClick={handleStartEditTitle}
                  className="p-1 rounded text-fg-muted hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex-shrink-0"
                  aria-label="Edit title"
                  title="Edit title"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </nav>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={handleDeleteSession}
                  disabled={isDeleting}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={isDeleting}
                  className="px-2 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-fg-primary text-xs rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isDeleting}
                className="p-1.5 rounded text-fg-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                aria-label="Delete session"
                title="Delete session"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="text-sm text-fg-muted mt-1">
          {session?.model} • {session?.source}
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <NoMessagesIllustration className="w-24 h-24 mb-4 text-fg-muted" />
              <h2 className="text-lg font-semibold text-fg-primary mb-1">
                Start a conversation
              </h2>
              <p className="text-sm text-fg-muted max-w-sm">
                Send a message to get a response from Hermes.
              </p>
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

            if (msg.role === 'assistant' && (!msg.content || msg.content.trim() === '')) {
              return null;
            }

            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex flex-row-reverse gap-3 group">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 relative rounded-lg p-4 bg-bg-secondary border-2 border-blue-500 text-fg-primary">
                    <MarkdownRenderer content={msg.content || ''} className="user-message" />
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-fg-muted" title={formatFullDateTime(msg.timestamp)}>
                        {formatTimeAgo(msg.timestamp)}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                        aria-label={copiedMessageId === msg.id ? 'Message copied' : 'Copy message'}
                        className="p-1 rounded text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-bg-secondary"
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
                <div className="flex-1 min-w-0 relative rounded-lg p-4 bg-bg-primary border border-border-default text-fg-primary">
                  <MarkdownRenderer content={msg.content || ''} className="assistant-message" />
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-xs text-fg-muted">
                      <span title={formatFullDateTime(msg.timestamp)}>
                        {formatTimeAgo(msg.timestamp)}
                      </span>
                      {msg.latencyMs !== undefined && (
                        <span>
                          · ⏱ {(msg.latencyMs / 1000).toFixed(1)}s
                          {msg.tokenCount !== undefined && ` · ${msg.tokenCount} tokens`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content || '')}
                        aria-label={copiedMessageId === msg.id ? 'Message copied' : 'Copy message'}
                        className="p-1 rounded text-fg-muted hover:bg-bg-secondary"
                      >
                        {copiedMessageId === msg.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={sending}
                        aria-label="Regenerate response"
                        className="p-1 rounded text-fg-muted hover:bg-bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
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
                {completedToolCalls.length} completed tool{completedToolCalls.length > 1 ? 's' : ''}
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
            <div key="streaming" className="max-w-3xl">
              <div className="bg-bg-primary rounded-lg p-4 border border-border-default">
                <MarkdownRenderer content={streamingContent} />
              </div>
            </div>
          )}
          
          {isWaitingForResponse && !streamingContent && activeToolCalls.size === 0 && (
            <div key="waiting" className="max-w-3xl">
              <div className="bg-bg-primary rounded-lg p-4 border border-border-default">
                <div className="flex items-center gap-2 text-fg-muted">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-sm">
                    {processStatus === 'thinking' 
                      ? 'Agent is thinking...' 
                      : processStatus === 'executing_tool' && executingTool
                        ? `Executing ${executingTool}...`
                        : 'Generating response...'}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {!isAtBottom && unreadCount > 0 && (
          <div className="sticky bottom-3 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              aria-label={`Scroll to ${unreadCount} new messages`}
              className="pointer-events-auto px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-lg transition-colors"
            >
              ↓ {unreadCount} new
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-bg-primary border-t border-border-default">
          <div className="max-w-4xl mx-auto">
            <ErrorMessage
              error={error}
              onRetry={error.retryable ? handleRetry : undefined}
            />
            <button
              onClick={() => setError(null)}
              aria-label="Close error message"
              className="text-xs text-fg-muted hover:text-fg-secondary mt-2"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="p-4 border-t border-border-default bg-bg-primary">
        <div className="max-w-4xl mx-auto">
          {isSessionBlocked ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    Sending messages in this session is blocked
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    This session context contains information blocked by the provider security filter.
                  </p>
                  <Link
                    to="/new"
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create new session
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                disabled={sending}
                rows={1}
                className="flex-1 px-4 py-2 rounded-lg border border-border-default bg-bg-secondary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none overflow-y-auto"
              />
              {sending ? (
                <button
                  onClick={handleStop}
                  aria-label="Stop generating"
                  className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
