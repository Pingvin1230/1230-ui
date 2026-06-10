import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import type { ApplicationComponentProps } from '../types';

export function PlaceholderApp({ sessionId }: ApplicationComponentProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
        <Eye className="w-7 h-7 text-blue-600 dark:text-blue-400" />
      </div>
      <h3 className="text-base font-semibold text-fg-primary mb-1">
        {t('applications.filePreviewComing')}
      </h3>
      <p className="text-sm text-fg-muted max-w-xs">
        {sessionId
          ? t('applications.filePreviewDesc')
          : t('applications.selectSession')}
      </p>
    </div>
  );
}
