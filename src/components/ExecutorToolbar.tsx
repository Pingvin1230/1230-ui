import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Session } from '../types/api';
import { useWorkspaceStore, type ExecutorSlug } from '../store/workspaceStore';

function abbreviate(s: string, n = 16): string {
  const t = s.trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export function ExecutorToolbar({ executor }: { executor: ExecutorSlug }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [recent, setRecent] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionByExecutor[executor]);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getSessions(3, 0, false, 'lastMessage', executor)
      .then((d) => {
        if (!cancelled) setRecent(d.sessions);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [executor, activeSessionId]);

  const goToSessions = () => {
    setActiveTab('sessions');
    navigate(`/sessions?executor=${executor}`);
  };

  const pillClass = (active: boolean) =>
    `px-2 py-1 rounded-md text-xs truncate max-w-[120px] transition-colors ${
      active
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        : 'bg-bg-secondary text-fg-secondary hover:bg-bg-muted'
    }`;

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-primary">
      <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-fg-muted animate-spin flex-shrink-0" />
        ) : recent.length === 0 ? (
          <span className="text-xs text-fg-muted">
            {t('workspace.noRecentSessions', { defaultValue: 'No recent sessions' })}
          </span>
        ) : (
          recent.map((s) => {
            const label = s.title || s.preview || t('common.untitledSession');
            return (
              <button
                key={s.id}
                type="button"
                title={label}
                onClick={() => setActiveSession(executor, s.id)}
                className={pillClass(s.id === activeSessionId)}
              >
                {abbreviate(label)}
              </button>
            );
          })
        )}
        <button
          type="button"
          onClick={goToSessions}
          title={t('workspace.allSessions', { defaultValue: 'All sessions for this executor' })}
          className="p-1 rounded-md text-fg-muted hover:text-fg-primary hover:bg-bg-secondary flex-shrink-0"
          aria-label={t('workspace.allSessions', { defaultValue: 'All sessions for this executor' })}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
