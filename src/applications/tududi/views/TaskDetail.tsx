import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Trash2,
  Calendar,
  Folder,
  Hash,
  ListChecks,
  CheckCircle2,
  Circle,
  Plus,
  ChevronDown,
} from 'lucide-react';
import {
  tududiApi,
  TududiApiError,
  type TududiTask,
  type TududiProject,
} from '../../../lib/api/tududi';
import {
  STATUS_IDS,
  STATUS_LABELS,
  displayName,
  dueLabel,
  getStatusString,
  type StatusKey,
} from '../helpers';

// ── Status Control (compact inline version) ─────────────────────────────────

const STATUS_COLORS: Record<StatusKey, string> = {
  not_started: 'text-fg-muted',
  in_progress: 'text-blue-600 dark:text-blue-400',
  planned: 'text-purple-600 dark:text-purple-400',
  waiting: 'text-amber-600 dark:text-amber-400',
  done: 'text-green-600 dark:text-green-400',
  cancelled: 'text-red-600 dark:text-red-400',
  archived: 'text-gray-500',
};

const STATUS_DOT: Record<StatusKey, string> = {
  not_started: 'bg-fg-muted',
  in_progress: 'bg-blue-500',
  planned: 'bg-purple-500',
  waiting: 'bg-amber-500',
  done: 'bg-green-500',
  cancelled: 'bg-red-500',
  archived: 'bg-gray-400',
};

