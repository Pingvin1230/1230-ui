import { create } from 'zustand';
import { api } from '../lib/api';
import type { CloudConnection, CloudEntry } from '../types/api';

const DISCONNECTED_KEY = 'cloud-connect:disconnected';

function loadDisconnectedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(DISCONNECTED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveDisconnectedIds(ids: Set<number>): void {
  try {
    localStorage.setItem(DISCONNECTED_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

interface CloudConnectState {
  connections: CloudConnection[];
  selectedConnectionId: number | null;
  // disconnected = user manually disconnected (hide file browser)
  disconnectedIds: Set<number>;
  currentPath: string;
  entries: CloudEntry[];
  selectedPaths: string[];
  loading: boolean;
  error: string | null;
  showAddForm: boolean;

  fetchConnections: () => Promise<void>;
  selectConnection: (id: number) => Promise<void>;
  disconnectConnection: (id: number) => void;
  reconnectConnection: (id: number) => Promise<void>;
  navigate: (path: string) => Promise<void>;
  toggleSelect: (path: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setShowAddForm: (show: boolean) => void;
  reset: () => void;
}

export const useCloudConnectStore = create<CloudConnectState>((set, get) => ({
  connections: [],
  selectedConnectionId: null,
  disconnectedIds: loadDisconnectedIds(),
  currentPath: '/',
  entries: [],
  selectedPaths: [],
  loading: false,
  error: null,
  showAddForm: false,

  fetchConnections: async () => {
    try {
      const data = await api.listCloudConnections();
      set({ connections: data.connections });
      // Auto-select on first load only (no connection selected yet)
      if (!get().selectedConnectionId && data.connections.length > 0) {
        const { disconnectedIds } = get();
        // Prefer first ok+connected; fall back to first disconnected so the
        // header always shows something even if everything is disconnected
        const firstOk = data.connections.find(
          (c) => c.status === 'ok' && !disconnectedIds.has(c.id)
        );
        if (firstOk) {
          get().selectConnection(firstOk.id);
        } else {
          // All disconnected — just set selectedConnectionId so the header shows
          set({ selectedConnectionId: data.connections[0].id });
        }
      }
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  selectConnection: async (id: number) => {
    set({ selectedConnectionId: id, currentPath: '/', entries: [], selectedPaths: [], loading: true, error: null });
    try {
      const data = await api.listCloudEntries(id, '/');
      set({ entries: data.entries, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  disconnectConnection: (id: number) => {
    const { disconnectedIds } = get();
    const next = new Set(disconnectedIds);
    next.add(id);
    saveDisconnectedIds(next);
    // Keep selectedConnectionId pointing to this connection so the header
    // still shows its name and the Connect button. Just clear the file listing.
    set({ disconnectedIds: next, entries: [], currentPath: '/' });
  },

  reconnectConnection: async (id: number) => {
    const { disconnectedIds } = get();
    const next = new Set(disconnectedIds);
    next.delete(id);
    saveDisconnectedIds(next);
    set({ disconnectedIds: next });
    await get().selectConnection(id);
  },

  navigate: async (path: string) => {
    const { selectedConnectionId } = get();
    if (!selectedConnectionId) return;
    set({ currentPath: path, selectedPaths: [], loading: true, error: null });
    try {
      const data = await api.listCloudEntries(selectedConnectionId, path);
      set({ entries: data.entries, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  toggleSelect: (path: string) => {
    const { selectedPaths } = get();
    const idx = selectedPaths.indexOf(path);
    if (idx >= 0) {
      set({ selectedPaths: selectedPaths.filter((_, i) => i !== idx) });
    } else {
      set({ selectedPaths: [...selectedPaths, path] });
    }
  },

  selectAll: () => {
    const { entries } = get();
    set({ selectedPaths: entries.filter((e) => !e.isDirectory).map((e) => e.path) });
  },

  clearSelection: () => {
    set({ selectedPaths: [] });
  },

  setShowAddForm: (show: boolean) => {
    set({ showAddForm: show });
  },

  reset: () => {
    const empty = new Set<number>();
    saveDisconnectedIds(empty);
    set({ selectedConnectionId: null, disconnectedIds: empty, currentPath: '/', entries: [], selectedPaths: [], error: null, showAddForm: false });
  },
}));
