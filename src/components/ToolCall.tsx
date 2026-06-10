import { useTranslation } from 'react-i18next';

interface ToolCallProps {
  toolName: string;
  content: string;
  timestamp: number;
}

export default function ToolCall({ toolName, content }: ToolCallProps) {
  const { t } = useTranslation();
  return (
    <details className="group">
      <summary className="flex items-center gap-2 cursor-pointer list-none text-xs text-fg-muted hover:text-fg-secondary transition-colors">
        <svg className="w-3 h-3 transition-transform group-open:rotate-90 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono">{toolName}</span>
        <span className="text-fg-muted">{t('toolCall.label')}</span>
      </summary>
      <pre className="mt-1 ml-5 text-xs font-mono text-fg-muted whitespace-pre-wrap break-words overflow-x-auto">
        {content}
      </pre>
    </details>
  );
}
