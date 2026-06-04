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
}

export interface Message {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  toolName?: string;
  timestamp: number;
  tokenCount?: number;
}