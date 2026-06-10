import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as LucideIcons from 'lucide-react';
import { useApplicationsStore } from '../store/applicationsStore';
import { applicationRegistry } from '../applications/registry';

interface ApplicationsPaneProps {
  sessionId: string | null;
}

export function ApplicationsPane({ sessionId }: ApplicationsPaneProps) {
  const { t } = useTranslation();
  const applications = useApplicationsStore((s) => s.applications);
  const selectedKey = useApplicationsStore((s) => s.selectedKey);
  const loading = useApplicationsStore((s) => s.loading);
  const selectApplication = useApplicationsStore((s) => s.selectApplication);
  const fetchApplications = useApplicationsStore((s) => s.fetchApplications);

  useEffect(() => {
    fetchApplications(true);
  }, [fetchApplications]);

  const enabledApps = useMemo(
    () => applications.filter((a) => a.enabled),
    [applications]
  );

  const selectedApp = useMemo(
    () => enabledApps.find((a) => a.key === selectedKey) ?? enabledApps[0] ?? null,
    [enabledApps, selectedKey]
  );

  const SelectedComponent = selectedApp ? applicationRegistry[selectedApp.key] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (enabledApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <p className="text-sm text-fg-muted">{t('applications.noApplications')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* App selector — pill tabs */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border-default bg-bg-primary">
        <div className="flex gap-1.5 overflow-x-auto">
          {enabledApps.map((app) => {
            const isActive = app.key === selectedApp?.key;
            const IconComponent = app.icon
              ? (LucideIcons as unknown as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[app.icon]
              : null;

            return (
              <button
                key={app.key}
                type="button"
                onClick={() => selectApplication(app.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-fg-secondary hover:bg-bg-secondary'
                }`}
                title={app.description ?? undefined}
              >
                {IconComponent && <IconComponent className="w-3.5 h-3.5 flex-shrink-0" />}
                <span>{app.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Application content area */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-bg-secondary">
        {SelectedComponent && selectedApp ? (
          <SelectedComponent sessionId={sessionId} config={selectedApp.config} />
        ) : (
          <div className="flex items-center justify-center h-full p-6 text-center">
            <p className="text-sm text-fg-muted">{t('applications.selectApplication')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
