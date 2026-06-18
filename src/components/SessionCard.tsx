import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Archive, Trash2, CheckSquare, Square } from 'lucide-react';
import type { Session } from '../types/api';
import { formatTimeAgo } from '../lib/time';
import { useSwipe } from '../hooks/useSwipe';
import { useMobile } from '../hooks/useMobile';

interface SessionCardProps {
  session: Session;
  bulkMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onTogglePin: (session: Session) => void;
  onToggleArchive: (session: Session) => void;
  onSwipeDelete: (session: Session) => void;
  onLongPress?: (session: Session) => void;
  onOpen: (session: Session) => void;
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
  onOpen,
}: SessionCardProps) {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const longPressHandledRef = useRef(false);

  const swipe = useSwipe<HTMLDivElement>({
    onSwipeLeft: () => onSwipeDelete(session),
    onLongPress: () => {
      longPressHandledRef.current = true;
      onLongPress?.(session);
    },
    disabled: bulkMode || !isMobile,
  });

  const { ref: swipeRef, translateX: swipeTranslateX, swiping: swipeSwiping } = swipe;

  const title =
    session.title ||
    (session.preview
      ? session.preview.length > 70
        ? session.preview.slice(0, 70) + '...'
        : session.preview
      : t('common.untitledSession'));

  // Meta string: assistant · model · N · time
  const metaParts: string[] = [];
  if (session.assistant) metaParts.push(
    [session.assistant.icon, session.assistant.name].filter(Boolean).join(' ')
  );
  if (session.model) metaParts.push(session.model);
  if (session.messageCount) metaParts.push(String(session.messageCount));
  metaParts.push(formatTimeAgo(session.lastMessageAt ?? session.startedAt));

  return (
    <div className="relative overflow-hidden">
      {/* Swipe reveal — mobile only */}
      {!bulkMode && isMobile && (
        <div
          className="absolute inset-0 bg-red-500 dark:bg-red-600 flex items-center justify-end px-6 pointer-events-none"
          aria-hidden="true"
        >
          <Trash2 className="w-4 h-4 text-white" />
        </div>
      )}

      <div
        ref={swipeRef}
        className={`group transform-gpu ${swipeSwiping ? '' : 'transition-transform duration-200 ease-out'}`}
        style={{ transform: `translateX(${swipeTranslateX}px)` }}
      >
        <div className={`flex items-center border-b border-border-default transition-colors ${
          isSelected ? 'bg-bg-secondary' : 'bg-bg-primary hover:bg-bg-secondary'
        }`}>

          {/* Bulk checkbox */}
          {bulkMode && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(session.id); }}
              data-swipe-ignore
              className="flex-shrink-0 pl-3 pr-2 py-3 text-fg-muted"
            >
              {isSelected
                ? <CheckSquare className="w-4 h-4 text-blue-500" />
                : <Square className="w-4 h-4" />
              }
            </button>
          )}

          {/* Content */}
          <button
            type="button"
            onClick={(e) => {
              if (longPressHandledRef.current) {
                e.preventDefault();
                longPressHandledRef.current = false;
                return;
              }
              if (bulkMode) {
                onToggleSelect(session.id);
                return;
              }
              onOpen(session);
            }}
            aria-label={bulkMode ? undefined : title}
            className="flex-1 min-w-0 py-3.5 px-3 sm:px-4 text-left"
          >
            {/* Row 1: title + meta */}
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-medium text-fg-primary truncate text-sm flex-1 min-w-0">
                {title}
              </span>
              <ExecutorBadge executor={session.executor} />
              <span className="text-xs text-fg-muted whitespace-nowrap flex-shrink-0 hidden sm:block">
                {metaParts.join(' · ')}
              </span>
              {/* Mobile: time only */}
              <span className="text-xs text-fg-muted whitespace-nowrap flex-shrink-0 sm:hidden">
                {formatTimeAgo(session.lastMessageAt ?? session.startedAt)}
              </span>
            </div>

            {/* Row 2: preview */}
            {session.preview && (
              <p className="text-xs text-fg-muted truncate mt-0.5 pl-5">
                {session.preview}
              </p>
            )}
          </button>

          {/* Actions — always visible */}
          {!bulkMode && (
            <div className="flex items-center gap-0.5 px-2 flex-shrink-0">
              {session.archived !== 1 && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(session); }}
                  data-swipe-ignore
                  aria-label={session.pinned === 1 ? t('chat.unpinSession') : t('chat.pinSession')}
                  title={session.pinned === 1 ? t('chat.unpinSession') : t('chat.pinSession')}
                  className={`p-1.5 rounded transition-colors ${
                    session.pinned === 1
                      ? 'text-yellow-500 hover:text-yellow-600'
                      : 'text-fg-muted hover:text-yellow-500'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${session.pinned === 1 ? 'fill-yellow-500' : ''}`} />
                </button>
              )}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleArchive(session); }}
                data-swipe-ignore
                aria-label={session.archived === 1 ? t('chat.unarchiveSession') : t('chat.archiveSession')}
                title={session.archived === 1 ? t('chat.unarchiveSession') : t('chat.archiveSession')}
                className="p-1.5 rounded text-fg-muted hover:text-fg-secondary transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExecutorBadge({ executor }: { executor: 'hermes' | 'opencode-1230' }) {
  const isOc = executor === 'opencode-1230';
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${
        isOc
          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
      }`}
      title={isOc ? 'OpenCode' : 'Hermes'}
    >
      {isOc ? '⚡ OC' : '🤖 H'}
    </span>
  );
}
