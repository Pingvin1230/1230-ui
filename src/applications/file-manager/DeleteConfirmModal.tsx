import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/Modal';
import type { GlobalFile } from '../../lib/api';

interface DeleteConfirmModalProps {
  file: GlobalFile | null;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

export function DeleteConfirmModal({ file, onConfirm, onCancel, deleting }: DeleteConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={file !== null}
      onClose={onCancel}
      title={t('fileManager.deleteConfirm.title')}
      size="sm"
      closeOnEsc={!deleting}
      closeOnBackdrop={!deleting}
      showCloseButton={!deleting}
    >
      <div className="p-4">
        <p className="text-sm text-fg-secondary mb-2">
          {t('fileManager.deleteConfirm.message', { filename: file?.filename })}
        </p>
        <p className="text-xs text-fg-muted mb-4">
          {t('fileManager.deleteConfirm.warning')}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-bg-secondary rounded hover:bg-bg-tertiary disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? '...' : t('common.delete')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
