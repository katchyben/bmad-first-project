import { act } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/a11y/announce';
import { FALLBACK_MESSAGE } from '@/api/errors';
import type { TaskResponse } from '@/client/types.gen';
import { Toaster } from '@/components/ui/sonner';
import { toLocalIso } from './presets';
import { TaskList } from './TaskList';
import { createHarness, jsonResponse, task, type Harness } from './testHarness';

let h: Harness;

// Fri Oct 2 2026, 2:30 PM local. Only Date is faked, so promises and React run normally.
const NOW = new Date(2026, 9, 2, 14, 30);
const TOMORROW_9 = new Date(2026, 9, 3, 9, 0);
const YESTERDAY_5PM = new Date(2026, 9, 1, 17, 0);
const IN_TWO_DAYS = new Date(2026, 9, 4, 12, 0);
const IN_FOUR_DAYS = new Date(2026, 9, 6, 12, 0);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  // The Toaster reads the colour scheme.
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
  // Radix's popper (the tooltip, the due popover) measures its anchor and content.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  h = createHarness();
});

afterEach(() => {
  // Sonner's toast store is module-global: don't carry a persistent toast into the next test.
  act(() => toast.dismiss());
  h.cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// --- Server -----------------------------------------------------------------

/** What GET /api/tasks returns; a test changes it to model the refetch. */
let listed: TaskResponse[] = [];
/** How PATCH answers: by default it applies the body to the listed task. */
let answerPatch: (id: number, body: Record<string, unknown>) => Promise<Response>;

function applyPatch(id: number, body: Record<string, unknown>): Promise<Response> {
  const current = listed.find((t) => t.id === id)!;
  const updated: TaskResponse = {
    ...current,
    ...(body as Partial<TaskResponse>),
    ...(typeof body.due_at === 'string' ? { due_at: new Date(body.due_at).toISOString() } : {}),
  };
  listed = listed.map((t) => (t.id === id ? updated : t)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  return Promise.resolve(jsonResponse(updated));
}

function serve(tasks: TaskResponse[]): void {
  listed = tasks;
  answerPatch = applyPatch;
  h.fetchMock.mockImplementation(async (r) => {
    if (r.method === 'GET') return jsonResponse(listed);
    const id = Number(new URL(r.url).pathname.split('/').pop());
    return answerPatch(id, await r.clone().json());
  });
}

const patches = () => h.fetchMock.mock.calls.filter(([r]) => r.method === 'PATCH');
const patchBody = async (n = 0) => patches()[n][0].clone().json();

// --- DOM --------------------------------------------------------------------

const grid = () => document.querySelector<HTMLDivElement>('[role="grid"][aria-label="Tasks"]')!;
const rows = () => [...grid().querySelectorAll<HTMLDivElement>(':scope > [role="row"]')];
const row = (title: string) =>
  rows().find((r) => r.querySelector('[data-testid="task-title"]')?.textContent === title)!;
const editRow = () => document.querySelector<HTMLDivElement>('[data-testid="edit-row"]');
const titleField = () => editRow()!.querySelector<HTMLInputElement>('input[name="title"]')!;
const descriptionField = () => editRow()!.querySelector<HTMLTextAreaElement>('textarea')!;
const slot = () => editRow()!.querySelector<HTMLElement>('[role="alert"]')!;
const button = (scope: Element, name: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    (b.getAttribute('aria-label') ?? b.textContent ?? '').startsWith(name),
  )!;
const editButton = (r: Element) =>
  r.querySelector<HTMLButtonElement>('[data-testid="row-actions"] button');
const pickChip = () =>
  editRow()!.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
const selectedTitle = () => {
  const id = grid().getAttribute('aria-activedescendant');
  return id === null
    ? null
    : document.getElementById(id)!.querySelector('[data-testid="task-title"]')?.textContent;
};
const announced = () => document.querySelector('[data-testid="announcer"]')!.textContent;
const toasts = () => [...document.querySelectorAll('[data-sonner-toast]')];

async function render(): Promise<void> {
  await h.render(
    <AnnounceProvider>
      <TaskList />
      <Toaster />
    </AnnounceProvider>,
  );
  await vi.waitFor(() => expect(document.querySelector('[role="grid"]')).not.toBeNull());
}

const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => setValue(el, value));
}

/** Dispatch a keydown; returns the event, to check `defaultPrevented`. */
async function press(el: Element, key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    el.dispatchEvent(event);
  });
  return event;
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    (el as HTMLElement).click();
  });
}

