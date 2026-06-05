import type { Session, Message } from '../types/api';

const API_BASE = '';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatError {
  type: string;
  message: string;
  provider?: string;
  model?: string;
  details?: string;
  code?: string;
  retryable?: boolean;
  suggestion?: string;
}

export const api = {
  async getSessions(limit = 20, offset = 0, includeArchived = false): Promise<{ sessions: Session[]; total: number; limit: number; offset: number }> {
    const res = await fetch(`${API_BASE}/api/sessions?limit=${limit}&offset=${offset}&includeArchived=${includeArchived ? 1 : 0}`);
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  },

  async getSession(id: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/api/sessions/${id}`);
    if (!res.ok) throw new Error('Failed to fetch session');
    return res.json();
  },

  async getMessages(sessionId: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },

  async getModels(): Promise<{
    default: { id: string; name: string; provider: string } | null;
    providers: Record<string, {
      id: string;
      name: string;
      models: Array<{ id: string; name: string }>;
    }>;
  }> {
    const res = await fetch(`${API_BASE}/api/models`);
    if (!res.ok) throw new Error('Failed to fetch models');
    return res.json();
  },

  async createSession(model: string, title?: string): Promise<string> {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, title }),
    });
    if (!res.ok) throw new Error('Failed to create session');
    const data = await res.json();
    return data.sessionId;
  },

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete session');
  },

  async updateSessionTitle(sessionId: string, title: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to update session title');
    return res.json();
  },

  sendMessage(
    messages: ChatMessage[],
    options: {
      sessionId?: string;
      model?: string;
      onStatus?: (status: 'thinking' | 'generating' | 'executing_tool', toolName?: string) => void;
      onChunk?: (chunk: string) => void;
      onDone?: (fullContent: string) => void;
      onError?: (error: ChatError) => void;
      onToolCallStart?: (id: string, toolName: string, label?: string) => void;
      onToolCallEnd?: (id: string) => void;
    } = {},
    maxRetries = 3
  ): AbortController {
    const controller = new AbortController();

    const doSend = async (attempt: number) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        const res = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages,
            session_id: options.sessionId,
            model: options.model,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let chatError: ChatError;
          try {
            const errorData = await res.json();
            if (errorData.error && typeof errorData.error === 'object') {
              chatError = errorData.error;
            } else {
              chatError = {
                type: 'server_error',
                message: errorData.error || `HTTP ${res.status}`,
                retryable: res.status >= 500 || res.status === 429
              };
            }
          } catch {
            chatError = {
              type: 'server_error',
              message: `HTTP ${res.status}`,
              retryable: res.status >= 500 || res.status === 429
            };
          }

          // Retry for retryable errors
          if (chatError.retryable && attempt < maxRetries) {
            options.onStatus?.('thinking');
            await new Promise(r => setTimeout(r, 1000 * attempt));
            return doSend(attempt + 1);
          }

          options.onError?.(chatError);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          const err: ChatError = {
            type: 'server_error',
            message: 'Empty response from server',
            code: 'NO_STREAM',
            retryable: true
          };
          if (attempt < maxRetries) {
            options.onStatus?.('thinking');
            await new Promise(r => setTimeout(r, 1000 * attempt));
            return doSend(attempt + 1);
          }
          options.onError?.(err);
          return;
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';
        let isDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                isDone = true;
                // Check that content is not empty
                if (!fullContent || fullContent.trim().length === 0) {
                  console.log(`[api] [DONE] received but content is empty, attempt=${attempt}/${maxRetries}`);
                  if (attempt < maxRetries) {
                    options.onStatus?.('thinking');
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    return doSend(attempt + 1);
                  }
                  options.onError?.({
                    type: 'content_moderation',
                    message: 'Request blocked by security filter',
                    provider: 'opencode-go',
                    model: options.model || 'unknown',
                    details: 'Provider rejected request due to session context content (code: EMPTY_RESPONSE)',
                    code: 'EMPTY_RESPONSE',
                    retryable: false,
                    suggestion: 'This session context contains information blocked by the provider filter. Create a new session or choose a different model in settings.'
                  });
                } else {
                  options.onDone?.(fullContent);
                }
                return;
              }
              try {
                const parsed = JSON.parse(data);

                // Status event from server
                if (parsed.type === 'status' && parsed.status) {
                  options.onStatus?.(parsed.status, parsed.toolName);
                  continue;
                }

                // Tool call events from server
                if (parsed.type === 'tool_call_start' && parsed.id && parsed.toolName) {
                  options.onToolCallStart?.(parsed.id, parsed.toolName, parsed.label);
                  options.onStatus?.('executing_tool', parsed.toolName);
                  continue;
                }
                if (parsed.type === 'tool_call_end' && parsed.id) {
                  options.onToolCallEnd?.(parsed.id);
                  continue;
                }

                // Check for server error
                if (parsed.error && typeof parsed.error === 'object') {
                  const err: ChatError = parsed.error;
                  // Add HTTP code if present in response
                  if (!err.code && res.status) {
                    err.code = `${res.status} ${err.code || ''}`.trim();
                  }
                  if (err.retryable && attempt < maxRetries) {
                    options.onStatus?.('thinking');
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    return doSend(attempt + 1);
                  }
                  options.onError?.(err);
                  return;
                }

                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  options.onChunk?.(delta);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        // Stream closed without [DONE] — retry
        if (!isDone) {
          console.log(`[api] Stream ended without [DONE], content=${fullContent.length} chars, attempt=${attempt}/${maxRetries}`);
          const err: ChatError = {
            type: 'network',
            message: fullContent ? 'Response incomplete' : 'Connection interrupted during response',
            details: fullContent ? `Partial response (${fullContent.length} characters)` : 'No response received',
            code: 'STREAM_ABORTED',
            retryable: true,
            suggestion: 'Hermes API Server may have restarted. Please try again.'
          };
          if (attempt < maxRetries) {
            options.onStatus?.('thinking');
            await new Promise(r => setTimeout(r, 1000 * attempt));
            return doSend(attempt + 1);
          }
          options.onError?.(err);
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError') return;

        const e = error as { message?: string; code?: string; name?: string };
        const err: ChatError = {
          type: 'network',
          message: e.message || 'Network error',
          code: e.code || e.name || 'FETCH_ERROR',
          details: e.message,
          retryable: true
        };

        if (attempt < maxRetries) {
          options.onStatus?.('thinking');
          await new Promise(r => setTimeout(r, 1000 * attempt));
          return doSend(attempt + 1);
        }

        options.onError?.(err);
      }
    };

    doSend(0);

    return controller;
  },

  async healthCheck(): Promise<{ status: string; dbConnected: boolean; hermesApi: string }> {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  async getSystemStatus(): Promise<{
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
  }> {
    const res = await fetch(`${API_BASE}/api/system/status`);
    if (!res.ok) throw new Error('Failed to fetch system status');
    return res.json();
  },

  async execSystemCommand(command: 'update' | 'doctor'): Promise<{
    success: boolean;
    exitCode?: number;
    output?: string;
    fullOutput?: string;
    error?: string;
  }> {
    const res = await fetch(`${API_BASE}/api/system/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    if (!res.ok) throw new Error('Failed to execute command');
    return res.json();
  },

  async getModelProviders(): Promise<Array<{
    id: number;
    name: string;
    display_name: string;
    env_var: string;
    base_url: string;
    sync_status: string;
    last_synced_at: string | null;
    models: Array<{
      id: number;
      model_id: string;
      display_name: string;
      enabled: number;
    }>;
    enabledCount: number;
    totalCount: number;
  }>> {
    const res = await fetch(`${API_BASE}/api/models/providers`);
    if (!res.ok) throw new Error('Failed to fetch model providers');
    return res.json();
  },

  async syncModelProviders(): Promise<{
    success: boolean;
    providers_synced?: number;
    models_synced?: number;
    errors?: string[];
    error?: string;
  }> {
    const res = await fetch(`${API_BASE}/api/models/sync`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to sync model providers');
    return res.json();
  },

  async toggleModel(modelId: number): Promise<{ success: boolean; id: number; enabled: number }> {
    const res = await fetch(`${API_BASE}/api/models/models/${modelId}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to toggle model');
    return res.json();
  },

  async togglePin(id: string): Promise<{ success: boolean; pinned: number }> {
    const res = await fetch(`${API_BASE}/api/sessions/${id}/pin`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to toggle pin');
    return res.json();
  },

  async toggleArchive(id: string): Promise<{ success: boolean; archived: number }> {
    const res = await fetch(`${API_BASE}/api/sessions/${id}/archive`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to toggle archive');
    return res.json();
  },

  async bulkDeleteSessions(ids: string[]): Promise<{ success: boolean; deletedCount: number }> {
    const res = await fetch(`${API_BASE}/api/sessions/bulk`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Failed to bulk delete sessions' }));
      throw new Error(data.error || 'Failed to bulk delete sessions');
    }
    return res.json();
  }
};
