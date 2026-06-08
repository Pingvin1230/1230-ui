import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { Assistant } from '../types/api';
import { getAssistantColorClasses } from '../lib/assistantColors';

interface AssistantTileProps {
  assistant: Assistant;
  modelLabel?: string | null;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function AssistantTile({ assistant, modelLabel, onClick, loading, disabled }: AssistantTileProps) {
  const { t } = useTranslation();
  const colors = getAssistantColorClasses(assistant.color);
  const archived = assistant.isArchived;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`group relative flex flex-col items-start gap-2 p-4 sm:p-5 rounded-xl border-2 text-left bg-bg-primary transition-all min-h-[120px] ${
        archived
          ? 'border-border-default opacity-60 cursor-not-allowed'
          : `${colors.border} hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 ${colors.ring}`
      }`}
    >
      <div className="flex items-center gap-2 w-full">
        {assistant.icon && (
          <span className="text-2xl flex-shrink-0" aria-hidden="true">
            {assistant.icon}
          </span>
        )}
        <span className="font-semibold text-fg-primary truncate flex-1">{assistant.name}</span>
        {archived && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-bg-muted text-fg-muted flex-shrink-0">
            {t('assistants.archivedBadge')}
          </span>
        )}
      </div>

      {assistant.description && (
        <p className="text-xs text-fg-secondary line-clamp-2 w-full">{assistant.description}</p>
      )}

      <div className="mt-auto w-full flex items-center justify-between gap-2">
        {modelLabel && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bgSubtle} ${colors.text} truncate`}>
            {modelLabel}
          </span>
        )}
        <span className={`text-xs ${colors.accent} font-medium ml-auto opacity-0 group-hover:opacity-100 transition-opacity`}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('newSession.create')}
        </span>
      </div>
    </button>
  );
}
