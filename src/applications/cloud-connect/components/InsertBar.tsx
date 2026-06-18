import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { api } from '../../../lib/api';
import { useCloudConnectStore } from '../../../store/cloudConnectStore';
import { useChatInputStore } from '../../../store/chatInputStore';
import type { SessionFile } from '../../../lib/api';

interface InsertBarProps {
  sessionId: string | null;
  onInserted: () => void;
}

export function InsertBar({ sessionId, onInserted }: InsertBarProps) {
  const { t } = useTranslation();
  const selectedConnectionId = useCloudConnectStore((s) => s.selectedConnectionId);
  const selectedPaths = useCloudConnectStore((s) => s.selectedPaths);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInsert = useCallback(async () => {
    if (!selectedConnectionId || selectedPaths.length === 0 || !sessionId) return;
    setInserting(true);
    setError(null);
    try {
      const result = await api.fetchCloudFilesToSession(selectedConnectionId, selectedPaths, sessionId);

      // Add each downloaded file to ChatInput via the existing chat:addFile event —
      // same mechanism FileManagerApp uses (FileManagerApp.tsx:91)
      result.files.forEach((file: SessionFile) => {
        useChatInputStore.getState().addFileToInput(file);
      });

      if (result.errors && result.errors.length > 0) {
        const names = result.errors.map((e: { path: string; error: string }) =>
          `${e.path.split('/').pop()}: ${e.error}`
        ).join('; ');
        setError(names);
      }

      if (result.files.length > 0) {
        onInserted();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setInserting(false);
    }
  }, [selectedConnectionId, selectedPaths, sessionId, onInserted]);

  return (
    <div className="flex-shrink-0 px-4 py-3 bg-bg-primary border-t border-border-default">
      {error && (
        <p className="text-xs text-red-500 mb-2 truncate" title={error}>{error}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm text-fg-secondary">
          {t('cloudConnect.selectedCount', { count: selectedPaths.length })}
        </span>
        <button
          type="button"
          onClick={handleInsert}
          disabled={inserting || !sessionId}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {inserting ? t('cloudConnect.inserting') : t('cloudConnect.insertIntoChat')}
        </button>
      </div>
    </div>
  );
}
