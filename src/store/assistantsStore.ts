import { create } from 'zustand';
import type { Assistant } from '../types/api';
import { api } from '../lib/api';

interface AssistantsState {
  assistants: Assistant[];
  loading: boolean;
  error: string | null;
  fetch: (includeArchived?: boolean) => Promise<void>;
  upsert: (assistant: Assistant) => void;
  remove: (id: number) => void;
  reset: () => void;
}

export const useAssistantsStore = create<AssistantsState>((set) => ({
  assistants: [],
  loading: false,
  error: null,

  fetch: async (includeArchived = false) => {
    set({ loading: true, error: null });
    try {
      const data = await api.getAssistants(includeArchived);
      set({ assistants: data.assistants, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  upsert: (assistant) =>
    set((state) => {
      const idx = state.assistants.findIndex((a) => a.id === assistant.id);
      if (idx === -1) return { assistants: [...state.assistants, assistant] };
      const next = state.assistants.slice();
      next[idx] = assistant;
      return { assistants: next };
    }),

  remove: (id) =>
    set((state) => ({ assistants: state.assistants.filter((a) => a.id !== id) })),

  reset: () => set({ assistants: [], loading: false, error: null }),
}));
