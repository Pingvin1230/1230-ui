import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Activity, MessageSquare, Send, Server, Cpu, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import type { Session } from '../types/api';
import { formatTimeAgo } from '../lib/time';

interface SystemStatus {
  hermes: {
    status: string;
    version: string;
    updateAvailable: number | null;
    latestVersion: string | null;
  };
  providers: Array<{
    name: string;
    displayName: string;
    syncStatus: string;
    lastSyncedAt: string;
  }>;
  stats: {
    totalSessions: number;
  };
}

interface ModelOption {
  id: string;
  name: string;
  providerName: string;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [statusData, sessionsData, modelsData] = await Promise.all([
        api.getSystemStatus(),
        api.getSessions(3, 0),
        api.getModels()
      ]);
      setStatus(statusData);
      setSessions(sessionsData.sessions);

      const allModels: ModelOption[] = [];
      Object.entries(modelsData.providers).forEach(([, provider]) => {
        provider.models.forEach(m => {
          allModels.push({ id: m.id, name: m.name, providerName: provider.name });
        });
      });
      setModels(allModels);

      const savedModel = localStorage.getItem('selectedModel');
      if (savedModel && allModels.some(m => m.id === savedModel)) {
        setModel(savedModel);
      } else if (modelsData.default) {
        setModel(modelsData.default.id);
      } else if (allModels.length > 0) {
        setModel(allModels[0].id);
      }

      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !model || sending) return;

    const content = input.trim();
    const title = content.length > 60 ? content.slice(0, 60) + '...' : content;

    try {
      setSending(true);
      localStorage.setItem('selectedModel', model);
      const sessionId = await api.createSession(model, title);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      navigate(`/chat/${sessionId}`, { state: { initialMessage: content } });
    } catch (err) {
      console.error('Failed to create session:', err);
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
        <h1 className="text-2xl font-semibold text-fg-primary">Welcome</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-bg-primary border border-border-default rounded-lg p-6 animate-pulse">
              <div className="h-6 bg-bg-muted rounded w-1/3 mb-4" />
              <div className="space-y-3">
                <div className="h-4 bg-bg-muted rounded w-full" />
                <div className="h-4 bg-bg-muted rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button
            onClick={loadData}
            className="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-fg-primary">Welcome</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Chat */}
        <div className="lg:col-span-2 bg-bg-primary border border-border-default rounded-lg p-6">
          <h2 className="text-lg font-semibold text-fg-primary mb-4">Start a New Conversation</h2>
          <div className="space-y-3">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.providerName})
                </option>
              ))}
            </select>
            <div className="flex gap-3 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                disabled={sending}
                rows={3}
                className="flex-1 px-4 py-3 rounded-lg border border-border-default bg-bg-primary text-fg-primary placeholder-fg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none overflow-y-auto"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="self-stretch inline-flex items-center justify-center gap-2 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-bg-primary border border-border-default rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-fg-primary">System Status</h2>
          </div>

          <div className="space-y-4">
            {/* Hermes Connection */}
            <div className="flex items-start gap-3">
              <Server className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg-primary">Hermes API</span>
                  {status?.hermes.status === 'connected' ? (
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">Connected</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <XCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">Disconnected</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-fg-muted mt-1">
                  Hermes version: {status?.hermes.version}
                </p>
                {status?.hermes.latestVersion && (
                  <p className="text-xs text-fg-muted mt-0.5">
                    Latest: {status.hermes.latestVersion}
                  </p>
                )}
                {status?.hermes.updateAvailable !== null && status?.hermes.updateAvailable !== undefined && status?.hermes.updateAvailable > 0 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    Update available: {status?.hermes.updateAvailable} commits behind
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Cpu className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <span className="text-sm font-medium text-fg-primary">Providers</span>
                {status?.providers && status.providers.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {status.providers.map((provider) => (
                      <div key={provider.name} className="flex items-center justify-between text-xs">
                        <span className="text-fg-secondary">{provider.displayName || provider.name}</span>
                        <span className={`px-2 py-0.5 rounded-full ${
                          provider.syncStatus === 'ok'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {provider.syncStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-fg-muted mt-1">No providers configured</p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-border-default">
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-secondary">Total Sessions</span>
                <span className="font-semibold text-fg-primary">{status?.stats.totalSessions}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="bg-bg-primary border border-border-default rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-fg-primary">Recent Sessions</h2>
            </div>
            <Link to="/sessions" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1">
              View all
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-fg-muted">No sessions yet</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const title = session.title ||
                  (session.preview
                    ? (session.preview.length > 60
                      ? session.preview.slice(0, 60) + '...'
                      : session.preview)
                    : 'Untitled session');

                return (
                  <Link
                    key={session.id}
                    to={`/chat/${session.id}`}
                    className="block p-3 rounded-lg hover:bg-bg-secondary transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg-primary truncate">
                          {title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-fg-muted">
                          {session.model && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
                              {session.model}
                            </span>
                          )}
                          <span>{session.messageCount} msgs</span>
                          <span>•</span>
                          <span>{formatTimeAgo(session.lastMessageAt ?? session.startedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
