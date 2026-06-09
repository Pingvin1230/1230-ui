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
      // On touch/coarse-pointer devices (phones/tablets including foldables)
      // default to closed so the sidebar does not overlay the content.
      // On desktop (mouse) open it when the viewport is wide enough.
      isOpen: typeof window !== 'undefined'
        && window.innerWidth >= 768
        && !window.matchMedia('(pointer: coarse) and (hover: none)').matches,
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
      setOpen: (value) => set({ isOpen: value }),
    }),
    { name: 'hermes-sidebar' }
  )
);
