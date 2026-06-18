import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, ArrowLeft, Loader2 } from 'lucide-react';

interface AddConnectionFormProps {
  onSubmit: (payload: { label: string; url: string; username: string; password: string }) => Promise<void>;
  onCancel: () => void;
  error: string | null;
  adding: boolean;
}

export function AddConnectionForm({ onSubmit, onCancel, error, adding }: AddConnectionFormProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !username || !password) return;
    onSubmit({ label: label || url, url, username, password });
  }, [label, url, username, password, onSubmit]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 text-fg-secondary hover:bg-bg-secondary rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-medium text-fg-primary">{t('cloudConnect.addConnection')}</h3>
      </div>

      <div className="flex flex-col items-center justify-center mb-6">
        <Cloud className="w-8 h-8 text-fg-muted mb-2" />
        <p className="text-xs text-fg-muted text-center">{t('cloudConnect.addConnectionDesc')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">
            {t('cloudConnect.form.label')}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('cloudConnect.form.labelPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">
            {t('cloudConnect.form.url')}
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://webdav.example.com"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">
            {t('cloudConnect.form.username')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="user@example.com"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-fg-secondary mb-1">
            {t('cloudConnect.form.password')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="text-xs text-red-500">{error}</div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm text-fg-secondary hover:bg-bg-secondary rounded-lg transition-colors"
            disabled={adding}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={adding || !url || !username || !password}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
          >
            {adding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('cloudConnect.form.testing')}
              </>
            ) : (
              t('cloudConnect.form.save')
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
