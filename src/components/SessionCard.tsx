import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Archive, MessageSquare, Trash2, CheckSquare, Square } from 'lucide-react';
import type { Session } from '../types/api';
import { formatTimeAgo, formatFullDateTime } from '../lib/time';
import { useSwipe } from '../hooks/useSwipe';

interface SessionCardProps {
  session: Session;
  bulkMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onTogglePin: (session: Session) => void;
  onToggleArchive: (session: Session) => void;
  onSwipeDelete: (session: Session) => void;
  onLongPress?: (session: Session) => void;
}

export function SessionCard({
  session,
  bulkMode,
  isSelected,
  onToggleSelect,
  onTogglePin,
  onToggleArchive,
  onSwipeDelete,
  onLongPress,
}: SessionCardProps) {
  const { t } = useTranslation();
  const longPressHandledRef = useRef(false);

  const swipe = useSwipe<HTMLDivElement>({
    onSwipeLeft: () => onSwipeDelete(session),
    onLongPress: () => {
      longPressHandledRef.current = true;
      onLongPress?.(session);
    },
    disabled: bulkMode,
  });

  const handleClick = (e: React.MouseEvent) => {
    if (longPressHandledRef.current) {
      e.preventDefault();
      longPressHandledRef.current = false;
    }
  };

  const title =
    session.title ||
    (session.preview
      ? session.preview.length > 70
        ? session.preview.slice(0, 70) + '...'
        : session.preview
      : t('common.untitledSession'));

  return (
    <div className="mb-2 relative overflow-hidden rounded-lg">
      {!bulkMode && (
        <div
          className="absolute inset-0 bg-red-500 dark:bg-red-600 rounded-lg flex items-center justify-end px-6 pointer-events-none"
          aria-hidden="true"
        >
          <Trash2 className="w-5 h-5 text-white" />
          <span className="ml-2 font-medium text-white">{t('common.delete')}</span>
        </div>
      )}
      <div
        /* eslint-disable react-hooks/refs -- swipe.ref is a RefObject from useSwipe hook; swiping/translateX are state, not ref.current */
        ref={swipe.ref}
        className={`group relative transform-gpu ${swipe.swiping ? '' : 'transition-transform duration-200 ease-out'}`}
        style={{ transform: `translateX(${swipe.translateX}px)` }}
      /* eslint-enable react-hooks/refs */
      >
        {bulkMode && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(session.id); }}
            data-swipe-ignore
            className="absolute z-10 left-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2"
            aria-label={isSelected ? t('common.selected', { count: 1 }) : t('sessions.selectSessions')}
          >
            {isSelected ? <CheckSquare className="w-5 h-5 text-blue-500" /> : <Square className="w-5 h-5 text-gray-400" />}
          </button>
        )}
        <Link
          to={`/chat/${session.id}`}
          onClick={handleClick}
          className={`block bg-bg-primary border rounded-lg p-3 sm:p-4 transition-all hover:shadow-sm ${
            bulkMode ? 'pl-12' : ''
          } ${
            session.pinned === 1
              ? 'border-yellow-300 dark:border-yellow-700 hover:border-yellow-400 dark:hover:border-yellow-600'
              : 'border-border-default hover:border-blue-300 dark:hover:border-blue-600'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 sm:gap-4 mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {session.pinned === 1 && (
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                )}
                <h3 className="font-semibold text-fg-primary truncate">
                  {title}
                </h3>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                {!bulkMode && (
                  <>
                    {session.archived !== 1 && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(session); }}
                        data-swipe-ignore
                        className="p-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded text-fg-muted hover:text-yellow-500 dark:hover:text-yellow-400 hover:bg-bg-secondary transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                        aria-label={session.pinned === 1 ? t('chat.unpinSession') : t('chat.pinSession')}
                      >
                        <Star className={`w-4 h-4 ${session.pinned === 1 ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleArchive(session); }}
                      data-swipe-ignore
                      className="p-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded text-fg-muted hover:text-fg-secondary hover:bg-bg-secondary transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                      aria-label={session.archived === 1 ? t('chat.unarchiveSession') : t('chat.archiveSession')}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </>
                )}
                <span
                  className="text-xs text-fg-muted whitespace-nowrap"
                  title={formatFullDateTime(session.lastMessageAt ?? session.startedAt)}
                >
                  {formatTimeAgo(session.lastMessageAt ?? session.startedAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {session.assistant && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-bg-secondary text-fg-secondary">
                  {session.assistant.icon && <span aria-hidden="true">{session.assistant.icon}</span>}
                  <span className="truncate max-w-[120px]">{session.assistant.name}</span>
                </span>
              )}
              {session.model && (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {session.model}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                <MessageSquare className="w-3 h-3" />
                {session.messageCount}
              </span>
            </div>
            {session.preview && (
              <p className="text-sm text-fg-secondary line-clamp-2">
                {session.preview}
              </p>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}
