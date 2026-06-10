import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import type { SessionFile } from '../../../lib/api';
import MarkdownRenderer from '../../../components/MarkdownRenderer';

interface ViewerProps {
  file: SessionFile;
  sessionId: string;
}

export function MarkdownViewer({ file, sessionId }: ViewerProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getFileContent(sessionId, file.id)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId, file.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32">
        <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
        <p className="text-xs text-fg-muted">{t('filePreview.error')}</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <MarkdownRenderer content={content ?? ''} />
    </div>
  );
}
