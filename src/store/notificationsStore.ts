import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationsState {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  toggle: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (value) => set({ enabled: value }),
      toggle: () => set((state) => ({ enabled: !state.enabled })),
    }),
    { name: 'hermes-notifications' }
  )
);
