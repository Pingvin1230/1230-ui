import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Eye,
  FolderOpen,
  Cloud,
  ListChecks,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useApplicationsStore } from '../store/applicationsStore';
import type { Application } from '../types/api';

const APPLICATION_ICONS: Record<string, LucideIcon> = {
  Eye,
  FolderOpen,
  Cloud,
  ListChecks,
};

export function ApplicationsPage() {
  const { t } = useTranslation();
  const applications = useApplicationsStore((s) => s.applications);
  const loading = useApplicationsStore((s) => s.loading);
  const fetchApplications = useApplicationsStore((s) => s.fetchApplications);
  const updateApplication = useApplicationsStore((s) => s.updateApplication);

  const [localApps, setLocalApps] = useState<Application[]>([]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    setLocalApps(applications);
  }, [applications]);

  const handleToggle = async (app: Application) => {
    await updateApplication(app.id, { enabled: app.enabled ? 0 : 1 });
  };

  const handleMove = async (app: Application, direction: 'up' | 'down') => {
    const sorted = [...localApps].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((a) => a.id === app.id);
    if (idx === -1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    await updateApplication(app.id, { sortOrder: other.sortOrder });
    await updateApplication(other.id, { sortOrder: app.sortOrder });
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const sortedApps = [...localApps].sort((a, b) => a.sortOrder - b.sortOrder);
  const enabledCount = sortedApps.filter((a) => a.enabled).length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
      <div className="max-w-3xl w-full mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border-default bg-bg-primary hover:bg-bg-secondary text-fg-secondary rounded-lg transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('applications.backToSettings')}
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-fg-primary">{t('applications.title')}</h1>
            <p className="text-sm text-fg-muted mt-0.5">
              {t('applications.subtitle', { enabled: enabledCount, total: sortedApps.length })}
            </p>
          </div>
        </div>

        {/* Applications list */}
        <div className="bg-bg-primary border border-border-default rounded-lg divide-y divide-border-default">
          {sortedApps.length === 0 ? (
            <div className="px-4 py-8 text-center text-fg-muted">
              <p className="text-sm">{t('applications.noApplications')}</p>
            </div>
          ) : (
            sortedApps.map((app, idx) => {
              const IconComponent = app.icon ? APPLICATION_ICONS[app.icon] ?? null : null;

              return (
                <div
                  key={app.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    !app.enabled ? 'opacity-50' : ''
                  }`}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    {IconComponent ? (
                      <IconComponent className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Settings className="w-4 h-4 text-fg-muted" />
                    )}
                  </div>

                  {/* Name + description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg-primary">{app.name}</p>
                    {app.description && (
                      <p className="text-xs text-fg-muted truncate">{app.description}</p>
                    )}
                  </div>

                  {/* Key badge */}
                  <span className="text-xs font-mono text-fg-muted bg-bg-secondary px-2 py-0.5 rounded">
                    {app.key}
                  </span>

                  {/* Move buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMove(app, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[44px] flex items-center justify-center"
                      aria-label={t('applications.moveUp')}
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-fg-muted" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(app, 'down')}
                      disabled={idx === sortedApps.length - 1}
                      className="p-1 rounded hover:bg-bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[44px] flex items-center justify-center"
                      aria-label={t('applications.moveDown')}
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-fg-muted" />
                    </button>
                  </div>

                  {/* Toggle switch */}
                  <button
                    type="button"
                    onClick={() => handleToggle(app)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors min-h-[44px] px-0.5 ${
                      app.enabled
                        ? 'bg-blue-600'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    role="switch"
                    aria-checked={!!app.enabled}
                    aria-label={`${app.name} ${app.enabled ? t('applications.enabled') : t('applications.disabled')}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                        app.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Info */}
        <div className="mt-4 p-4 bg-bg-primary border border-border-default rounded-lg">
          <p className="text-xs text-fg-muted">
            {t('applications.infoText')}
          </p>
        </div>
      </div>
    </div>
  );
}
