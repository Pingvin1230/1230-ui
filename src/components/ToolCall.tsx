interface ToolCallProps {
  toolName: string;
  content: string;
  timestamp: number;
}

export default function ToolCall({ toolName, content, timestamp }: ToolCallProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden">
      <details className="group">
        <summary className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-gray-700 dark:text-gray-300">
              {toolName}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">Tool call</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(timestamp * 1000).toLocaleTimeString()}
            </span>
            <svg
              className="w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </summary>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words overflow-x-auto">
            {content}
          </pre>
        </div>
      </details>
    </div>
  );
}
