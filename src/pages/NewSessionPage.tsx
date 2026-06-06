import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Session } from '../types/api';
import { NoModelsIllustration } from '../assets/illustrations';
import { formatTimeAgo, formatFullDateTime } from '../lib/time';
import { MessageSquare, Send } from 'lucide-react';

interface Model {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  name: string;
  models: Model[];
}

interface ModelsResponse {
  default: Model & { provider: string } | null;
  providers: Record<string, Provider>;
}

export function NewSessionPage() {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionsData, modelsData] = await Promise.all([
          api.getSessions(5, 0),
          api.getModels(),
        ]);

        if (cancelled) return;
        setSessions(sessionsData.sessions);
        setModels(modelsData);

        const savedModel = localStorage.getItem('selectedModel');

        if (savedModel) {
          const modelAvailable = Object.values(modelsData.providers).some(p =>
            p.models.some(m => m.id === savedModel)
          );

          if (modelAvailable) {
            setModel(savedModel);
            return;
          }
        }

        if (modelsData.default) {
          setModel(modelsData.default.id);
        } else {
          const firstProvider = Object.values(modelsData.providers)[0];
          if (firstProvider && firstProvider.models.length > 0) {
            setModel(firstProvider.models[0].id);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-fg-primary">New Session</h1>
        </div>
        <div className="bg-bg-primary border border-border-default rounded-lg p-6 animate-pulse space-y-4">
          <div className="h-4 bg-bg-muted rounded w-1/4" />
          <div className="h-9 bg-bg-muted rounded w-full" />
          <div className="h-24 bg-bg-muted rounded w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-fg-primary">New Session</h1>
        <p className="text-sm text-fg-muted mt-1">Create a new conversation with Hermes</p>
      </div>

      <div className="bg-bg-primary border border-border-default rounded-lg p-6">
        <h2 className="text-lg font-semibold text-fg-primary mb-4">Start a New Conversation</h2>
        <div className="space-y-3">
          {models ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border-default bg-bg-primary text-fg-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(models.providers).map(([providerId, provider]) => (
                <optgroup key={providerId} label={provider.name}>
                  {provider.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {models.default?.id === m.id ? ' (default)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <div className="flex flex-col items-center text-center py-6">
              <NoModelsIllustration className="w-20 h-20 mb-3 text-fg-muted" />
              <p className="text-fg-muted text-sm">
                No models available
              </p>
            </div>
          )}
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
              type="button"
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

      {sessions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-fg-primary mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {sessions.slice(0, 5).map((session) => {
              const titleText = session.title ||
                (session.preview
                  ? session.preview.length > 60
                    ? session.preview.slice(0, 60) + '...'
                    : session.preview
                  : 'Untitled session');
              return (
                <Link
                  key={session.id}
                  to={`/chat/${session.id}`}
                  className="block bg-bg-primary border border-border-default rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-all hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-semibold text-fg-primary truncate">
                      {titleText}
                    </h3>
                    <span
                      className="text-xs text-fg-muted whitespace-nowrap flex-shrink-0"
                      title={formatFullDateTime(session.lastMessageAt ?? session.startedAt)}
                    >
                      {formatTimeAgo(session.lastMessageAt ?? session.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    {session.model && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        {session.model}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {session.messageCount}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
