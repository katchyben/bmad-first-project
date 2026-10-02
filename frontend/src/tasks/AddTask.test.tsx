import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/a11y/announce';
import { FALLBACK_MESSAGE } from '@/api/errors';
import { Toaster } from '@/components/ui/sonner';
import { listTasksQueryKey } from '@/client/@tanstack/react-query.gen';
import { AddTask } from './AddTask';
import { toLocalIso } from './presets';
import { createHarness, jsonResponse, task, type Harness } from './testHarness';

let h: Harness;

// Fri Oct 2 2026, 2:30 PM local. Only Date is faked, so promises and React run normally.
const NOW = new Date(2026, 9, 2, 14, 30);
const TOMORROW_9 = new Date(2026, 9, 3, 9, 0);
const NEXT_MONDAY_9 = new Date(2026, 9, 5, 9, 0);

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
  h = createHarness();
});

afterEach(() => {
  h.cleanup();
  vi.useRealTimers();
});

const titleInput = () => document.querySelector<HTMLInputElement>('input[name="title"]')!;
const textarea = () => document.querySelector<HTMLTextAreaElement>('textarea');
const descriptionLink = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Add description');
const chip = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
    (b) => b.textContent === label,
  )!;
const errorSlot = () => document.querySelector('[role="alert"]')!;
const announcer = () => document.querySelector('[data-testid="announcer"]')!;
const posts = () =>
  h.fetchMock.mock.calls.filter(
    ([r]) => r.method === 'POST' && new URL(r.url).pathname === '/api/tasks',
  );
const postBody = async (n = 0) => posts()[n][0].clone().json();

/** Answer the create with 201 echoing the body as a task; every other request with []. */
function serveCreated(): void {
  h.fetchMock.mockImplementation(async (r) => {
    if (r.method !== 'POST') return jsonResponse([]);
    const body = await r.clone().json();
    return jsonResponse(
      task({
        title: body.title.trim(),
        description: body.description ?? null,
        due_at: new Date(body.due_at).toISOString(),
      }),
      201,
    );
  });
}

function serveError(status: number, body: unknown): void {
  h.fetchMock.mockImplementation(async (r) =>
    r.method === 'POST' ? jsonResponse(body, status) : jsonResponse([]),
  );
}

async function renderAddTask(): Promise<void> {
  await h.render(
    <AnnounceProvider>
      <AddTask />
      <Toaster />
    </AnnounceProvider>,
  );
}

const toasts = () => [...document.querySelectorAll('[data-sonner-toast]')];

/** Hold the create open until `resolve` is called; every other request gets []. */
function holdCreate(): { resolve: (r: Response) => void } {
  const held = { resolve: (_r: Response) => {} };
  h.fetchMock.mockImplementation((r) =>
    r.method === 'POST'
      ? new Promise<Response>((res) => (held.resolve = res))
      : Promise.resolve(jsonResponse([])),
  );
  return held;
}

const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement : HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => setValue(el, value));
}

/** Dispatch a keydown; returns false when a handler prevented the default. */
async function press(el: Element, key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  let result = true;
  await act(async () => {
    result = el.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  });
  return result;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => el.click());
}

async function focus(el: HTMLElement): Promise<void> {
  await act(async () => el.focus());
}

async function openDescription(): Promise<HTMLTextAreaElement> {
  await click(descriptionLink()!);
  return textarea()!;
}

