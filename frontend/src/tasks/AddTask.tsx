import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useAnnounce } from '@/a11y/announce';
import { errorMessage, isEnvelopeError } from '@/api/errors';
import { createTaskMutation, listTasksQueryKey } from '@/client/@tanstack/react-query.gen';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDue } from './formatDue';
import { DEFAULT_PRESET, PRESETS, resolvePreset, toLocalIso, type PresetId } from './presets';

// Class lists that mix the custom `text-<role>` sizes with colours are joined
// plainly, not with `cn()`: tailwind-merge would drop one as a colour clash.
// The shadcn Input and Textarea go through `cn()`, so they take the 15px input
// size as an arbitrary value, which tailwind-merge does recognise as a size,
// and the textarea's 16px padding (add-input-padding-x) as `px-4` so it replaces
// the primitive's `px-2.5`.
const FIELD_TEXT = 'text-[15px] md:text-[15px]';

const chipClass = (pressed: boolean) =>
  [
    'inline-flex min-h-min-target items-center rounded-full border px-2.5 text-chip whitespace-nowrap',
    'focus-ring transition-colors',
    pressed
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-muted-foreground hover:text-foreground',
  ].join(' ');

/**
 * True for the Enter that submits: not Shift+Enter, and not one that ends an IME
 * composition (Safari reports that one with `isComposing` false but keyCode 229).
 */
function isSubmitEnter(event: KeyboardEvent): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229
  );
}

type Fields = { title: string; preset: PresetId; description: string };

/**
 * The add-task input (DESIGN.md Components > Add-task input, Preset chip, Add
 * description link): a title field, the preset chips beneath it, and an "Add
 * description" link that expands to a textarea. Enter creates the task through
 * the generated client; the list query is invalidated, never updated in place.
 * The API decides every rule: its envelope message shows as written in the one
 * error slot, and everything typed is kept.
 */
export function AddTask() {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState<PresetId>(DEFAULT_PRESET);
  const [description, setDescription] = useState('');
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // What was sent, and what the fields hold now: a success resets only the
  // fields the user has not changed while the request was in flight.
  const submitted = useRef<Fields | null>(null);
  const latest = useRef<Fields>({ title, preset, description });
  useEffect(() => {
    latest.current = { title, preset, description };
  });
  // Set when the link opens the textarea, so focus moves into it once it mounts.
  const focusDescription = useRef(false);
  // A ref, not the mutation state: a second Enter can arrive before React re-renders.
  const inFlight = useRef(false);

  const queryClient = useQueryClient();
  const announce = useAnnounce();

  const create = useMutation({
    ...createTaskMutation(),
    onSuccess: (task) => {
      announce(`Added '${task.title}', due ${formatDue(new Date(task.due_at), new Date())}.`);
      const sent = submitted.current;
      const now = latest.current;
      const descriptionCleared = sent !== null && now.description === sent.description;
      if (sent !== null) {
        if (now.title === sent.title) setTitle('');
        if (now.preset === sent.preset) setPreset(DEFAULT_PRESET);
        if (descriptionCleared) {
          setDescription('');
          setDescriptionOpen(false);
        }
      }
      setError(null);
      // Return to the title from inside the form or the page, except from a
      // description that stays open with the user's text: leave focus there, and
      // wherever else the user moved it during a slow create.
      const active = document.activeElement;
      const inForm = active !== null && (formRef.current?.contains(active) ?? false);
      const keptDescription = active === descriptionRef.current && !descriptionCleared;
      if (active === null || active === document.body || (inForm && !keptDescription)) {
        titleRef.current?.focus();
      }
      void queryClient.invalidateQueries({ queryKey: listTasksQueryKey() });
    },
    onError: (failure) => {
      // A 5xx goes to the global toast and a network failure to the connection
      // banner; only an envelope belongs in the slot. Fields are kept either way.
      if (isEnvelopeError(failure)) setError(errorMessage(failure));
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  useEffect(() => {
    if (descriptionOpen && focusDescription.current) {
      focusDescription.current = false;
      descriptionRef.current?.focus();
    }
  }, [descriptionOpen]);

  function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    // No pre-validation: a blank title goes to the API like any other value.
    submitted.current = { title, preset, description };
    const dueAt = toLocalIso(resolvePreset(preset, new Date()));
    create.mutate({
      body: { title, due_at: dueAt, ...(description === '' ? {} : { description }) },
    });
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isSubmitEnter(event)) return;
    event.preventDefault();
    submit();
  }

  function onDescriptionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSubmitEnter(event)) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      titleRef.current?.focus();
    }
  }

  function openDescription() {
    focusDescription.current = true;
    setDescriptionOpen(true);
  }

  const invalid = error !== null;
  const errorProps = {
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? errorId : undefined,
  };

  return (
    <form
      ref={formRef}
      noValidate
      aria-label="Add a task"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="relative">
        <label htmlFor={titleId} className="sr-only">
          Add a task
        </label>
        <Plus
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-add-input-padding-x size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={titleRef}
          id={titleId}
          name="title"
          autoComplete="off"
          placeholder="Add a task"
          className={`h-auto min-h-add-input-min-height rounded-lg bg-card pr-16 pl-10 dark:bg-card ${FIELD_TEXT}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onTitleKeyDown}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => setTitleFocused(false)}
          {...errorProps}
        />
        <kbd
          aria-hidden="true"
          data-testid="kbd-hint"
          className="pointer-events-none absolute top-1/2 right-add-input-padding-x -translate-y-1/2 rounded-xs border border-b-2 border-border bg-card px-1 text-kbd text-muted-foreground"
        >
          {titleFocused ? 'Enter' : '⌘K'}
        </kbd>
      </div>
      <p
        id={errorId}
        role="alert"
        className={invalid ? 'mt-1.5 pl-add-input-padding-x text-caption text-foreground' : undefined}
      >
        {error}
      </p>
      <div role="group" aria-label="Due" className="mt-2 flex flex-wrap gap-1.5 pl-10">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset === p.id}
            className={chipClass(preset === p.id)}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {descriptionOpen ? (
        <div className="mt-description-link-gap">
          <label htmlFor={descriptionId} className="sr-only">
            Description
          </label>
          <Textarea
            ref={descriptionRef}
            id={descriptionId}
            name="description"
            rows={3}
            placeholder="Description (optional)"
            className={`field-sizing-fixed min-h-0 rounded-lg bg-card px-4 py-2.5 dark:bg-card ${FIELD_TEXT}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={onDescriptionKeyDown}
            // It stays open while it has text; an empty one folds back to the link.
            onBlur={(e) => {
              if (e.target.value === '') setDescriptionOpen(false);
            }}
            {...errorProps}
          />
        </div>
      ) : (
        <button
          type="button"
          className="mt-description-link-gap ml-10 block min-h-min-target text-caption text-muted-foreground hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-ring"
          onClick={openDescription}
        >
          Add description
        </button>
      )}
    </form>
  );
}
