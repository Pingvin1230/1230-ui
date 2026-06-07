import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Trash2, Plus, X, Loader2, AlertCircle, Check, Save } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from './Modal';
import { ApiKeyInput } from './ApiKeyInput';

export interface ProviderCardData {
  name: string;
  display_name: string;
  description: string;
  env_vars: string[];
  configured_env_var: string | null;
  is_configured: boolean;
}

interface ProviderCardProps {
  provider: ProviderCardData;
  onChanged: () => void;
}

export function ProviderCard({ provider, onChanged }: ProviderCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [envVar, setEnvVar] = useState(provider.env_vars[0] || '');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEnvVar(provider.env_vars[0] || '');
    setValue('');
    setError(null);
  };

  const handleAdd = async () => {
    if (!value.trim()) {
      setError(t('providers.errorKeyEmpty'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setProviderKey(provider.name, envVar, value);
      resetForm();
      setExpanded(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('providers.errorAddFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!provider.configured_env_var) return;
    setConfirmRemove(false);
    setRemoving(true);
    setError(null);
    try {
      await api.removeProviderKey(provider.name, provider.configured_env_var);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('providers.errorRemoveFailed'));
    } finally {
      setRemoving(false);
    }
  };

  const isConfigured = provider.is_configured;

  return (
    <>
      <div className="bg-bg-primary border border-border-default rounded-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-fg-primary">{provider.display_name}</h4>
              {isConfigured && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  title={t('providers.keyConfigured')}
                >
                  <Check className="w-3 h-3" />
                </span>
              )}
            </div>
            {provider.description && (
              <p className="text-xs text-fg-muted mt-0.5 line-clamp-1">{provider.description}</p>
            )}
            <p className="text-xs text-fg-muted mt-0.5 inline-flex items-center gap-1 font-mono">
              <KeyRound className="w-3 h-3" />
              {provider.configured_env_var || provider.env_vars[0]}
            </p>
          </div>

          {isConfigured ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={removing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border-default text-fg-secondary hover:bg-bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {removing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              {t('providers.removeKey')}
            </button>
          ) : expanded ? (
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                resetForm();
              }}
              disabled={saving}
              className="p-1.5 text-fg-muted hover:text-fg-secondary hover:bg-bg-secondary rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              aria-label={t('common.cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('providers.addKey')}
            </button>
          )}
        </div>

        {expanded && !isConfigured && (
          <div className="px-4 pb-4 pt-1 border-t border-border-default space-y-3">
            {provider.env_vars.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-fg-secondary mb-1">
                  {t('providers.envVarLabel')}
                </label>
                <select
                  value={envVar}
                  onChange={(e) => setEnvVar(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-border-default bg-bg-primary text-fg-primary font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {provider.env_vars.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-fg-secondary mb-1">
                {t('providers.apiKeyLabel')}
              </label>
              <ApiKeyInput
                value={value}
                onChange={setValue}
                placeholder={t('providers.apiKeyPlaceholder')}
              />
              <p className="mt-1.5 text-xs text-fg-muted">{t('providers.storedInEnv')}</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !value.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('providers.saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {t('providers.saveKey')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {error && isConfigured && (
          <div className="px-4 pb-3 -mt-1">
            <p className="text-xs text-red-500 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          </div>
        )}
      </div>

      <Modal
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        size="md"
        title={t('providers.confirmRemoveTitle')}
      >
        <div className="p-6">
          <p className="text-sm text-fg-secondary">
            {t('providers.confirmRemoveDesc', {
              name: provider.display_name,
              envVar: provider.configured_env_var,
            })}
          </p>
          <div className="flex gap-2 justify-end mt-4">
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              {t('providers.removeKey')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
