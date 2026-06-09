import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Archive, MessageSquare, Trash2, CheckSquare, Square, Paperclip } from 'lucide-react';
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
      {/* Swipe-to-delete reveal layer */}
      {!bulkMode && (
        <div
          className="absolute inset-0 bg-red-500 dark:bg-red-600 rounded-lg flex items-center justify-end px-6 pointer-events-none"
          aria-hidden="true"
        >
          <Trash2 className="w-5 h-5 text-white" />
          <span className="ml-2 font-medium text-white">{t('common.delete')}</span>
        </div>
      )}

      {/* Swipeable card */}
      <div
        /* eslint-disable react-hooks/refs */
        ref={swipe.ref}
        className={`group relative transform-gpu ${swipe.swiping ? '' : 'transition-transform duration-200 ease-out'}`}
        style={{ transform: `translateX(${swipe.translateX}px)` }}
        /* eslint-enable react-hooks/refs */
      >
        {/* Main card: content left + checkbox right, always same layout */}
        <div
          className={`flex items-stretch bg-bg-primary border rounded-lg transition-all hover:shadow-sm ${
            session.pinned === 1
              ? 'border-yellow-300 dark:border-yellow-700'
              : 'border-border-default hover:border-blue-300 dark:hover:border-blue-600'
          }`}
        >
          {/* ── Content area (clickable link) ── */}
          <Link
            to={`/chat/${session.id}`}
            onClick={handleClick}
            className="flex-1 min-w-0 p-3 sm:p-4"
          >
            {/* Row 1: title */}
            <div className="flex items-center gap-1.5 mb-0.5">
              {session.pinned === 1 && (
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
              )}
              <h3 className="font-semibold text-fg-primary truncate">
                {title}
              </h3>
            </div>

            {/* Row 2: preview */}
            {session.preview ? (
              <p className="text-sm text-fg-muted truncate mb-2">
                {session.preview}
              </p>
            ) : (
              <div className="mb-2" />
            )}

            {/* Row 3: meta left + actions+time right */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Left: assistant, model, message count */}
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                {session.assistant && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-bg-secondary text-fg-secondary">
                    {session.assistant.icon && (
                      <span aria-hidden="true">{session.assistant.icon}</span>
                    )}
                    <span className="truncate max-w-[100px]">{session.assistant.name}</span>
                  </span>
                )}
                {session.model && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 truncate max-w-[120px]">
                    {session.model}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                  <MessageSquare className="w-3 h-3 flex-shrink-0" />
                  {session.messageCount}
                </span>
                {/* #35: file count badge */}
                {(session.fileCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-fg-muted">
                    <Paperclip className="w-3 h-3 flex-shrink-0" />
                    {session.fileCount}
                  </span>
                )}
              </div>

              {/* Right: pin, archive, time */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {session.archived !== 1 && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(session); }}
                    data-swipe-ignore
                    aria-label={session.pinned === 1 ? t('chat.unpinSession') : t('chat.pinSession')}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded text-fg-muted hover:text-yellow-500 dark:hover:text-yellow-400 hover:bg-bg-secondary transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                  >
                    <Star className={`w-3.5 h-3.5 ${session.pinned === 1 ? 'fill-yellow-500 text-yellow-500' : ''}`} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleArchive(session); }}
                  data-swipe-ignore
                  aria-label={session.archived === 1 ? t('chat.unarchiveSession') : t('chat.archiveSession')}
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded text-fg-muted hover:text-fg-secondary hover:bg-bg-secondary transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
                <span
                  className="text-xs text-fg-muted whitespace-nowrap ml-1"
                  title={formatFullDateTime(session.lastMessageAt ?? session.startedAt)}
                >
                  {formatTimeAgo(session.lastMessageAt ?? session.startedAt)}
                </span>
              </div>
            </div>


          </Link>

          {/* ── Checkbox column (right side, always in DOM) ── */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(session.id); }}
            data-swipe-ignore
            aria-label={isSelected ? t('common.selected', { count: 1 }) : t('sessions.selectSessions')}
            tabIndex={bulkMode ? 0 : -1}
            className={`flex-shrink-0 w-12 flex items-center justify-center border-l transition-all duration-150 rounded-r-lg ${
              bulkMode
                ? 'opacity-100 pointer-events-auto border-border-default'
                : 'opacity-0 pointer-events-none border-transparent'
            }`}
          >
            {isSelected
              ? <CheckSquare className="w-5 h-5 text-blue-500" />
              : <Square className="w-5 h-5 text-fg-muted" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
