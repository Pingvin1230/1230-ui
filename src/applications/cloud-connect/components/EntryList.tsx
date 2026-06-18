import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatInputStore } from '../../../store/chatInputStore';
import {
  FolderOpen,
  Folder,
  FileText,
  FileCode,
  FileSpreadsheet,
  File as FileIcon,
  Image as ImageIcon,
  ChevronRight,
  Loader2,
  AlertCircle,
  ArrowUp,
  Send,
} from 'lucide-react';
import { useCloudConnectStore } from '../../../store/cloudConnectStore';
import { api } from '../../../lib/api';
import { formatFileSize } from '../../../lib/fileUtils';
import type { SessionFile } from '../../../lib/api';
import type { CloudEntry } from '../../../types/api';

function fileIcon(entry: CloudEntry) {
  const cls = 'w-4 h-4';
  if (entry.isDirectory) return <Folder className={`${cls} text-yellow-500`} />;
  const m = entry.mimeType ?? '';
  if (m.startsWith('image/')) return <ImageIcon className={`${cls} text-purple-500`} />;
  if (m === 'application/pdf') return <FileIcon className={`${cls} text-red-500`} />;
  if (m === 'text/csv' || m === 'application/csv') return <FileSpreadsheet className={`${cls} text-green-600`} />;
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/sql')
    return <FileCode className={`${cls} text-blue-500`} />;
  return <FileText className={`${cls} text-fg-muted`} />;
}

function formatDate(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface EntryRowProps {
  entry: CloudEntry;
  sessionId: string | null;
}

function EntryRow({ entry, sessionId }: EntryRowProps) {
  const navigate = useCloudConnectStore((s) => s.navigate);
  const selectedConnectionId = useCloudConnectStore((s) => s.selectedConnectionId);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleClick = useCallback(() => {
    if (entry.isDirectory) navigate(entry.path);
  }, [entry, navigate]);

  const handleSend = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sessionId || !selectedConnectionId || sending) return;
    setSending(true);
    try {
      const result = await api.fetchCloudFilesToSession(
        selectedConnectionId,
        [entry.path],
        sessionId,
      );
      result.files.forEach((file: SessionFile) => {
        useChatInputStore.getState().addFileToInput(file);
      });
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }, [sessionId, selectedConnectionId, entry.path, sending]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-muted cursor-pointer`}
      onClick={handleClick}
      role={entry.isDirectory ? 'button' : undefined}
      tabIndex={entry.isDirectory ? 0 : undefined}
      onKeyDown={(e) => { if (entry.isDirectory && e.key === 'Enter') handleClick(); }}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {fileIcon(entry)}
      </div>

      {/* Name + size — takes all available space, hover handled by parent */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-fg-primary truncate">{entry.name}</div>
        {!entry.isDirectory && entry.size !== null && (
          <div className="text-xs text-fg-muted">{formatFileSize(entry.size)}</div>
        )}
      </div>

      {/* Date */}
      {!entry.isDirectory && entry.modifiedAt !== null && (
        <div className="flex-shrink-0 text-xs text-fg-muted hidden sm:block">
          {formatDate(entry.modifiedAt)}
        </div>
      )}

      {/* Directory chevron or Send button */}
      {entry.isDirectory ? (
        <ChevronRight className="w-4 h-4 text-fg-muted flex-shrink-0" />
      ) : (
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !sessionId}
          className={`flex-shrink-0 p-1 rounded transition-colors ${
            sent ? 'text-green-500' : 'text-green-600 dark:text-green-400'
          } disabled:opacity-40`}
          title="Send to chat"
        >
          {sending
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Send className="w-5 h-5" />
          }
        </button>
      )}
    </div>
  );
}

interface EntryListProps {
  sessionId: string | null;
}

export function EntryList({ sessionId }: EntryListProps) {
  const { t } = useTranslation();
  const currentPath = useCloudConnectStore((s) => s.currentPath);
  const entries = useCloudConnectStore((s) => s.entries);
  const loading = useCloudConnectStore((s) => s.loading);
  const error = useCloudConnectStore((s) => s.error);
  const navigate = useCloudConnectStore((s) => s.navigate);

  const pathParts = currentPath.split('/').filter(Boolean);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
        <p className="text-sm text-fg-muted">{error}</p>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Breadcrumb */}
      <div className="sticky top-0 flex items-center gap-1 px-4 py-1.5 bg-bg-primary border-b border-border-default z-10 text-xs text-fg-secondary">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="hover:text-fg-primary transition-colors flex items-center gap-1"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>/</span>
        </button>
        {pathParts.map((part, idx) => {
          const partialPath = '/' + pathParts.slice(0, idx + 1).join('/');
          return (
            <span key={partialPath} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-fg-muted" />
              <button
                type="button"
                onClick={() => navigate(partialPath)}
                className="hover:text-fg-primary transition-colors max-w-[80px] truncate"
                title={part}
              >
                {part}
              </button>
            </span>
          );
        })}
      </div>

      {/* Parent dir link */}
      {currentPath !== '/' && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-muted transition-colors cursor-pointer"
          onClick={() => {
            const parent = '/' + pathParts.slice(0, -1).join('/');
            navigate(parent || '/');
          }}
        >
          <ArrowUp className="w-4 h-4 text-fg-muted flex-shrink-0" />
          <span className="text-sm text-fg-secondary">..</span>
        </div>
      )}

      {/* Entries */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderOpen className="w-10 h-10 text-fg-muted mb-3" />
          <p className="text-sm text-fg-muted">{t('cloudConnect.empty.folder')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border-default">
          {sorted.map((entry) => (
            <EntryRow key={entry.path} entry={entry} sessionId={sessionId} />
          ))}
        </div>
      )}
    </div>
  );
}