function StatusPicker({ status, onChange }: { status: number; onChange: (s: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getStatusString(status);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const options: StatusKey[] = ['not_started', 'in_progress', 'planned', 'waiting', 'done', 'cancelled', 'archived'];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-fg-secondary hover:bg-bg-secondary px-2 py-1 rounded border border-border-default"
      >
        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[current]}`} />
        <span className={STATUS_COLORS[current]}>{STATUS_LABELS[current]}</span>
        <ChevronDown className="w-3 h-3 text-fg-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-bg-primary border border-border-default rounded-lg shadow-lg z-50 overflow-hidden">
          {options.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(STATUS_IDS[key]);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                current === key
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'text-fg-secondary hover:bg-bg-secondary'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[key]}`} />
              {STATUS_LABELS[key]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TaskDetail ───────────────────────────────────────────────────────────────

interface TaskDetailProps {
  task: TududiTask;
  projects?: TududiProject[];
  onBack: () => void;
  onUpdated: (task: TududiTask) => void;
  onDeleted: (uid: string) => void;
}

export function TaskDetail({ task: initial, projects = [], onBack, onUpdated, onDeleted }: TaskDetailProps) {
  const [task, setTask] = useState<TududiTask>(initial);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Ref holding the latest task; lets the patch-queue read fresh state without
  // re-creating the `update` callback on every change. Without this, two rapid
  // edits would race: the second `update()` would read a stale `task` from the
  // callback's closure and overwrite the first edit's result on the server's
  // response (see audit §B1).
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  // Inline edit state
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(task.name);

  const [noteOpen, setNoteOpen] = useState(!!task.note);
  const [noteDraft, setNoteDraft] = useState(task.note ?? '');

  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsDraft, setTagsDraft] = useState((task.tags ?? []).join(' '));

  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [newSub, setNewSub] = useState('');

  const isDone = task.status === 2;
  const due = dueLabel(task.due_date);
  const isRecurring = !!task.recurrence_type && task.recurrence_type !== 'none';

  // Sync name draft when task changes externally
  useEffect(() => setNameDraft(task.name), [task.name]);
  useEffect(() => setNoteDraft(task.note ?? ''), [task.note]);
  useEffect(() => setTagsDraft((task.tags ?? []).join(' ')), [task.tags]);

  const update = useCallback(
    async (patch: Partial<TududiTask>) => {
      const uid = taskRef.current.uid;
      const changedKeys = Object.keys(patch) as (keyof TududiTask)[];

      // Optimistic: apply on top of the freshest known state.
      setTask((prev) => {
        const next = { ...prev, ...patch };
        onUpdated(next);
        return next;
      });

      try {
        const updated = await tududiApi.updateTask(uid, patch);
        setTask((prev) => {
          if (updated.uid !== prev.uid) return prev;
          // Trust the server only for fields this patch changed; preserve
          // other fields so concurrent optimistic edits are not clobbered
          // (audit §B1: rapid status → due_date no longer loses one of them).
          const merged: TududiTask = { ...prev };
          for (const k of changedKeys) {
            (merged as Record<keyof TududiTask, unknown>)[k] = updated[k];
          }
          onUpdated(merged);
          return merged;
        });
      } catch (e) {
        const msg = e instanceof TududiApiError ? e.message : String(e);
        setError(msg);
        // Don't auto-rollback: a blind revert could clobber concurrent edits
        // or overwrite uncommitted drafts (name/note/tags). The error banner
        // surfaces the failure; user can navigate back to refresh from server.
      }
    },
    [onUpdated],
  );

  function commitName() {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== task.name) {
      // For recurring instances, preserve the template name
      const patch: Partial<TududiTask> = { name: trimmed };
      if (task.original_name && task.name !== task.original_name) {
        patch.original_name = task.original_name;
      }
      update(patch);
    } else {
      setNameDraft(task.name);
    }
  }

  function commitNote() {
    setNoteOpen(noteDraft.length > 0);
    const next = noteDraft.length > 0 ? noteDraft : null;
    if (next !== task.note) update({ note: next });
  }

  function commitTags() {
    setTagsOpen(false);
    const next = tagsDraft
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);
    if (JSON.stringify(next) !== JSON.stringify(task.tags ?? [])) update({ tags: next });
  }

  async function addSubtask() {
    const name = newSub.trim();
    if (!name) return;
    try {
      await tududiApi.createSubtask(task.id, name);
      const fresh = await tududiApi.getTask(task.uid);
      setTask(fresh);
      onUpdated(fresh);
      setNewSub('');
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
    }
  }

  async function toggleSub(sub: TududiTask) {
    const subtasks = task.subtasks ?? [];
    const next: number = sub.status === 2 ? 0 : 2;
    const optimistic = {
      ...task,
      subtasks: subtasks.map((s) => (s.uid === sub.uid ? { ...s, status: next } : s)),
    };
    setTask(optimistic);
    onUpdated(optimistic);
    try {
      await tududiApi.updateTask(sub.uid, { status: next });
      const fresh = await tududiApi.getTask(task.uid);
      setTask(fresh);
      onUpdated(fresh);
    } catch {
      setTask(task);
      onUpdated(task);
    }
  }

  async function doDelete() {
    try {
      await tududiApi.deleteTask(task.uid);
      onDeleted(task.uid);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
    }
  }

  const subtasks = task.subtasks ?? [];
  const openSubs = subtasks.filter((s) => s.status !== 2 && s.status !== 3).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-start gap-2 px-3 py-2 border-b border-border-default bg-bg-primary">
        <button
          type="button"
          onClick={onBack}
          className="p-1 mt-0.5 rounded text-fg-muted hover:bg-bg-secondary"
          title="Back to tasks"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {isRecurring && (
            <div className="text-[10px] text-fg-muted mb-0.5">
              ↻ {task.recurrence_type}
            </div>
          )}
          {editingName ? (
            <input
              type="text"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setNameDraft(task.name); setEditingName(false); }
              }}
              className="w-full text-sm font-semibold px-1.5 py-0.5 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className={`w-full text-left text-sm font-semibold ${
                isDone ? 'line-through text-fg-muted' : 'text-fg-primary'
              }`}
            >
              {displayName(task)}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="p-1 mt-0.5 rounded text-fg-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          title="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="flex-shrink-0 m-3 p-3 text-xs bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
          <p className="text-red-700 dark:text-red-300 font-medium mb-2">
            Delete "{displayName(task)}"?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doDelete}
              className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2 py-1 rounded border border-border-default text-fg-secondary text-xs hover:bg-bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mx-3 mt-2 p-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-fg-muted hover:text-fg-primary">
            ✕
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {/* Status + Due + Priority row */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPicker status={task.status} onChange={(s) => update({ status: s })} />
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-fg-muted" />
            <input
              type="date"
              value={task.due_date || ''}
              onChange={(e) => update({ due_date: e.target.value || null })}
              className="text-xs px-1.5 py-0.5 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {task.due_date && (
              <button
                type="button"
                onClick={() => update({ due_date: null })}
                className="text-fg-muted hover:text-red-500 text-xs"
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
          {due && <span className={`text-[10px] ${due.cls}`}>{due.text}</span>}
          <div className="ml-auto flex items-center gap-0.5">
            {([null, 0, 1, 2] as (number | null)[]).map((p) => {
              const labels: Record<string, string> = { '': '–', '0': 'L', '1': 'M', '2': 'H' };
              const colors: Record<string, string> = {
                '': 'text-fg-muted',
                '0': 'text-fg-muted',
                '1': 'text-amber-500',
                '2': 'text-red-500',
              };
              const isActive = task.priority === p;
              return (
                <button
                  key={String(p)}
                  type="button"
                  onClick={() => update({ priority: p })}
                  className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-medium ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-900/30 ' + colors[String(p)]
                      : 'text-fg-muted hover:bg-bg-secondary'
                  }`}
                  title={p === null ? 'No priority' : p === 0 ? 'Low' : p === 1 ? 'Medium' : 'High'}
                >
                  {labels[String(p)]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Project */}
        <div className="flex items-center gap-2">
          <Folder className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
          <span className="text-xs text-fg-muted">Project:</span>
          <select
            value={task.project_id ?? ''}
            onChange={(e) => update({ project_id: e.target.value ? Number(e.target.value) : null })}
            className="flex-1 text-xs px-2 py-1 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Note */}
        <div>
          <button
            type="button"
            onClick={() => setNoteOpen(!noteOpen)}
            className="w-full flex items-center gap-2 text-xs text-fg-secondary hover:bg-bg-secondary px-2 py-1 rounded"
          >
            <ListChecks className="w-3.5 h-3.5 text-fg-muted" />
            <span>Note</span>
            {task.note && <span className="text-[10px] text-fg-muted ml-auto">edited</span>}
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${noteOpen ? 'rotate-180' : ''}`} />
          </button>
          {noteOpen && (
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={commitNote}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setNoteDraft(task.note ?? ''); setNoteOpen(false); }
              }}
              placeholder="Add a note…"
              rows={4}
              className="w-full mt-1 text-xs px-3 py-2 rounded-lg border border-border-default bg-bg-primary resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
          )}
        </div>

        {/* Tags */}
        <div>
          <button
            type="button"
            onClick={() => setTagsOpen(!tagsOpen)}
            className="w-full flex items-center gap-2 text-xs text-fg-secondary hover:bg-bg-secondary px-2 py-1 rounded"
          >
            <Hash className="w-3.5 h-3.5 text-fg-muted" />
            <span>Tags</span>
            {task.tags && task.tags.length > 0 && (
              <span className="ml-auto flex gap-1">
                {task.tags.slice(0, 4).map((tag, i) => (
                  <span key={i} className="px-1 rounded bg-bg-secondary text-[10px]">#{tag}</span>
                ))}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${tagsOpen ? 'rotate-180' : ''}`} />
          </button>
          {tagsOpen && (
            <input
              type="text"
              value={tagsDraft}
              onChange={(e) => setTagsDraft(e.target.value)}
              onBlur={commitTags}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setTagsDraft((task.tags ?? []).join(' ')); setTagsOpen(false); }
              }}
              placeholder="tag1 tag2 tag3"
              className="w-full mt-1 text-xs px-2 py-1 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Subtasks */}
        <div>
          <button
            type="button"
            onClick={() => setSubtasksOpen(!subtasksOpen)}
            className="w-full flex items-center gap-2 text-xs text-fg-secondary hover:bg-bg-secondary px-2 py-1 rounded"
          >
            <ListChecks className="w-3.5 h-3.5 text-fg-muted" />
            <span>
              Subtasks{subtasks.length > 0 ? ` (${openSubs}/${subtasks.length})` : ''}
            </span>
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${subtasksOpen ? 'rotate-180' : ''}`} />
          </button>
          {subtasksOpen && (
            <div className="mt-1 space-y-0.5">
              {subtasks.length === 0 && (
                <div className="text-xs text-fg-muted px-2">No subtasks.</div>
              )}
              {subtasks.map((sub) => {
                const subDone = sub.status === 2;
                return (
                  <div
                    key={sub.uid}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-secondary"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSub(sub)}
                      className="flex-shrink-0"
                    >
                      {subDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-fg-muted" />
                      )}
                    </button>
                    <span className={`text-xs flex-1 ${subDone ? 'line-through text-fg-muted' : 'text-fg-primary'}`}>
                      {sub.name}
                    </span>
                  </div>
                );
              })}
              <form
                onSubmit={(e) => { e.preventDefault(); addSubtask(); }}
                className="flex items-center gap-1 px-2 pt-1"
              >
                <Plus className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
                <input
                  type="text"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  placeholder="Add subtask…"
                  className="flex-1 min-w-0 text-xs px-1.5 py-1 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {newSub.trim() && (
                  <button
                    type="submit"
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Add
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
