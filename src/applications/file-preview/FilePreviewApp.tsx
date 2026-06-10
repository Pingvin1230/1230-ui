import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { SessionFile } from '../../lib/api';
import { useFilePreviewStore } from '../../store/filePreviewStore';
import { FileList } from './FileList';
import { FilePreview } from './FilePreview';
import type { ApplicationComponentProps } from '../types';

export function FilePreviewApp({ sessionId }: ApplicationComponentProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const storeSelectedFileId = useFilePreviewStore((s) => s.selectedFileId);
  const setStoreSelectedFileId = useFilePreviewStore((s) => s.setSelectedFileId);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.listSessionFiles(sessionId)
      .then((data) => {
        if (cancelled) return;
        setFiles(data.files);
        if (data.files.length > 0 && !selectedFileId) {
          setSelectedFileId(data.files[0].id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // React to store-selected file (from navbar click or File Manager click)
  useEffect(() => {
    if (storeSelectedFileId !== null && files.length > 0) {
      // Check if the file exists in the current session's file list
      const fileExists = files.some(f => f.id === storeSelectedFileId);
      if (fileExists) {
        setSelectedFileId(storeSelectedFileId);
        setStoreSelectedFileId(null);
      }
    }
  }, [storeSelectedFileId, setStoreSelectedFileId, files]);

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <FileText className="w-10 h-10 text-fg-muted mb-3" />
        <p className="text-sm text-fg-muted">{t('filePreview.noSession')}</p>
      </div>
    );
  }

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
        <p className="text-sm text-fg-muted mb-2">{t('filePreview.error')}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setLoading(true);
            api.listSessionFiles(sessionId)
              .then((data) => {
                setFiles(data.files);
                if (data.files.length > 0) setSelectedFileId(data.files[0].id);
              })
              .catch((err) => setError(err.message))
              .finally(() => setLoading(false));
          }}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('filePreview.retry')}
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <FileText className="w-10 h-10 text-fg-muted mb-3" />
        <p className="text-sm text-fg-muted">{t('filePreview.noFiles')}</p>
      </div>
    );
  }

  const activeFileId = selectedFileId ?? files[0].id;

  return (
    <div className="flex flex-col h-full">
      <FileList
        files={files}
        selectedFileId={activeFileId}
        onSelect={(id) => setSelectedFileId(id)}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <FilePreview file={files.find((f) => f.id === activeFileId) ?? files[0]} sessionId={sessionId} />
      </div>
    </div>
  );
}
