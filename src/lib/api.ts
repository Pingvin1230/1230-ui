import i18n from '../i18n';
import type { Assistant, Session, Message } from '../types/api';

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

export interface CreateAssistantInput {
  name: string;
  color?: string | null;
  icon?: string | null;
  modelId?: string | null;
  style?: string | null;
  depth?: string | null;
  systemPrompt?: string | null;
}

export type UpdateAssistantInput = Partial<CreateAssistantInput>;

export interface SessionFile {
  id: number;
  sessionId: string;
  filename: string;
  storedName: string;
  mimeType: string | null;
  size: number;
  uploadedAt: number;
  path: string;
  source?: 'user' | 'agent';
}

export const api = {
  async getSessions(limit = 20, offset = 0, includeArchived = false, sort: 'created' | 'lastMessage' = 'created'): Promise<{ sessions: Session[]; total: number; limit: number; offset: number }> {
    const res = await fetch(`${API_BASE}/api/sessions?limit=${limit}&offset=${offset}&includeArchived=${includeArchived ? 1 : 0}&sort=${sort}`);
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchSessions'));
    return res.json();
  },

  async getSession(id: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/api/sessions/${id}`);
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchSession'));
    return res.json();
  },

  async getMessages(sessionId: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchMessages'));
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
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchModels'));
    return res.json();
  },

  async createSession(model: string, title?: string, assistantId?: number | null): Promise<string> {
    const body: { model: string; title?: string; assistantId?: number | null } = { model };
    if (title) body.title = title;
    if (assistantId != null) body.assistantId = assistantId;
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(i18n.t('api.failedToCreateSession'));
    const data = await res.json();
    return data.sessionId;
  },

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(i18n.t('api.failedToDeleteSession'));
  },

  async updateSessionTitle(sessionId: string, title: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(i18n.t('api.failedToUpdateSessionTitle'));
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
      onAgentFiles?: (files: Array<{ id: number; filename: string; size: number; mimeType: string }>) => void;
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
                message: errorData.error || i18n.t('api.httpError', { status: res.status }),
                retryable: res.status >= 500 || res.status === 429
              };
            }
          } catch {
            chatError = {
              type: 'server_error',
              message: i18n.t('api.httpError', { status: res.status }),
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
            message: i18n.t('api.emptyResponse'),
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
        let doneFired = false;

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
                // Do NOT return here — the server may still send agent_files
                // events after [DONE] (in the finally block of routes/chat.js).
                // We fire onDone now so the UI shows the message immediately,
                // but we keep reading until the stream is physically closed.
                if (!fullContent || fullContent.trim().length === 0) {
                  // Empty-content retry is deferred to after stream close (below).
                } else if (!doneFired) {
                  doneFired = true;
                  options.onDone?.(fullContent);
                }
                continue;
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

                // Task #24: agent files detected from the assistant's text.
                if (parsed.type === 'agent_files' && Array.isArray(parsed.files)) {
                  options.onAgentFiles?.(parsed.files);
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
          const err: ChatError = {
            type: 'network',
            message: fullContent ? i18n.t('api.responseIncomplete') : i18n.t('api.connectionInterrupted'),
            details: fullContent ? i18n.t('api.partialResponse', { count: fullContent.length }) : i18n.t('api.noResponseReceived'),
            code: 'STREAM_ABORTED',
            retryable: true,
            suggestion: i18n.t('api.serverRestartedSuggestion')
          };
          if (attempt < maxRetries) {
            options.onStatus?.('thinking');
            await new Promise(r => setTimeout(r, 1000 * attempt));
            return doSend(attempt + 1);
          }
          options.onError?.(err);
          return;
        }

        // Stream closed after [DONE]. Handle the empty-content case that was
        // deferred above (we needed to keep reading for agent_files first).
        if (!doneFired) {
          if (!fullContent || fullContent.trim().length === 0) {
            if (attempt < maxRetries) {
              options.onStatus?.('thinking');
              await new Promise(r => setTimeout(r, 1000 * attempt));
              return doSend(attempt + 1);
            }
            options.onError?.({
              type: 'content_moderation',
              message: i18n.t('api.requestBlocked'),
              provider: 'opencode-go',
              model: options.model || 'unknown',
              details: i18n.t('api.providerRejected'),
              code: 'EMPTY_RESPONSE',
              retryable: false,
              suggestion: i18n.t('api.blockedSuggestion')
            });
          } else {
            options.onDone?.(fullContent);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError') return;

        const e = error as { message?: string; code?: string; name?: string };
        const err: ChatError = {
          type: 'network',
          message: e.message || i18n.t('api.networkError'),
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
    if (!res.ok) throw new Error(i18n.t('api.healthCheckFailed'));
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
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchSystemStatus'));
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
    if (!res.ok) throw new Error(i18n.t('api.failedToExecuteCommand'));
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
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchModelProviders'));
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
    if (!res.ok) throw new Error(i18n.t('api.failedToSyncModelProviders'));
    return res.json();
  },

  async toggleModel(modelId: number): Promise<{ success: boolean; id: number; enabled: number }> {
    const res = await fetch(`${API_BASE}/api/models/models/${modelId}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error(i18n.t('api.failedToToggleModel'));
    return res.json();
  },

  async togglePin(id: string): Promise<{ success: boolean; pinned: number }> {
    const res = await fetch(`${API_BASE}/api/sessions/${id}/pin`, { method: 'PATCH' });
    if (!res.ok) throw new Error(i18n.t('api.failedToTogglePin'));
    return res.json();
  },

  async toggleArchive(id: string): Promise<{ success: boolean; archived: number }> {
    const res = await fetch(`${API_BASE}/api/sessions/${id}/archive`, { method: 'PATCH' });
    if (!res.ok) throw new Error(i18n.t('api.failedToToggleArchive'));
    return res.json();
  },

  async bulkDeleteSessions(ids: string[]): Promise<{ success: boolean; deletedCount: number }> {
    const res = await fetch(`${API_BASE}/api/sessions/bulk`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: i18n.t('api.failedToBulkDelete') }));
      throw new Error(data.error || i18n.t('api.failedToBulkDelete'));
    }
    return res.json();
  },

  async sendLike(): Promise<{ success: boolean; sent_at: number; retry_after?: number }> {
    const res = await fetch(`${API_BASE}/api/like`, { method: 'POST' });
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = Number(data.retry_after ?? res.headers.get('Retry-After') ?? 0);
      const err = new Error(data.message || i18n.t('api.likeCooldown')) as Error & {
        type?: string;
        retry_after?: number;
      };
      err.type = 'cooldown';
      err.retry_after = retryAfter;
      throw err;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || i18n.t('api.failedToSendLike'));
    }
    return res.json();
  },

  // --- Provider key management ---

  async getAvailableProviders(configured?: boolean): Promise<{
    providers: Array<{
      name: string;
      display_name: string;
      description: string;
      signup_url: string;
      auth_type: string;
      env_vars: string[];
      configured_env_var: string | null;
      is_configured: boolean;
      base_url: string;
    }>;
  }> {
    const qs = configured === undefined ? '' : `?configured=${configured ? 1 : 0}`;
    const res = await fetch(`${API_BASE}/api/providers/available${qs}`);
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchAvailableProviders'));
    return res.json();
  },

  async setProviderKey(name: string, envVar: string, value: string): Promise<{
    success: boolean;
    provider: string;
    env_var: string;
    masked: string;
  }> {
    const res = await fetch(`${API_BASE}/api/providers/${encodeURIComponent(name)}/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env_var: envVar, value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToSetProviderKey'));
    return data;
  },

  async removeProviderKey(name: string, envVar: string): Promise<{ success: boolean; provider: string; env_var: string }> {
    const res = await fetch(
      `${API_BASE}/api/providers/${encodeURIComponent(name)}/key?env_var=${encodeURIComponent(envVar)}`,
      { method: 'DELETE' }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToRemoveProviderKey'));
    return data;
  },

  // --- Session file management ---

  async uploadFile(sessionId: string, file: File): Promise<SessionFile> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/files`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToUploadFile'));
    return data as SessionFile;
  },

  async listSessionFiles(sessionId: string): Promise<{ files: SessionFile[] }> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/files`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToListFiles'));
    return data;
  },

  async deleteSessionFile(sessionId: string, fileId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/files/${fileId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || i18n.t('api.failedToDeleteFile'));
    }
  },

  async getAssistants(includeArchived = false): Promise<{ assistants: Assistant[] }> {
    const res = await fetch(`${API_BASE}/api/assistants?include_archived=${includeArchived ? 1 : 0}`);
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchAssistants'));
    return res.json();
  },

  async getAssistant(id: number): Promise<Assistant> {
    const res = await fetch(`${API_BASE}/api/assistants/${id}`);
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchAssistant'));
    return res.json();
  },

  async createAssistant(input: CreateAssistantInput): Promise<{ assistant: Assistant; forked: false }> {
    const res = await fetch(`${API_BASE}/api/assistants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        color: input.color ?? null,
        icon: input.icon ?? null,
        model_id: input.modelId ?? null,
        style: input.style ?? null,
        depth: input.depth ?? null,
        system_prompt: input.systemPrompt ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToCreateAssistant'));
    return data;
  },

  async updateAssistant(id: number, input: UpdateAssistantInput): Promise<{ assistant: Assistant; forked: boolean; previousId?: number }> {
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;

    if (input.color !== undefined) body.color = input.color;
    if (input.icon !== undefined) body.icon = input.icon;
    if (input.modelId !== undefined) body.model_id = input.modelId;
    if (input.style !== undefined) body.style = input.style;
    if (input.depth !== undefined) body.depth = input.depth;
    if (input.systemPrompt !== undefined) body.system_prompt = input.systemPrompt;
    const res = await fetch(`${API_BASE}/api/assistants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToUpdateAssistant'));
    return data;
  },

  async archiveAssistant(id: number): Promise<{ assistant: Assistant }> {
    const res = await fetch(`${API_BASE}/api/assistants/${id}/archive`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToArchiveAssistant'));
    return data;
  },

  async restoreAssistant(id: number): Promise<{ assistant: Assistant }> {
    const res = await fetch(`${API_BASE}/api/assistants/${id}/restore`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToRestoreAssistant'));
    return data;
  },

  async duplicateAssistant(id: number): Promise<{ assistant: Assistant }> {
    const res = await fetch(`${API_BASE}/api/assistants/${id}/duplicate`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToDuplicateAssistant'));
    return data;
  },
};
