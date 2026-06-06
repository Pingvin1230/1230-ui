import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  setOpen: (value: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isOpen: typeof window !== 'undefined' && window.innerWidth >= 768,
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setOpen: (value) => set({ isOpen: value }),
    }),
    { name: 'hermes-sidebar' }
  )
);
