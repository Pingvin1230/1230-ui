import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { Message, Session } from '../types/api';
import { useChatInputStore, type LiveMessageStatus } from '../store/chatInputStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useDocumentVisibility } from './useDocumentVisibility';

interface UseChatSessionOptions {
  id: string | null | undefined;
  retryTrigger: number;
  isActive: boolean;
  locationState: { initialMessage?: string } | null;
  liveStatus: LiveMessageStatus;
  sendingRef: RefObject<boolean>;
  isAtBottomRef: RefObject<boolean>;
  unreadCount: number;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  clearLive: (id: string) => void;
  notify: (title: string, body?: string) => void;
  setBadge: (count: number) => void;
}

export interface UseChatSessionResult {
  session: Session | null;
  setSession: (s: Session | null) => void;
  messages: Message[];
  setMessages: (m: Message[]) => void;
  loading: boolean;
  loadError: string | null;
}

// Loads session + committed messages, performs a cheap focus refetch when the
// tab is revisited, and — crucially — owns the B11 stream-end transition:
// when the live slice for this session leaves an active state, the turn just
// finished, so we fire the response notification + unread badge and refresh
// the committed messages (which lets us drop the now-stale overlay).
export function useChatSession(opts: UseChatSessionOptions): UseChatSessionResult {
  const {
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
  } = opts;
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const idRefForVisibility = useRef<string | null>(null);
  useEffect(() => {
    idRefForVisibility.current = id ?? null;
  }, [id]);

  // Load session + messages on id / retry change. No abort on id-change: the
  // in-flight stream lives in chatInputStore and must survive navigation.
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
        setLoadError(err instanceof Error ? err.message : t('chat.sessionNotFound'));
        // Self-heal: drop a stale active-session slot so we don't 404 forever.
        const ws = useWorkspaceStore.getState();
        const slots = ws.activeSessionByExecutor;
        for (const ex of ['hermes', 'opencode-1230'] as const) {
          if (slots[ex] === id) ws.clearActiveSession(ex);
        }
      }

      try {
        const messagesData = await api.getMessages(id);
        if (cancelled) return;
        setMessages(messagesData);
        // B11: drop a now-stale overlay (stream finalized while unmounted) once
        // the committed messages contain its turn.
        const ls = useChatInputStore.getState().liveMessages[id];
        if (ls && ls.status === 'idle') {
          const lastA = [...messagesData].reverse().find((m) => m.role === 'assistant' && m.content);
          if (!ls.streamingContent || (lastA && lastA.content!.trim() === ls.streamingContent.trim())) {
            clearLive(id);
          }
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, retryTrigger, locationState, t, clearLive]);

  // B11: focus refetch. Cheaply re-pull committed messages when the user
  // returns to the tab while no stream is active, and clear a stale finalized
  // overlay if the committed messages now contain its turn.
  useDocumentVisibility(
    useCallback(() => {
      const sid = idRefForVisibility.current;
      if (!sid) return;
      if (sendingRef.current) return; // stream still running; overlay is source of truth
      (async () => {
        try {
          const [sessionData, messagesData] = await Promise.all([
            api.getSession(sid),
            api.getMessages(sid),
          ]);
          if (idRefForVisibility.current !== sid) return;
          setSession(sessionData);
          setMessages(messagesData);
          const ls = useChatInputStore.getState().liveMessages[sid];
          if (ls && ls.status === 'idle' && ls.streamingContent) {
            const lastA = [...messagesData].reverse().find((m) => m.role === 'assistant' && m.content);
            if (lastA && lastA.content!.trim() === ls.streamingContent.trim()) {
              clearLive(sid);
            }
          }
        } catch (err) {
          console.error('Failed to refresh on focus:', err);
        }
      })();
    }, [clearLive, sendingRef]),
  );

  // B11: stream-end transition. When the live status leaves an active state
  // (streaming/recovering), the turn just finished: fire the response
  // notification + unread badge (covers a background session too, as both
  // executor ChatPages stay mounted), then refresh the committed messages so
  // the persisted turn appears and the stale overlay is dropped.
  const prevStatusRef = useRef<LiveMessageStatus | undefined>(liveStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = liveStatus;
    if (!id) return;
    if (!prev || (prev !== 'streaming' && prev !== 'recovering')) return;
    if (liveStatus === 'streaming' || liveStatus === 'recovering') return;

    if (liveStatus === 'idle') {
      const ls = useChatInputStore.getState().liveMessages[id];
      const finalContent = ls?.streamingContent ?? '';
      if (finalContent) {
        if (!isAtBottomRef.current) {
          setUnreadCount((c) => c + 1);
          setBadge(unreadCount + 1);
        }
        const preview = finalContent.slice(0, 100) + (finalContent.length > 100 ? '...' : '');
        notify(t('chat.responseReceived'), preview);
      }
    }

    if (!isActive) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, msgs] = await Promise.all([api.getSession(id), api.getMessages(id)]);
        if (cancelled) return;
        setSession(s);
        setMessages(msgs);
        const ls = useChatInputStore.getState().liveMessages[id];
        if (ls && ls.status === 'idle' && ls.streamingContent) {
          const lastA = [...msgs].reverse().find((m) => m.role === 'assistant' && m.content);
          if (lastA && lastA.content!.trim() === ls.streamingContent.trim()) {
            clearLive(id);
          }
        }
      } catch (err) {
        console.error('Failed to refresh after stream end:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveStatus, id, isActive, clearLive, notify, setBadge, t, unreadCount, isAtBottomRef, setUnreadCount]);

  // Bump the unread counter when committed messages arrive while the user is
  // scrolled up. (When at the bottom, onAtBottomChange in useChatScroll resets
  // the counter.) This is the unread half of the old ChatPage scroll effect —
  // the auto-scroll half moved into MessageList (it owns the scroller).
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    if (!isAtBottomRef.current && messages.length !== prevMessageCountRef.current) {
      const diff = messages.length - prevMessageCountRef.current;
      if (diff > 0) setUnreadCount((prev) => prev + diff);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, isAtBottomRef, setUnreadCount]);

  return { session, setSession, messages, setMessages, loading, loadError };
}
