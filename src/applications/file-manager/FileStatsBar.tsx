import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { formatFileSize } from '../../lib/fileUtils';
import type { FileStats } from '../../lib/api';

interface FileStatsBarProps {
  stats: FileStats;
}

export function FileStatsBar({ stats }: FileStatsBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-bg-secondary border-b border-border-default">
      <span className="text-sm text-fg-secondary">
        <FolderOpen className="w-4 h-4 inline mr-1" />
        {t('fileManager.stats.files', { count: stats.totalFiles })}
      </span>
      <span className="text-sm text-fg-secondary">
        {formatFileSize(stats.totalSize)}
      </span>
      {stats.expiringSoon > 0 && (
        <span className="text-sm text-orange-600 dark:text-orange-400">
          {t('fileManager.stats.expiringSoon', { count: stats.expiringSoon })}
        </span>
      )}
    </div>
  );
}
