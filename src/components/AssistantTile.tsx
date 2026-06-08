import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { Assistant } from '../types/api';
import { getAssistantColorClasses } from '../lib/assistantColors';
import { STYLE_OPTIONS, DEPTH_OPTIONS } from '../types/assistant';

interface AssistantTileProps {
  assistant: Assistant;
  modelLabel?: string | null;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/** Three-dot depth indicator: ●●○ */
function DepthDots({ dots, colorClass }: { dots: number; colorClass: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-1.5 h-1.5 rounded-full ${n <= dots ? colorClass : 'bg-fg-muted/25'}`}
        />
      ))}
    </span>
  );
}

export function AssistantTile({ assistant, modelLabel, onClick, loading, disabled }: AssistantTileProps) {
  const { t } = useTranslation();
  const colors = getAssistantColorClasses(assistant.color);
  const archived = assistant.isArchived;

  const styleOption = STYLE_OPTIONS.find((s) => s.id === assistant.style) ?? null;
  const depthOption = DEPTH_OPTIONS.find((d) => d.id === assistant.depth) ?? null;

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
      {/* Loading spinner — top-right corner */}
      {loading && (
        <span className="absolute top-3 right-3">
          <Loader2 className={`w-4 h-4 animate-spin ${colors.accent}`} />
        </span>
      )}

      <div className="flex items-center gap-2 w-full pr-6">
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

      {/* Bottom: model pill + style/depth indicators */}
      <div className="mt-auto w-full flex items-center gap-2 flex-wrap">
        {modelLabel && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bgSubtle} ${colors.text} truncate max-w-[120px]`}>
            {modelLabel}
          </span>
        )}
        {styleOption && (
          <span
            className="flex items-center gap-1 text-xs text-fg-secondary"
            title={t(styleOption.label)}
          >
            <span aria-hidden="true">{styleOption.emoji}</span>
            <span className="hidden sm:inline">{t(styleOption.label)}</span>
          </span>
        )}
        {depthOption && (
          <span title={t(depthOption.label)} aria-label={t(depthOption.label)}>
            <DepthDots dots={depthOption.dots} colorClass={colors.bg} />
          </span>
        )}
      </div>
    </button>
  );
}
