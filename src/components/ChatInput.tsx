import { useState, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Paperclip, X, FileText, Image as ImageIcon, AlertCircle, Loader2, Plus, ShieldAlert, Send, Square, FileStack, ChevronDown, User, Bot } from 'lucide-react';
import { api, type SessionFile } from '../lib/api';
import { useChatInputStore } from '../store/chatInputStore';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 5;
const ALLOWED_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.py', '.js', '.ts', '.jsx', '.tsx',
  '.json', '.csv', '.yml', '.yaml',
  '.log', '.html', '.css', '.xml', '.sh', '.sql',
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx).toLowerCase();
}

function isAllowedFileType(name: string): boolean {
  return ALLOWED_FILE_EXTENSIONS.has(getFileExtension(name));
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = getFileExtension(name);
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return ImageIcon;
  return FileText;
}

type AttachedFile = {
  localId: string;
  id?: number;
  filename: string;
  size: number;
  path?: string;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
};

function SessionFilesBar({ files }: { files: SessionFile[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const userFiles = files.filter(f => f.source !== 'agent');
  const agentFiles = files.filter(f => f.source === 'agent');

  const label = t('chat.sessionFilesCount', {
    count: files.length,
    defaultValue_one: '{{count}} файл в сессии',
    defaultValue_other: '{{count}} файлов в сессии',
    defaultValue: `${files.length} ${files.length === 1 ? 'файл' : 'файлов'} в сессии`,
  });

  return (
    <div className="mb-2 relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg border transition-colors text-xs ${
          open
            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : 'border-border-default bg-bg-secondary text-fg-secondary hover:border-blue-200 dark:hover:border-blue-800 hover:text-fg-primary'
        }`}
        aria-expanded={open}
      >
        <FileStack className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        {/* Source breakdown badges */}
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {userFiles.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              <User className="w-2.5 h-2.5" />
              {userFiles.length}
            </span>
          )}
          {agentFiles.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              <Bot className="w-2.5 h-2.5" />
              {agentFiles.length}
            </span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 right-0 z-20 rounded-lg border border-border-default bg-bg-primary shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border-default">
            <span className="text-xs font-medium text-fg-secondary">{t('chat.sessionFilesTitle', { defaultValue: 'Файлы сессии' })}</span>
            <button type="button" onClick={() => setOpen(false)} className="p-0.5 rounded text-fg-muted hover:text-fg-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* File list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {files.map(file => {
              const isAgent = file.source === 'agent';
              const ext = file.filename.split('.').pop()?.toLowerCase() ?? '';
              const isImage = ['png','jpg','jpeg','gif','webp'].includes(ext);
              return (
                <div key={file.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-bg-secondary transition-colors">
                  {isImage
                    ? <ImageIcon className="w-4 h-4 text-fg-muted flex-shrink-0" />
                    : <FileText className="w-4 h-4 text-fg-muted flex-shrink-0" />
                  }
                  <span className="text-xs text-fg-primary truncate flex-1 min-w-0" title={file.filename}>
                    {file.filename}
                  </span>
                  <span className="text-xs text-fg-muted flex-shrink-0">{formatFileSize(file.size)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                    isAgent
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  }`}>
                    {isAgent
                      ? t('chat.fileSourceAgent', { defaultValue: 'агент' })
                      : t('chat.fileSourceUser', { defaultValue: 'вы' })
                    }
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ChatInputHandle {
  getAttachedFiles: () => Array<{ id?: number; path?: string; filename: string }>;
  clearInput: () => void;
}

interface ChatInputProps {
  sessionId: string;
  isSessionBlocked: boolean;
  sending: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  onSessionFilesChange?: (files: SessionFile[]) => void;
  onAttachedFilesChange?: (hasAttached: boolean) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  { sessionId, isSessionBlocked, sending, onSend, onStop, onSessionFilesChange, onAttachedFilesChange },
  ref
) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounterRef = useRef(0);

  const setStoreHandle = useChatInputStore((s) => s.setHandle);
  const handle = useMemo<ChatInputHandle>(() => ({
    clearInput: () => {
      setInput('');
      setAttachedFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    },
    getAttachedFiles: () => attachedFiles
      .filter(f => f.status === 'ready' && f.path)
      .map(f => ({ id: f.id, path: f.path, filename: f.filename }))
  }), [attachedFiles]);

  useImperativeHandle(ref, () => handle, [handle]);

  // Also publish the handle to the store so ChatPage can reach ChatInput
  // (which lives in a different React subtree — Layout — and so cannot share
  // refs with ChatPage directly).
  useEffect(() => {
    setStoreHandle(handle);
    return () => setStoreHandle(null);
  }, [handle, setStoreHandle]);

  // Listen for prefill events from prompt suggestions
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail.text;
      setInput(text);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        textareaRef.current.focus();
      }
    };
    window.addEventListener('chat:prefill', handler);
    return () => window.removeEventListener('chat:prefill', handler);
  }, []);

  // Notify parent about attached files presence (for navigation guard)
  useEffect(() => {
    onAttachedFilesChange?.(attachedFiles.length > 0);
  }, [attachedFiles.length, onAttachedFilesChange]);

  // Load session files on mount / session change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { files } = await api.listSessionFiles(sessionId);
        if (!cancelled) {
          setSessionFiles(files);
          onSessionFilesChange?.(files);
        }
      } catch {
        // Non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, onSessionFilesChange]);

  // Reset on session change — setState in effect is intentional here:
  // we reset local UI state whenever the session id changes, not syncing
  // with an external system. This is the recommended pattern for "reset on
  // key change" and does not cause cascading renders.
  useEffect(() => {
    setAttachedFiles([]);
    setFileWarning(null);
    setIsDraggingFile(false);
    dragCounterRef.current = 0;
  }, [sessionId]);

  const updateAttachedFile = useCallback((localId: string, patch: Partial<AttachedFile>) => {
    setAttachedFiles((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
  }, []);

  const removeAttachedFile = useCallback(async (file: AttachedFile) => {
    if (file.status === 'ready' && file.id) {
      try {
        await api.deleteSessionFile(sessionId, file.id);
        setSessionFiles((prev) => {
          const next = prev.filter((f) => f.id !== file.id);
          onSessionFilesChange?.(next);
          return next;
        });
      } catch (err) {
        console.error('Failed to delete uploaded file:', err);
      }
    }
    setAttachedFiles((prev) => prev.filter((f) => f.localId !== file.localId));
  }, [sessionId, onSessionFilesChange]);

  const handleFiles = useCallback((incoming: File[]) => {
    setFileWarning(null);

    setAttachedFiles((prev) => {
      const remainingSlots = MAX_FILES_PER_MESSAGE - prev.length;
      if (remainingSlots <= 0) {
        setFileWarning(t('chat.tooManyFiles'));
        return prev;
      }
      const accepted = incoming.slice(0, remainingSlots);
      const rejected = incoming.length - accepted.length;
      if (rejected > 0) {
        setFileWarning(t('chat.tooManyFiles'));
      }

      const newOnes: AttachedFile[] = accepted.map((file) => {
        const localId = crypto.randomUUID();
        if (file.size > MAX_FILE_SIZE) {
          return { localId, filename: file.name, size: file.size, status: 'error', error: t('chat.fileTooLarge') };
        }
        if (!isAllowedFileType(file.name)) {
          return { localId, filename: file.name, size: file.size, status: 'error', error: t('chat.fileTypeNotAllowed') };
        }
        return { localId, filename: file.name, size: file.size, status: 'uploading' };
      });

      newOnes.forEach((entry, idx) => {
        const file = accepted[idx];
        if (entry.status !== 'uploading') return;
        api.uploadFile(sessionId, file)
          .then((serverFile: SessionFile) => {
            updateAttachedFile(entry.localId, { status: 'ready', id: serverFile.id, path: serverFile.path });
            setSessionFiles((prev) => {
              const next = [...prev, serverFile];
              onSessionFilesChange?.(next);
              return next;
            });
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : t('chat.fileError');
            updateAttachedFile(entry.localId, { status: 'error', error: message });
          });
      });

      return [...prev, ...newOnes];
    });
  }, [sessionId, t, updateAttachedFile, onSessionFilesChange]);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleFiles(files);
    e.target.value = '';
  }, [handleFiles]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDraggingFile(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingFile(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) handleFiles(files);
  }, [handleFiles]);

  function handleSend() {
    if (sending) return;
    const userContent = input.trim();
    if (!userContent && !attachedFiles.some((f) => f.status === 'ready')) return;

    // Prepend attached file paths
    const fileLines = attachedFiles
      .filter((f) => f.status === 'ready' && f.path)
      .map((f) => `[Attached file: ${f.path}]`)
      .join('\n');
    const fullContent = fileLines ? `${fileLines}\n\n${userContent}` : userContent;

    setInput('');
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    onSend(fullContent);
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative"
    >
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/10 border-2 border-dashed border-blue-500 rounded-lg">
          <div className="px-6 py-4 rounded-xl bg-bg-primary border border-blue-500 shadow-lg text-fg-primary text-base font-medium flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-blue-500" />
            {t('chat.dropFilesHere')}
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto">
        {isSessionBlocked ? (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  {t('chat.sessionBlocked')}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {t('chat.sessionBlockedDesc')}
                </p>
                <Link
                  to="/new"
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('chat.createNewSession')}
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachedFiles.map((file) => {
                  const Icon = file.status === 'uploading' ? Loader2
                    : file.status === 'error' ? AlertCircle
                    : getFileIcon(file.filename);
                  const colorClasses = file.status === 'error'
                    ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : file.status === 'ready'
                      ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-border-default bg-bg-secondary text-fg-secondary';
                  return (
                    <div
                      key={file.localId}
                      className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border text-xs ${colorClasses}`}
                    >
                      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${file.status === 'uploading' ? 'animate-spin' : ''}`} />
                      <span className="max-w-[160px] truncate" title={file.filename}>{file.filename}</span>
                      <span className="text-fg-muted">· {formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachedFile(file)}
                        aria-label={t('common.close')}
                        className="ml-0.5 inline-flex items-center justify-center min-w-[24px] min-h-[24px] rounded text-fg-muted hover:text-fg-primary hover:bg-bg-muted"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {fileWarning && (
              <div className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                {fileWarning}
              </div>
            )}
            {sessionFiles.length > 0 && (
              <SessionFilesBar
                files={sessionFiles}
              />
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={onFileInputChange}
                accept=".txt,.md,.py,.js,.ts,.jsx,.tsx,.json,.csv,.yml,.yaml,.log,.html,.css,.xml,.sh,.sql,.pdf,.png,.jpg,.jpeg,.gif,.webp"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                aria-label={t('chat.attachFile')}
                title={t('chat.attachFile')}
                className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-secondary text-fg-secondary hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={t('chat.typeMessage')}
                disabled={sending}
                rows={1}
                className="flex-1 px-4 py-2 rounded-lg border border-border-default bg-bg-secondary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none overflow-y-auto"
              />
              {sending ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label={t('chat.stopGenerating')}
                  className="px-4 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  {t('common.stop')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() && !attachedFiles.some((f) => f.status === 'ready')}
                  aria-label={t('chat.sendMessage')}
                  className="px-4 py-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  {t('common.send')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
