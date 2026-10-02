import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useAnnounce } from '@/a11y/announce';
import { errorMessage, isEnvelopeError } from '@/api/errors';
import { createTaskMutation, listTasksQueryKey } from '@/client/@tanstack/react-query.gen';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { addShortcutHint, isMacPlatform } from '@/lib/platform';
import { chipClass } from './chipClass';
import { DuePicker } from './DuePicker';
import { formatDue } from './formatDue';
import { DEFAULT_PRESET, PRESETS, resolvePreset, toLocalIso, type PresetId } from './presets';

// Class lists that mix the custom `text-<role>` sizes with colours are joined
// plainly, not with `cn()`: tailwind-merge would drop one as a colour clash.
// The shadcn Input and Textarea go through `cn()`, so they take the 15px input
// size as an arbitrary value, which tailwind-merge does recognise as a size,
// and the textarea's 16px padding (add-input-padding-x) as `px-4` so it replaces
// the primitive's `px-2.5`.
const FIELD_TEXT = 'text-[15px] md:text-[15px]';

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

/** A preset, or the instant picked in the due popover. */
type Due = { kind: 'preset'; preset: PresetId } | { kind: 'picked'; at: Date };

const DEFAULT_DUE: Due = { kind: 'preset', preset: DEFAULT_PRESET };

type Fields = { title: string; due: Due; description: string };

type Props = {
  /** The title input, for a caller that focuses it (the ⌘K shortcut). */
  titleRef?: RefObject<HTMLInputElement | null>;
  /** Esc in the title input; without it, Esc just blurs the input. */
  onEscape?: () => void;
  /** Whether the shortcut hint shows ⌘K (macOS) or Ctrl K. Detected when omitted. */
  mac?: boolean;
};

/**
 * The add-task input (DESIGN.md Components > Add-task input, Preset chip, Add
 * description link): a title field, the preset chips beneath it, and an "Add
 * description" link that expands to a textarea. Enter creates the task through
 * the generated client; the list query is invalidated, never updated in place.
 * The API decides every rule: its envelope message shows as written in the one
 * error slot, and everything typed is kept.
 */
export function AddTask({ titleRef: externalTitleRef, onEscape, mac: macProp }: Props = {}) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  const [title, setTitle] = useState('');
  const [due, setDue] = useState<Due>(DEFAULT_DUE);
  const [description, setDescription] = useState('');
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const ownTitleRef = useRef<HTMLInputElement>(null);
  const titleRef = externalTitleRef ?? ownTitleRef;
  const [detectedMac] = useState(isMacPlatform);
  const mac = macProp ?? detectedMac;
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // What was sent, and what the fields hold now: a success resets only the
  // fields the user has not changed while the request was in flight.
  const submitted = useRef<Fields | null>(null);
  const latest = useRef<Fields>({ title, due, description });
  useEffect(() => {
    latest.current = { title, due, description };
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
        // The same object: a re-pick of an equal instant still counts as a change.
        if (now.due === sent.due) setDue(DEFAULT_DUE);
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
    submitted.current = { title, due, description };
    // A picked time earlier than now is sent as is: the API's message shows in the slot.
    const dueAt = toLocalIso(due.kind === 'picked' ? due.at : resolvePreset(due.preset, new Date()));
    create.mutate({
      body: { title, due_at: dueAt, ...(description === '' ? {} : { description }) },
    });
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // An Esc that cancels an IME composition belongs to the IME.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (onEscape) onEscape();
      else event.currentTarget.blur();
      return;
    }
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
          {titleFocused ? 'Enter' : addShortcutHint(mac)}
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
        {PRESETS.map((p) => {
          const pressed = due.kind === 'preset' && due.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={pressed}
              className={chipClass(pressed)}
              // The same object when already pressed, so the success reset
              // (an identity check against what was sent) still applies.
              onClick={() =>
                setDue((current) =>
                  current.kind === 'preset' && current.preset === p.id
                    ? current
                    : { kind: 'preset', preset: p.id },
                )
              }
            >
              {p.label}
            </button>
          );
        })}
        <DuePicker
          value={due.kind === 'picked' ? due.at : null}
          pressed={due.kind === 'picked'}
          onSet={(at) => setDue({ kind: 'picked', at })}
          focusAfterSet={titleRef}
        />
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
