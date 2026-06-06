import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SessionsSortMode = 'created' | 'lastMessage';

interface SessionsSortState {
  sortMode: SessionsSortMode;
  setSortMode: (value: SessionsSortMode) => void;
}

export const useSessionsSortStore = create<SessionsSortState>()(
  persist(
    (set) => ({
      sortMode: 'created',
      setSortMode: (value) => set({ sortMode: value }),
    }),
    { name: 'hermes-sessions-sort' }
  )
);
