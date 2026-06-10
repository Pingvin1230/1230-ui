import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { api } from '../../../lib/api';
import type { SessionFile } from '../../../lib/api';

interface ViewerProps {
  file: SessionFile;
  sessionId: string;
}

export function CSVViewer({ file, sessionId }: ViewerProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getFileContent(sessionId, file.id)
      .then((text) => {
        if (cancelled) return;
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (result.errors.length > 0 && result.data.length === 0) {
          setError('Failed to parse CSV');
          return;
        }
        setHeaders(result.meta.fields ?? []);
        setRows(result.data as Record<string, string>[]);
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
    <div className="p-4 overflow-auto">
      <div className="overflow-x-auto rounded-lg border border-border-default">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-bg-secondary">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left font-semibold text-fg-primary border-b border-border-default whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-bg-secondary/50 transition-colors">
                {headers.map((h) => (
                  <td
                    key={h}
                    className="px-4 py-2.5 text-fg-secondary border-b border-border-default last:border-b-0"
                  >
                    {row[h] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
