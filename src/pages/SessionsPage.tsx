import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Virtuoso } from 'react-virtuoso';
import { api } from '../lib/api';
import { RefreshCw, Plus, MessageSquare, Sparkles, Loader2, SearchX } from 'lucide-react';
import type { Session } from '../types/api';
import { formatTimeAgo, formatFullDateTime } from '../lib/time';
import { useSearchStore } from '../store/searchStore';
import { NoSessionsIllustration } from '../assets/illustrations';

const PAGE_SIZE = 20;

function groupSessionsByDate(sessions: Session[]): Record<string, Session[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, Session[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Older: [],
  };

  sessions.forEach((session) => {
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
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSessions(PAGE_SIZE, 0);
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
      const data = await api.getSessions(PAGE_SIZE, sessions.length);
      setSessions((prev) => [...prev, ...data.sessions]);
      setHasMore(sessions.length + data.sessions.length < data.total);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, sessions.length]);

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
            onClick={loadSessions}
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
  const filteredGrouped = groupSessionsByDate(filteredSessions);
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
            onClick={loadSessions}
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
                return (
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide py-3 sticky top-0 bg-gray-100 dark:bg-gray-800">
                    {item.name}
                  </h2>
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
              return (
                <Link
                  to={`/chat/${session.id}`}
                  className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-2 hover:border-blue-300 dark:hover:border-blue-600 transition-all hover:shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {title}
                      </h3>
                      <span
                        className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0"
                        title={formatFullDateTime(session.startedAt)}
                      >
                        {formatTimeAgo(session.startedAt)}
                      </span>
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
    </div>
  );
}
