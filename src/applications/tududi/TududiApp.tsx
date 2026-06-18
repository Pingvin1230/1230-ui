import { useEffect, useState } from 'react';
import { ListChecks, Loader2, ExternalLink, Folder, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ApplicationComponentProps } from '../types';
import { tududiApi } from '../../lib/api/tududi';
import { TasksView } from './views/TasksView';
import { NotesView } from './views/NotesView';
import { ProjectsView } from './views/ProjectsView';

type Tab = 'tasks' | 'notes' | 'projects';
type NavFromProjects = { type: 'tasks' | 'notes'; projectId: number } | null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TududiApp(_props: ApplicationComponentProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasksResetKey, setTasksResetKey] = useState(0);
  const [health, setHealth] = useState<'ok' | 'down' | 'loading'>('loading');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [navTarget, setNavTarget] = useState<NavFromProjects>(null);
  const [upstreamUrl, setUpstreamUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHealth('loading');
    tududiApi
      .health()
      .then((h) => {
        if (cancelled) return;
        setHealth(h.configured && h.reachable ? 'ok' : 'down');
      })
      .catch(() => {
        if (cancelled) return;
        setHealth('down');
      });
    tududiApi
      .getConfig()
      .then((cfg) => {
        if (cancelled) return;
        setUpstreamUrl(cfg.apiUrl || null);
      })
      .catch(() => {
        // ignore — link will fall back to the default below
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!navTarget) return;
    setSelectedProjectId(navTarget.projectId);
    setTab(navTarget.type);
    if (navTarget.type === 'tasks') setTasksResetKey((k) => k + 1);
  }, [navTarget]);

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
      active
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        : 'text-fg-secondary hover:bg-bg-secondary'
    }`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-primary">
        <div className="flex gap-1.5 overflow-x-auto flex-1">
          <button
            type="button"
            onClick={() => { setTab('tasks'); setTasksResetKey((k) => k + 1); setSelectedProjectId(null); }}
            className={tabClass(tab === 'tasks')}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>{t('tududi.tab.tasks', 'Tasks')}</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('notes'); setSelectedProjectId(null); }}
            className={tabClass(tab === 'notes')}
          >
            <span>{t('tududi.tab.notes', 'Notes')}</span>
          </button>
          <button type="button" onClick={() => setTab('projects')} className={tabClass(tab === 'projects')}>
            <Folder className="w-3.5 h-3.5" />
            <span>{t('tududi.tab.projects', 'Projects')}</span>
          </button>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <HealthDot state={health} />
          <Link
            to="/settings/tududi"
            className="p-1.5 rounded-md text-fg-muted hover:bg-bg-secondary"
            title={t('tududi.settings', 'Settings')}
          >
            <Settings className="w-3.5 h-3.5" />
          </Link>
          <a
            href={upstreamUrl ?? 'https://todo.thinkout.ru'}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-fg-muted hover:bg-bg-secondary"
            title={t('tududi.openExternal', 'Open in Tududi')}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-bg-secondary">
        {tab === 'tasks' && <TasksView resetKey={tasksResetKey} initialProjectId={selectedProjectId} />}
        {tab === 'notes' && <NotesView initialProjectId={selectedProjectId} />}
        {tab === 'projects' && <ProjectsView onNavigate={(target) => setNavTarget(target)} />}
      </div>
    </div>
  );
}

function HealthDot({ state }: { state: 'ok' | 'down' | 'loading' }) {
  if (state === 'loading') return <Loader2 className="w-3.5 h-3.5 text-fg-muted animate-spin" />;
  if (state === 'down') {
    return <span title="Tududi unreachable" className="flex items-center gap-1 text-xs text-red-500">
      <span className="w-2 h-2 rounded-full bg-red-500" />
    </span>;
  }
  return <span title="Tududi connected" className="w-2 h-2 rounded-full bg-green-500" />;
}
