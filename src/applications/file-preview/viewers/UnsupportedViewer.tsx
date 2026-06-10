import { useTranslation } from 'react-i18next';
import { FileDown, Download } from 'lucide-react';
import type { SessionFile } from '../../../lib/api';
import { formatFileSize } from '../../../lib/fileUtils';

interface ViewerProps {
  file: SessionFile;
  sessionId: string;
}

export function UnsupportedViewer({ file, sessionId }: ViewerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-bg-muted mb-4">
        <FileDown className="w-7 h-7 text-fg-muted" />
      </div>
      <h3 className="text-base font-semibold text-fg-primary mb-1">{file.filename}</h3>
      <p className="text-sm text-fg-muted mb-1">{formatFileSize(file.size)}</p>
      <p className="text-xs text-fg-muted mb-4">{t('filePreview.unsupported')}</p>
      <a
        href={`/api/sessions/${sessionId}/files/${file.id}/download`}
        download={file.filename}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Download className="w-4 h-4" />
        {t('filePreview.download')}
      </a>
    </div>
  );
}
