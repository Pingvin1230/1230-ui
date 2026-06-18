import { create } from 'zustand';

export type ExecutorSlug = 'hermes' | 'opencode-1230';
export type WorkspaceTab = 'sessions' | ExecutorSlug;

export const WORKSPACE_EXECUTORS: ExecutorSlug[] = ['hermes', 'opencode-1230'];

export const EXECUTOR_LABEL: Record<ExecutorSlug, string> = {
  hermes: 'Hermes',
  'opencode-1230': 'OpenCode',
};

const ACTIVE_TAB_KEY = '1230-workspace-active-tab';
const ACTIVE_SESSION_PREFIX = '1230-workspace-session-';

function loadActiveTab(): WorkspaceTab {
  try {
    const v = localStorage.getItem(ACTIVE_TAB_KEY);
    if (v === 'sessions' || v === 'hermes' || v === 'opencode-1230') return v;
  } catch {
    // ignore
  }
  return 'sessions';
}

function loadActiveSession(executor: ExecutorSlug): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_PREFIX + executor);
  } catch {
    return null;
  }
}

interface WorkspaceState {
  activeTab: WorkspaceTab;
  activeSessionByExecutor: Record<ExecutorSlug, string | null>;
  setActiveTab: (tab: WorkspaceTab) => void;
  setActiveSession: (executor: ExecutorSlug, sessionId: string) => void;
  clearActiveSession: (executor: ExecutorSlug) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeTab: loadActiveTab(),
  activeSessionByExecutor: {
    hermes: loadActiveSession('hermes'),
    'opencode-1230': loadActiveSession('opencode-1230'),
  },

  setActiveTab: (tab) => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      // ignore
    }
    set({ activeTab: tab });
  },

  setActiveSession: (executor, sessionId) => {
    try {
      localStorage.setItem(ACTIVE_SESSION_PREFIX + executor, sessionId);
    } catch {
      // ignore
    }
    set((state) => ({
      activeSessionByExecutor: {
        ...state.activeSessionByExecutor,
        [executor]: sessionId,
      },
    }));
  },

  clearActiveSession: (executor) => {
    try {
      localStorage.removeItem(ACTIVE_SESSION_PREFIX + executor);
    } catch {
      // ignore
    }
    set((state) => ({
      activeSessionByExecutor: {
        ...state.activeSessionByExecutor,
        [executor]: null,
      },
    }));
  },
}));
