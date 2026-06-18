import type { Message, AgentFile } from '../types/api';
import type { LiveToolCall } from '../store/chatInputStore';

export interface ChatBlock {
  user: Message | null;
  tools: Message[];
  assistant: Message | null;
}

// Splits a flat message history into turn-blocks. Each block starts with a
// user message (or the implicit first turn) and collects its tool calls +
// final assistant reply. Mirrors the in-JSX grouping that used to live in
// ChatPage so the rendered output is identical.
export function buildMessageBlocks(messages: Message[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let cur: ChatBlock = { user: null, tools: [], assistant: null };
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (cur.user || cur.tools.length || cur.assistant) blocks.push(cur);
      cur = { user: msg, tools: [], assistant: null };
    } else if (msg.role === 'tool') {
      cur.tools.push(msg);
    } else if (msg.role === 'assistant') {
      if (cur.assistant) {
        // intermediate empty assistant — skip
        if (!cur.assistant.content?.trim() && !cur.assistant.agentFiles?.length) {
          // discard
        } else {
          blocks.push(cur);
          cur = { user: null, tools: [], assistant: msg };
          continue;
        }
      }
      cur.assistant = msg;
    }
  }
  blocks.push(cur);
  return blocks;
}

export type RenderItem =
  | { kind: 'empty' }
  | { kind: 'user'; message: Message }
  | { kind: 'toolGroup'; tools: Message[] }
  | { kind: 'assistant'; message: Message }
  | { kind: 'pendingUser'; content: string }
  | { kind: 'activeTools'; calls: LiveToolCall[] }
  | { kind: 'completedTools'; calls: LiveToolCall[] }
  | { kind: 'streaming'; content: string; sending: boolean; agentFiles: AgentFile[] }
  | { kind: 'waiting' };

export interface MessageOverlay {
  showEmpty: boolean;
  showPendingUserBubble: boolean;
  pendingUserContent: string | null;
  liveActiveToolCalls: LiveToolCall[];
  liveCompletedToolCalls: LiveToolCall[];
  showStreamingBubble: boolean;
  streamingContent: string;
  sending: boolean;
  liveAgentFiles: AgentFile[];
  isWaiting: boolean;
}

// Builds the flat, virtualizable render-item list. The order is exactly the
// order ChatPage used to emit JSX: committed blocks (user → tool-group →
// assistant) followed by the in-flight overlay (pending user, active tools,
// completed tools, streaming bubble, waiting dots).
export function buildRenderItems(messages: Message[], overlay: MessageOverlay): RenderItem[] {
  const items: RenderItem[] = [];
  if (overlay.showEmpty) items.push({ kind: 'empty' });

  for (const block of buildMessageBlocks(messages)) {
    if (block.user) items.push({ kind: 'user', message: block.user });
    if (block.tools.length > 0) items.push({ kind: 'toolGroup', tools: block.tools });
    if (block.assistant && (block.assistant.content?.trim() || (block.assistant.agentFiles?.length ?? 0) > 0)) {
      items.push({ kind: 'assistant', message: block.assistant });
    }
  }

  if (overlay.showPendingUserBubble && overlay.pendingUserContent) {
    items.push({ kind: 'pendingUser', content: overlay.pendingUserContent });
  }
  if (overlay.liveActiveToolCalls.length > 0) {
    items.push({ kind: 'activeTools', calls: overlay.liveActiveToolCalls });
  }
  if (overlay.liveCompletedToolCalls.length > 0) {
    items.push({ kind: 'completedTools', calls: overlay.liveCompletedToolCalls });
  }
  if (overlay.showStreamingBubble) {
    items.push({
      kind: 'streaming',
      content: overlay.streamingContent,
      sending: overlay.sending,
      agentFiles: overlay.liveAgentFiles,
    });
  }
  if (overlay.isWaiting) items.push({ kind: 'waiting' });

  return items;
}

export function renderItemsKey(item: RenderItem): string {
  switch (item.kind) {
    case 'empty':
      return 'empty-state';
    case 'user':
      return `user-${item.message.id}`;
    case 'toolGroup':
      return `tool-group-${item.tools[0]?.id}`;
    case 'assistant':
      return `assistant-${item.message.id}`;
    case 'pendingUser':
      return 'pending-user';
    case 'activeTools':
      return 'active-tools';
    case 'completedTools':
      return 'completed-tools';
    case 'streaming':
      return 'streaming';
    case 'waiting':
      return 'waiting';
  }
}

// C8: robust optimistic-bubble dedup.
//
// The committed user content carries the attached-file prefix that was sent
// to the LLM (one or more `[Attached file: <path>]` lines followed by a blank
// line), while `pendingUserContent` is the typed text only. We suppress the
// optimistic bubble once the LAST committed user message represents this turn.
//
// Matching is exact (trimmed) — never a substring/suffix check — so a
// different legitimate message whose text happens to be a suffix of a prior
// turn is no longer eaten. We accept either a direct exact match (no files
// attached) or a match after stripping the known attached-file prefix.
export function stripAttachedFilePrefix(content: string): string {
  return content.replace(/^(?:\[Attached file:[^\n]*\n)+\n/, '');
}

export function committedUserMatchesPending(
  committedContent: string | null | undefined,
  pending: string,
): boolean {
  if (!committedContent) return false;
  const committedTrimmed = committedContent.trim();
  const pendingTrimmed = pending.trim();
  if (committedTrimmed === pendingTrimmed) return true;
  return stripAttachedFilePrefix(committedContent).trim() === pendingTrimmed;
}
