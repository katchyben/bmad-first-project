import { CircleAlert } from 'lucide-react';
import type { TaskResponse, TaskStatus } from '@/client/types.gen';
import { formatDue } from './formatDue';

const STATUS_LABEL: Record<TaskStatus, string> = {
  to_do: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** The To do mark: an 18px line-drawn empty circle (1.5px stroke). Decorative. */
function EmptyCircle() {
  return (
    <svg
      aria-hidden="true"
      data-testid="status-mark"
      viewBox="0 0 18 18"
      className="mt-[3px] size-status-mark shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="9" cy="9" r="8.25" />
    </svg>
  );
}

/** The row's accessible name: "<full title>, To do, due <due text>[, overdue]". */
export function rowLabel(task: TaskResponse, dueText: string, overdue: boolean): string {
  const label = `${task.title}, ${STATUS_LABEL[task.status]}, due ${dueText}`;
  return overdue ? `${label}, overdue` : label;
}

type Props = {
  task: TaskResponse;
  /** The row's DOM id, which the grid's `aria-activedescendant` points at. */
  id: string;
  /** The browser's current time, for the due text. */
  now: Date;
  /** Whether the row shows the overdue treatment (server or live promotion). */
  overdue: boolean;
  /** Whether this is the grid's selected row. */
  selected: boolean;
  /** Whether the grid has focus: the selected row then carries the ring. */
  focused: boolean;
  /** Select this row (on press or click). */
  onSelect: () => void;
};

/**
 * One task row (DESIGN.md Task row) in the task grid: cell 1 holds the status
 * mark, the title (clamped to two lines unless selected), the optional overdue
 * label and the due time; cell 2 holds the row actions. The labels and due time
 * wrap under the title when the row is narrow. Selected rows take the
 * `row-selected` tint (overdue rows keep theirs) and, while the grid has focus,
 * the 2px inset ring. Class names are joined plainly, not with `cn()`, because
 * tailwind-merge would treat the custom `text-row-*` sizes as colours.
 */
export function TaskRow({ task, id, now, overdue, selected, focused, onSelect }: Props) {
  const dueText = formatDue(new Date(task.due_at), now);
  const background = overdue
    ? 'bg-overdue-tint shadow-[inset_3px_0_0_var(--overdue)]'
    : selected
      ? 'bg-row-selected'
      : 'bg-card';
  const rowClass = [
    'flex min-h-row-min-height items-start px-row-padding-x py-row-padding-y',
    'border-t border-border first:border-t-0',
    background,
    selected && focused ? 'row-ring' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="row"
      id={id}
      aria-selected={selected}
      aria-label={rowLabel(task, dueText, overdue)}
      data-overdue={overdue || undefined}
      data-selected={selected || undefined}
      className={rowClass}
      // Select on press so the grid's focus (which follows) finds this row selected.
      onMouseDown={(event) => {
        if (event.button === 0) onSelect();
      }}
      onClick={onSelect}
    >
      <div role="gridcell" className="flex min-w-0 flex-1 items-start gap-row-gap">
        <span className={overdue ? 'text-overdue' : 'text-muted-foreground'}>
          <EmptyCircle />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-row-gap">
          <span
            data-testid="task-title"
            className={`${selected ? '' : 'line-clamp-2 '}min-w-0 flex-[1_1_12rem] text-row-title wrap-anywhere text-foreground`}
          >
            {task.title}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-row-gap">
            {overdue && (
              <span className="flex items-center gap-1 text-overdue-label text-overdue">
                <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
                Overdue
              </span>
            )}
            <span
              data-testid="task-due"
              className={`text-row-meta ${overdue ? 'text-overdue' : 'text-muted-foreground'}`}
            >
              {dueText}
            </span>
          </span>
        </div>
      </div>
      {/* Row actions arrive with the edit and delete stories. */}
      <div role="gridcell" data-testid="row-actions" className="shrink-0" />
    </div>
  );
}