/** Focus the grid (selecting the first row), move ↓ `down` times, press E. */
async function editWithKey(down = 0): Promise<void> {
  await act(async () => grid().focus());
  for (let i = 0; i < down; i++) await press(grid(), 'ArrowDown');
  await press(grid(), 'e');
}

/** Wait until the edit row has closed and focus is back on the grid. */
async function closed(): Promise<void> {
  await vi.waitFor(() => expect(editRow()).toBeNull());
  expect(document.activeElement).toBe(grid());
}

// --- Tests ------------------------------------------------------------------

describe('row actions', () => {
  it('gives an active row an Edit action with its tooltip and key, out of the Tab order', async () => {
    serve([task({ title: 'Pack bags' }), task({ title: 'Started', status: 'in_progress' })]);
    await render();

    for (const r of rows()) {
      const edit = editButton(r)!;
      expect(edit.textContent).toBe('Edit');
      expect(edit.getAttribute('aria-keyshortcuts')).toBe('E');
      expect(edit.tabIndex).toBe(-1);
      expect(edit.className).toContain('min-h-[26px]');
      expect(edit.dataset.variant).toBe('ghost');
    }
    const edit = editButton(row('Pack bags'))!;
    await act(async () => edit.focus());
    await vi.waitFor(() =>
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Edit (E)'),
    );
  });

  it('reveals the actions on hover over the due time, and in flow beside it when selected', async () => {
    serve([task({ title: 'One' }), task({ title: 'Two' })]);
    await render();
    const actions = (r: Element) => r.querySelector<HTMLElement>('[data-testid="row-actions"]')!;
    const due = (r: Element) => r.querySelector<HTMLElement>('[data-testid="task-due"]')!;

    // Unselected: hidden until hover, laid over the due time, which fades out on hover.
    expect(actions(row('Two')).className).toContain('opacity-0');
    expect(actions(row('Two')).className).toContain('group-hover:opacity-100');
    expect(actions(row('Two')).className).toContain('absolute');
    expect(actions(row('Two')).className).toContain('fade');
    expect(due(row('Two')).className).toContain('group-hover:opacity-0');
    expect(row('Two').className).toContain('hover:bg-row-hover');

    // Selected, focused or not: shown in flow, and the due time stays.
    await click(row('Two'));
    await act(async () => grid().blur());
    expect(actions(row('Two')).className).toContain('opacity-100');
    expect(actions(row('Two')).className).not.toContain('absolute');
    expect(due(row('Two')).className).not.toContain('opacity-0');
  });

  it('shows the actions on a blurred, selected overdue row', async () => {
    serve([task({ title: 'Late', due_at: '2020-01-01T09:00:00Z', is_overdue: true })]);
    await render();
    await act(async () => grid().focus());
    await act(async () => grid().blur());
    const actions = row('Late').querySelector<HTMLElement>('[data-testid="row-actions"]')!;
    expect(actions.className).toContain('opacity-100');
    expect(actions.className).not.toContain('opacity-0');
  });

  it('offers no actions on a finished row, and E there does nothing', async () => {
    serve([
      task({ title: 'Done one', status: 'done', finished_at: '2026-10-01T10:00:00Z' }),
      task({ title: 'Cancelled one', status: 'cancelled', finished_at: '2026-10-01T10:00:00Z' }),
    ]);
    await render();
    expect(editButton(row('Done one'))).toBeNull();
    expect(editButton(row('Cancelled one'))).toBeNull();

    await act(async () => grid().focus());
    const e = await press(grid(), 'e');
    expect(e.defaultPrevented).toBe(false);
    await press(grid(), 'ArrowDown');
    await press(grid(), 'e');
    expect(editRow()).toBeNull();
    expect(patches()).toHaveLength(0);
    expect(document.activeElement).toBe(grid());
  });

  it('ignores E with a modifier', async () => {
    serve([task({ title: 'One' })]);
    await render();
    await act(async () => grid().focus());
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }]) {
      await press(grid(), 'e', init);
    }
    expect(editRow()).toBeNull();
  });
});

