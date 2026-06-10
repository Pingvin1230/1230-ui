import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { api } from '../../../lib/api';
import type { SessionFile } from '../../../lib/api';

interface ViewerProps {
  file: SessionFile;
  sessionId: string;
}

export function PDFViewer({ file, sessionId }: ViewerProps) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-sm text-fg-muted mb-3">{t('filePreview.pdfNotSupported')}</p>
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

  return (
    <iframe
      src={api.getFileContentUrl(sessionId, file.id)}
      className="w-full h-full border-0"
      title={file.filename}
      onError={() => setError(true)}
    />
  );
}
