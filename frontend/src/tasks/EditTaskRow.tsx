import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { errorCode, errorMessage, isEnvelopeError } from '@/api/errors';
import { showErrorToast } from '@/api/errorToast';
import { editTaskMutation, listTasksQueryKey } from '@/client/@tanstack/react-query.gen';
import type { EditTaskBody, TaskResponse } from '@/client/types.gen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { chipClass } from './chipClass';
import { DuePicker } from './DuePicker';
import { FIELD_TEXT, KBD_HINT, isSubmitEnter } from './fields';
import { formatDue } from './formatDue';
import { PRESETS, resolvePreset, toLocalIso, type PresetId } from './presets';

/** The task's current due (untouched), a preset, or an instant picked in the popover. */
type Due =
  | { kind: 'current' }
  | { kind: 'preset'; preset: PresetId }
  | { kind: 'picked'; at: Date };

/**
 * The PATCH body: only the fields that differ from `task`. The title goes as
 * typed (the API decides every rule); an emptied description goes as `null`;
 * a preset resolves now, and a due equal to the current one is never sent.
 */
function changedFields(
  task: TaskResponse,
  fields: { title: string; description: string; due: Due },
  now: Date,
): EditTaskBody {
  const body: EditTaskBody = {};
  if (fields.title !== task.title) body.title = fields.title;
  if (fields.description !== (task.description ?? '')) {
    body.description = fields.description === '' ? null : fields.description;
  }
  const { due } = fields;
  const dueAt =
    due.kind === 'preset' ? resolvePreset(due.preset, now) : due.kind === 'picked' ? due.at : null;
  if (dueAt !== null && dueAt.getTime() !== new Date(task.due_at).getTime()) {
    body.due_at = toLocalIso(dueAt);
  }
  return body;
}

type Props = {
  task: TaskResponse;
  /** The row's DOM id: the same one the read row has, for `aria-activedescendant`. */
  id: string;
  /** The browser's current time, for the current-due chip text. */
  now: Date;
  selected: boolean;
  /** Bumped each time the grid asks for the title to take focus (E or Edit). */
  focusRequest: number;
  /** The row closes: `saved` after a successful save, otherwise a discard. */
  onClose: (saved: boolean) => void;
};

/**
 * The inline edit row (DESIGN.md `inline-edit-row`): it replaces a task row in
 * place, with the title, the description and the due control, one error slot
 * and Cancel / Save. Save sends only the changed fields through the generated
 * client; the list query is invalidated and refetched, never updated in place.
 * A `validation_error` shows its envelope message in the slot; other envelope
 * errors go to the error toast. The row stays open, fields kept, on any failure.
 */
