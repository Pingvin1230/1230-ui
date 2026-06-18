import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  Plus,
  Folder,
  Calendar,
  X,
  ListChecks,
  FileText,
} from 'lucide-react';
import {
  tududiApi,
  TududiApiError,
  type TududiProject,
  type TududiTask,
  type TududiNote,
} from '../../../lib/api/tududi';

// ── New Project page ────────────────────────────────────────────────────────

function NewProjectPage({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (input: { name: string; description?: string | null; due_date_at?: string | null }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, description: description.trim() || null, due_date_at: dueDate });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-primary">
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-fg-muted hover:bg-bg-secondary"
          title="Back to projects"
        >
          <X className="w-4 h-4" />
        </button>
        <Plus className="w-3.5 h-3.5 text-fg-muted" />
        <span className="text-xs text-fg-muted">New Project</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Project name"
          autoFocus
          className="w-full text-sm font-semibold px-2 py-1.5 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="w-full text-xs px-2 py-1.5 rounded border border-border-default bg-bg-primary resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
          <span className="text-xs text-fg-muted">Due:</span>
          <input
            type="date"
            value={dueDate ?? ''}
            onChange={(e) => setDueDate(e.target.value || null)}
            className="flex-1 text-xs px-2 py-1 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-border-default bg-bg-primary p-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Project
        </button>
      </div>
    </div>
  );
}

// ── ProjectsView ─────────────────────────────────────────────────────────────

type NavTarget = { type: 'tasks' | 'notes'; projectId: number } | null;

interface ProjectsViewProps {
  onNavigate: (target: NavTarget) => void;
}

export function ProjectsView({ onNavigate }: ProjectsViewProps) {
  const [projects, setProjects] = useState<TududiProject[] | null>(null);
  const [tasks, setTasks] = useState<TududiTask[] | null>(null);
  const [notes, setNotes] = useState<TududiNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newProjectMode, setNewProjectMode] = useState(false);

  async function load() {
    try {
      setError(null);
      setLoading(true);
      const [projectsRes, tasksRes, notesRes] = await Promise.all([
        tududiApi.listProjects(),
        tududiApi.listTasks(),
        tududiApi.listNotes(),
      ]);
      setProjects(projectsRes.projects);
      setTasks(tasksRes.tasks);
      setNotes(notesRes);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const projectStats = useMemo(() => {
    if (!projects || !tasks || !notes) return [];
    return projects.map((p) => {
      const projectTasks = tasks.filter((t) => t.project_id === p.id && !t.parent_task_id);
      const total = projectTasks.length;
      const done = projectTasks.filter((t) => t.status === 2).length;
      const noteCount = notes.filter((n) => n.project_id === p.id).length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;

      // Earliest due date among tasks
      const taskDueDates = projectTasks
        .map((t) => t.due_date)
        .filter(Boolean)
        .sort();
      const earliestDue = taskDueDates.length > 0 ? taskDueDates[0] : null;

      // Project-level due date
      const projectDue = p.due_date_at ?? earliestDue;

      return {
        project: p,
        total,
        done,
        noteCount,
        progress,
        dueDate: projectDue,
      };
    });
  }, [projects, tasks, notes]);

  async function handleCreateProject(input: { name: string; description?: string | null; due_date_at?: string | null }) {
    try {
      const created = await tududiApi.createProject(input);
      setProjects((prev) => (prev ? [...prev, created] : [created]));
      setNewProjectMode(false);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (newProjectMode) {
    return (
      <NewProjectPage
        onCancel={() => setNewProjectMode(false)}
        onCreate={handleCreateProject}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="flex-shrink-0 m-3 p-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={load} className="text-blue-600 hover:underline">
            Retry
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {projectStats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-fg-muted">
            <Folder className="w-8 h-8 mb-2 opacity-40" />
            No projects yet. Create one below.
          </div>
        )}

        {projectStats.map(({ project: p, total, done, noteCount, progress, dueDate }) => {
          const due = dueLabel(dueDate);
          const statusColor =
            p.status === 'completed' ? 'text-green-600'
              : p.status === 'archived' ? 'text-fg-muted'
                : 'text-fg-primary';

          return (
            <div
              key={p.uid}
              className="rounded-lg border border-border-default bg-bg-primary p-3 space-y-2"
            >
              {/* Header */}
              <div className="flex items-start gap-2">
                <Folder className={`w-4 h-4 mt-0.5 flex-shrink-0 ${statusColor}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${statusColor}`}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div className="text-[10px] text-fg-muted truncate mt-0.5">
                      {p.description}
                    </div>
                  )}
                </div>
                {p.status && p.status !== 'active' && (
                  <span className="text-[10px] text-fg-muted capitalize px-1.5 py-0.5 rounded bg-bg-secondary">
                    {p.status}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {total > 0 && (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] text-fg-muted">
                    <span>{done}/{total} tasks</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-3 text-[10px] text-fg-muted">
                {dueDate && (
                  <span className={`flex items-center gap-1 ${due?.cls ?? ''}`}>
                    <Calendar className="w-3 h-3" />
                    {due?.text}
                  </span>
                )}
                {noteCount > 0 && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {noteCount}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate({ type: 'tasks', projectId: p.id })}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border border-border-default text-[10px] text-fg-secondary hover:bg-bg-secondary transition-colors"
                >
                  <ListChecks className="w-3 h-3" />
                  Tasks
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ type: 'notes', projectId: p.id })}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border border-border-default text-[10px] text-fg-secondary hover:bg-bg-secondary transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  Notes
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* New project button */}
      <div className="flex-shrink-0 border-t border-border-default bg-bg-primary p-2">
        <button
          type="button"
          onClick={() => setNewProjectMode(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-secondary hover:bg-bg-secondary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dueLabel(iso: string | null | undefined): { text: string; cls: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  let text: string;
  if (diffDays === 0) text = 'Today';
  else if (diffDays === 1) text = 'Tomorrow';
  else if (diffDays === -1) text = 'Yesterday';
  else if (diffDays < 0) text = `${-diffDays}d overdue`;
  else if (diffDays < 7) text = `In ${diffDays}d`;
  else text = d.toLocaleDateString();
  const cls = diffDays < 0 ? 'text-red-500' : diffDays === 0 ? 'text-orange-500' : 'text-fg-muted';
  return { text, cls };
}
