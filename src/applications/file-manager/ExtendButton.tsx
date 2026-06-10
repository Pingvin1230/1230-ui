import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

interface ExtendButtonProps {
  onExtend: () => Promise<void>;
}

export function ExtendButton({ onExtend }: ExtendButtonProps) {
  const { t } = useTranslation();
  const [extending, setExtending] = useState(false);

  const handleExtend = async () => {
    setExtending(true);
    try {
      await onExtend();
    } finally {
      setExtending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExtend}
      disabled={extending}
      className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-50"
      title={t('fileManager.extend')}
    >
      {extending ? (
        <Clock className="w-4 h-4 animate-spin" />
      ) : (
        <Clock className="w-4 h-4" />
      )}
    </button>
  );
}
