import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Loader2,
  AlertCircle,
  Search,
  X,
  Folder,
  CalendarIcon,
} from 'lucide-react';
import {
  tududiApi,
  TududiApiError,
  type TududiTask,
  type TududiProject,
} from '../../../lib/api/tududi';
import {
  STATUS_IDS,
  displayName,
  dueLabel,
  getStatusString,
  isVisible,
  type StatusKey,
} from '../helpers';
import { TaskDetail } from './TaskDetail';

type Filter = 'all' | 'today' | 'upcoming';

interface TasksViewProps {
  resetKey?: number;
  initialProjectId?: number | null;
}

// ── Status Control ──────────────────────────────────────────────────────────

const quickStartStatuses = new Set<StatusKey>(['not_started', 'planned', 'waiting', 'cancelled']);

function isTaskCompleted(status: number): boolean {
  return status === STATUS_IDS.done;
}

function isTaskInProgress(status: number): boolean {
  return status === STATUS_IDS.in_progress;
}

function isTaskNotStarted(status: number): boolean {
  return status === STATUS_IDS.not_started;
}

const STATUS_STYLES: Record<StatusKey, { button: string; border: string }> = {
  planned: {
    button: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
  },
  in_progress: {
    button: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  waiting: {
    button: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  done: {
    button: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
  },
  cancelled: {
    button: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  archived: {
    button: 'bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300',
    border: 'border-gray-200 dark:border-gray-800',
  },
  not_started: {
    button: 'bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300',
    border: 'border-gray-200 dark:border-gray-700',
  },
};

const resolveStatusKey = (status?: number | null): StatusKey => getStatusString(status ?? null);
const getStatusButtonColorClasses = (status?: number | null) => STATUS_STYLES[resolveStatusKey(status)].button;
const getStatusBorderColorClasses = (status?: number | null) => STATUS_STYLES[resolveStatusKey(status)].border;

function StatusControl({ task, onStatusChange }: { task: TududiTask; onStatusChange: (status: number) => void }) {
  const [completionMenuOpen, setCompletionMenuOpen] = useState<null | 'desktop' | 'mobile'>(null);
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const desktopCompletionMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileCompletionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!completionMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const activeRef =
        completionMenuOpen === 'desktop' ? desktopCompletionMenuRef.current : mobileCompletionMenuRef.current;
      if (activeRef && activeRef.contains(target)) return;
      setCompletionMenuOpen(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [completionMenuOpen]);

  const taskCompleted = isTaskCompleted(task.status);
  const taskInProgress = isTaskInProgress(task.status);
  const currentStatusString = getStatusString(task.status);

  const completionButtonHoverClass = taskCompleted
    ? 'hover:bg-green-50 dark:hover:bg-green-900/40'
    : taskInProgress
      ? 'hover:bg-blue-50 dark:hover:bg-blue-900/40'
      : 'hover:bg-gray-50 dark:hover:bg-gray-800';

  const completionButtonMainBgClass = taskCompleted
    ? 'bg-green-100 dark:bg-green-900/50'
    : taskInProgress
      ? 'bg-blue-100 dark:bg-blue-900/50'
      : 'bg-gray-200 dark:bg-gray-700';

  const completionButtonMainTextClass = taskCompleted
    ? 'text-green-900 dark:text-green-100 font-semibold'
    : taskInProgress
      ? 'text-blue-900 dark:text-blue-100 font-semibold'
      : 'text-gray-900 dark:text-gray-100 font-semibold';

  const isSquareVariant = true;
  const textSizeClass = isSquareVariant ? 'text-xs' : 'text-sm';
  const gapClass = isSquareVariant ? 'gap-1.5' : 'gap-2';
  const iconSizeClass = isSquareVariant ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const containerRoundedClass = isSquareVariant ? 'rounded-lg' : 'rounded-full';
  const completionButtonPaddingClass = isSquareVariant ? 'px-2.5 py-1' : 'px-3 py-1';
  const quickButtonPaddingClass = isSquareVariant ? 'px-1.5' : 'px-2';

  const completionButtonMainClasses = `inline-flex items-center ${gapClass} ${textSizeClass} transition ${completionButtonMainTextClass} ${completionButtonMainBgClass} ${completionButtonHoverClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`;

  const completionButtonChevronClasses = `inline-flex items-center justify-center transition ${completionButtonHoverClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`;

  const statusButtonColorClasses = getStatusButtonColorClasses(task.status);
  const statusBorderColorClass = getStatusBorderColorClasses(task.status);

  const showQuickStartButton = quickStartStatuses.has(currentStatusString);
  const showQuickCompleteButton = currentStatusString !== 'done';

  const handleCompletionClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCompletionMenuOpen(null);
    if (!taskCompleted) {
      setIsCompletingTask(true);
      await new Promise((r) => setTimeout(r, 1200));
    }
    onStatusChange(taskCompleted ? STATUS_IDS.not_started : STATUS_IDS.done);
    setTimeout(() => setIsCompletingTask(false), 100);
  };

  const handleStatusSelection = async (_e: React.MouseEvent, statusValue: StatusKey) => {
    setCompletionMenuOpen(null);
    onStatusChange(STATUS_IDS[statusValue]);
  };

  type StatusDropdownOption = {
    value: StatusKey;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    activeClasses: string;
    inactiveClasses: string;
    activeIconClass: string;
    inactiveIconClass: string;
    completion?: boolean;
  };

  const renderStatusMenuOptions = (menuType: 'desktop' | 'mobile') => {
    const options: StatusDropdownOption[] = [
      {
        value: 'not_started',
        label: 'Not started',
        Icon: PauseCircleIcon,
        activeClasses:
          'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold border-l-2 border-gray-500 dark:border-gray-400',
        inactiveClasses: 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
        activeIconClass: 'text-gray-600 dark:text-gray-300',
        inactiveIconClass: 'text-gray-500 dark:text-gray-400',
      },
      {
        value: 'planned',
        label: 'Planned',
        Icon: CalendarIcon,
        activeClasses:
          'bg-purple-100 dark:bg-purple-900/50 text-purple-900 dark:text-purple-100 font-semibold border-l-2 border-purple-500 dark:border-purple-400',
        inactiveClasses: 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
        activeIconClass: 'text-purple-600 dark:text-purple-300',
        inactiveIconClass: 'text-purple-500 dark:text-purple-400',
      },
      {
        value: 'in_progress',
        label: 'In progress',
        Icon: PlayIcon,
        activeClasses:
          'bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100 font-semibold border-l-2 border-blue-500 dark:border-blue-400',
        inactiveClasses: 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
        activeIconClass: 'text-blue-600 dark:text-blue-300',
        inactiveIconClass: 'text-blue-500 dark:text-blue-400',
      },
      {
        value: 'waiting',
        label: 'Waiting',
        Icon: ClockIcon,
        activeClasses:
          'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-100 font-semibold border-l-2 border-yellow-500 dark:border-yellow-400',
        inactiveClasses: 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
        activeIconClass: 'text-yellow-600 dark:text-yellow-300',
        inactiveIconClass: 'text-yellow-500 dark:text-yellow-400',
      },
      {
        value: 'cancelled',
        label: 'Cancelled',
        Icon: XCircleIcon,
        activeClasses:
          'bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100 font-semibold border-l-2 border-red-500 dark:border-red-400',
        inactiveClasses: 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
        activeIconClass: 'text-red-600 dark:text-red-300',
        inactiveIconClass: 'text-red-500 dark:text-gray-400',
      },
      {
        value: 'done',
        label: 'Set as done',
        Icon: CheckIcon,
        activeClasses:
          'bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-100 font-semibold border-l-2 border-green-500 dark:border-green-400',
        inactiveClasses: 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
        activeIconClass: 'text-green-600 dark:text-green-300',
        inactiveIconClass: 'text-green-500 dark:text-green-400',
        completion: true,
      },
    ];

    const currentStatus = getStatusString(task.status);
    return options.map((option, index) => {
      const isActive = currentStatus === option.value;
      const roundedClass =
        index === 0 ? 'rounded-t-lg' : index === options.length - 1 ? 'rounded-b-lg' : '';
      const iconClass = isActive ? option.activeIconClass : option.inactiveIconClass;
      const stateClasses = isActive ? option.activeClasses : option.inactiveClasses;
      return (
        <button
          key={`${menuType}-${option.value}`}
          type="button"
          onClick={async (event) => {
            if (option.completion) {
              await handleCompletionClick(event);
            } else {
              await handleStatusSelection(event, option.value);
            }
          }}
          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${roundedClass} ${stateClasses}`}
          disabled={option.completion ? isCompletingTask : false}
        >
          <option.Icon className={`h-4 w-4 ${iconClass}`} />
          <span className="flex-1">{option.label}</span>
        </button>
      );
    });
  };

  const quickButtonClasses = `inline-flex items-center justify-center border-l ${statusBorderColorClass} transition-all duration-200 ${statusButtonColorClasses} px-1.5 md:px-0 md:w-0 md:opacity-0 md:pointer-events-none md:border-l-0 md:group-hover:px-1.5 md:group-hover:w-auto md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-hover:border-l`;
  const quickCompleteClasses = `inline-flex items-center justify-center border-l ${statusBorderColorClass} transition-all duration-200 ${statusButtonColorClasses} px-1.5 md:px-0 md:w-0 md:opacity-0 md:pointer-events-none md:border-l-0 md:group-hover:px-1.5 md:group-hover:w-auto md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-hover:border-l`;

  const statusDisplayConfig: Record<StatusKey, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
    not_started: { label: 'Not started', Icon: PauseCircleIcon },
    planned: { label: 'Planned', Icon: CalendarIcon },
    in_progress: { label: 'In progress', Icon: PlayIcon },
    waiting: { label: 'Waiting', Icon: ClockIcon },
    cancelled: { label: 'Cancelled', Icon: XCircleIcon },
    done: { label: 'Done', Icon: CheckIcon },
    archived: { label: 'Archived', Icon: CheckIcon },
  };
  const statusDisplay = statusDisplayConfig[currentStatusString] || statusDisplayConfig.not_started;
  const CompletionIcon = statusDisplay.Icon;
  const completionButtonLabel = statusDisplay.label;

  return (
    <div className={`relative ${completionMenuOpen ? 'z-[10000]' : ''}`}>
      <div
        className={`inline-flex items-stretch ${containerRoundedClass} border ${statusBorderColorClass} overflow-hidden group`}
        ref={desktopCompletionMenuRef}
      >
        <button
          type="button"
          onClick={
            taskInProgress || (!taskCompleted && (task.status === 0 || isTaskNotStarted(task.status)))
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : handleCompletionClick
          }
          className={`${completionButtonMainClasses} ${completionButtonPaddingClass} ${statusButtonColorClasses}`}
          title={taskCompleted ? 'Undo' : taskInProgress ? 'In progress' : 'Not started'}
        >
          <CompletionIcon className={iconSizeClass} />
          {completionButtonLabel}
        </button>
        {showQuickStartButton && (
          <button
            type="button"
            onClick={async (e) => {
              await handleStatusSelection(e, 'in_progress');
            }}
            className={quickButtonClasses}
            title="Set in progress"
          >
            <PlayIcon className={iconSizeClass} />
          </button>
        )}
        {showQuickCompleteButton && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCompletionClick(e);
            }}
            className={quickCompleteClasses}
            title="Mark as done"
            disabled={isCompletingTask}
          >
            <CheckIcon
              className={`${iconSizeClass} transition-all duration-300 ${
                isCompletingTask ? 'scale-125 text-green-600 dark:text-green-400' : ''
              }`}
            />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCompletionMenuOpen((prev) => (prev === 'desktop' ? null : 'desktop'));
          }}
          className={`${completionButtonChevronClasses} ${quickButtonPaddingClass} border-l ${statusBorderColorClass}`}
          aria-haspopup="menu"
          aria-expanded={completionMenuOpen === 'desktop'}
        >
          <ChevronDownIcon className={iconSizeClass} />
        </button>
      </div>
      {completionMenuOpen === 'desktop' && (
        <div
          className={`absolute right-0 top-full mt-1 w-48 bg-bg-primary dark:bg-bg-primary border ${statusBorderColorClass} rounded-lg shadow-lg z-[9999] opacity-100`}
        >
          {renderStatusMenuOptions('desktop')}
        </div>
      )}

      <div className="mt-2 relative block md:hidden" ref={mobileCompletionMenuRef}>
        <div
          className={`inline-flex items-stretch ${containerRoundedClass} border ${statusBorderColorClass} overflow-hidden text-xs`}
        >
          <button
            type="button"
            onClick={
              taskInProgress || (!taskCompleted && (task.status === 0 || isTaskNotStarted(task.status)))
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                : handleCompletionClick
            }
            className={`${completionButtonMainClasses} px-2 py-1 ${statusButtonColorClasses}`}
          >
            <CompletionIcon className="h-3.5 w-3.5" />
            <span className="ml-1">{completionButtonLabel}</span>
          </button>
          {showQuickStartButton && (
            <button
              type="button"
              onClick={async (e) => {
                await handleStatusSelection(e, 'in_progress');
              }}
              className={`${completionButtonChevronClasses} ${statusButtonColorClasses} px-2 border-l ${statusBorderColorClass}`}
              title="Set in progress"
            >
              <PlayIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {showQuickCompleteButton && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCompletionClick(e);
              }}
              className={`${
                isCompletingTask
                  ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                  : `${completionButtonChevronClasses} ${statusButtonColorClasses}`
              } px-2 border-l ${statusBorderColorClass} transition-all duration-300`}
              title="Mark as done"
              disabled={isCompletingTask}
            >
              <CheckIcon
                className={`h-3.5 w-3.5 transition-all duration-300 ${
                  isCompletingTask ? 'scale-125 text-green-600 dark:text-green-400' : ''
                }`}
              />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCompletionMenuOpen((prev) => (prev === 'mobile' ? null : 'mobile'));
            }}
            className={`${completionButtonChevronClasses} px-2 border-l ${statusBorderColorClass}`}
            aria-haspopup="menu"
            aria-expanded={completionMenuOpen === 'mobile'}
          >
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        {completionMenuOpen === 'mobile' && (
          <div
            className={`absolute right-0 top-full mt-1 w-48 bg-bg-primary border ${statusBorderColorClass} rounded-lg shadow-lg z-[9999] opacity-100`}
          >
            {renderStatusMenuOptions('mobile')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

function PauseCircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <rect x="9" y="8" width="2.5" height="8" rx="0.5" fill="currentColor" />
      <rect x="12.5" y="8" width="2.5" height="8" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function XCircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

function ClockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function RecurringIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7M21 5v5h-5" />
    </svg>
  );
}

function ChevronDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ── New Task page ───────────────────────────────────────────────────────────

function NewTaskPage({
  projects,
  onCancel,
  onCreate,
}: {
  projects: TududiProject[];
  onCancel: () => void;
  onCreate: (input: { name: string; project_id?: number | null; due_date?: string | null; priority?: number | null }) => void;
}) {
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<number | null>(1);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, project_id: projectId, due_date: dueDate, priority });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-default bg-bg-primary">
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-fg-muted hover:bg-bg-secondary"
          title="Back to tasks"
        >
          <X className="w-4 h-4" />
        </button>
        <Plus className="w-3.5 h-3.5 text-fg-muted" />
        <span className="text-xs text-fg-muted">New Task</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {/* Name */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="Task name"
          autoFocus
          className="w-full text-sm font-semibold px-2 py-1.5 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {/* Project */}
        <div className="flex items-center gap-2">
          <Folder className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
          <span className="text-xs text-fg-muted">Project:</span>
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
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

        {/* Due date */}
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
          <span className="text-xs text-fg-muted">Due:</span>
          <input
            type="date"
            value={dueDate ?? ''}
            onChange={(e) => setDueDate(e.target.value || null)}
            className="flex-1 text-xs px-2 py-1 rounded border border-border-default bg-bg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Priority */}
        <div className="flex items-center gap-2">
          <Folder className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
          <span className="text-xs text-fg-muted">Priority:</span>
          <div className="flex gap-1">
            {([
              [null, 'None'],
              [0, 'Low'],
              [1, 'Medium'],
              [2, 'High'],
            ] as [number | null, string][]).map(([val, label]) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setPriority(val)}
                className={`px-2 py-0.5 rounded text-xs ${
                  priority === val
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-fg-secondary hover:bg-bg-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Submit button */}
      <div className="flex-shrink-0 border-t border-border-default bg-bg-primary p-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Task
        </button>
      </div>
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export function TasksView({ resetKey, initialProjectId }: TasksViewProps = {}) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<TududiTask[] | null>(null);
  const [projects, setProjects] = useState<TududiProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null | 'all'>(null);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  // Navigation
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [newTaskMode, setNewTaskMode] = useState(false);

  useEffect(() => {
    setSelectedUid(null);
  }, [resetKey]);

  useEffect(() => {
    if (initialProjectId != null) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const [tasksRes, projectsRes] = await Promise.all([
        tududiApi.listTasks(),
        tududiApi.listProjects(),
      ]);
      setTasks(tasksRes.tasks);
      setProjects(projectsRes.projects);
      if (selectedProjectId === null && initialProjectId == null && projectsRes.projects.length > 0) {
        setSelectedProjectId('all');
      }
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, initialProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleTasks = useMemo(() => {
    if (!tasks) return [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return tasks
      .filter((task) => {
        if (task.parent_task_id) return false;
        if (!isVisible(task.status)) return false;
        if (query) {
          const haystack = `${displayName(task)} ${task.original_name ?? ''} ${task.name}`.toLowerCase();
          if (!haystack.includes(query.toLowerCase())) return false;
        }
        if (filter === 'today') {
          if (!task.due_date) return false;
          const d = new Date(task.due_date);
          return d <= today;
        }
        if (filter === 'upcoming') {
          if (!task.due_date) return false;
          const d = new Date(task.due_date);
          return d > today;
        }
        return true;
      })
      .sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        const ap = a.priority ?? -1;
        const bp = b.priority ?? -1;
        if (ap !== bp) return bp - ap;
        const ac = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bc = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bc - ac;
      });
  }, [tasks, filter, query]);

  // Apply project filter on top
  const filteredTasks = useMemo(() => {
    if (selectedProjectId === 'all' || selectedProjectId === null) return visibleTasks;
    return visibleTasks.filter((t) => t.project_id === selectedProjectId);
  }, [visibleTasks, selectedProjectId]);

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<number | null, TududiTask[]>();
    for (const task of filteredTasks) {
      const key = task.project_id ?? null;
      const arr = map.get(key) ?? [];
      arr.push(task);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([projectId, items]) => ({
      projectId,
      projectName: items[0]?.Project?.name ?? null,
      tasks: items,
    }));
  }, [filteredTasks]);

  // Project groups for filter bar (based on all visible tasks, not filtered)
  const projectGroups = useMemo(() => {
    const map = new Map<number | null, number>();
    for (const t of visibleTasks) {
      const key = t.project_id ?? null;
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
  }, [visibleTasks, projects]);

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!projectDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [projectDropdownOpen]);

  function onTaskUpdated(updated: TududiTask) {
    setTasks((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((t) => t.uid === updated.uid);
      if (idx === -1) return [updated, ...prev];
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
  }

  function onTaskStatusChange(task: TududiTask, status: number) {
    const optimistic = { ...task, status };
    onTaskUpdated(optimistic);
    tududiApi
      .updateTask(task.uid, { status })
      .then((updated) => onTaskUpdated(updated))
      .catch(() => {
        // Rollback to the pre-edit state. We don't refetch the whole list
        // because that would clobber any other concurrent local edits (e.g.
        // an inline status change on another row that's still in flight).
        onTaskUpdated(task);
      });
  }

  function onTaskDeleted(uid: string) {
    setTasks((prev) => prev?.filter((t) => t.uid !== uid) ?? null);
    setSelectedUid(null);
  }

  async function handleCreateTask(input: { name: string; project_id?: number | null; due_date?: string | null; priority?: number | null }) {
    try {
      const created = await tududiApi.createTask({ ...input, status: 0 });
      setTasks((prev) => (prev ? [created, ...prev] : [created]));
      setNewTaskMode(false);
      setSelectedUid(created.uid);
    } catch (e) {
      const msg = e instanceof TududiApiError ? e.message : String(e);
      setError(msg);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      </div>
    );
  }

  // ── Task detail ──────────────────────────────────────────────────────────

  if (selectedUid && tasks) {
    const selected = tasks.find((t) => t.uid === selectedUid);
    if (selected) {
      return (
        <TaskDetail
          task={selected}
          projects={projects}
          onBack={() => setSelectedUid(null)}
          onUpdated={onTaskUpdated}
          onDeleted={onTaskDeleted}
        />
      );
    }
  }

  // ── New task page ────────────────────────────────────────────────────────

  if (newTaskMode) {
    return (
      <NewTaskPage
        projects={projects}
        onCancel={() => setNewTaskMode(false)}
        onCreate={handleCreateTask}
      />
    );
  }

  // ── Main list ────────────────────────────────────────────────────────────

  const totalCount = filteredTasks.length;

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
        {/* Time filters + project dropdown */}
        <div className="flex items-center gap-1.5">
          {(['all', 'today', 'upcoming'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-fg-secondary hover:bg-bg-secondary'
              }`}
            >
              {t(`tududi.tasks.filter.${f}`, f)}
              {f === 'all' && totalCount > 0 && (
                <span className="ml-1 opacity-60">{totalCount}</span>
              )}
            </button>
          ))}
          {/* Project dropdown */}
          {projectGroups.length > 0 && (
            <div className="relative ml-auto" ref={projectDropdownRef}>
              <button
                type="button"
                onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                className={`p-1.5 rounded-lg transition-colors ${
                  selectedProjectId !== 'all'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-fg-muted hover:bg-bg-secondary'
                }`}
                title="Filter by project"
              >
                <Folder className="w-3.5 h-3.5" />
              </button>
              {projectDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-bg-primary border border-border-default rounded-lg shadow-lg z-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectId('all');
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs ${
                      selectedProjectId === 'all'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-fg-secondary hover:bg-bg-secondary'
                    }`}
                  >
                    All projects
                  </button>
                  {projectGroups
                    .filter((g) => g.projectId !== null)
                    .map((g) => (
                      <button
                        key={g.projectId}
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(g.projectId);
                          setProjectDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 ${
                          selectedProjectId === g.projectId
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                            : 'text-fg-secondary hover:bg-bg-secondary'
                        }`}
                      >
                        <Folder className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate flex-1">{g.projectName}</span>
                        <span className="text-[10px] text-fg-muted">{g.count}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border-default bg-bg-primary">
          <Search className="w-3 h-3 text-fg-muted flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
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

        {/* Task list */}
        {grouped.length === 0 && (
          <div className="flex items-center justify-center h-full p-6 text-center text-xs text-fg-muted">
            {tasks?.length === 0
              ? 'No tasks yet — create one below.'
              : 'Nothing matches this filter.'}
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.projectId ?? 'no-project'} className="mb-3">
            {group.projectName && (
              <div className="px-1 py-1 flex items-center">
                <h3 className="text-xs font-semibold text-fg-primary">{group.projectName}</h3>
                <span className="ml-auto text-[10px] text-fg-muted">{group.tasks.length}</span>
              </div>
            )}
            <div className="space-y-1">
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.uid}
                  task={task}
                  onOpen={(uid) => setSelectedUid(uid)}
                  onStatusChange={onTaskStatusChange}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* New task button */}
      <div className="flex-shrink-0 border-t border-border-default bg-bg-primary p-2">
        <button
          type="button"
          onClick={() => setNewTaskMode(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-secondary hover:bg-bg-secondary transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onOpen,
  onStatusChange,
}: {
  task: TududiTask;
  onOpen: (uid: string) => void;
  onStatusChange: (task: TududiTask, status: number) => void;
}) {
  const due = dueLabel(task.due_date);
  const isRecurring = !!task.recurrence_type && task.recurrence_type !== 'none';
  const name = displayName(task);
  const subtaskCount = task.subtasks?.length ?? 0;
  const openSubs = task.subtasks?.filter((s) => s.status !== 2 && s.status !== 3).length ?? 0;

  return (
    <div
      onClick={() => onOpen(task.uid)}
      className="px-3 py-2.5 rounded-lg border border-border-default bg-bg-primary hover:bg-bg-secondary cursor-pointer flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-fg-primary truncate">{name}</div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-fg-muted flex-wrap">
          {task.due_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="w-3 h-3" />
              <span className={due?.cls ?? 'text-fg-muted'}>
                {due?.text ?? new Date(task.due_date).toLocaleDateString()}
              </span>
            </span>
          )}
          {isRecurring && (
            <span className="inline-flex items-center gap-1">
              <RecurringIcon className="w-3 h-3" />
              {task.recurrence_type}
            </span>
          )}
          {subtaskCount > 0 && (
            <span>☑ {openSubs}/{subtaskCount}</span>
          )}
          {task.tags && task.tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
              {task.tags.slice(0, 3).map((tag, i) => (
                <span key={`${task.uid}-tag-${i}`} className="px-1 rounded bg-bg-secondary">
                  #{tag}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <StatusControl task={task} onStatusChange={(s) => onStatusChange(task, s)} />
    </div>
  );
}
