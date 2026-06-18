import type React from 'react';
import { create } from 'zustand';
import { api, type SessionFile, type ChatMessage, type ChatError } from '../lib/api';
import type { AgentFile } from '../types/api';
import type { ChatInputHandle } from '../components/ChatInput';

// Module-level (non-reactive) registry of in-flight stream controllers, keyed
// by sessionId. Lives outside the store so navigating between pages / sessions
// never aborts a background stream — the controller survives as long as the
// turn is running. Only an explicit Stop (stopStream) or the turn completing
// (onDone/onError) removes the entry.
const streamControllers = new Map<string, AbortController>();

export interface NavSessionMeta {
  title: string | null;
  model: string | null;
  assistantName: string | null;
  assistantIcon: string | null;
}

// Callback registered by ChatPage so Navbar can trigger title save / delete
export interface SessionActions {
  onStartEditTitle: () => void;
  onSaveTitle: (title: string) => Promise<void>;
  onDeleteSession: () => void;
  onStop: () => void;
}

// Generic page context — used by non-chat pages to inject title + actions into Navbar
export interface NavPageAction {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}

export interface NavPageContext {
  title: string;
  actions: NavPageAction[];
}

// Live state for an in-flight chat stream. Persisted in the store (NOT in
// React useState) so it survives the ChatPage unmount that happens when
// the user navigates away while the agent is still responding. On return,
// ChatPage hydrates from this slice and starts a short recovery-poll that
// watches the server-side message persistence for the final assistant
// reply. See docs/analysis/chat-focus-update.md §2 for the rationale.
export type LiveMessageStatus =
  | 'idle'        // no stream in progress for this session
  | 'streaming'   // SSE deltas flowing, ChatPage is the source of truth
  | 'recovering'  // ChatPage unmounted mid-stream; recovery-poll waiting for server-side persist
  | 'error';      // stream ended with an error; final state visible in the chat

export interface LiveToolCall {
  id: string;
  toolName: string;
  label?: string;
}

export interface LiveMessageState {
  status: LiveMessageStatus;
  streamingContent: string;
  activeToolCalls: LiveToolCall[];
  completedToolCalls: LiveToolCall[];
  error: ChatError | null;
  startedAt: number | null;
  // The pre-allocated assistant message id (Date.now()+1). Kept so any
  // subscriber can correlate the in-flight turn with a persisted row.
  pendingAssistantId: number | null;
  // The optimistic user message text for the in-flight turn (typed text,
  // WITHOUT the attached-file prefix). Lets the user bubble survive
  // navigation away and back while the stream is still running.
  pendingUserContent: string | null;
  // Agent-generated download cards accumulated during the in-flight turn
  // (arrive via the `agent_files` SSE event, often AFTER [DONE]).
  agentFiles: AgentFile[];
}

const EMPTY_LIVE: LiveMessageState = {
  status: 'idle',
  streamingContent: '',
  activeToolCalls: [],
  completedToolCalls: [],
  error: null,
  startedAt: null,
  pendingAssistantId: null,
  pendingUserContent: null,
  agentFiles: [],
};

// ── UI-trigger actions (D3) ───────────────────────────────────────────
// Replaces the old `window.dispatchEvent(new CustomEvent('chat:*'))` bus
// that Layout / ChatPage / external panes used to drive ChatInput and
// ChatPage across React subtree boundaries. Each request is appended to a
// FIFO queue stamped with a monotonically increasing nonce; the consumer
// (ChatInput for input actions, ChatPage for chat actions) drains items
// newer than the last nonce it processed. The nonce gives exact
// "fires-once-per-request" semantics (safe under React StrictMode
// double-invoke) and preserves ordering + multiplicity when several
// requests are issued in the same tick (e.g. Cloud Connect inserting a
// batch of files via a sync forEach loop).

let chatActionNonce = 0;
const nextNonce = () => (chatActionNonce += 1);

export type PendingInputAction =
  | { type: 'prefill'; text: string; nonce: number }
  | { type: 'addFile'; file: SessionFile; nonce: number }
  | { type: 'insertText'; text: string; nonce: number };

