import i18n from '../i18n';
import { z } from 'zod';
import type { Assistant, Session, Message, Application, CloudConnection, CloudEntry, IssuedLink } from '../types/api';

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
  executor?: 'hermes' | 'opencode-1230';
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

export interface GlobalFile {
  id: number;
  sessionId: string;
  sessionTitle: string | null;
  filename: string;
  mimeType: string | null;
  size: number;
  uploadedAt: number;
  expiresAt: number | null;
  extendedCount: number;
  source: 'user' | 'agent';
  path?: string;
}

export interface FileStats {
  totalFiles: number;
  totalSize: number;
  expiringSoon: number;
}

const ToolCallSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }).optional(),
});

const AgentFileSchema = z.object({
  id: z.number(),
  filename: z.string(),
  size: z.number(),
  mimeType: z.string(),
});

const AssistantSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  modelId: z.string().nullable(),
  style: z.string().nullable(),
  depth: z.string().nullable(),
  systemPrompt: z.string().nullable(),
  executor: z.enum(['hermes', 'opencode-1230']),
  isArchived: z.boolean(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const SessionSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  source: z.string(),
  model: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  messageCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  preview: z.string().optional(),
  lastMessageAt: z.number().nullable().optional(),
  pinned: z.number().optional(),
  archived: z.number().optional(),
  assistant: AssistantSchema.nullable().optional(),
  executor: z.enum(['hermes', 'opencode-1230']),
  fileCount: z.number().optional(),
});

const MessageSchema = z.object({
  id: z.number(),
  sessionId: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().nullable(),
  toolCallId: z.string().nullish(),
  toolCalls: z.array(ToolCallSchema).nullish(),
  toolName: z.string().nullish(),
  timestamp: z.number(),
  tokenCount: z.number().nullish(),
  latencyMs: z.number().nullish(),
  agentFiles: z.array(AgentFileSchema).nullish(),
});

const SessionListSchema = z.object({
  sessions: z.array(SessionSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const AssistantListSchema = z.object({
  assistants: z.array(AssistantSchema),
});

// Soft validation: on schema drift, warn (dev signal) and fall back to the
// raw response so the UI keeps working instead of crashing. Hard throws here
// would turn any backend shape change into a blank screen.
type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues?: unknown[]; message?: string } };

function parse<T>(
  schema: { safeParse: (data: unknown) => SafeParseResult<T> },
  data: unknown,
  label?: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  console.warn(
    `[api] response validation failed${label ? ` (${label})` : ''}; using raw data`,
    result.error.issues ?? result.error,
  );
  return data as T;
}

async function request<T>(url: string, init?: RequestInit, errorMessage?: string): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(errorMessage ?? i18n.t('api.requestFailed', { status: res.status }));
  }
  return res.json() as Promise<T>;
}

