import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Virtuoso } from 'react-virtuoso';
import { api } from '../lib/api';
import { RefreshCw, Plus, MessageSquare, Sparkles, Loader2, SearchX, Star, Archive, Trash2, CheckSquare, Square, Eye } from 'lucide-react';
import type { Session } from '../types/api';
import { formatTimeAgo, formatFullDateTime } from '../lib/time';
import { useSearchStore } from '../store/searchStore';
import { NoSessionsIllustration } from '../assets/illustrations';
import { Modal } from '../components/Modal';

const PAGE_SIZE = 20;

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

    const sessionDate = new Date(session.startedAt * 1000);
    const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

    if (sessionDay >= today) {
      groups.Today.push(session);
    } else if (sessionDay >= yesterday) {
      groups.Yesterday.push(session);
    } else if (sessionDay >= weekStart) {
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);

  const loadSessions = useCallback(async (includeArchived = false) => {
    try {
      setLoading(true);
      const data = await api.getSessions(PAGE_SIZE, 0, includeArchived);
      setSessions(data.sessions);
      setTotal(data.total);
      setHasMore(data.sessions.length < data.total);
      setError(null);
    } catch (err) {
      setError('Failed to load sessions');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.getSessions(PAGE_SIZE, 0);
        if (cancelled) return;
        setSessions(data.sessions);
        setTotal(data.total);
        setHasMore(data.sessions.length < data.total);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError('Failed to load sessions');
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const data = await api.getSessions(PAGE_SIZE, sessions.length, showArchived);
      setSessions((prev) => [...prev, ...data.sessions]);
      setHasMore(sessions.length + data.sessions.length < data.total);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, sessions.length, showArchived]);

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

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Sessions</h1>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 animate-pulse">
              <div className="flex-1">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                <div className="flex gap-2 mb-3">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                </div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button
            onClick={() => loadSessions(showArchived)}
            className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Retry
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
    <div className="p-6 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Sessions</h1>
            {hasSessions && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {sessions.length} of {total} {total === 1 ? 'session' : 'sessions'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !showArchived;
              setShowArchived(next);
              loadSessions(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
              showArchived
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            aria-label="Toggle archived sessions"
          >
            <Eye className="w-4 h-4" />
            Archived
          </button>
          <button
            onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
              bulkMode
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            aria-label="Select sessions"
          >
            <CheckSquare className="w-4 h-4" />
            Select
          </button>
          <button
            onClick={() => loadSessions(showArchived)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Refresh sessions"
          >
            <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <Link
            to="/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            New Session
          </Link>
        </div>
      </div>

      {bulkMode && selectedIds.size > 0 && (
        <div className="flex items-center justify-between mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkMode(false); }}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
            <button
              onClick={() => setShowBulkConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {!hasSessions ? (
        <div className="text-center py-16">
          <NoSessionsIllustration className="w-24 h-24 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No sessions yet
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Create your first session to start a conversation
          </p>
          <Link
            to="/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            <Sparkles className="w-5 h-5" />
            Create Session
          </Link>
        </div>
      ) : isSearching && !hasFiltered ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
            <SearchX className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No sessions match &quot;{query}&quot;
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Searching loaded sessions only
          </p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors text-sm font-medium"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          {isSearching && (
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
              Searching loaded sessions — {filteredSessions.length} of {sessions.length} match
            </p>
          )}
          <Virtuoso
            data={flatItems}
            useWindowScroll={false}
            endReached={loadMore}
            increaseViewportBy={400}
            itemContent={(_, item) => {
              if (item.type === 'header') {
                const isPinned = item.name === 'Pinned';
                const isArchived = item.name === 'Archived';
                return (
                  <div className="flex items-center gap-2 py-3 sticky top-0 bg-gray-100 dark:bg-gray-800">
                    {isPinned && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                    <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {item.name}
                    </h2>
                    {isArchived && <Archive className="w-4 h-4 text-gray-400" />}
                  </div>
                );
              }
              const session = item.session;
              const title =
                session.title ||
                (session.preview
                  ? session.preview.length > 70
                    ? session.preview.slice(0, 70) + '...'
                    : session.preview
                  : 'Untitled session');
              const isSelected = selectedIds.has(session.id);

              return (
                <div className="mb-2 group relative">
                  {bulkMode && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(session.id); }}
                      className="absolute z-10 left-3 top-1/2 -translate-y-1/2 p-1"
                    >
                      {isSelected ? <CheckSquare className="w-5 h-5 text-blue-500" /> : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                  )}
                  <Link
                    to={`/chat/${session.id}`}
                    className={`block bg-white dark:bg-gray-800 border rounded-lg p-4 transition-all hover:shadow-sm ${
                      bulkMode ? 'pl-10' : ''
                    } ${
                      session.pinned === 1
                        ? 'border-yellow-300 dark:border-yellow-700 hover:border-yellow-400 dark:hover:border-yellow-600'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {session.pinned === 1 && (
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                          )}
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!bulkMode && (
                            <>
                              {session.archived !== 1 && (
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTogglePin(session); }}
                                  className="p-1 rounded text-gray-400 hover:text-yellow-500 dark:hover:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  aria-label={session.pinned === 1 ? 'Unpin session' : 'Pin session'}
                                >
                                  <Star className={`w-4 h-4 ${session.pinned === 1 ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleArchive(session); }}
                                className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                aria-label={session.archived === 1 ? 'Unarchive session' : 'Archive session'}
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <span
                            className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
                            title={formatFullDateTime(session.startedAt)}
                          >
                            {formatTimeAgo(session.startedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {session.model && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            {session.model}
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          {session.source}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          <MessageSquare className="w-3 h-3" />
                          {session.messageCount}
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                          #{session.id.slice(0, 8)}
                        </span>
                      </div>
                      {session.preview && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {session.preview}
                        </p>
                      )}
                    </div>
                  </Link>
                </div>
              );
            }}
            components={{
              Footer: () =>
                loadingMore || (hasMore && !isSearching) ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  </div>
                ) : null,
            }}
          />
        </>
      )}

      <Modal
        isOpen={showBulkConfirm}
        onClose={() => setShowBulkConfirm(false)}
        title="Delete sessions"
        size="sm"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-fg-secondary">
            Delete {selectedIds.size} session{selectedIds.size === 1 ? '' : 's'}? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowBulkConfirm(false)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
