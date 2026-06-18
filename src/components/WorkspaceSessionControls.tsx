import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Loader2, Paperclip, FileText, Image as ImageIcon, ChevronDown, PanelRight } from 'lucide-react';
import { useChatInputStore } from '../store/chatInputStore';
import { useAppsPaneStore } from '../store/appsPaneStore';
import { useFilePreviewStore } from '../store/filePreviewStore';
import { formatFileSize } from '../lib/fileUtils';
import type { SessionFile } from '../lib/api';



// ── Inline SessionFilesBar for Navbar ─────────────────────────────────────
function NavSessionFilesBar({ files }: { files: SessionFile[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const setSelectedFileId = useFilePreviewStore((s) => s.setSelectedFileId);
  const appsPaneVisible = useAppsPaneStore((s) => s.visible);
  const toggleAppsPane = useAppsPaneStore((s) => s.toggleVisible);

  // Close on outside click — use 'click' (not mousedown) to avoid race with toggle
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Delay one tick so the opening click doesn't immediately close the panel
    const id = window.setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', handler);
    };
  }, [open]);

  const handleFileClick = (fileId: number) => {
    setSelectedFileId(fileId);
    if (!appsPaneVisible) toggleAppsPane();
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Badge — same visual size as model/assistant badges */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors ${
          open
            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300'
            : 'border-border-default bg-bg-secondary text-fg-secondary hover:text-fg-primary hover:border-blue-200 dark:hover:border-blue-800'
        }`}
        aria-expanded={open}
        title={t('chat.sessionFilesTitle', { defaultValue: 'Файлы сессии' })}
      >
        <Paperclip className="w-3 h-3 flex-shrink-0" />
        <span>{files.length}</span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-[60] w-64 rounded-lg border border-border-default bg-bg-primary shadow-xl overflow-hidden">
          <div className="px-3 py-2 bg-bg-secondary border-b border-border-default">
            <span className="text-xs font-medium text-fg-secondary">
              {t('chat.sessionFilesTitle', { defaultValue: 'Файлы сессии' })} · {files.length}
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {files.map(file => (
              <div
                key={file.id}
                onClick={() => handleFileClick(file.id)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-secondary cursor-pointer transition-colors"
              >
                {file.mimeType?.startsWith('image/')
                  ? <ImageIcon className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
                  : <FileText className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
                }
                <span className="text-xs text-fg-primary truncate flex-1 min-w-0" title={file.filename}>
                  {file.filename}
                </span>
                <span className="text-xs text-fg-muted flex-shrink-0">{formatFileSize(file.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── WorkspaceSessionControls ──────────────────────────────────────────────
export function WorkspaceSessionControls() {
  const { t } = useTranslation();

  const navSessionMeta = useChatInputStore((s) => s.navSessionMeta);
  const sessionActions = useChatInputStore((s) => s.sessionActions);
  const sessionFiles = useChatInputStore((s) => s.sessionFiles);
  const activeSessionId = useChatInputStore((s) => s.activeSessionId);

  const appsPaneVisible = useAppsPaneStore((s) => s.visible);
  const toggleAppsPane = useAppsPaneStore((s) => s.toggleVisible);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset delete-confirm state when the active session changes
  useEffect(() => {
    setConfirmDelete(false);
    setIsDeleting(false);
  }, [activeSessionId]);

  async function handleDeleteConfirmed() {
    setIsDeleting(true);
    try {
      await sessionActions?.onDeleteSession();
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="hidden sm:flex items-center gap-1.5">
        {(() => {
          const name = navSessionMeta?.assistantName;
          const label = name ?? t('chat.quickChat', { defaultValue: 'Quick chat' });
          const icon = navSessionMeta?.assistantIcon ?? (name ? '🤖' : '💬');
          return (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-bg-secondary text-fg-secondary border border-border-default">
              <span aria-hidden="true">{icon}</span>
              <span className="truncate max-w-[80px]">{label}</span>
            </span>
          );
        })()}
        {navSessionMeta?.model && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-bg-secondary text-fg-secondary border border-border-default truncate max-w-[100px]">
            {navSessionMeta.model}
          </span>
        )}
      </div>
      {sessionFiles.length > 0 && (
        <div className="hidden sm:block">
          <NavSessionFilesBar files={sessionFiles} />
        </div>
      )}
      {/* Apps pane toggle — desktop only */}
      <button
        type="button"
        onClick={toggleAppsPane}
        className={`hidden lg:flex p-1.5 rounded transition-colors ${
          appsPaneVisible
            ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
            : 'text-fg-muted hover:text-fg-primary hover:bg-bg-secondary'
        }`}
        aria-label={appsPaneVisible ? t('applications.hideApplications') : t('applications.showApplications')}
        title={appsPaneVisible ? t('applications.hideApplications') : t('applications.showApplications')}
      >
        <PanelRight className="w-3.5 h-3.5" />
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={handleDeleteConfirmed} disabled={isDeleting}
            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1">
            {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {t('chat.deleteConfirm')}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} disabled={isDeleting}
            className="px-2 py-1 bg-bg-secondary hover:bg-bg-muted text-fg-primary text-xs rounded transition-colors disabled:opacity-50">
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)}
          className="p-1.5 rounded text-fg-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          aria-label={t('chat.deleteSession')} title={t('chat.deleteSession')}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

    </div>
  );
}
