import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useAnnounce } from '@/a11y/announce';
import { isUnreachable } from '@/api/errors';
import { listTasksOptions } from '@/client/@tanstack/react-query.gen';
import type { TaskResponse } from '@/client/types.gen';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fade } from '@/lib/motion';
import { EditTaskRow } from './EditTaskRow';
import { isActive, isShownOverdue } from './overdue';
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

/** The grid's instruction text, read after its name. */
export const GRID_INSTRUCTIONS =
  'Use arrow keys to move, S start, B move back, C complete, X cancel, E edit, Backspace delete, Z undo.';

/** The selected task, and where it was, so a vanished task hands over to its old index. */
type Selection = { id: number; index: number };

/** The task open in the inline edit row, and a counter that asks it to focus its title. */
type Editing = { id: number; focusRequest: number };

/** E with no modifiers (Caps Lock may report it upper-case). */
const isEditKey = (event: KeyboardEvent) =>
  (event.key === 'e' || event.key === 'E') &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey;

/**
 * Keep the selection on its task across refetches; if the task is gone, move it
 * to the row now at its old index, clamped to the list.
 */
function followSelection(selection: Selection | null, tasks: TaskResponse[]): Selection | null {
  if (selection === null || tasks.length === 0) return selection;
  const index = tasks.findIndex((t) => t.id === selection.id);
  if (index !== -1) return index === selection.index ? selection : { id: selection.id, index };
  const clamped = Math.min(selection.index, tasks.length - 1);
  return { id: tasks[clamped].id, index: clamped };
}

type GridProps = {
  tasks: TaskResponse[];
  now: Date;
  gridRef?: RefObject<HTMLDivElement | null>;
  /** Called when the grid unmounts while it has focus (the list became empty). */
  onEmptied?: () => void;
};

/**
 * The task grid: one Tab stop that keeps DOM focus and points at the selected
 * row with `aria-activedescendant`. The first focus selects the first row;
 * ↑/↓ move one row and stop at the ends; clicking a row selects it and focuses
 * the grid. E (or the row's Edit action) on an active task replaces its row
 * with the inline edit row. Only one is open: E on another row discards it,
 * while clicking or arrowing to another row leaves it open. When it closes, its
 * task is selected and the grid focused again; if a refetch drops the task or
 * finishes it, the row goes and focus returns to the grid. The other letter
 * shortcuts belong to later stories.
 */