export const api = {
  async getSessions(limit = 20, offset = 0, includeArchived = false, sort: 'created' | 'lastMessage' = 'created', executor?: 'hermes' | 'opencode-1230'): Promise<{ sessions: Session[]; total: number; limit: number; offset: number }> {
    const execParam = executor ? `&executor=${executor}` : '';
    const url = `${API_BASE}/api/sessions?limit=${limit}&offset=${offset}&includeArchived=${includeArchived ? 1 : 0}&sort=${sort}${execParam}`;
    const data = await request(url, undefined, i18n.t('api.failedToFetchSessions'));
    return parse(SessionListSchema, data, 'getSessions');
  },

  async getSession(id: string): Promise<Session> {
    const data = await request(`${API_BASE}/api/sessions/${id}`, undefined, i18n.t('api.failedToFetchSession'));
    return parse(SessionSchema, data, 'getSession');
  },

  async getMessages(sessionId: string): Promise<Message[]> {
    const data = await request(`${API_BASE}/api/sessions/${sessionId}/messages`, undefined, i18n.t('api.failedToFetchMessages'));
    return parse(z.array(MessageSchema), data, 'getMessages');
  },

  async getModels(): Promise<{
    default: { id: string; name: string; provider: string } | null;
    providers: Record<string, {
      id: string;
      name: string;
      models: Array<{ id: string; name: string }>;
    }>;
  }> {
    return request(`${API_BASE}/api/models`, undefined, i18n.t('api.failedToFetchModels'));
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
    return request(`${API_BASE}/api/sessions/${sessionId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }, i18n.t('api.failedToUpdateSessionTitle'));
  },

  sendMessage(
    messages: ChatMessage[],
    options: {
      sessionId?: string;
      model?: string;
      maxRetries?: number;
      onStatus?: (status: 'thinking' | 'generating' | 'executing_tool', toolName?: string) => void;
      onChunk?: (chunk: string) => void;
      onDone?: (fullContent: string) => void;
      onError?: (error: ChatError) => void;
      onToolCallStart?: (id: string, toolName: string, label?: string) => void;
      onToolCallEnd?: (id: string) => void;
      onAgentFiles?: (files: Array<{ id: number; filename: string; size: number; mimeType: string }>) => void;
    } = {},
    _legacyMaxRetries?: number
  ): AbortController {
    // Allow callers to pass maxRetries via options (preferred) or via the
    // legacy positional arg. Default is 0 — we never auto-retry the chat
    // request, because each retry fires a new Python subprocess and creates
    // a duplicate turn. The user must click the manual Retry button.
    const maxRetries = options.maxRetries ?? _legacyMaxRetries ?? 0;
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

                // The server's `done` event is the canonical completion signal
                // for chat.js's NDJSON-to-SSE bridge. The literal `data: [DONE]`
                // sentinel is also sent right after it (defense in depth), but
                // many of our events use the same SSE format and rely on
                // `type === 'done'` to fire onDone. Without this branch, every
                // successful response is misclassified as STREAM_ABORTED when
                // the connection closes after the `done` event.
                if (parsed.type === 'done') {
                  isDone = true;
                  // Prefer the final_response from the server payload when
                  // present (it's the authoritative text); fall back to the
                  // accumulated deltas from the SSE stream.
                  const serverText =
                    typeof parsed.final_response === 'string'
                      ? parsed.final_response
                      : fullContent;
                  if (!doneFired) {
                    doneFired = true;
                    options.onDone?.(serverText);
                  }
                  // Keep reading — the server may still send `agent_files`
                  // events after this (in the child.on('close') path of
                  // routes/chat.js).
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

                // Adapter delta event (Hermes/OpenCode emit { type: 'delta', text }).
                if (parsed.type === 'delta' && typeof parsed.text === 'string') {
                  if (parsed.text) {
                    fullContent += parsed.text;
                    options.onChunk?.(parsed.text);
                  }
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
            suggestion: i18n.t('api.serverRestartedSuggestion'),
          };
          if (attempt < maxRetries) {
            options.onStatus?.('thinking');
            await new Promise(r => setTimeout(r, 1000 * attempt));
            return doSend(attempt + 1);
          }
          // Final fallback: if we have a partial response and a `done`-like
          // event was observed, surface the partial text instead of dropping
          // it. This is the "rescue" path for the long-silence case (the
          // browser stayed connected through a multi-second gap, then the
          // stream finally closed) — the user still gets their text.
          if (fullContent && fullContent.trim().length > 0) {
            options.onDone?.(fullContent);
            return;
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
    return request(`${API_BASE}/api/health`, undefined, i18n.t('api.healthCheckFailed'));
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
    return request(`${API_BASE}/api/system/status`, undefined, i18n.t('api.failedToFetchSystemStatus'));
  },

  async execSystemCommand(command: 'update' | 'doctor'): Promise<{
    success: boolean;
    exitCode?: number;
    output?: string;
    fullOutput?: string;
    error?: string;
  }> {
    return request(`${API_BASE}/api/system/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    }, i18n.t('api.failedToExecuteCommand'));
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
  }  >> {
    return request(`${API_BASE}/api/models/providers`, undefined, i18n.t('api.failedToFetchModelProviders'));
  },

  async syncModelProviders(): Promise<{
    success: boolean;
    providers_synced?: number;
    models_synced?: number;
    errors?: string[];
    error?: string;
  }> {
    return request(`${API_BASE}/api/models/sync`, { method: 'POST' }, i18n.t('api.failedToSyncModelProviders'));
  },

  async toggleModel(modelId: number): Promise<{ success: boolean; id: number; enabled: number }> {
    return request(`${API_BASE}/api/models/models/${modelId}/toggle`, { method: 'PATCH' }, i18n.t('api.failedToToggleModel'));
  },

  async togglePin(id: string): Promise<{ success: boolean; pinned: number }> {
    return request(`${API_BASE}/api/sessions/${id}/pin`, { method: 'PATCH' }, i18n.t('api.failedToTogglePin'));
  },

  async toggleArchive(id: string): Promise<{ success: boolean; archived: number }> {
    return request(`${API_BASE}/api/sessions/${id}/archive`, { method: 'PATCH' }, i18n.t('api.failedToToggleArchive'));
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
    return request(`${API_BASE}/api/providers/available${qs}`, undefined, i18n.t('api.failedToFetchAvailableProviders'));
  },

  // --- OpenCode provider catalogue (read-only proxy to the daemon) ---

  async getOpenCodeProviders(): Promise<{
    providers: Array<{
      id: string;
      name: string;
      source: 'env' | 'config' | 'custom' | 'api' | string;
      env: string[];
      hasApiKey: boolean;
      baseUrl: string | null;
      connected: boolean;
      modelCount: number;
      defaultModel: string | null;
    }>;
    connectedCount: number;
    totalCount: number;
  }> {
    const res = await fetch(`${API_BASE}/api/opencode/providers`);
    if (!res.ok) {
      // Daemon unreachable / 5xx → surface a friendly hint for the UI.
      const err = new Error(i18n.t('api.failedToFetchOpenCodeProviders')) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
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

  getFileContentUrl(sessionId: string, fileId: number): string {
    return `/api/sessions/${sessionId}/files/${fileId}/content`;
  },

  async getFileContent(sessionId: string, fileId: number): Promise<string> {
    const res = await fetch(this.getFileContentUrl(sessionId, fileId), {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Failed to fetch file content: ${res.status}`);
    return res.text();
  },

  async getAssistants(includeArchived = false): Promise<{ assistants: Assistant[] }> {
    const data = await request(`${API_BASE}/api/assistants?include_archived=${includeArchived ? 1 : 0}`, undefined, i18n.t('api.failedToFetchAssistants'));
    return parse(AssistantListSchema, data, 'getAssistants');
  },

  async getAssistant(id: number): Promise<Assistant> {
    const data = await request(`${API_BASE}/api/assistants/${id}`, undefined, i18n.t('api.failedToFetchAssistant'));
    return parse(AssistantSchema, data, 'getAssistant');
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
        executor: input.executor ?? 'hermes',
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
    if (input.executor !== undefined) body.executor = input.executor;
    const res = await fetch(`${API_BASE}/api/assistants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToUpdateAssistant'));
    return data;
  },

  async getAvailableExecutors(): Promise<{ executors: Array<'hermes' | 'opencode-1230'> }> {
    return request(`${API_BASE}/api/system/executors`, undefined, i18n.t('api.failedToFetchAvailableExecutors'));
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

  // --- Applications ---

  async getApplications(enabledOnly = false): Promise<{ applications: Application[] }> {
    const qs = enabledOnly ? '?enabled=1' : '';
    return request(`${API_BASE}/api/applications${qs}`, undefined, i18n.t('api.failedToFetchApplications'));
  },

  async updateApplication(id: number, patch: Partial<Application>): Promise<{ application: Application }> {
    const body: Record<string, unknown> = {};
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    if (patch.sortOrder !== undefined) body.sortOrder = patch.sortOrder;
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.icon !== undefined) body.icon = patch.icon;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.config !== undefined) body.config = patch.config;
    const res = await fetch(`${API_BASE}/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToUpdateApplication'));
    return data;
  },

  // --- Global file management (Task #38) ---

  async getGlobalFiles(): Promise<{ files: GlobalFile[]; stats: FileStats }> {
    return request(`${API_BASE}/api/files`, undefined, i18n.t('api.failedToListFiles'));
  },

  async extendFile(fileId: number): Promise<{ success: boolean; expiresAt: number }> {
    const res = await fetch(`${API_BASE}/api/files/${fileId}/extend`, { method: 'PATCH' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToExtendFile'));
    return data;
  },

  async copyFile(fileId: number, targetSessionId: string): Promise<SessionFile> {
    const res = await fetch(`${API_BASE}/api/files/${fileId}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToCopyFile'));
    return data;
  },

  async deleteGlobalFile(fileId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/api/files/${fileId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || i18n.t('api.failedToDeleteFile'));
    }
  },

  // --- Cloud Connect ---

  async listCloudConnections(): Promise<{ connections: CloudConnection[] }> {
    return request(`${API_BASE}/api/cloud-connections`, undefined, i18n.t('api.failedToFetchCloudConnections'));
  },

  async createCloudConnection(payload: { label?: string; url: string; username: string; password: string }): Promise<{ connection: CloudConnection }> {
    const res = await fetch(`${API_BASE}/api/cloud-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToCreateCloudConnection'));
    return data;
  },

  async testCloudConnection(id: number): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/api/cloud-connections/${id}/test`, { method: 'POST' });
    if (!res.ok) throw new Error(i18n.t('api.failedToTestConnection'));
    return res.json();
  },

  async updateCloudConnection(id: number, patch: { label?: string }): Promise<{ connection: CloudConnection }> {
    const res = await fetch(`${API_BASE}/api/cloud-connections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToUpdateConnection'));
    return data;
  },

  async deleteCloudConnection(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/api/cloud-connections/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error(i18n.t('api.failedToDeleteConnection'));
  },

  async listCloudEntries(connectionId: number, path: string): Promise<{ entries: CloudEntry[] }> {
    const res = await fetch(`${API_BASE}/api/cloud-connections/${connectionId}/list?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(i18n.t('api.failedToListCloudEntries'));
    return res.json();
  },

  async issueCloudLinks(connectionId: number, paths: string[], ttlSeconds?: number): Promise<{ links: IssuedLink[]; expiresAt: number }> {
    const res = await fetch(`${API_BASE}/api/cloud-connections/${connectionId}/issue-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, ttlSeconds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToIssueLinks'));
    return data;
  },

  // --- Executor configuration ---

  async getExecutorConfig(slug: 'hermes-agent' | 'opencode-1230'): Promise<
    | { slug: 'hermes-agent'; pythonPath: string; apiUrl: string; hasApiKey: boolean }
    | { slug: 'opencode-1230'; url: string; username: string; hasPassword: boolean }
  > {
    const res = await fetch(`${API_BASE}/api/system/executor-config/${slug}`);
    if (!res.ok) throw new Error(i18n.t('api.failedToFetchExecutorConfig'));
    return res.json();
  },

  async saveExecutorConfig(
    slug: 'hermes-agent' | 'opencode-1230',
    payload:
      | { pythonPath: string; apiUrl: string; apiKey?: string }
      | { url: string; username: string; password?: string }
  ): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/api/system/executor-config/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToSaveExecutorConfig'));
    return data;
  },

  async fetchCloudFilesToSession(
    connectionId: number,
    paths: string[],
    sessionId: string,
  ): Promise<{ files: SessionFile[]; errors: { path: string; error: string }[] }> {
    const res = await fetch(`${API_BASE}/api/cloud-connections/${connectionId}/fetch-to-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || i18n.t('api.failedToFetchFilesFromCloud'));
    return data;
  },
};
