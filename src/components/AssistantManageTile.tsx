import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MoreVertical, Pencil, Copy, Archive, RotateCcw } from 'lucide-react';
import type { Assistant } from '../types/api';
import { getAssistantColorClasses } from '../lib/assistantColors';

interface AssistantManageTileProps {
  assistant: Assistant;
  modelLabel?: string | null;
  onDuplicate: (assistant: Assistant) => void;
  onArchive: (assistant: Assistant) => void;
  onRestore?: (assistant: Assistant) => void;
}

export function AssistantManageTile({
  assistant,
  modelLabel,
  onDuplicate,
  onArchive,
  onRestore,
}: AssistantManageTileProps) {
  const { t } = useTranslation();
  const colors = getAssistantColorClasses(assistant.color);
  const archived = assistant.isArchived;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (menuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [menuOpen]);

  const handleMenuAction = (action: () => void) => {
    setMenuOpen(false);
    setMenuPos(null);
    action();
  };

  return (
    <div className="group relative flex flex-col items-start gap-2 p-4 sm:p-5 rounded-xl text-left bg-bg-primary transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 min-h-[120px]">
      {/* Colored border overlay — single border, no duplicate */}
      <div
        className={`absolute inset-0 rounded-xl border-2 transition-colors pointer-events-none ${
          archived
            ? 'border-border-default'
            : colors.border
        }`}
      />

      {/* Top row: icon + name + actions */}
      <div className="flex items-center gap-2 w-full relative z-10">
        {assistant.icon && (
          <span className="text-2xl flex-shrink-0" aria-hidden="true">
            {assistant.icon}
          </span>
        )}
        <Link
          to={`/assistants/${assistant.id}`}
          className={`font-semibold truncate flex-1 ${
            archived ? 'line-through text-fg-muted' : 'text-fg-primary hover:text-blue-600 dark:hover:text-blue-400'
          }`}
        >
          {assistant.name}
        </Link>

        {/* Archived badge — warning style */}
        {archived && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 flex-shrink-0">
            {t('assistants.archivedBadge')}
          </span>
        )}

        {/* MoreVertical menu button */}
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="relative z-20 p-1 rounded-md text-fg-muted hover:text-fg-primary hover:bg-bg-secondary opacity-0 group-hover:opacity-100 transition-opacity min-h-[32px] min-w-[32px] flex items-center justify-center"
          aria-label={t('assistants.actionsLabel')}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      {assistant.description && (
        <p className="text-xs text-fg-secondary line-clamp-2 w-full relative z-10">{assistant.description}</p>
      )}

      {/* Bottom row: model label */}
      <div className="mt-auto w-full relative z-10">
        {modelLabel && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bgSubtle} ${colors.text} truncate inline-block`}>
            {modelLabel}
          </span>
        )}
      </div>

      {/* Dropdown menu rendered via portal to escape overflow containers */}
      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed w-48 rounded-lg shadow-2xl border border-border-default z-[10000] bg-white dark:bg-gray-800 overflow-hidden"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <Link
            to={`/assistants/${assistant.id}`}
            onClick={() => { setMenuOpen(false); setMenuPos(null); }}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
          >
            <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
            {t('assistants.actionEdit')}
          </Link>
          <button
            type="button"
            onClick={() => handleMenuAction(() => onDuplicate(assistant))}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
          >
            <Copy className="w-3.5 h-3.5 flex-shrink-0" />
            {t('assistants.actionDuplicate')}
          </button>
          {archived ? (
            onRestore && (
              <button
                type="button"
                onClick={() => handleMenuAction(() => onRestore(assistant))}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
              >
                <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
                {t('assistants.restore')}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => handleMenuAction(() => onArchive(assistant))}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
            >
              <Archive className="w-3.5 h-3.5 flex-shrink-0" />
              {t('assistants.actionArchive')}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
