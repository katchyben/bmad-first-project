import type { TaskResponse } from '@/client/types.gen';

const ACTIVE = new Set<TaskResponse['status']>(['to_do', 'in_progress']);

/** Whether a task is active (To do or In progress), as opposed to finished. */
export function isActive(task: TaskResponse): boolean {
  return ACTIVE.has(task.status);
}

/**
 * Whether a row shows as overdue: the server said so, or the task is
 * active and its due time has passed in the browser's clock. The client only
 * ever promotes: it never clears a server `true` and never touches finished tasks.
 */
export function isShownOverdue(task: TaskResponse, now: Date): boolean {
  if (task.is_overdue) return true;
  return isActive(task) && new Date(task.due_at).getTime() < now.getTime();
}