describe('add task: anatomy', () => {
  it('labels the input, shows the presets with Tomorrow pressed and the description link', async () => {
    await renderAddTask();
    const input = titleInput();
    expect(input.placeholder).toBe('Add a task');
    expect(document.querySelector(`label[for="${input.id}"]`)!.textContent).toBe('Add a task');
    const icon = input.parentElement!.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');

    const chips = [...document.querySelectorAll('button[aria-pressed]')];
    expect(chips.map((c) => c.textContent)).toEqual(['Tomorrow 9:00 AM', 'Next Monday 9:00 AM']);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(chips.every((c) => c.className.includes('min-h-min-target'))).toBe(true);

    const link = descriptionLink()!;
    expect(link.className).toContain('min-h-min-target');
    expect(textarea()).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows the ⌘K hint unfocused and the Enter hint focused', async () => {
    await renderAddTask();
    const hint = document.querySelector('[data-testid="kbd-hint"]')!;
    expect(hint.getAttribute('aria-hidden')).toBe('true');
    expect(hint.textContent).toBe('⌘K');
    await focus(titleInput());
    expect(hint.textContent).toBe('Enter');
    await act(async () => titleInput().blur());
    expect(hint.textContent).toBe('⌘K');
  });

  it('keeps exactly one preset pressed', async () => {
    await renderAddTask();
    await click(chip('Next Monday 9:00 AM'));
    expect(chip('Next Monday 9:00 AM').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Tomorrow 9:00 AM').getAttribute('aria-pressed')).toBe('false');
    await click(chip('Next Monday 9:00 AM'));
    expect(chip('Next Monday 9:00 AM').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('add task: submitting', () => {
  it('sends the title and the Tomorrow instant with the local offset on Enter', async () => {
    serveCreated();
    await renderAddTask();
    await focus(titleInput());
    await type(titleInput(), 'Pay rent');
    expect(await press(titleInput(), 'Enter')).toBe(false);

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(await postBody()).toEqual({ title: 'Pay rent', due_at: toLocalIso(TOMORROW_9) });
  });

  it('sends the pressed preset and the description', async () => {
    serveCreated();
    await renderAddTask();
    await click(chip('Next Monday 9:00 AM'));
    await type(titleInput(), 'Plan week');
    const area = await openDescription();
    await type(area, 'Line one');
    await press(titleInput(), 'Enter');

    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(await postBody()).toEqual({
      title: 'Plan week',
      description: 'Line one',
      due_at: toLocalIso(NEXT_MONDAY_9),
    });
  });

  it('resets everything, keeps focus in the title and announces on success', async () => {
    serveCreated();
    await renderAddTask();
    await click(chip('Next Monday 9:00 AM'));
    await type(titleInput(), 'Pay rent');
    const area = await openDescription();
    await type(area, 'By transfer');
    await press(area, 'Enter');

    await vi.waitFor(() => expect(announcer().textContent).not.toBe(''));
    expect(announcer().textContent).toBe("Added 'Pay rent', due Mon, 9:00 AM.");
    expect(titleInput().value).toBe('');
    expect(document.activeElement).toBe(titleInput());
    expect(chip('Tomorrow 9:00 AM').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Next Monday 9:00 AM').getAttribute('aria-pressed')).toBe('false');
    expect(textarea()).toBeNull();
    expect(descriptionLink()).toBeDefined();
    expect(errorSlot().textContent).toBe('');
  });

  it("announces the server's due time with formatDue", async () => {
    serveCreated();
    await renderAddTask();
    await type(titleInput(), 'Pay rent');
    await press(titleInput(), 'Enter');
    await vi.waitFor(() =>
      expect(announcer().textContent).toBe("Added 'Pay rent', due Tomorrow, 9:00 AM."),
    );
  });

  it('invalidates the task list query, with no optimistic insert', async () => {
    serveCreated();
    await renderAddTask();
    h.queryClient.setQueryData(listTasksQueryKey(), []);
    const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
    await type(titleInput(), 'Pay rent');
    await press(titleInput(), 'Enter');

    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: listTasksQueryKey() }),
    );
    expect(h.queryClient.getQueryData(listTasksQueryKey())).toEqual([]);
  });

  it('still sends a blank title', async () => {
    serveCreated();
    await renderAddTask();
    await press(titleInput(), 'Enter');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect((await postBody()).title).toBe('');
  });

  it("ignores Safari's IME-commit Enter (keyCode 229)", async () => {
    serveCreated();
    await renderAddTask();
    await type(titleInput(), '日本');
    expect(await press(titleInput(), 'Enter', { keyCode: 229 } as KeyboardEventInit)).toBe(true);
    await press(titleInput(), 'Enter', { isComposing: true });
    expect(posts()).toHaveLength(0);
  });

  it('sends one request for a double Enter', async () => {
    let resolve!: (r: Response) => void;
    h.fetchMock.mockImplementation((r) =>
      r.method === 'POST'
        ? new Promise<Response>((res) => (resolve = res))
        : Promise.resolve(jsonResponse([])),
    );
    await renderAddTask();
    await type(titleInput(), 'Once');
    await act(async () => {
      for (let i = 0; i < 2; i++) {
        titleInput().dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
      }
    });
    await press(titleInput(), 'Enter');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await act(async () => resolve(jsonResponse(task({ title: 'Once' }), 201)));
    await vi.waitFor(() => expect(titleInput().value).toBe(''));
    expect(posts()).toHaveLength(1);
  });
});

describe('add task: edits while the create is in flight', () => {
  it('keeps a title typed while the request is pending', async () => {
    const held = holdCreate();
    await renderAddTask();
    await type(titleInput(), 'First');
    await press(titleInput(), 'Enter');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await type(titleInput(), 'Second');
    await act(async () => held.resolve(jsonResponse(task({ title: 'First' }), 201)));

    await vi.waitFor(() => expect(announcer().textContent).toContain("Added 'First'"));
    expect(titleInput().value).toBe('Second');
  });

  it('keeps a preset and a description changed while the request is pending', async () => {
    const held = holdCreate();
    await renderAddTask();
    await type(titleInput(), 'First');
    const area = await openDescription();
    await type(area, 'Sent');
    await press(titleInput(), 'Enter');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await click(chip('Next Monday 9:00 AM'));
    await type(textarea()!, 'Changed');
    await focus(textarea()!);
    await act(async () => held.resolve(jsonResponse(task({ title: 'First' }), 201)));

    await vi.waitFor(() => expect(titleInput().value).toBe(''));
    expect(chip('Next Monday 9:00 AM').getAttribute('aria-pressed')).toBe('true');
    expect(textarea()!.value).toBe('Changed');
    // Still typing in the kept description: focus isn't pulled to the title.
    expect(document.activeElement).toBe(textarea());
  });

  it('leaves focus where the user moved it outside the form', async () => {
    const held = holdCreate();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      await renderAddTask();
      await focus(titleInput());
      await type(titleInput(), 'First');
      await press(titleInput(), 'Enter');
      await vi.waitFor(() => expect(posts()).toHaveLength(1));
      await focus(outside);
      await act(async () => held.resolve(jsonResponse(task({ title: 'First' }), 201)));

      await vi.waitFor(() => expect(titleInput().value).toBe(''));
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

describe('add task: errors', () => {
  const PAST = 'That time has already passed.';

  it('shows a 422 envelope message in the slot and keeps everything typed', async () => {
    serveError(422, { error: { code: 'validation_error', message: PAST } });
    await renderAddTask();
    await click(chip('Next Monday 9:00 AM'));
    await type(titleInput(), 'Call the plumber');
    const area = await openDescription();
    await type(area, 'Leaky tap');
    await press(area, 'Enter');

    await vi.waitFor(() => expect(errorSlot().textContent).toBe(PAST));
    const input = titleInput();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(errorSlot().id);
    expect(input.value).toBe('Call the plumber');
    expect(textarea()!.value).toBe('Leaky tap');
    expect(chip('Next Monday 9:00 AM').getAttribute('aria-pressed')).toBe('true');
    const area2 = textarea()!;
    expect(area2.getAttribute('aria-invalid')).toBe('true');
    expect(area2.getAttribute('aria-describedby')).toBe(errorSlot().id);
    expect(announcer().textContent).toBe('');
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(toasts()).toHaveLength(0);
  });

  it('clears the slot after a later success', async () => {
    serveError(422, { error: { code: 'validation_error', message: "Title can't be empty." } });
    await renderAddTask();
    await press(titleInput(), 'Enter');
    await vi.waitFor(() => expect(errorSlot().textContent).toBe("Title can't be empty."));

    serveCreated();
    await type(titleInput(), 'Now with a title');
    await press(titleInput(), 'Enter');
    await vi.waitFor(() => expect(titleInput().value).toBe(''));
    expect(errorSlot().textContent).toBe('');
    expect(titleInput().getAttribute('aria-invalid')).toBeNull();
    expect(titleInput().getAttribute('aria-describedby')).toBeNull();
  });

  it('sends a 5xx to the global toast, keeps the slot empty and the fields, never retries', async () => {
    serveError(500, { detail: 'boom' });
    await renderAddTask();
    await type(titleInput(), 'Kept');
    await press(titleInput(), 'Enter');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await vi.waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
    expect(errorSlot().textContent).toBe('');
    expect(titleInput().value).toBe('Kept');
    expect(posts()).toHaveLength(1);
    await vi.waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0].textContent).toContain(FALLBACK_MESSAGE);
  });

  it('keeps a network failure out of the slot and keeps every field', async () => {
    h.fetchMock.mockImplementation((r) =>
      r.method === 'POST'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(jsonResponse([])),
    );
    await renderAddTask();
    await click(chip('Next Monday 9:00 AM'));
    await type(titleInput(), 'Offline');
    const area = await openDescription();
    await type(area, 'Still here');
    await press(area, 'Enter');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await vi.waitFor(() => expect(h.queryClient.isMutating()).toBe(0));

    expect(errorSlot().textContent).toBe('');
    expect(titleInput().getAttribute('aria-invalid')).toBeNull();
    expect(titleInput().value).toBe('Offline');
    expect(chip('Next Monday 9:00 AM').getAttribute('aria-pressed')).toBe('true');
    expect(textarea()!.value).toBe('Still here');
    expect(posts()).toHaveLength(1);
  });
});

describe('add task: description', () => {
  it('opens the textarea from the link and focuses it', async () => {
    await renderAddTask();
    const area = await openDescription();
    expect(descriptionLink()).toBeUndefined();
    expect(area.rows).toBe(3);
    expect(area.placeholder).toBe('Description (optional)');
    expect(document.querySelector(`label[for="${area.id}"]`)!.textContent).toBe('Description');
    expect(document.activeElement).toBe(area);
  });

  it('is a native type="button", so Enter and Space activate it', async () => {
    await renderAddTask();
    const link = descriptionLink()!;
    expect(link.tagName).toBe('BUTTON');
    expect(link.getAttribute('type')).toBe('button');
  });

  it('lets Shift+Enter insert a newline without submitting', async () => {
    serveCreated();
    await renderAddTask();
    const area = await openDescription();
    expect(await press(area, 'Enter', { shiftKey: true })).toBe(true);
    expect(posts()).toHaveLength(0);
  });

  it('returns focus to the title on Esc and keeps the text', async () => {
    await renderAddTask();
    const area = await openDescription();
    await type(area, 'Keep me');
    await press(area, 'Escape');
    expect(document.activeElement).toBe(titleInput());
    expect(textarea()!.value).toBe('Keep me');
  });

  it('folds back to the link when left empty', async () => {
    await renderAddTask();
    const area = await openDescription();
    await press(area, 'Escape');
    expect(document.activeElement).toBe(titleInput());
    expect(textarea()).toBeNull();
    expect(descriptionLink()).toBeDefined();
  });
});
