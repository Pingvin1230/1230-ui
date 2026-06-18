import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  FileText,
  Search,
  ChevronDown,
  X,
  Folder,
  MoreHorizontal,
  Pencil,
  Eye,
} from 'lucide-react';
import {
  tududiApi,
  TududiApiError,
  type TududiNote,
  type TududiProject,
} from '../../../lib/api/tududi';
import MarkdownRenderer from '../../../components/MarkdownRenderer';

// ── Color palette (matches Tududi) ──────────────────────────────────────────

const NOTE_COLORS = [
  { value: null, label: 'None', bg: 'bg-bg-primary', border: 'border-border-default' },
  { value: '#fef3c7', label: 'Amber', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
  { value: '#fce7f3', label: 'Pink', bg: 'bg-pink-50 dark:bg-pink-900/20', border: 'border-pink-200 dark:border-pink-800' },
  { value: '#dbeafe', label: 'Blue', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' },
  { value: '#d1fae5', label: 'Green', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
  { value: '#ede9fe', label: 'Purple', bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800' },
  { value: '#fed7aa', label: 'Orange', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
  { value: '#fecaca', label: 'Red', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' },
  { value: '#bbf7d0', label: 'Lime', bg: 'bg-lime-50 dark:bg-lime-900/20', border: 'border-lime-200 dark:border-lime-800' },
  { value: '#e0e7ff', label: 'Indigo', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800' },
];

function getColorClasses(color: string | null | undefined) {
  const found = NOTE_COLORS.find((c) => c.value === color);
  return found ?? NOTE_COLORS[0];
}

// ── Sort options ─────────────────────────────────────────────────────────────

type SortKey = 'updated_at' | 'title' | 'created_at';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'updated_at', label: 'Recently updated' },
  { key: 'title', label: 'Title A-Z' },
  { key: 'created_at', label: 'Date created' },
];

// ── Main view ────────────────────────────────────────────────────────────────

interface NotesViewProps {
  initialProjectId?: number | null;
}

export function NotesView({ initialProjectId }: NotesViewProps = {}) {
  const [notes, setNotes] = useState<TududiNote[] | null>(null);
  const [projects, setProjects] = useState<TududiProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null | 'all'>(null);
  const [showAllProjects, setShowAllProjects] = useState(false);

  // View mode (read-only preview)
  const [viewingUid, setViewingUid] = useState<string | null>(null);

  // Edit mode (with textarea)
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const [draftProjectId, setDraftProjectId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const [notesRes, projectsRes] = await Promise.all([
        tududiApi.listNotes(),
        tududiApi.listProjects(),
      ]);
      setNotes(notesRes);
      setProjects(projectsRes.projects);
      if (selectedProjectId === null && initialProjectId == null && projectsRes.projects.length > 0) {
        setSelectedProjectId('all');
      }
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, initialProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialProjectId != null) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  // ── Filtered + sorted notes ──────────────────────────────────────────────

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    let result = notes;

    if (selectedProjectId !== 'all' && selectedProjectId !== null) {
      result = result.filter((n) => n.project_id === selectedProjectId);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (n) =>
          (n.title ?? '').toLowerCase().includes(q) ||
          (n.content ?? '').toLowerCase().includes(q),
      );
    }

    result = [...result].sort((a, b) => {
      if (sortKey === 'title') {
        return (a.title ?? '').localeCompare(b.title ?? '');
      }
      if (sortKey === 'created_at') {
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
      return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
    });

    return result;
  }, [notes, selectedProjectId, query, sortKey]);

  // ── Project groups for filter bar ────────────────────────────────────────

  const projectGroups = useMemo(() => {
    if (!notes) return [];
    const map = new Map<number | null, number>();
    for (const n of notes) {
      const key = n.project_id ?? null;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([projectId, count]) => ({
        projectId,
        projectName:
          projectId === null
            ? 'No project'
            : projects.find((p) => p.id === projectId)?.name ?? 'Unknown',
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [notes, projects]);

  const visibleProjects = showAllProjects
    ? projectGroups
    : projectGroups.slice(0, 3);

  // ── View / Edit helpers ──────────────────────────────────────────────────

  function startView(note: TududiNote) {
    setViewingUid(note.uid);
    setEditingUid(null);
  }

  function startEdit(note: TududiNote) {
    setEditingUid(note.uid);
    setViewingUid(null);
    setDraftTitle(note.title ?? '');
    setDraftContent(note.content ?? '');
    setDraftColor(note.color ?? null);
    setDraftProjectId(note.project_id ?? null);
    setSaveStatus('idle');
  }

  function closeView() {
    setViewingUid(null);
    setEditingUid(null);
  }

  function cancelEdit() {
    setEditingUid(null);
    setDraftTitle('');
    setDraftContent('');
    setDraftColor(null);
    setDraftProjectId(null);
    setSaveStatus('idle');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  function scheduleAutoSave() {
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave();
    }, 1000);
  }

  async function doSave() {
    if (!editingUid) return;
    try {
      const updated = await tududiApi.updateNote(editingUid, {
        title: draftTitle,
        content: draftContent,
        color: draftColor,
        project_id: draftProjectId,
      });
      setNotes((prev) =>
        prev?.map((n) => (n.uid === editingUid ? updated : n)) ?? null,
      );
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
      setSaveStatus('idle');
    }
  }

  async function createNote() {
    try {
      const created = await tududiApi.createNote({
        title: '',
        content: '',
        project_id:
          selectedProjectId !== 'all' && selectedProjectId !== null
            ? selectedProjectId
            : null,
      });
      setNotes((prev) => (prev ? [created, ...prev] : [created]));
      startEdit(created);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
    }
  }

  async function deleteNote(uid: string) {
    try {
      await tududiApi.deleteNote(uid);
      setNotes((prev) => prev?.filter((n) => n.uid !== uid) ?? null);
      setViewingUid(null);
      setEditingUid(null);
      setShowDeleteConfirm(null);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const sortRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [sortOpen]);

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      </div>
    );
  }

  // ── View mode (read-only preview) ────────────────────────────────────────

  if (viewingUid) {
    const note = notes?.find((n) => n.uid === viewingUid);
    if (!note) return null;
    const colorClasses = getColorClasses(note.color);
    const projectName =
      note.project_id === null
        ? null
        : projects.find((p) => p.id === note.project_id)?.name ?? null;

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-primary">
          <button
            type="button"
            onClick={closeView}
            className="p-1 rounded text-fg-muted hover:bg-bg-secondary"
            title="Back to notes"
          >
            <X className="w-4 h-4" />
          </button>
          <Eye className="w-3.5 h-3.5 text-fg-muted" />
          <span className="text-xs text-fg-muted truncate flex-1">
            {note.title || 'Untitled'}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => startEdit(note)}
              className="p-1 rounded text-fg-muted hover:bg-bg-secondary"
              title="Edit note"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(viewingUid)}
              className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm === viewingUid && (
          <div className="flex-shrink-0 m-3 p-3 text-xs bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <p className="text-red-700 dark:text-red-300 font-medium mb-2">
              Delete "{note.title || 'Untitled'}"?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => deleteNote(viewingUid)}
                className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(null)}
                className="px-2 py-1 rounded border border-border-default text-fg-secondary hover:bg-bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {/* Title */}
          <h2 className="text-sm font-semibold text-fg-primary">
            {note.title || 'Untitled'}
          </h2>

          {/* Content preview */}
          {note.content ? (
            <div
              className={`rounded-lg border ${colorClasses.border} ${colorClasses.bg} p-3`}
            >
              <div className="text-xs">
                <MarkdownRenderer content={note.content} />
              </div>
            </div>
          ) : (
            <div className="text-xs text-fg-muted italic">No content</div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 text-[10px] text-fg-muted pt-1">
            {projectName && (
              <span className="flex items-center gap-1">
                <Folder className="w-3 h-3" />
                {projectName}
              </span>
            )}
            {note.updated_at && (
              <span>Updated {relativeTime(new Date(note.updated_at))} ago</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────

  if (editingUid) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-primary">
          <button
            type="button"
            onClick={cancelEdit}
            className="p-1 rounded text-fg-muted hover:bg-bg-secondary"
            title="Back to notes"
          >
            <X className="w-4 h-4" />
          </button>
          <Pencil className="w-3.5 h-3.5 text-fg-muted" />
          <span className="text-xs text-fg-muted">Edit note</span>
          <div className="ml-auto flex items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="text-[10px] text-fg-muted animate-pulse">Saving…</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-green-600">Saved</span>
            )}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(editingUid)}
              className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm === editingUid && (
          <div className="flex-shrink-0 m-3 p-3 text-xs bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
            <p className="text-red-700 dark:text-red-300 font-medium mb-2">
              Delete "{draftTitle || 'Untitled'}"?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => deleteNote(editingUid)}
                className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(null)}
                className="px-2 py-1 rounded border border-border-default text-fg-secondary hover:bg-bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col p-3 space-y-3">
          {/* Title + color */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => {
                setDraftTitle(e.target.value);
                scheduleAutoSave();
              }}
              placeholder="Note title"
              className="flex-1 text-sm font-semibold px-2 py-1.5 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex items-center gap-0.5">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value ?? 'none'}
                  type="button"
                  onClick={() => {
                    setDraftColor(c.value);
                    scheduleAutoSave();
                  }}
                  className={`w-4 h-4 rounded-full border ${c.bg} ${c.border} ${
                    draftColor === c.value ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Markdown editor — fills remaining space */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="text-[10px] text-fg-muted mb-1 font-medium uppercase tracking-wide">
              Markdown
            </div>
            <textarea
              value={draftContent}
              onChange={(e) => {
                setDraftContent(e.target.value);
                scheduleAutoSave();
              }}
              placeholder="Write your note in Markdown…"
              className="flex-1 min-h-0 text-xs px-3 py-2 rounded-lg border border-border-default bg-bg-primary resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* Project selector */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Folder className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
            <span className="text-xs text-fg-muted">Project:</span>
            <select
              value={draftProjectId ?? ''}
              onChange={(e) => {
                setDraftProjectId(e.target.value ? Number(e.target.value) : null);
                scheduleAutoSave();
              }}
              className="flex-1 text-xs px-2 py-1 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  // ── Main grid view ───────────────────────────────────────────────────────

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

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
        {/* Project filters */}
        {projectGroups.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedProjectId('all')}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedProjectId === 'all'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-fg-secondary hover:bg-bg-secondary'
              }`}
            >
              All
            </button>
            {visibleProjects
              .filter((g) => g.projectId !== null)
              .map((g) => (
                <button
                  key={g.projectId}
                  type="button"
                  onClick={() => setSelectedProjectId(g.projectId)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                    selectedProjectId === g.projectId
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-fg-secondary hover:bg-bg-secondary'
                  }`}
                >
                  <Folder className="w-3 h-3" />
                  {g.projectName}
                </button>
              ))}
            {projectGroups.length > 3 && !showAllProjects && (
              <button
                type="button"
                onClick={() => setShowAllProjects(true)}
                className="px-2 py-1 rounded-lg text-xs text-fg-muted hover:bg-bg-secondary"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            )}
            {showAllProjects && (
              <button
                type="button"
                onClick={() => setShowAllProjects(false)}
                className="px-1.5 py-1 rounded text-xs text-fg-muted hover:bg-bg-secondary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-primary">
            <Search className="w-3 h-3 text-fg-muted flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="flex-1 min-w-0 text-xs bg-transparent focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-0.5 rounded text-fg-muted hover:bg-bg-secondary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="relative" ref={sortRef}>
            <button
              type="button"
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border-default bg-bg-primary text-xs text-fg-secondary hover:bg-bg-secondary"
            >
              Sort
              <ChevronDown className="w-3 h-3" />
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-bg-primary border border-border-default rounded-lg shadow-lg z-50 overflow-hidden">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSortKey(opt.key);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs ${
                      sortKey === opt.key
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-fg-secondary hover:bg-bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notes grid */}
        {filteredNotes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-fg-muted">
            <FileText className="w-8 h-8 mb-2 opacity-40" />
            {notes?.length === 0
              ? 'No notes yet. Create one below.'
              : 'Nothing matches this filter.'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {filteredNotes.map((note) => {
            const colorClasses = getColorClasses(note.color);
            const projectName =
              note.project_id === null
                ? null
                : projects.find((p) => p.id === note.project_id)?.name ?? null;
            const timeAgo = note.updated_at
              ? relativeTime(new Date(note.updated_at))
              : '';

            return (
              <div
                key={note.uid}
                className={`relative rounded-lg border ${colorClasses.border} ${colorClasses.bg} p-2.5 hover:shadow-sm transition-shadow group`}
              >
                {/* Action buttons — visible on hover */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(note);
                    }}
                    className="p-1 rounded bg-bg-primary/80 text-fg-muted hover:text-blue-600 hover:bg-bg-primary"
                    title="Edit note"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(note.uid);
                    }}
                    className="p-1 rounded bg-bg-primary/80 text-fg-muted hover:text-red-600 hover:bg-bg-primary"
                    title="Delete note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Delete confirmation overlay */}
                {showDeleteConfirm === note.uid && (
                  <div className="absolute inset-0 z-10 rounded-lg bg-bg-primary/95 flex flex-col items-center justify-center p-3 text-center">
                    <p className="text-xs text-fg-primary font-medium mb-2">
                      Delete "{note.title || 'Untitled'}"?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNote(note.uid);
                        }}
                        className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(null);
                        }}
                        className="px-2 py-1 rounded border border-border-default text-fg-secondary text-xs hover:bg-bg-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Card content */}
                <button
                  type="button"
                  onClick={() => startView(note)}
                  className="w-full text-left"
                >
                  <div className="text-xs font-medium text-fg-primary truncate mb-1 pr-12">
                    {note.title || 'Untitled'}
                  </div>
                  {note.content && (
                    <div className="text-[10px] text-fg-secondary line-clamp-2 mb-1.5">
                      {stripMarkdown(note.content)}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
                    {projectName && (
                      <span className="flex items-center gap-0.5 truncate">
                        <Folder className="w-2.5 h-2.5 flex-shrink-0" />
                        {projectName}
                      </span>
                    )}
                    {timeAgo && <span>· {timeAgo}</span>}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* New note button */}
      <div className="flex-shrink-0 border-t border-border-default bg-bg-primary p-2">
        <button
          type="button"
          onClick={createNote}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-secondary hover:bg-bg-secondary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Note
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s?/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s/gm, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/^>\s/gm, '')
    .replace(/^---$/gm, '')
    .trim()
    .slice(0, 100);
}

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString();
}