export type PendingChatAction =
  | { type: 'send'; content: string; nonce: number }
  | { type: 'stop'; nonce: number };

interface ChatInputState {
  // Active chat session id — when set, ChatInput is visible in Layout
  activeSessionId: string | null;
  sending: boolean;
  hasAttachedFiles: boolean;
  isSessionBlocked: boolean;
  // Bridge so Layout can read attached files / clear input from outside
  // ChatPage, while keeping ChatInput as the single owner of its state.
  handle: ChatInputHandle | null;
  sessionFiles: SessionFile[];
  // Measured height of the ChatInput (px) — kept for potential future use
  // (e.g. floating overlays), not currently consumed after the Layout
  // refactor that made ChatInput a flex-shrink-0 sibling of MobileNav.
  inputHeight: number;
  // Metadata for Navbar display (session title, model, assistant)
  navSessionMeta: NavSessionMeta | null;
  // Actions registered by ChatPage for Navbar to invoke
  sessionActions: SessionActions | null;
  // Generic page context for non-chat pages
  navPageContext: NavPageContext | null;
  // Per-session live stream state — see LiveMessageState above.
  liveMessages: Record<string, LiveMessageState>;
  // D3: pending UI-trigger request queues (replacements for the chat:* bus).
  pendingInputActions: PendingInputAction[];
  pendingChatActions: PendingChatAction[];
  setActiveSession: (id: string | null) => void;
  setSending: (sending: boolean) => void;
  setHasAttachedFiles: (v: boolean) => void;
  setSessionBlocked: (v: boolean) => void;
  setHandle: (h: ChatInputHandle | null) => void;
  setSessionFiles: (files: SessionFile[]) => void;
  setInputHeight: (h: number) => void;
  setNavSessionMeta: (meta: NavSessionMeta | null) => void;
  setSessionActions: (actions: SessionActions | null) => void;
  setNavPageContext: (ctx: NavPageContext | null) => void;
  // Live-state mutators (operate on liveMessages[sessionId])
  setLiveStatus: (id: string, status: LiveMessageStatus) => void;
  appendLiveChunk: (id: string, chunk: string) => void;
  setLiveStreamingContent: (id: string, content: string) => void;
  setLiveActiveToolCalls: (id: string, calls: LiveToolCall[]) => void;
  setLiveCompletedToolCalls: (id: string, calls: LiveToolCall[]) => void;
  setLiveError: (id: string, error: LiveMessageState['error']) => void;
  setLivePendingAssistantId: (id: string, assistantId: number | null) => void;
  setLiveStartedAt: (id: string, ts: number | null) => void;
  initLive: (id: string) => void;
  clearLive: (id: string) => void;
  // Stream ownership (B11): the store owns the fetch + in-flight state so
  // navigation never aborts a running turn. startStream resets the live
  // slice, kicks off api.sendMessage (writing every callback into the
  // store), and registers the AbortController in the module-level
  // streamControllers map.
  startStream: (sessionId: string, opts: {
    model: string;
    history: ChatMessage[];
    content: string;
    attachedFilePaths?: string[];
  }) => void;
  stopStream: (sessionId: string) => void;
  clearStream: (sessionId: string) => void;
  // D3: UI-trigger request setters (replace chat:* window events).
  prefillInput: (text: string) => void;
  addFileToInput: (file: SessionFile) => void;
  insertTextToInput: (text: string) => void;
  requestSend: (content: string) => void;
  requestStop: () => void;
}

