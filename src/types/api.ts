export interface Assistant {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  modelId: string | null;
  style: string | null;
  depth: string | null;
  systemPrompt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  assistant?: Assistant | null;
  fileCount?: number;
}

export interface ToolCall {
  id?: string;
  type?: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface AgentFile {
  id: number;
  filename: string;
  size: number;
  mimeType: string;
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
  agentFiles?: AgentFile[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface Application {
  id: number;
  key: string;
  name: string;
  icon: string | null;
  description: string | null;
  enabled: number;
  sortOrder: number;
  desktopOnly: number;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}