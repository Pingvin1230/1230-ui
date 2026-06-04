import { create } from 'zustand';
import type { Session, Message } from '../types/session';

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  messages: Message[];
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
}));