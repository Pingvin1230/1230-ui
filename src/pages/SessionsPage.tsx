import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Sparkles, Loader2, SearchX, Archive, Trash2, Eye, CheckSquare } from 'lucide-react';
import type { Session } from '../types/api';
import { useSearchStore } from '../store/searchStore';
import { useSessionsSortStore } from '../store/sessionsSortStore';
import { useChatInputStore } from '../store/chatInputStore';
import { NoSessionsIllustration } from '../assets/illustrations';
import { Modal } from '../components/Modal';
import { SessionCard } from '../components/SessionCard';

const PAGE_SIZE = 20;

function getActivityAt(session: Session): number {
  return session.lastMessageAt != null ? session.lastMessageAt : session.startedAt;
}

function groupSessionsByDate(sessions: Session[], showArchived: boolean): Record<string, Session[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, Session[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
    Archived: [],
  };

  sessions.forEach((session) => {
    const isArchived = session.archived === 1;
    const isPinned = session.pinned === 1;

    if (isArchived) {
      if (showArchived) groups.Archived.push(session);
      return;
    }

    if (isPinned) {
      groups.Pinned.push(session);
      return;
    }

    const activityDate = new Date(getActivityAt(session) * 1000);
    const activityDay = new Date(activityDate.getFullYear(), activityDate.getMonth(), activityDate.getDate());

    if (activityDay >= today) {
      groups.Today.push(session);
    } else if (activityDay >= yesterday) {
      groups.Yesterday.push(session);
    } else if (activityDay >= weekStart) {
      groups['This Week'].push(session);
    } else {
      groups.Older.push(session);
    }
  });

  return groups;
}

type ListItem =
  | { type: 'header'; key: string; name: string }
  | { type: 'session'; key: string; session: Session };

