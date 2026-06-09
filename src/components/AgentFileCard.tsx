import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon, FileDown, Download, ChevronDown } from 'lucide-react';
// Note: useState and ChevronDown are used by AgentFileGroup below.
import type { AgentFile } from '../types/api';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface AgentFileCardProps {
  file: AgentFile;
  sessionId: string;
}

// Module-level component so React keeps its identity across re-renders.
function FileRow({ file, sessionId }: AgentFileCardProps) {
  const { t } = useTranslation();
  const downloadHref = `/api/sessions/${sessionId}/files/${file.id}/download`;
  // Render all three icon types and use CSS to show only the one matching
  // the file's MIME type. This avoids the "components during render" lint
  // rule that triggers on `const Icon = ...` inside a function body.
  const isImage = !!file.mimeType && file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';
  return (
    <>
      {isImage ? (
        <ImageIcon className="w-4 h-4 text-fg-secondary flex-shrink-0" />
      ) : isPdf ? (
        <FileDown className="w-4 h-4 text-fg-secondary flex-shrink-0" />
      ) : (
        <FileText className="w-4 h-4 text-fg-secondary flex-shrink-0" />
      )}
      <span className="text-sm font-medium text-fg-primary truncate" title={file.filename}>
        {file.filename}
      </span>
      <span className="text-xs text-fg-muted flex-shrink-0">· {formatFileSize(file.size)}</span>
      <a
        href={downloadHref}
        download={file.filename}
        aria-label={t('chat.downloadFile')}
        className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors flex-shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        {t('chat.downloadFile')}
      </a>
    </>
  );
}

export function AgentFileCard({ file, sessionId }: AgentFileCardProps) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary overflow-hidden">
      <div className="flex items-center gap-2 min-w-0 px-3 py-2">
        <FileRow file={file} sessionId={sessionId} />
      </div>
    </div>
  );
}

interface AgentFileGroupProps {
  files: AgentFile[];
  sessionId: string;
}

export function AgentFileGroup({ files, sessionId }: AgentFileGroupProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  if (files.length === 0) return null;
  if (files.length === 1) {
    return <AgentFileCard file={files[0]} sessionId={sessionId} />;
  }
  return (
    <div className="rounded-lg border border-border-default bg-bg-secondary overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-bg-muted transition-colors"
      >
        <span className="text-sm font-medium text-fg-primary">
          {t('chat.agentFilesLabel', { count: files.length })}
        </span>
        <ChevronDown className={`w-4 h-4 text-fg-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="border-t border-border-default p-2 space-y-2">
          {files.map((f) => (
            <AgentFileCard key={f.id} file={f} sessionId={sessionId} />
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentFileCard;
