interface ToolCallProps {
  toolName: string;
  content: string;
  timestamp: number;
}

export default function ToolCall({ toolName, content, timestamp }: ToolCallProps) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary overflow-hidden">
      <details className="group">
        <summary className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-bg-secondary transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-fg-secondary">
              {toolName}
            </span>
            <span className="text-xs text-fg-muted">Tool call</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">
              {new Date(timestamp * 1000).toLocaleTimeString()}
            </span>
            <svg
              className="w-4 h-4 text-fg-muted transition-transform group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </summary>
        <div className="px-4 py-3 border-t border-border-default">
          <pre className="text-xs font-mono text-fg-secondary whitespace-pre-wrap break-words overflow-x-auto">
            {content}
          </pre>
        </div>
      </details>
    </div>
  );
}
