import { create } from 'zustand';

const APPS_PANE_KEY = 'hermes-apps-pane-visible';

interface AppsPaneState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
}

export const useAppsPaneStore = create<AppsPaneState>((set) => ({
  visible: (() => {
    try {
      const stored = localStorage.getItem(APPS_PANE_KEY);
      return stored !== null ? stored === 'true' : false;
    } catch {
      return false;
    }
  })(),

  setVisible: (visible: boolean) => {
    try {
      localStorage.setItem(APPS_PANE_KEY, String(visible));
    } catch {
      // ignore
    }
    set({ visible });
  },

  toggleVisible: () => {
    set((state) => {
      const next = !state.visible;
      try {
        localStorage.setItem(APPS_PANE_KEY, String(next));
      } catch {
        // ignore
      }
      return { visible: next };
    });
  },
}));