describe('opening the edit row', () => {
  it('replaces the row in place, keeping its id, with the title focused and the cursor at the end', async () => {
    serve([task({ title: 'One' }), task({ title: 'Submit reprot', description: 'Q3 numbers' })]);
    await render();
    const id = row('Submit reprot').id;
    await editWithKey(1);

    const edit = editRow()!;
    expect(edit.id).toBe(id);
    expect(edit.getAttribute('role')).toBe('row');
    expect(grid().getAttribute('aria-activedescendant')).toBe(id);
    expect(rows()[1]).toBe(edit);
    expect(document.activeElement).toBe(titleField());
    expect(titleField().value).toBe('Submit reprot');
    expect(titleField().selectionStart).toBe('Submit reprot'.length);
    expect(titleField().selectionEnd).toBe('Submit reprot'.length);
    expect(descriptionField().value).toBe('Q3 numbers');

    const label = (el: HTMLElement) => document.querySelector(`label[for="${el.id}"]`)!;
    expect(label(titleField()).textContent).toBe('Task title');
    expect(label(titleField()).className).toContain('sr-only');
    expect(label(descriptionField()).textContent).toBe('Description');
    expect(label(descriptionField()).className).toContain('sr-only');
  });

  it('shows the current due in the third chip with nothing pressed, and Cancel / Save with their hints', async () => {
    serve([task({ title: 'Late', due_at: YESTERDAY_5PM.toISOString(), is_overdue: true })]);
    await render();
    await editWithKey();

    const chips = [...editRow()!.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')];
    expect(chips.map((c) => c.textContent)).toEqual([
      'Tomorrow 9:00 AM',
      'Next Monday 9:00 AM',
      'Yesterday, 5:00 PM',
    ]);
    expect(chips.every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(pickChip().getAttribute('aria-label')).toBe('Yesterday, 5:00 PM, pick another date');

    const cancel = button(editRow()!, 'Cancel');
    const save = button(editRow()!, 'Save');
    expect(cancel.dataset.variant).toBe('ghost');
    expect(cancel.querySelector('kbd')!.textContent).toBe('Esc');
    expect(save.dataset.variant).toBe('default');
    expect(save.querySelector('kbd')!.textContent).toBe('↵');
    expect(editRow()!.textContent).not.toMatch(/clear/i);
  });

  it('opens from the Edit button', async () => {
    serve([task({ title: 'One' }), task({ title: 'Two' })]);
    await render();
    await click(editButton(row('Two'))!);
    expect(editRow()).not.toBeNull();
    expect(titleField().value).toBe('Two');
    expect(document.activeElement).toBe(titleField());
    expect(selectedTitle()).toBeUndefined(); // the edit row has no read title
    expect(grid().getAttribute('aria-activedescendant')).toBe(editRow()!.id);
  });

  it('discards the first edit row when another opens', async () => {
    serve([task({ title: 'A' }), task({ title: 'B' })]);
    await render();
    await editWithKey();
    await type(titleField(), 'A changed');

    // Arrowing away leaves it open; E on B discards A.
    await act(async () => grid().focus());
    await press(grid(), 'ArrowDown');
    expect(editRow()).not.toBeNull();
    await press(grid(), 'e');

    expect(document.querySelectorAll('[data-testid="edit-row"]')).toHaveLength(1);
    expect(titleField().value).toBe('B');
    expect(row('A')).toBeDefined();
    expect(patches()).toHaveLength(0);
  });

  it('keeps the edit row open when another row is clicked', async () => {
    serve([task({ title: 'A' }), task({ title: 'B' })]);
    await render();
    await editWithKey();
    await type(titleField(), 'A changed');
    await click(row('B'));
    expect(editRow()).not.toBeNull();
    expect(titleField().value).toBe('A changed');
    expect(selectedTitle()).toBe('B');
  });
});

describe('saving', () => {
  it('sends only a changed title, then refetches, selects and focuses the row and announces "Saved."', async () => {
    serve([task({ title: 'One' }), task({ title: 'Submit reprot', description: 'Notes' })]);
    await render();
    await editWithKey(1);
    await type(titleField(), 'Submit report');
    const enter = await press(titleField(), 'Enter');
    expect(enter.defaultPrevented).toBe(true);

    await closed();
    expect(patches()).toHaveLength(1);
    expect(new URL(patches()[0][0].url).pathname).toMatch(/^\/api\/tasks\/\d+$/);
    expect(await patchBody()).toEqual({ title: 'Submit report' });
    expect(selectedTitle()).toBe('Submit report');
    expect(row('Submit report').className).toContain('row-ring');
    expect(announced()).toBe('Saved.');
  });

  it('never sends the past due of an overdue task when the title changes', async () => {
    serve([task({ title: 'Late', due_at: YESTERDAY_5PM.toISOString(), is_overdue: true })]);
    await render();
    await editWithKey();
    await type(titleField(), 'Late, renamed');
    await click(button(editRow()!, 'Save'));
    await closed();
    expect(await patchBody()).toEqual({ title: 'Late, renamed' });
  });

  it('sends a chosen preset as due_at, and the selection follows the task to its new place', async () => {
    const moving = task({ title: 'Moving', due_at: IN_FOUR_DAYS.toISOString() });
    serve([task({ title: 'First', due_at: IN_TWO_DAYS.toISOString() }), moving]);
    await render();
    await editWithKey(1);
    await click(button(editRow()!, 'Tomorrow 9:00 AM'));
    expect(button(editRow()!, 'Tomorrow 9:00 AM').getAttribute('aria-pressed')).toBe('true');
    // Enter from a due chip saves.
    const enter = await press(button(editRow()!, 'Tomorrow 9:00 AM'), 'Enter');
    expect(enter.defaultPrevented).toBe(true);

    await closed();
    expect(await patchBody()).toEqual({ due_at: toLocalIso(TOMORROW_9) });
    await vi.waitFor(() =>
      expect(rows().map((r) => r.querySelector('[data-testid="task-title"]')!.textContent)).toEqual([
        'Moving',
        'First',
      ]),
    );
    expect(selectedTitle()).toBe('Moving');
    expect(rows()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('sends a cleared description as null', async () => {
    serve([task({ title: 'Noted', description: 'Notes' })]);
    await render();
    await editWithKey();
    await type(descriptionField(), '');
    await press(descriptionField(), 'Enter');
    await closed();
    expect(await patchBody()).toEqual({ description: null });
  });

  it('sends a description added to a task without one, and keeps Shift+Enter as a newline', async () => {
    serve([task({ title: 'Bare' })]);
    await render();
    await editWithKey();
    await type(descriptionField(), 'Line one');
    const shiftEnter = await press(descriptionField(), 'Enter', { shiftKey: true });
    expect(shiftEnter.defaultPrevented).toBe(false);
    expect(patches()).toHaveLength(0);
    expect(editRow()).not.toBeNull();
    await type(descriptionField(), 'Line one\nLine two');
    await press(descriptionField(), 'Enter');
    await closed();
    expect(await patchBody()).toEqual({ description: 'Line one\nLine two' });
  });

  it('ignores the Enter that ends an IME composition', async () => {
    serve([task({ title: 'Bare' })]);
    await render();
    await editWithKey();
    await type(titleField(), 'Changed');
    await press(titleField(), 'Enter', { isComposing: true });
    expect(patches()).toHaveLength(0);
  });

  it('sends nothing and closes quietly when nothing changed', async () => {
    serve([task({ title: 'Same', description: 'Notes' })]);
    await render();
    await editWithKey();
    await click(button(editRow()!, 'Save'));
    await closed();
    expect(patches()).toHaveLength(0);
    expect(announced()).toBe('');
    expect(selectedTitle()).toBe('Same');
  });

  it('counts a picked instant equal to the current due as unchanged', async () => {
    serve([task({ title: 'Same due', due_at: TOMORROW_9.toISOString() })]);
    await render();
    await editWithKey();
    const settle = () => act(async () => new Promise<void>((r) => setTimeout(r, 0)));
    await click(pickChip());
    await settle();
    await press(document.querySelector('[role="dialog"] td[data-day="2026-10-03"] button')!, 'Enter');
    const time = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="time"]')!;
    expect(time.value).toBe('09:00');
    await press(time, 'Enter');
    await settle();
    expect(document.activeElement).toBe(titleField());
    expect(pickChip().getAttribute('aria-pressed')).toBe('true');
    await press(titleField(), 'Enter');
    await closed();
    expect(patches()).toHaveLength(0);
  });

  it('marks Save aria-disabled while in flight and sends once', async () => {
    serve([task({ title: 'Slow' })]);
    let release: () => void = () => {};
    answerPatch = (id, body) =>
      new Promise((resolve) => (release = () => resolve(applyPatch(id, body))));
    await render();
    await editWithKey();
    await type(titleField(), 'Slow, renamed');
    await press(titleField(), 'Enter');
    await vi.waitFor(() => expect(patches()).toHaveLength(1));
    const save = button(editRow()!, 'Save');
    expect(save.getAttribute('aria-disabled')).toBe('true');
    await click(save);
    await press(titleField(), 'Enter');
    expect(patches()).toHaveLength(1);

    await act(async () => release());
    await closed();
    expect(announced()).toBe('Saved.');
  });
});

describe('errors', () => {
  it('shows a validation_error message in the one slot, linked from every field, keeping what was typed', async () => {
    serve([task({ title: 'Dentist' })]);
    answerPatch = () =>
      Promise.resolve(
        jsonResponse(
          { error: { code: 'validation_error', message: 'That time has already passed.' } },
          422,
        ),
      );
    await render();
    await editWithKey();
    await type(titleField(), 'Dentist, moved');
    await type(descriptionField(), 'Bring the card');
    await press(titleField(), 'Enter');

    await vi.waitFor(() => expect(slot().textContent).toBe('That time has already passed.'));
    expect(editRow()!.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(slot().className).toContain('text-caption');
    // Directly above the line that holds Cancel / Save.
    expect(slot().nextElementSibling!.contains(button(editRow()!, 'Save'))).toBe(true);
    const fields = [
      titleField(),
      descriptionField(),
      ...editRow()!.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'),
    ];
    expect(fields).toHaveLength(5);
    for (const field of fields) expect(field.getAttribute('aria-describedby')).toBe(slot().id);
    expect(titleField().value).toBe('Dentist, moved');
    expect(descriptionField().value).toBe('Bring the card');
    expect(toasts()).toHaveLength(0);
    expect(announced()).toBe('');
    expect(button(editRow()!, 'Save').getAttribute('aria-disabled')).toBeNull();
  });

  it.each([
    [404, 'not_found', 'That task no longer exists.'],
    [409, 'state_conflict', 'That task is already finished.'],
  ])('shows a %i %s envelope message in the error toast and keeps the row open', async (status, code, message) => {
    serve([task({ title: 'Gone' })]);
    answerPatch = () => Promise.resolve(jsonResponse({ error: { code, message } }, status));
    await render();
    await editWithKey();
    await type(titleField(), 'Gone, renamed');
    await press(titleField(), 'Enter');

    await vi.waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0].textContent).toContain(message);
    expect(editRow()).not.toBeNull();
    expect(titleField().value).toBe('Gone, renamed');
    expect(slot().textContent).toBe('');
  });

  it('leaves a 5xx to the global toast and keeps the row open', async () => {
    serve([task({ title: 'Broken' })]);
    answerPatch = () => Promise.resolve(jsonResponse({ detail: 'boom' }, 500));
    await render();
    await editWithKey();
    await type(titleField(), 'Broken, renamed');
    await press(titleField(), 'Enter');

    await vi.waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0].textContent).toContain(FALLBACK_MESSAGE);
    expect(editRow()).not.toBeNull();
    expect(titleField().value).toBe('Broken, renamed');
  });
});

describe('closing without saving', () => {
  it('discards on Esc and returns focus to the row', async () => {
    serve([task({ title: 'One' }), task({ title: 'Two' })]);
    await render();
    await editWithKey(1);
    await type(titleField(), 'Two changed');
    const esc = await press(titleField(), 'Escape');
    expect(esc.defaultPrevented).toBe(true);
    await closed();
    expect(patches()).toHaveLength(0);
    expect(selectedTitle()).toBe('Two');
    expect(row('Two')).toBeDefined();
  });

  it('discards on Cancel', async () => {
    serve([task({ title: 'One', description: 'Kept' })]);
    await render();
    await editWithKey();
    await type(descriptionField(), '');
    await click(button(editRow()!, 'Cancel'));
    await closed();
    expect(patches()).toHaveLength(0);
    expect(selectedTitle()).toBe('One');

    // Reopening shows the saved values, not the discarded ones.
    await press(grid(), 'e');
    expect(descriptionField().value).toBe('Kept');
  });

  it('closes only the due popover on its own Esc', async () => {
    serve([task({ title: 'One' })]);
    await render();
    await editWithKey();
    await click(pickChip());
    await act(async () => new Promise<void>((r) => setTimeout(r, 0)));
    const dialog = document.querySelector('[role="dialog"]')!;
    await press(dialog.querySelector('input[type="time"]')!, 'Escape');
    expect(editRow()).not.toBeNull();
  });
});

describe('keys inside the edit row', () => {
  it('do not move the grid selection or reopen the row', async () => {
    serve([task({ title: 'One', description: 'Line one\nLine two' }), task({ title: 'Two' })]);
    await render();
    await editWithKey();
    await act(async () => descriptionField().focus());
    for (const key of ['ArrowDown', 'ArrowUp', 'e']) {
      const event = await press(descriptionField(), key);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(grid().getAttribute('aria-activedescendant')).toBe(editRow()!.id);
    expect(document.activeElement).toBe(descriptionField());
  });

  it('a press inside the edit row does not move focus to the grid', async () => {
    serve([task({ title: 'One' })]);
    await render();
    await editWithKey();
    await act(async () => {
      descriptionField().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      descriptionField().focus();
      descriptionField().click();
    });
    expect(document.activeElement).toBe(descriptionField());
  });
});

describe('review fixes', () => {
  const settle = () => act(async () => new Promise<void>((r) => setTimeout(r, 0)));

  /** Hold every PATCH until the returned `release` is called. */
  function holdPatch(): { release: () => void } {
    const held = { release: () => {} };
    answerPatch = (id, body) =>
      new Promise((resolve) => (held.release = () => resolve(applyPatch(id, body))));
    return held;
  }

  it('Enter on an unpressed preset chip applies that preset and saves with it', async () => {
    serve([task({ title: 'Later', due_at: IN_FOUR_DAYS.toISOString() })]);
    await render();
    await editWithKey();
    const enter = await press(button(editRow()!, 'Tomorrow 9:00 AM'), 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    await closed();
    expect(await patchBody()).toEqual({ due_at: toLocalIso(TOMORROW_9) });
  });

  it('Enter on "Pick date…" is left to the chip, which opens the popover', async () => {
    serve([task({ title: 'One' })]);
    await render();
    await editWithKey();
    const enter = await press(pickChip(), 'Enter');
    expect(enter.defaultPrevented).toBe(false);
    await click(pickChip());
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(patches()).toHaveLength(0);
    expect(editRow()).not.toBeNull();
  });

  it('ignores Esc and Cancel while a save is in flight, with Cancel aria-disabled', async () => {
    serve([task({ title: 'Slow' })]);
    const held = holdPatch();
    await render();
    await editWithKey();
    await type(titleField(), 'Slow, renamed');
    await press(titleField(), 'Enter');
    await vi.waitFor(() => expect(patches()).toHaveLength(1));
    const cancel = button(editRow()!, 'Cancel');
    expect(cancel.getAttribute('aria-disabled')).toBe('true');
    await press(titleField(), 'Escape');
    await click(cancel);
    expect(editRow()).not.toBeNull();

    await act(async () => held.release());
    await closed();
    expect(announced()).toBe('Saved.');
  });

  it('a save landing after another row opened moves no focus and announces nothing', async () => {
    serve([task({ title: 'A' }), task({ title: 'B' })]);
    const held = holdPatch();
    await render();
    await editWithKey();
    await type(titleField(), 'A renamed');
    await press(titleField(), 'Enter');
    await vi.waitFor(() => expect(patches()).toHaveLength(1));

    await act(async () => grid().focus());
    await press(grid(), 'ArrowDown');
    await press(grid(), 'e');
    expect(titleField().value).toBe('B');
    await type(titleField(), 'B typing');

    await act(async () => held.release());
    await vi.waitFor(() => expect(row('A renamed')).toBeDefined());
    expect(announced()).toBe('');
    expect(editRow()).not.toBeNull();
    expect(titleField().value).toBe('B typing');
    expect(document.activeElement).toBe(titleField());
    expect(grid().getAttribute('aria-activedescendant')).toBe(editRow()!.id);
  });

  it('a 404 save toasts, refetches, and the row goes with focus back on the grid', async () => {
    const gone = task({ title: 'Gone' });
    serve([task({ title: 'Stays' }), gone]);
    answerPatch = () => {
      listed = listed.filter((t) => t.id !== gone.id);
      return Promise.resolve(
        jsonResponse({ error: { code: 'not_found', message: 'That task no longer exists.' } }, 404),
      );
    };
    await render();
    await editWithKey(1);
    await type(titleField(), 'Gone, renamed');
    await press(titleField(), 'Enter');

    await vi.waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0].textContent).toContain('That task no longer exists.');
    await vi.waitFor(() => expect(editRow()).toBeNull());
    expect(rows()).toHaveLength(1);
    expect(document.activeElement).toBe(grid());
    expect(selectedTitle()).toBe('Stays');
  });

  it('a refetch that finishes the edited task drops the edit row and refocuses the grid', async () => {
    const t = task({ title: 'Finishing' });
    serve([t]);
    await render();
    await editWithKey();
    expect(document.activeElement).toBe(titleField());

    listed = [{ ...t, status: 'done', finished_at: '2026-10-02T14:00:00Z' }];
    await act(async () => {
      await h.queryClient.invalidateQueries();
    });
    await vi.waitFor(() => expect(editRow()).toBeNull());
    expect(document.activeElement).toBe(grid());
    expect(editButton(row('Finishing'))).toBeNull();
  });

  it('a 401 save shows no toast and leaves the slot empty', async () => {
    serve([task({ title: 'One' })]);
    answerPatch = () =>
      Promise.resolve(
        jsonResponse({ error: { code: 'unauthenticated', message: 'Please log in again.' } }, 401),
      );
    await render();
    await editWithKey();
    await type(titleField(), 'One, renamed');
    await press(titleField(), 'Enter');
    await vi.waitFor(() => expect(patches()).toHaveLength(1));
    await act(async () => new Promise<void>((r) => setTimeout(r, 50)));
    expect(toasts()).toHaveLength(0);
    expect(editRow()).not.toBeNull();
    expect(slot().textContent).toBe('');
  });

  it('E on the grid while the row is open refocuses its title and keeps what was typed', async () => {
    serve([task({ title: 'One' })]);
    await render();
    await editWithKey();
    await type(titleField(), 'One typed');
    await act(async () => grid().focus());
    await press(grid(), 'e');
    expect(document.activeElement).toBe(titleField());
    expect(titleField().value).toBe('One typed');
    expect(titleField().selectionStart).toBe('One typed'.length);
  });

  it('opens on an upper-case E with no modifiers', async () => {
    serve([task({ title: 'One' })]);
    await render();
    await act(async () => grid().focus());
    await press(grid(), 'E');
    expect(editRow()).not.toBeNull();
  });

  it.each([
    ['the description', () => descriptionField()],
    ['a chip', () => button(editRow()!, 'Next Monday 9:00 AM')],
  ])('Esc from %s discards and returns focus to the row', async (_where, target) => {
    serve([task({ title: 'One' })]);
    await render();
    await editWithKey();
    await type(titleField(), 'Changed');
    await act(async () => target().focus());
    await press(target(), 'Escape');
    await closed();
    expect(patches()).toHaveLength(0);
    expect(selectedTitle()).toBe('One');
  });
});