function TaskGrid({ tasks, now, gridRef, onEmptied }: GridProps) {
  const id = useId();
  const instructionsId = `${id}-instructions`;
  const rowId = (taskId: number) => `${id}-task-${taskId}`;
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = gridRef ?? ownRef;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const announce = useAnnounce();

  // Adjusted during render, so a refetch never paints a stale selection.
  const followed = followSelection(selection, tasks);
  if (followed !== selection) setSelection(followed);
  const selectedId = followed?.id ?? null;

  // The edited task is gone or finished after a refetch: drop the edit row,
  // and hand focus (which it took with it) back to the grid.
  const [refocus, setRefocus] = useState(false);
  if (editing !== null) {
    const edited = tasks.find((t) => t.id === editing.id);
    if (edited === undefined || !isActive(edited)) {
      setEditing(null);
      setRefocus(true);
    }
  }
  useLayoutEffect(() => {
    if (!refocus) return;
    setRefocus(false);
    const active = document.activeElement;
    if (active === null || active === document.body) ref.current?.focus();
  }, [refocus, ref]);
  const selectedIndex = followed?.index ?? null;

  // Only while the grid has focus, so the page never jumps while the user types.
  useEffect(() => {
    if (selectedId === null || !focused) return;
    document.getElementById(`${id}-task-${selectedId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [id, selectedId, selectedIndex, focused]);

  // Runs before the grid leaves the DOM: hand focus on rather than drop it to body.
  const onEmptiedRef = useRef(onEmptied);
  useEffect(() => {
    onEmptiedRef.current = onEmptied;
  });
  useLayoutEffect(() => {
    const grid = ref.current;
    return () => {
      if (grid !== null && grid.contains(document.activeElement)) onEmptiedRef.current?.();
    };
  }, [ref]);

  const select = (index: number) => setSelection({ id: tasks[index].id, index });

  /** Open the edit row on the task at `index`, discarding any other one. */
  function openEdit(index: number) {
    const taskId = tasks[index].id;
    select(index);
    setEditing((current) => ({ id: taskId, focusRequest: (current?.focusRequest ?? 0) + 1 }));
  }

  /** The edit row closed: select its task by ID, focus the grid, and announce a save. */
  function closeEdit(taskId: number, index: number, saved: boolean) {
    setEditing((current) => (current?.id === taskId ? null : current));
    setSelection({ id: taskId, index });
    ref.current?.focus();
    if (saved) announce('Saved.');
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys typed inside the edit row (or its popover) are the row's own.
    if (event.target !== event.currentTarget) return;
    if (isEditKey(event)) {
      if (followed === null || !isActive(tasks[followed.index])) return;
      event.preventDefault();
      openEdit(followed.index);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (followed === null) {
      select(0);
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : -1;
    // No wrap-around: the selection stops at the first and last rows.
    select(Math.min(Math.max(followed.index + step, 0), tasks.length - 1));
  }

  return (
    <>
      <p id={instructionsId} className="sr-only">
        {GRID_INSTRUCTIONS}
      </p>
      {/* Rows render exactly in API order: the client never sorts or filters. */}
      <div
        ref={ref}
        role="grid"
        aria-label="Tasks"
        aria-describedby={instructionsId}
        aria-activedescendant={selectedId === null ? undefined : rowId(selectedId)}
        tabIndex={0}
        // The selected row's ring shows the focus; the grid draws none of its own.
        className="overflow-hidden rounded-lg border border-border bg-card outline-none focus-visible:outline-none"
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          setFocused(true);
          setSelection((current) => current ?? { id: tasks[0].id, index: 0 });
        }}
        onBlur={(event) => {
          if (event.target === event.currentTarget) setFocused(false);
        }}
        onKeyDown={onKeyDown}
      >
        <TooltipProvider>
          {tasks.map((task, index) =>
            editing?.id === task.id && isActive(task) ? (
              <EditTaskRow
                key={task.id}
                id={rowId(task.id)}
                task={task}
                now={now}
                selected={task.id === selectedId}
                focusRequest={editing.focusRequest}
                onClose={(saved) => closeEdit(task.id, index, saved)}
              />
            ) : (
              <TaskRow
                key={task.id}
                id={rowId(task.id)}
                task={task}
                now={now}
                overdue={isShownOverdue(task, now)}
                selected={task.id === selectedId}
                focused={focused}
                onSelect={() => {
                  select(index);
                  ref.current?.focus();
                }}
                onEdit={isActive(task) ? () => openEdit(index) : undefined}
              />
            ),
          )}
        </TooltipProvider>
      </div>
    </>
  );
}

type ListProps = { gridRef?: RefObject<HTMLDivElement | null>; onEmptied?: () => void };

function Loaded({ tasks, gridRef, onEmptied }: ListProps & { tasks: TaskResponse[] }) {
  const now = useNow();
  const shown = useShown();
  return (
    <div data-testid="task-list-content" className={`${fade} ${shown ? 'opacity-100' : 'opacity-0'}`}>
      {tasks.length === 0 ? <EmptyState /> : <TaskGrid tasks={tasks} now={now} gridRef={gridRef} onEmptied={onEmptied} />}
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
export function TaskList({ gridRef, onEmptied }: ListProps = {}) {
  const query = useQuery(listTasksOptions());
  const coldLoad = query.isPending && !isUnreachable(query.failureReason);
  const showLoading = useDelayed(coldLoad, LOADING_DELAY_MS);

  if (query.data !== undefined) return <Loaded tasks={query.data} gridRef={gridRef} onEmptied={onEmptied} />;
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
