import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type HermesStatusState = 'connected' | 'disconnected' | 'unknown';

interface HermesStatusData {
  status: HermesStatusState;
  version: string | null;
  latestVersion: string | null;
  updateAvailable: number | null;
  lastChecked: number;
}

interface HermesStatusStore extends HermesStatusData {
  isLoading: boolean;
  setData: (data: Partial<HermesStatusData>) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialData: HermesStatusData = {
  status: 'unknown',
  version: null,
  latestVersion: null,
  updateAvailable: null,
  lastChecked: 0,
};

export const useHermesStatusStore = create<HermesStatusStore>()(
  persist(
    (set) => ({
      ...initialData,
      isLoading: false,
      setData: (data) =>
        set((state) => ({
          ...state,
          ...data,
        })),
      setLoading: (loading) => set({ isLoading: loading }),
      reset: () => set({ ...initialData, isLoading: false }),
    }),
    {
      name: 'hermes-status',
      partialize: (state) => ({
        status: state.status,
        version: state.version,
        latestVersion: state.latestVersion,
        updateAvailable: state.updateAvailable,
        lastChecked: state.lastChecked,
      }),
    }
  )
);
