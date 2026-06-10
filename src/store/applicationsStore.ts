import { create } from 'zustand';
import type { Application } from '../types/api';
import { api } from '../lib/api';

const SELECTED_KEY_STORAGE = 'hermes-selected-application';

interface ApplicationsState {
  applications: Application[];
  selectedKey: string | null;
  loading: boolean;
  error: string | null;

  fetchApplications: (enabledOnly?: boolean) => Promise<void>;
  selectApplication: (key: string) => void;
  updateApplication: (id: number, patch: Partial<Application>) => Promise<void>;
}

export const useApplicationsStore = create<ApplicationsState>((set, get) => ({
  applications: [],
  selectedKey: (() => {
    try {
      return localStorage.getItem(SELECTED_KEY_STORAGE);
    } catch {
      return null;
    }
  })(),
  loading: false,
  error: null,

  fetchApplications: async (enabledOnly = false) => {
    set({ loading: true, error: null });
    try {
      const data = await api.getApplications(enabledOnly);
      set({ applications: data.applications, loading: false });

      // Auto-select first enabled application if nothing selected or selected key is not in list
      const { selectedKey } = get();
      const enabledApps = data.applications.filter((a) => a.enabled);
      if (enabledApps.length > 0) {
        const hasSelected = enabledApps.some((a) => a.key === selectedKey);
        if (!hasSelected) {
          get().selectApplication(enabledApps[0].key);
        }
      } else {
        set({ selectedKey: null });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  selectApplication: (key: string) => {
    try {
      localStorage.setItem(SELECTED_KEY_STORAGE, key);
    } catch {
      // ignore
    }
    set({ selectedKey: key });
  },

  updateApplication: async (id: number, patch: Partial<Application>) => {
    try {
      const result = await api.updateApplication(id, patch);
      set((state) => {
        const idx = state.applications.findIndex((a) => a.id === id);
        if (idx === -1) return {};
        const next = state.applications.slice();
        next[idx] = result.application;
        return { applications: next };
      });
    } catch (err) {
      console.error('Failed to update application:', err);
    }
  },
}));