export function EditTaskRow({ task, id, now, selected, focusRequest, onClose }: Props) {
  const fieldId = useId();
  const titleId = `${fieldId}-title`;
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [due, setDue] = useState<Due>({ kind: 'current' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  // A ref, not the mutation state: a second Enter can arrive before React re-renders.
  const inFlight = useRef(false);
  // Set once the row has closed (Cancel, or another row opened): a save that
  // lands afterwards still refreshes the list but no longer moves focus.
  const closed = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);

  // Title focused with the cursor at the end, on open and on every new request.
  useEffect(() => {
    const input = titleRef.current;
    if (input === null) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [focusRequest]);

  const queryClient = useQueryClient();
  const edit = useMutation({
    ...editTaskMutation(),
    onSuccess: async () => {
      // Close after the refetch, so the row reopens on the saved values.
      await queryClient.invalidateQueries({ queryKey: listTasksQueryKey() });
      if (closed.current) return;
      closed.current = true;
      onCloseRef.current(true);
    },
    onError: (failure) => {
      // A 5xx goes to the global toast and a network failure to the connection
      // banner; a 401 to the login screen. Fields are kept every time.
      if (!isEnvelopeError(failure)) return;
      const code = errorCode(failure);
      if (code === 'validation_error') setError(errorMessage(failure));
      else if (code !== 'unauthenticated') showErrorToast(failure);
      // The task is gone or finished: refetch, so the grid drops this row.
      if (code === 'not_found' || code === 'state_conflict') {
        void queryClient.invalidateQueries({ queryKey: listTasksQueryKey() });
      }
    },
    onSettled: () => {
      inFlight.current = false;
      setPending(false);
    },
  });

  function close(saved: boolean) {
    // Cancel / Esc wait for an in-flight save: it would land after a "discard".
    if (closed.current || inFlight.current) return;
    closed.current = true;
    onCloseRef.current(saved);
  }

  /** Save; `withDue` is a due chosen in the same keystroke, before its state update lands. */
  function save(withDue: Due = due) {
    if (inFlight.current) return;
    const body = changedFields(task, { title, description, due: withDue }, new Date());
    // Nothing changed: no request, the row just closes.
    if (Object.keys(body).length === 0) {
      close(false);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    edit.mutate({ path: { task_id: task.id }, body });
  }

  function onEnterSave(event: KeyboardEvent) {
    if (!isSubmitEnter(event)) return;
    event.preventDefault();
    save();
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    // Keys from the due popover reach here through the React tree; it handles its own Esc.
    if (!event.currentTarget.contains(event.target as Node)) return;
    event.preventDefault();
    close(false);
  }

  /** Enter on a preset chip applies that preset and saves with it. */
  function onPresetKeyDown(event: KeyboardEvent, preset: PresetId) {
    if (!isSubmitEnter(event)) return;
    event.preventDefault();
    const next: Due = { kind: 'preset', preset };
    setDue(next);
    save(next);
  }

  const currentDue = new Date(task.due_at);

  return (
    <div
      role="row"
      id={id}
      aria-selected={selected}
      aria-label={`Edit '${task.title}'`}
      data-testid="edit-row"
      className="border-t border-border bg-card px-row-padding-x py-row-padding-y first:border-t-0"
      onKeyDown={onRowKeyDown}
    >
      <div role="gridcell" className="flex flex-col gap-2">
        <label htmlFor={titleId} className="sr-only">
          Task title
        </label>
        <Input
          ref={titleRef}
          id={titleId}
          name="title"
          autoComplete="off"
          className={`h-auto min-h-[38px] rounded-md bg-card px-3 dark:bg-card ${FIELD_TEXT}`}
          value={title}
          aria-describedby={errorId}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onEnterSave}
        />
        <label htmlFor={descriptionId} className="sr-only">
          Description
        </label>
        <Textarea
          id={descriptionId}
          name="description"
          rows={3}
          placeholder="Description (optional)"
          className={`field-sizing-fixed min-h-0 rounded-md bg-card px-3 py-2 dark:bg-card ${FIELD_TEXT}`}
          value={description}
          aria-describedby={errorId}
          onChange={(e) => setDescription(e.target.value)}
          // Enter saves; Shift+Enter keeps its newline.
          onKeyDown={onEnterSave}
        />
        <p
          id={errorId}
          role="alert"
          className={error === null ? undefined : 'text-caption text-foreground'}
        >
          {error}
        </p>
        <div className="flex flex-wrap items-center gap-x-row-gap gap-y-2">
          <div
            role="group"
            aria-label="Due"
            className="flex min-w-0 flex-wrap gap-1.5"
          >
            {PRESETS.map((p) => {
              const pressed = due.kind === 'preset' && due.preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={pressed}
                  aria-describedby={errorId}
                  className={chipClass(pressed)}
                  onClick={() => setDue({ kind: 'preset', preset: p.id })}
                  onKeyDown={(event) => onPresetKeyDown(event, p.id)}
                >
                  {p.label}
                </button>
              );
            })}
            <DuePicker
              value={due.kind === 'picked' ? due.at : due.kind === 'current' ? currentDue : null}
              pressed={due.kind === 'picked'}
              label={due.kind === 'current' ? formatDue(currentDue, now) : undefined}
              onSet={(at) => setDue({ kind: 'picked', at })}
              focusAfterSet={titleRef}
              describedBy={errorId}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              aria-keyshortcuts="Escape"
              aria-disabled={pending || undefined}
              className="min-target gap-1.5 text-[13px] text-muted-foreground hover:text-foreground aria-disabled:opacity-60"
              onClick={() => close(false)}
            >
              Cancel
              <kbd aria-hidden="true" className={KBD_HINT}>
                Esc
              </kbd>
            </Button>
            <Button
              type="button"
              aria-keyshortcuts="Enter"
              aria-disabled={pending || undefined}
              className="min-target gap-1.5 text-[13px] aria-disabled:opacity-60"
              onClick={() => save()}
            >
              Save
              <kbd aria-hidden="true" className={KBD_HINT}>
                ↵
              </kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