function flattenGrouped(grouped: Record<string, Session[]>): ListItem[] {
  const out: ListItem[] = [];
  for (const [name, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;
    out.push({ type: 'header', key: `h:${name}`, name });
    for (const session of items) {
      out.push({ type: 'session', key: `s:${session.id}`, session });
    }
  }
  return out;
}

export function SessionsPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [pendingSwipeDelete, setPendingSwipeDelete] = useState<Session | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const sortMode = useSessionsSortStore((s) => s.sortMode);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const location = useLocation();
  const setNavPageContext = useChatInputStore((s) => s.setNavPageContext);

  // Infinite scroll sentinel — must be declared before any early returns
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async (includeArchived = false) => {
    try {
      setLoading(true);
      const data = await api.getSessions(PAGE_SIZE, 0, includeArchived, sortMode);
      setSessions(data.sessions);
      setTotal(data.total);
      setHasMore(data.sessions.length < data.total);
      setError(null);
    } catch (err) {
        setError(t('sessions.failedToLoadSessions'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [sortMode, t]);

  // Register page context in Navbar
  useEffect(() => {
    setNavPageContext({
      title: t('sessions.title'),
        actions: [
        {
          label: t('sessions.archived'),
          icon: <Eye className="w-3.5 h-3.5" />,
          active: showArchived,
          onClick: () => {
            const next = !showArchived;
            setShowArchived(next);
            loadSessions(next);
          },
        },
        {
          label: t('common.select'),
          icon: <CheckSquare className="w-3.5 h-3.5" />,
          active: bulkMode,
          onClick: () => { setBulkMode(v => !v); setSelectedIds(new Set()); },
        },
      ],
    });
    return () => setNavPageContext(null);
  }, [t, showArchived, bulkMode, setNavPageContext, loadSessions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.getSessions(PAGE_SIZE, 0, showArchived, sortMode);
        if (cancelled) return;
        setSessions(data.sessions);
        setTotal(data.total);
        setHasMore(data.sessions.length < data.total);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(t('sessions.failedToLoadSessions'));
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.key, showArchived, sortMode, t]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const data = await api.getSessions(PAGE_SIZE, sessions.length, showArchived, sortMode);
      setSessions((prev) => [...prev, ...data.sessions]);
      setHasMore(sessions.length + data.sessions.length < data.total);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, sessions.length, showArchived, sortMode]);

  // Trigger loadMore when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  async function handleTogglePin(session: Session) {
    try {
      const result = await api.togglePin(session.id);
      setSessions(prev => prev.map(s =>
        s.id === session.id ? { ...s, pinned: result.pinned } : s
      ));
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  }

  async function handleToggleArchive(session: Session) {
    try {
      const result = await api.toggleArchive(session.id);
      if (result.archived === 1) {
        setSessions(prev => prev.filter(s => s.id !== session.id));
        setTotal(t => t - 1);
      } else {
        await loadSessions(showArchived);
      }
    } catch (err) {
      console.error('Failed to toggle archive:', err);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    try {
      await api.bulkDeleteSessions(Array.from(selectedIds));
      setSessions(prev => prev.filter(s => !selectedIds.has(s.id)));
      setTotal(t => t - selectedIds.size);
      setSelectedIds(new Set());
      setBulkMode(false);
      setShowBulkConfirm(false);
    } catch (err) {
      console.error('Failed to bulk delete:', err);
    }
  }

  function handleSwipeDelete(session: Session) {
    setPendingSwipeDelete(session);
  }

  function handleLongPress(session: Session) {
    if (!bulkMode) setBulkMode(true);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(session.id);
      return next;
    });
  }

  async function confirmSwipeDelete() {
    if (!pendingSwipeDelete) return;
    const id = pendingSwipeDelete.id;
    try {
      setIsDeleting(true);
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      setTotal(t => t - 1);
      setPendingSwipeDelete(null);
    } catch (err) {
      console.error('Failed to delete session:', err);
    } finally {
      setIsDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto border-t border-border-default">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b border-border-default px-3 sm:px-4 py-3.5 animate-pulse">
            <div className="h-4 bg-bg-muted rounded w-1/2 mb-1.5" />
            <div className="h-3 bg-bg-muted rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button
            onClick={() => loadSessions(showArchived)}
            className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const hasSessions = sessions.length > 0;

  const filteredSessions = query.trim()
    ? sessions.filter((s) => {
        const q = query.toLowerCase();
        return (
          (s.title?.toLowerCase().includes(q) ?? false) ||
          (s.preview?.toLowerCase().includes(q) ?? false)
        );
      })
    : sessions;
  const hasFiltered = filteredSessions.length > 0;
  const filteredGrouped = groupSessionsByDate(filteredSessions, showArchived);
  const flatItems = flattenGrouped(filteredGrouped);
  const isSearching = query.trim().length > 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto">

      {bulkMode && selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            {t('common.selected', { count: selectedIds.size })}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkMode(false); }}
              className="px-3 py-2 min-h-[44px] text-sm text-fg-secondary hover:bg-bg-secondary rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={async () => {
                try {
                  for (const id of selectedIds) {
                    await api.toggleArchive(id);
                  }
                  setSessions(prev => prev.filter(s => !selectedIds.has(s.id)));
                  setTotal(t => t - selectedIds.size);
                  setSelectedIds(new Set());
                  setBulkMode(false);
                } catch (err) {
                  console.error('Failed to bulk archive:', err);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              {t('common.archive')}
            </button>
            <button
              onClick={() => setShowBulkConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('common.delete')}
            </button>
          </div>
        </div>
      )}

      {!hasSessions ? (
        <div className="text-center py-16">
          <NoSessionsIllustration className="w-24 h-24 mx-auto mb-4 text-fg-muted" />
          <h2 className="text-xl font-semibold text-fg-primary mb-2">
            {t('sessions.noSessionsYet')}
          </h2>
          <p className="text-fg-muted mb-6">
            {t('sessions.noSessionsDesc')}
          </p>
          <Link
            to="/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            <Sparkles className="w-5 h-5" />
            {t('common.createSession')}
          </Link>
        </div>
      ) : isSearching && !hasFiltered ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-bg-secondary mb-4">
            <SearchX className="w-8 h-8 text-fg-muted" />
          </div>
          <h2 className="text-xl font-semibold text-fg-primary mb-2">
            {t('sessions.noMatchTitle', { query })}
          </h2>
          <p className="text-fg-muted mb-6">
            {t('sessions.noMatchDesc')}
          </p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-fg-primary rounded-lg transition-colors text-sm font-medium"
          >
            {t('common.clearSearch')}
          </button>
        </div>
      ) : (
        <>
          {isSearching && (
            <p className="text-xs text-fg-muted mb-3">
              {t('sessions.searchInfo', { filtered: filteredSessions.length, total: sessions.length })}
            </p>
          )}
          <div className="border-t border-border-default">
            {flatItems.map((item) => {
              if (item.type === 'header') {
                const groupName =
                  item.name === 'Pinned' ? t('sessions.pinned')
                  : item.name === 'Archived' ? t('sessions.archived')
                  : item.name === 'Today' ? t('sessions.today')
                  : item.name === 'Yesterday' ? t('sessions.yesterday')
                  : item.name === 'This Week' ? t('sessions.thisWeek')
                  : t('sessions.older');
                return (
                  <div key={item.key} className="sticky top-0 z-10 bg-bg-secondary px-3 sm:px-4 py-1.5">
                    <span className="text-xs text-fg-muted font-medium">{groupName}</span>
                  </div>
                );
              }
              const session = item.session;
              const isSelected = selectedIds.has(session.id);
              return (
                <SessionCard
                  key={item.key}
                  session={session}
                  bulkMode={bulkMode}
                  isSelected={isSelected}
                  onToggleSelect={toggleSelect}
                  onTogglePin={handleTogglePin}
                  onToggleArchive={handleToggleArchive}
                  onSwipeDelete={handleSwipeDelete}
                  onLongPress={handleLongPress}
                />
              );
            })}
          </div>
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {(loadingMore || (hasMore && !isSearching)) && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={showBulkConfirm}
        onClose={() => setShowBulkConfirm(false)}
        title={t('sessions.deleteSessionsTitle')}
        size="sm"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg-secondary">
            {t('sessions.deleteSessionsConfirm', { count: selectedIds.size })}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowBulkConfirm(false)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-fg-primary rounded-lg transition-colors text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={pendingSwipeDelete !== null}
        onClose={() => { if (!isDeleting) setPendingSwipeDelete(null); }}
        title={t('sessions.deleteSessionTitle')}
        size="sm"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg-secondary">
            {t('sessions.deleteSessionConfirm')}
          </p>
          {pendingSwipeDelete && (
            <p className="text-sm font-medium text-fg-primary truncate">
              {pendingSwipeDelete.title || t('common.untitledSession')}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setPendingSwipeDelete(null)}
              disabled={isDeleting}
              className="px-4 py-2 min-h-[44px] bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-fg-primary rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmSwipeDelete}
              disabled={isDeleting}
              className="px-4 py-2 min-h-[44px] bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
    </div>
  );
}
