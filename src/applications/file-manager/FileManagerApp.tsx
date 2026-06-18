import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { GlobalFile } from '../../lib/api';
import { useChatInputStore } from '../../store/chatInputStore';
import { FileStatsBar } from './FileStatsBar';
import { FileList } from './FileList';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import type { ApplicationComponentProps } from '../types';

type SortKey = 'name' | 'date' | 'size' | 'expires';
type SortOrder = 'asc' | 'desc';
type FilterKey = 'all' | 'expiring' | 'images' | 'code' | 'documents';

export function FileManagerApp({ sessionId }: ApplicationComponentProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<GlobalFile[]>([]);
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: 0, expiringSoon: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('date');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GlobalFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const fetchFiles = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getGlobalFiles()
      .then((data) => {
        setFiles(data.files);
        setStats(data.stats);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleExtend = useCallback(async (fileId: number) => {
    try {
      const result = await api.extendFile(fileId);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, expiresAt: result.expiresAt, extendedCount: f.extendedCount + 1 } : f
        )
      );
    } catch {
      // Toast error handled by caller or silent fail
    }
  }, []);

  const handleDelete = useCallback((file: GlobalFile) => {
    setDeleteTarget(file);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteGlobalFile(deleteTarget.id);
      setFiles((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      // Error handled silently
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const handleCopy = useCallback(async (file: GlobalFile) => {
    if (!sessionId) return;
    try {
      const copiedFile = await api.copyFile(file.id, sessionId);
      // Dispatch event to add file to ChatInput
      useChatInputStore.getState().addFileToInput(copiedFile);
      // Refresh files list to show the new copy
      fetchFiles();
    } catch {
      // Error handled silently
    }
  }, [sessionId, fetchFiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
        <p className="text-sm text-fg-muted mb-2">{t('fileManager.error')}</p>
        <button
          type="button"
          onClick={fetchFiles}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <FolderOpen className="w-10 h-10 text-fg-muted mb-3" />
        <p className="text-sm font-medium text-fg-primary">{t('fileManager.empty.noFiles')}</p>
        <p className="text-xs text-fg-muted mt-1">{t('fileManager.empty.noFilesDesc')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <FileStatsBar stats={stats} />
      <FileList
        files={files}
        search={search}
        sort={sort}
        order={order}
        filter={filter}
        now={now}
        onSearchChange={setSearch}
        onSortChange={setSort}
        onOrderChange={setOrder}
        onFilterChange={setFilter}
        onExtend={handleExtend}
        onDelete={handleDelete}
        onCopy={handleCopy}
      />
      <DeleteConfirmModal
        file={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        deleting={deleting}
      />
    </div>
  );
}
