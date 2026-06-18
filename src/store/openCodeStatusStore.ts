import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OpenCodeStatusState = 'connected' | 'disconnected' | 'unknown';

interface OpenCodeStatusData {
  status: OpenCodeStatusState;
  lastChecked: number;
}

interface OpenCodeStatusStore extends OpenCodeStatusData {
  isLoading: boolean;
  setData: (data: Partial<OpenCodeStatusData>) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialData: OpenCodeStatusData = {
  status: 'unknown',
  lastChecked: 0,
};

export const useOpenCodeStatusStore = create<OpenCodeStatusStore>()(
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
      name: 'opencode-status',
      partialize: (state) => ({
        status: state.status,
        lastChecked: state.lastChecked,
      }),
    }
  )
);