export const useChatInputStore = create<ChatInputState>((set, get) => ({
  activeSessionId: null,
  sending: false,
  hasAttachedFiles: false,
  isSessionBlocked: false,
  handle: null,
  sessionFiles: [],
  inputHeight: 0,
  navSessionMeta: null,
  sessionActions: null,
  navPageContext: null,
  liveMessages: {},
  pendingInputActions: [],
  pendingChatActions: [],
  setActiveSession: (id) => set({ activeSessionId: id }),
  setSending: (sending) => set({ sending }),
  setHasAttachedFiles: (v) => set({ hasAttachedFiles: v }),
  setSessionBlocked: (v) => set({ isSessionBlocked: v }),
  setHandle: (h) => set({ handle: h }),
  setSessionFiles: (files) => set({ sessionFiles: files }),
  setInputHeight: (h) => set({ inputHeight: h }),
  setNavSessionMeta: (meta) => set({ navSessionMeta: meta }),
  setSessionActions: (actions) => set({ sessionActions: actions }),
  setNavPageContext: (ctx) => set({ navPageContext: ctx }),

  setLiveStatus: (id, status) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      if (cur.status === status) return state;
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...cur, status } },
      };
    }),

  appendLiveChunk: (id, chunk) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      if (!chunk) return state;
      return {
        liveMessages: {
          ...state.liveMessages,
          [id]: { ...cur, streamingContent: cur.streamingContent + chunk },
        },
      };
    }),

  setLiveStreamingContent: (id, content) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...cur, streamingContent: content } },
      };
    }),

  setLiveActiveToolCalls: (id, calls) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...cur, activeToolCalls: calls } },
      };
    }),

  setLiveCompletedToolCalls: (id, calls) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...cur, completedToolCalls: calls } },
      };
    }),

  setLiveError: (id, error) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...cur, error } },
      };
    }),

  setLivePendingAssistantId: (id, assistantId) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...cur, pendingAssistantId: assistantId } },
      };
    }),

  setLiveStartedAt: (id, ts) =>
    set((state) => {
      const cur = state.liveMessages[id] ?? EMPTY_LIVE;
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...cur, startedAt: ts } },
      };
    }),

  initLive: (id) =>
    set((state) => {
      if (state.liveMessages[id]) {
        // Already initialised — leave existing state in place so we don't
        // wipe a stream that ChatPage is actively writing to.
        return state;
      }
      return {
        liveMessages: { ...state.liveMessages, [id]: { ...EMPTY_LIVE, status: 'idle' } },
      };
    }),

  clearLive: (id) =>
    set((state) => {
      if (!state.liveMessages[id]) return state;
      const next = { ...state.liveMessages };
      delete next[id];
      return { liveMessages: next };
    }),

  // ── Stream ownership (B11) ───────────────────────────────────────────
  // The streaming half of the old ChatPage.doSend, moved here so the fetch
  // is owned by the store (app-root) and survives ChatPage unmount/session
  // switch. Every SSE callback writes into liveMessages[sessionId] via the
  // mutators above; no component state is touched.
  startStream: (sessionId, opts) => {
    // Abort any lingering stream for this session (defensive — the sending
    // guard in the UI already prevents concurrent sends).
    streamControllers.get(sessionId)?.abort();

    // Build the full user content (with attached-file prefix) for the LLM,
    // but keep opts.content (typed text) as pendingUserContent so the user
    // bubble shows what the user actually typed.
    const fileLines = (opts.attachedFilePaths ?? [])
      .filter(Boolean)
      .map((p) => `[Attached file: ${p}]`)
      .join('\n');
    const fullContent = fileLines ? `${fileLines}\n\n${opts.content}` : opts.content;

    const assistantId = Date.now() + 1;

    // Reset the live slice for this turn (overwrite, not merge).
    set((state) => ({
      liveMessages: {
        ...state.liveMessages,
        [sessionId]: {
          ...EMPTY_LIVE,
          status: 'streaming',
          startedAt: Date.now(),
          pendingAssistantId: assistantId,
          pendingUserContent: opts.content,
        },
      },
    }));

    const requestMessages: ChatMessage[] = [
      ...opts.history,
      { role: 'user', content: fullContent },
    ];

    const controller = api.sendMessage(requestMessages, {
      sessionId,
      model: opts.model,
      maxRetries: 0,
      onChunk: (chunk) => {
        get().appendLiveChunk(sessionId, chunk);
      },
      onToolCallStart: (toolId, toolName, label) => {
        const cur = get().liveMessages[sessionId];
        if (!cur) return;
        get().setLiveActiveToolCalls(sessionId, [
          ...cur.activeToolCalls,
          { id: toolId, toolName, label },
        ]);
      },
      onToolCallEnd: (toolId) => {
        const cur = get().liveMessages[sessionId];
        if (!cur) return;
        const moved = cur.activeToolCalls.find((c) => c.id === toolId);
        get().setLiveActiveToolCalls(
          sessionId,
          cur.activeToolCalls.filter((c) => c.id !== toolId),
        );
        if (moved) {
          get().setLiveCompletedToolCalls(sessionId, [...cur.completedToolCalls, moved]);
        }
      },
      onAgentFiles: (files) => {
        if (!files || files.length === 0) return;
        set((state) => {
          const live = state.liveMessages[sessionId];
          if (!live) return state;
          return {
            liveMessages: {
              ...state.liveMessages,
              [sessionId]: { ...live, agentFiles: [...live.agentFiles, ...files] },
            },
          };
        });
      },
      onDone: (fullResponse) => {
        streamControllers.delete(sessionId);
        // Keep the finalized content visible (status 'idle') until the
        // committed messages refresh confirms the server has persisted the
        // turn — this avoids a flicker where the streaming text would
        // vanish before the committed row appears. The subscriber clears
        // the slice once the committed assistant message matches.
        set((state) => {
          const cur = state.liveMessages[sessionId];
          if (!cur) return state;
          return {
            liveMessages: {
              ...state.liveMessages,
              [sessionId]: { ...cur, status: 'idle', streamingContent: fullResponse },
            },
          };
        });
      },
      onError: (chatError) => {
        streamControllers.delete(sessionId);
        set((state) => {
          const cur = state.liveMessages[sessionId];
          if (!cur) return state;
          return {
            liveMessages: {
              ...state.liveMessages,
              [sessionId]: {
                ...cur,
                status: 'error',
                error: chatError,
                // Drop the partial in-flight overlay (matches the previous
                // behaviour of removing the optimistic user + assistant
                // placeholders on error) but keep the error for display.
                streamingContent: '',
                pendingUserContent: null,
                activeToolCalls: [],
                completedToolCalls: [],
                agentFiles: [],
              },
            },
          };
        });
        if (chatError.type === 'content_moderation' && !chatError.retryable) {
          get().setSessionBlocked(true);
          try {
            sessionStorage.setItem(`blocked:${sessionId}`, 'true');
          } catch {
            // sessionStorage may be unavailable (private mode) — non-critical.
          }
        }
      },
    });

    streamControllers.set(sessionId, controller);
  },

  stopStream: (sessionId) => {
    streamControllers.get(sessionId)?.abort();
    streamControllers.delete(sessionId);
    get().clearLive(sessionId);
  },

  clearStream: (sessionId) => {
    get().clearLive(sessionId);
  },

  // ── D3: chat:* event-bus replacements ───────────────────────────────
  // Each setter appends a nonce-stamped request to the relevant queue.
  // Consumers drain the queue in order and trim processed entries, so
  // ordering, multiplicity (e.g. batched file inserts) and dedup are all
  // preserved exactly vs. the old synchronous window-event dispatch.
  prefillInput: (text) =>
    set((state) => ({
      pendingInputActions: [
        ...state.pendingInputActions,
        { type: 'prefill', text, nonce: nextNonce() },
      ],
    })),
  addFileToInput: (file) =>
    set((state) => ({
      pendingInputActions: [
        ...state.pendingInputActions,
        { type: 'addFile', file, nonce: nextNonce() },
      ],
    })),
  insertTextToInput: (text) =>
    set((state) => ({
      pendingInputActions: [
        ...state.pendingInputActions,
        { type: 'insertText', text, nonce: nextNonce() },
      ],
    })),
  requestSend: (content) =>
    set((state) => ({
      pendingChatActions: [
        ...state.pendingChatActions,
        { type: 'send', content, nonce: nextNonce() },
      ],
    })),
  requestStop: () =>
    set((state) => ({
      pendingChatActions: [
        ...state.pendingChatActions,
        { type: 'stop', nonce: nextNonce() },
      ],
    })),
}));
