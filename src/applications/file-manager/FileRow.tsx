import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Image,
  FileCode,
  FileSpreadsheet,
  File as FileIcon,
  Trash2,
  Download,
  Copy,
} from 'lucide-react';
import { formatFileSize } from '../../lib/fileUtils';
import { useFilePreviewStore } from '../../store/filePreviewStore';
import { useApplicationsStore } from '../../store/applicationsStore';
import type { GlobalFile } from '../../lib/api';
import { ExpirationBadge } from './ExpirationBadge';
import { ExtendButton } from './ExtendButton';

interface FileRowProps {
  file: GlobalFile;
  now: number;
  onExtend: (fileId: number) => Promise<void>;
  onDelete: (file: GlobalFile) => void;
  onCopy: (file: GlobalFile) => void;
}

function renderFileIcon(mimeType: string | null) {
  const props = { className: 'w-4 h-4' };
  if (!mimeType) return <FileText {...props} />;
  if (mimeType.startsWith('image/')) return <Image {...props} />;
  if (mimeType === 'application/pdf') return <FileIcon {...props} />;
  if (mimeType === 'text/csv' || mimeType === 'application/csv') return <FileSpreadsheet {...props} />;
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/sql'
  )
    return <FileCode {...props} />;
  return <FileText {...props} />;
}

export function FileRow({ file, now, onExtend, onDelete, onCopy }: FileRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setStoreSelectedFileId = useFilePreviewStore((s) => s.setSelectedFileId);
  const selectApplication = useApplicationsStore((s) => s.selectApplication);

  const handleClick = () => {
    navigate(`/chat/${file.sessionId}`);
    setStoreSelectedFileId(file.id);
    selectApplication('file_preview');
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/api/sessions/${file.sessionId}/files/${file.id}/download`, '_blank');
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-bg-secondary transition-colors">
      <div className="flex-shrink-0 text-fg-muted">
        {renderFileIcon(file.mimeType)}
      </div>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleClick(); }}
      >
        <div className="text-sm font-medium text-fg-primary truncate">
          {file.filename}
        </div>
        <div className="text-xs text-fg-muted truncate">
          {file.sessionTitle || t('fileManager.deletedSession')}
        </div>
      </div>

      <div className="flex-shrink-0 text-sm text-fg-secondary">
        {formatFileSize(file.size)}
      </div>

      <div className="flex-shrink-0">
        <ExpirationBadge expiresAt={file.expiresAt} now={now} />
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDownload}
          className="p-1.5 text-fg-secondary hover:bg-bg-secondary rounded"
          title={t('fileManager.download')}
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onCopy(file)}
          className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
          title={t('fileManager.copyToChat')}
        >
          <Copy className="w-4 h-4" />
        </button>
        <ExtendButton onExtend={() => onExtend(file.id)} />
        <button
          type="button"
          onClick={() => onDelete(file)}
          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
          title={t('fileManager.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
