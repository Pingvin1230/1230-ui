/**
 * src/lib/api/tududi.ts
 *
 * Frontend client for the Tududi proxy (server-side at /api/tududi/*).
 * All requests go through the 1230-UI backend; the bearer token never
 * reaches the browser.
 *
 * Note: tududi's API mixes singular/plural forms and response envelopes.
 *   - GET: /api/tasks, /api/notes, /api/projects, /api/tags, /api/areas
 *          (/api/tasks and /api/projects return { tasks: [] } / { projects: [] })
 *   - POST: /api/task, /api/note, /api/project (singular!)
 *   - PATCH/DELETE: /api/task/:uid, /api/note/:uid
 *   - Projects are read-only via API in some versions; createProject may return 400.
 */

const BASE = '/api/tududi';

export const TUDUDI_STATUS: Record<number, string> = {
  0: 'not_started',
  1: 'in_progress',
  2: 'done',
  3: 'archived',
  4: 'waiting',
  5: 'cancelled',
  6: 'planned',
};

export const TUDUDI_PRIORITY: Record<number, 'low' | 'medium' | 'high'> = {
  0: 'low',
  1: 'medium',
  2: 'high',
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const parsed = await safeReadBody(res);
    const message =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : null) || res.statusText;
    throw new TududiApiError(res.status, message, parsed);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function safeReadBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}

export class TududiApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'TududiApiError';
    this.status = status;
    this.detail = detail;
  }
}

export interface TududiProjectRef {
  id: number;
  uid: string;
  name: string;
  status?: string;
}

export interface TududiTask {
  id: number;
  uid: string;
  name: string;
  note?: string | null;
  status: number;
  priority: number | null;
  due_date?: string | null;
  defer_until?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  project_id?: number | null;
  parent_task_id?: number | null;
  Project?: TududiProjectRef | null;
  tags?: string[];
  subtasks?: TududiTask[];
  habit_mode?: boolean;
  recurrence_type?: string | null;
  original_name?: string | null;
}

export interface TududiNote {
  id: number;
  uid: string;
  title?: string | null;
  content?: string | null;
  project_id?: number | null;
  tags?: string[];
  color?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TududiProject {
  id: number;
  uid: string;
  name: string;
  description?: string | null;
  priority?: number | null;
  due_date_at?: string | null;
  area_id?: number | null;
  image_url?: string | null;
  task_show_completed?: boolean;
  task_sort_order?: string;
  status?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TududiTag {
  id: number;
  uid: string;
  name: string;
}

export interface TududiHealth {
  configured: boolean;
  reachable: boolean;
  status?: number;
  error?: string;
}

export interface TududiConfig {
  apiUrl: string;
  hasToken: boolean;
}

export interface TududiTestResult {
  ok: boolean;
  status: number;
  error?: string;
}

export const tududiApi = {
  health(): Promise<TududiHealth> {
    return request<TududiHealth>('/health');
  },

  getConfig(): Promise<TududiConfig> {
    return request<TududiConfig>('/config');
  },

  saveConfig(input: { apiUrl: string; apiToken?: string }): Promise<{ success: true }> {
    return request<{ success: true }>('/config', { method: 'POST', body: JSON.stringify(input) });
  },

  testConfig(input: { apiUrl?: string; apiToken?: string } = {}): Promise<TududiTestResult> {
    return request<TududiTestResult>('/test', { method: 'POST', body: JSON.stringify(input) });
  },

  listTasks(): Promise<{ tasks: TududiTask[] }> {
    return request<{ tasks: TududiTask[] }>('/tasks');
  },

  getTask(uid: string): Promise<TududiTask> {
    return request<TududiTask>(`/task/${encodeURIComponent(uid)}`);
  },

  createTask(input: { name: string; status?: number; priority?: number | null; project_id?: number | null; note?: string | null; due_date?: string | null; parent_task_id?: number | null; tags?: string[] }): Promise<TududiTask> {
    return request<TududiTask>('/task', { method: 'POST', body: JSON.stringify(input) });
  },

  createSubtask(parentId: number, name: string): Promise<TududiTask> {
    return this.createTask({ name, parent_task_id: parentId });
  },

  updateTask(uid: string, patch: Partial<TududiTask>): Promise<TududiTask> {
    return request<TududiTask>(`/task/${encodeURIComponent(uid)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  completeTask(uid: string): Promise<TududiTask> {
    return this.updateTask(uid, { status: 2 });
  },

  deleteTask(uid: string): Promise<void> {
    return request<void>(`/task/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  },

  // /notes returns a bare array, not { notes: [] }
  listNotes(): Promise<TududiNote[]> {
    return request<TududiNote[]>('/notes');
  },

  getNote(uid: string): Promise<TududiNote> {
    return request<TududiNote>(`/note/${encodeURIComponent(uid)}`);
  },

  createNote(input: { title?: string; content?: string; project_id?: number | null }): Promise<TududiNote> {
    return request<TududiNote>('/note', { method: 'POST', body: JSON.stringify(input) });
  },

  updateNote(uid: string, patch: Partial<TududiNote>): Promise<TududiNote> {
    return request<TududiNote>(`/note/${encodeURIComponent(uid)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  deleteNote(uid: string): Promise<void> {
    return request<void>(`/note/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  },

  listProjects(): Promise<{ projects: TududiProject[] }> {
    return request<{ projects: TududiProject[] }>('/projects');
  },

  createProject(input: { name: string; description?: string | null; due_date_at?: string | null }): Promise<TududiProject> {
    return request<TududiProject>('/project', { method: 'POST', body: JSON.stringify(input) });
  },

  listTags(): Promise<TududiTag[]> {
    return request<TududiTag[]>('/tags');
  },
};
