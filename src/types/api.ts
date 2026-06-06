export interface Session {
  id: string;
  title: string | null;
  source: string;
  model: string | null;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  preview?: string;
  lastMessageAt?: number | null;
  pinned?: number;
  archived?: number;
}

export interface ToolCall {
  id?: string;
  type?: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  toolName?: string;
  timestamp: number;
  tokenCount?: number;
  latencyMs?: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}