import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Archive, Copy } from 'lucide-react';
import type { Assistant } from '../types/api';
import { getAssistantColorClasses } from '../lib/assistantColors';

interface AssistantCardProps {
  assistant: Assistant;
  modelLabel?: string | null;
  onArchive: (assistant: Assistant) => void;
  onDuplicate: (assistant: Assistant) => void;
}

export function AssistantCard({ assistant, modelLabel, onArchive, onDuplicate }: AssistantCardProps) {
  const { t } = useTranslation();
  const colors = getAssistantColorClasses(assistant.color);
  const archived = assistant.isArchived;

  const actionClass =
    'inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-fg-secondary hover:bg-bg-secondary hover:text-fg-primary transition-colors min-h-[32px]';

  return (
    <div
      className={`flex items-stretch gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border bg-bg-primary transition-colors ${
        archived ? `${colors.border} opacity-70` : 'border-border-default hover:border-blue-300'
      }`}
    >
      <div
        className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center text-xl self-center ${colors.bgSubtle}`}
        aria-hidden="true"
      >
        {assistant.icon || '·'}
      </div>

      <div className="flex-1 min-w-0 self-center">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-fg-primary truncate">{assistant.name}</h3>
          {archived && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-md bg-bg-muted text-fg-muted">
              {t('assistants.archivedBadge')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-fg-muted">
          {modelLabel && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md ${colors.bgSubtle} ${colors.text}`}>
              {modelLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 flex-shrink-0 self-stretch justify-center">
        <Link
          to={`/assistants/${assistant.id}`}
          className={actionClass}
        >
          <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{t('assistants.actionEdit')}</span>
        </Link>
        <button
          type="button"
          onClick={() => onDuplicate(assistant)}
          className={actionClass}
        >
          <Copy className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{t('assistants.actionDuplicate')}</span>
        </button>
        {!archived && (
          <button
            type="button"
            onClick={() => onArchive(assistant)}
            className={`${actionClass} hover:!text-red-600 dark:hover:!text-red-400`}
          >
            <Archive className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{t('assistants.actionArchive')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
