import { FileText, Image, FileCode, FileSpreadsheet, File as FileIcon } from 'lucide-react';
import type { SessionFile } from '../../lib/api';
import { formatFileSize } from '../../lib/fileUtils';

interface FileListProps {
  files: SessionFile[];
  selectedFileId: number | null;
  onSelect: (id: number) => void;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return FileText;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf') return FileIcon;
  if (mimeType === 'text/csv' || mimeType === 'application/csv') return FileSpreadsheet;
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/sql'
  )
    return FileCode;
  return FileText;
}

export function FileList({ files, selectedFileId, onSelect }: FileListProps) {
  return (
    <div className="flex-shrink-0 px-3 py-2 border-b border-border-default bg-bg-secondary">
      <div className="flex gap-1.5 overflow-x-auto">
        {files.map((file) => {
          const isActive = file.id === selectedFileId;
          const Icon = getFileIcon(file.mimeType);
          const displayName =
            file.filename.length > 24
              ? file.filename.slice(0, 22) + '\u2026'
              : file.filename;

          return (
            <button
              key={file.id}
              type="button"
              onClick={() => onSelect(file.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-fg-secondary hover:bg-bg-primary'
              }`}
              title={`${file.filename} (${formatFileSize(file.size)})`}
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{displayName}</span>
              <span className="text-fg-muted opacity-60">{formatFileSize(file.size)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
