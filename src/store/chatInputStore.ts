import { create } from 'zustand';
import type { SessionFile } from '../lib/api';
import type { ChatInputHandle } from '../components/ChatInput';

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
  setActiveSession: (id: string | null) => void;
  setSending: (sending: boolean) => void;
  setHasAttachedFiles: (v: boolean) => void;
  setSessionBlocked: (v: boolean) => void;
  setHandle: (h: ChatInputHandle | null) => void;
  setSessionFiles: (files: SessionFile[]) => void;
  setInputHeight: (h: number) => void;
}

export const useChatInputStore = create<ChatInputState>((set) => ({
  activeSessionId: null,
  sending: false,
  hasAttachedFiles: false,
  isSessionBlocked: false,
  handle: null,
  sessionFiles: [],
  inputHeight: 0,
  setActiveSession: (id) => set({ activeSessionId: id }),
  setSending: (sending) => set({ sending }),
  setHasAttachedFiles: (v) => set({ hasAttachedFiles: v }),
  setSessionBlocked: (v) => set({ isSessionBlocked: v }),
  setHandle: (h) => set({ handle: h }),
  setSessionFiles: (files) => set({ sessionFiles: files }),
  setInputHeight: (h) => set({ inputHeight: h }),
}));
