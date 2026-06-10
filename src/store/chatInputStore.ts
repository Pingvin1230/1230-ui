import type React from 'react';
import { create } from 'zustand';
import type { SessionFile } from '../lib/api';
import type { ChatInputHandle } from '../components/ChatInput';

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
}

export const useChatInputStore = create<ChatInputState>((set) => ({
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
}));
