import type { TududiTask } from '../../lib/api/tududi';

export type StatusKey =
  | 'not_started'
  | 'in_progress'
  | 'done'
  | 'archived'
  | 'waiting'
  | 'cancelled'
  | 'planned';

export const STATUS_IDS: Record<StatusKey, number> = {
  not_started: 0,
  in_progress: 1,
  planned: 6,
  waiting: 4,
  done: 2,
  cancelled: 5,
  archived: 3,
};

export const STATUS_LABELS: Record<StatusKey, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  planned: 'Planned',
  waiting: 'Waiting',
  done: 'Done',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

export function getStatusString(status: number | null | undefined): StatusKey {
  if (status === 6) return 'planned';
  if (status === 1) return 'in_progress';
  if (status === 2) return 'done';
  if (status === 3) return 'archived';
  if (status === 4) return 'waiting';
  if (status === 5) return 'cancelled';
  return 'not_started';
}

export function isVisible(status: number): boolean {
  return status !== 2 && status !== 3 && status !== 5;
}

const RECURRING_PLACEHOLDER = new Set(['monthly', 'daily', 'weekly', 'yearly']);

export function isRecurringPlaceholder(
  name: string | undefined,
  recurrenceType: string | null | undefined,
): boolean {
  if (!recurrenceType || recurrenceType === 'none') return false;
  if (!name) return true;
  return RECURRING_PLACEHOLDER.has(name.trim().toLowerCase());
}

export function displayName(task: TududiTask): string {
  if (isRecurringPlaceholder(task.name, task.recurrence_type) && task.original_name) {
    return task.original_name;
  }
  return task.name;
}

export function dueLabel(
  iso: string | null | undefined,
): { text: string; cls: string } | null {
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
