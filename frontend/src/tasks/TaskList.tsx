import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isUnreachable } from '@/api/errors';
import { listTasksOptions } from '@/client/@tanstack/react-query.gen';
import type { TaskResponse } from '@/client/types.gen';
import { fade } from '@/lib/motion';
import { isShownOverdue } from './overdue';
import { TaskRow } from './TaskRow';
import { useNow } from './useNow';

/** How long a cold load may be pending before "Loading…" shows. */
export const LOADING_DELAY_MS = 1000;

/** True once `active` has stayed true for `delayMs`; false again as soon as it isn't. */
function useDelayed(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}

/** False on the first paint, true from the next frame: drives a fade-in from opacity 0. */
function useShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return shown;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-card px-empty-padding-x py-empty-padding-y text-center">
      <span
        aria-hidden="true"
        data-testid="empty-ring"
        className="size-empty-ring rounded-full border-[1.5px] border-border"
      />
      <p className="mt-4 text-empty-title text-foreground">Nothing due. Enjoy the quiet.</p>
      <p className="mt-1 text-caption text-muted-foreground">Type above when something comes up.</p>
    </div>
  );
}

function Loaded({ tasks }: { tasks: TaskResponse[] }) {
  const now = useNow();
  const shown = useShown();
  return (
    <div data-testid="task-list-content" className={`${fade} ${shown ? 'opacity-100' : 'opacity-0'}`}>
      {tasks.length === 0 ? (
        <EmptyState />
      ) : (
        // Rows render exactly in API order: the client never sorts or filters.
        <ul aria-label="Tasks" className="overflow-hidden rounded-lg border border-border bg-card">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} now={now} overdue={isShownOverdue(task, now)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The task list under the main screen header. No spinner or
 * skeleton: a cold load still pending after 1 s, with the server reachable,
 * shows one muted "Loading…" line, announced once; refetches never show it
 * because the query is no longer pending. An unreachable server is the
 * connection banner's job, and other failures go to the global error toast.
 */
export function TaskList() {
  const query = useQuery(listTasksOptions());
  const coldLoad = query.isPending && !isUnreachable(query.failureReason);
  const showLoading = useDelayed(coldLoad, LOADING_DELAY_MS);

  if (query.data !== undefined) return <Loaded tasks={query.data} />;
  if (!query.isPending) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`px-row-padding-x py-row-padding-y text-caption text-muted-foreground ${fade} ${showLoading ? 'opacity-100' : 'opacity-0'}`}
    >
      {showLoading ? 'Loading…' : ''}
    </p>
  );
}
