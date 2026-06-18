import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../store/workspaceStore';

export function ChatRouteResolver() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const incomingStateRef = useRef(location.state);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) { navigate('/sessions', { replace: true }); return; }
    let cancelled = false;
    api.getSession(id)
      .then((s) => {
        if (cancelled) return;
        setActiveSession(s.executor, id);
        setActiveTab(s.executor);
        navigate('/sessions', { replace: true, state: incomingStateRef.current });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id, navigate, setActiveSession, setActiveTab]);

  if (failed) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-fg-primary mb-2">{t('chat.sessionNotFound')}</h2>
          <Link to="/sessions" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium">{t('common.backToSessions')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
    </div>
  );
}
