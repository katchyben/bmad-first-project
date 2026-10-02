import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/a11y/announce';
import { NetworkError } from '@/api/errors';
import { listTasksQueryKey } from '@/client/@tanstack/react-query.gen';
import type { TaskResponse } from '@/client/types.gen';
import { formatDue } from './formatDue';
import { GRID_INSTRUCTIONS, LOADING_DELAY_MS, TaskList } from './TaskList';
import { createHarness, jsonResponse, task, tasksRequests, type Harness } from './testHarness';
import { NOW_TICK_MS } from './useNow';

let h: Harness;

beforeEach(() => {
  h = createHarness();
});

afterEach(() => {
  h.cleanup();
  vi.useRealTimers();
});

const grid = () => document.querySelector<HTMLDivElement>('[role="grid"][aria-label="Tasks"]');
const rows = () => [...document.querySelectorAll<HTMLDivElement>('[role="grid"][aria-label="Tasks"] > [role="row"]')];
const row = (title: string) => rows().find((r) => r.textContent?.includes(title))!;
// The list's own live region, not the app announcer the tests render around it.
const STATUS = '[role="status"]:not([data-testid="announcer"])';
const status = () => document.querySelector(STATUS);

/** Render inside the app's live region, as App does. */
const view = (node: ReactNode) => h.render(<AnnounceProvider>{node}</AnnounceProvider>);

function serve(tasks: TaskResponse[]): void {
  h.fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(tasks)));
}

async function renderLoaded(): Promise<void> {
  await view(<TaskList />);
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="task-list-content"]')).not.toBeNull(),
  );
}

/** Advance faked timers, letting promises and React settle in between. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('task list', () => {
  it('renders rows exactly in API order, in one bordered card', async () => {
    // Deliberately not in due order: the client must not re-sort.
    serve([
      task({ title: 'Later', due_at: '2026-10-09T09:00:00Z' }),
      task({ title: 'Sooner', due_at: '2026-10-03T09:00:00Z' }),
      task({ title: 'Middle', due_at: '2026-10-05T09:00:00Z' }),
    ]);
    await renderLoaded();

    expect(rows().map((r) => r.querySelector('[data-testid="task-title"]')!.textContent)).toEqual([
      'Later',
      'Sooner',
      'Middle',
    ]);
    const list = grid()!;
    expect(list.className).toContain('rounded-lg');
    expect(list.className).toContain('border');
    expect(list.className).toContain('bg-card');
    expect(tasksRequests(h.fetchMock)).toHaveLength(1);
  });

  it('shows the mark, the title and the due text, with the accessible name', async () => {
    const due = '2026-10-03T09:00:00Z';
    serve([task({ title: 'Pack bags', due_at: due })]);
    await renderLoaded();

    const r = row('Pack bags');
    const mark = r.querySelector('svg[data-testid="status-mark"]')!;
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('class')).toContain('size-status-mark');
    expect(mark.querySelector('circle')).not.toBeNull();
    const dueText = formatDue(new Date(due), new Date());
    expect(r.querySelector('[data-testid="task-due"]')!.textContent).toBe(dueText);
    expect(r.getAttribute('aria-label')).toBe(`Pack bags, To do, due ${dueText}`);
    // Left to right: mark, title, due, then the actions cell.
    const order = [...r.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'));
    expect(order).toEqual(['status-mark', 'task-title', 'task-due', 'row-actions']);
    expect(r.dataset.overdue).toBeUndefined();
    expect(r.textContent).not.toContain('Overdue');
  });

  it('shows a server-overdue task with tint, rule, icon, word and coloured due time', async () => {
    serve([
      task({ title: 'Late one', due_at: '2020-01-01T09:00:00Z', is_overdue: true }),
      task({ title: 'Fine one', due_at: '2999-01-01T09:00:00Z' }),
    ]);
    await renderLoaded();

    const r = row('Late one');
    expect(r.className).toContain('bg-overdue-tint');
    expect(r.className).toContain('shadow-[inset_3px_0_0_var(--overdue)]');
    expect(r.querySelector('svg[data-testid="status-mark"]')!.parentElement!.className).toBe(
      'text-overdue',
    );
    const label = [...r.querySelectorAll('span')].find((s) => s.textContent === 'Overdue')!;
    expect(label.className).toContain('text-overdue-label');
    expect(label.className).toContain('text-overdue');
    const icon = label.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(r.querySelector('[data-testid="task-due"]')!.className).toContain('text-overdue');
    expect(r.getAttribute('aria-label')).toMatch(/^Late one, To do, due .+, overdue$/);

    const fine = row('Fine one');
    expect(fine.className).toContain('bg-card');
    expect(fine.className).not.toContain('overdue');
    expect(fine.getAttribute('aria-label')).not.toContain('overdue');
  });

  it.each([
    ['in_progress', 'In progress'],
    ['done', 'Done'],
    ['cancelled', 'Cancelled'],
  ] as const)('names a %s row with its status word', async (status, word) => {
    const due = '2026-10-03T09:00:00Z';
    serve([task({ title: 'Named', status, due_at: due })]);
    await renderLoaded();
    const dueText = formatDue(new Date(due), new Date());
    expect(rows()[0].getAttribute('aria-label')).toBe(`Named, ${word}, due ${dueText}`);
  });

  it('clamps the title to two lines but keeps the full title in the accessible name', async () => {
    const long = 'A very long title '.repeat(11).trim();
    serve([task({ title: long })]);
    await renderLoaded();

    const r = rows()[0];
    const title = r.querySelector('[data-testid="task-title"]')!;
    expect(title.className).toContain('line-clamp-2');
    expect(title.textContent).toBe(long);
    expect(r.getAttribute('aria-label')!.startsWith(`${long}, To do, due `)).toBe(true);
  });

  it('shows the empty state when there are no tasks', async () => {
    serve([]);
    await renderLoaded();

    expect(grid()).toBeNull();
    const content = document.querySelector('[data-testid="task-list-content"]')!;
    expect(content.textContent).toContain('Nothing due. Enjoy the quiet.');
    expect(content.textContent).toContain('Type above when something comes up.');
    const ring = content.querySelector('[data-testid="empty-ring"]')!;
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.className).toContain('size-empty-ring');
    expect(ring.className).toContain('rounded-full');
    expect(ring.className).toContain('border-[1.5px]');
  });

  it('fades the list in with the fade utility', async () => {
    serve([task()]);
    await renderLoaded();
    const content = document.querySelector('[data-testid="task-list-content"]')!;
    expect(content.className).toContain('fade');
    await vi.waitFor(() => expect(content.className).toContain('opacity-100'));
  });
});

describe('live overdue promotion', () => {
  const START = new Date('2026-10-02T14:00:00Z');

  beforeEach(() => {
    // Only the clock and the minute tick are faked; the query runs on real timeouts.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(START);
  });

  it('promotes an active row once its due time passes, on the minute tick, without a refetch', async () => {
    serve([
      task({ title: 'Soon', due_at: '2026-10-02T14:00:30Z' }),
      task({ title: 'Later', due_at: '2026-10-02T16:00:00Z' }),
    ]);
    await renderLoaded();
    expect(row('Soon').dataset.overdue).toBeUndefined();

    vi.setSystemTime(START.getTime() + NOW_TICK_MS);
    act(() => vi.advanceTimersByTime(NOW_TICK_MS));

    const soon = row('Soon');
    expect(soon.dataset.overdue).toBe('true');
    expect(soon.className).toContain('bg-overdue-tint');
    expect(soon.textContent).toContain('Overdue');
    expect(soon.getAttribute('aria-label')).toMatch(/, overdue$/);
    expect(row('Later').dataset.overdue).toBeUndefined();
    // Silent and in place: same order, no new request, nothing announced.
    expect(rows().map((r) => r.querySelector('[data-testid="task-title"]')!.textContent)).toEqual([
      'Soon',
      'Later',
    ]);
    expect(tasksRequests(h.fetchMock)).toHaveLength(1);
    expect(status()).toBeNull();
  });

  it('promotes on window focus between ticks', async () => {
    serve([task({ title: 'Soon', due_at: '2026-10-02T14:00:10Z' })]);
    await renderLoaded();

    vi.setSystemTime(START.getTime() + 20_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(row('Soon').dataset.overdue).toBe('true');
    expect(tasksRequests(h.fetchMock)).toHaveLength(1);
  });

  it('never clears a server true and never promotes a finished row', async () => {
    serve([
      // The browser clock says this is not yet due; the server's word stands.
      task({ title: 'Server says late', due_at: '2026-10-02T18:00:00Z', is_overdue: true }),
      task({
        title: 'Done long ago',
        due_at: '2026-10-01T09:00:00Z',
        status: 'done',
        finished_at: '2026-10-01T10:00:00Z',
      }),
      task({
        title: 'Cancelled long ago',
        due_at: '2026-10-01T09:00:00Z',
        status: 'cancelled',
        finished_at: '2026-10-01T10:00:00Z',
      }),
      task({ title: 'Started, past due', due_at: '2026-10-02T13:00:00Z', status: 'in_progress' }),
    ]);
    await renderLoaded();
    vi.setSystemTime(START.getTime() + 5 * NOW_TICK_MS);
    act(() => vi.advanceTimersByTime(5 * NOW_TICK_MS));

    expect(row('Server says late').dataset.overdue).toBe('true');
    expect(row('Done long ago').dataset.overdue).toBeUndefined();
    expect(row('Cancelled long ago').dataset.overdue).toBeUndefined();
    expect(row('Started, past due').dataset.overdue).toBe('true');
  });
});

describe('cold load', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('shows nothing before 1 s, then one muted "Loading…" line in a polite live region', async () => {
    h.fetchMock.mockImplementation(() => new Promise(() => {}));
    await view(<TaskList />);

    // The live region exists, empty, before the text arrives, so it is announced once.
    expect(status()).not.toBeNull();
    expect(status()!.getAttribute('aria-live')).toBe('polite');
    expect(status()!.textContent).toBe('');
    await advance(LOADING_DELAY_MS - 1);
    expect(status()!.textContent).toBe('');

    await advance(1);
    expect(status()!.textContent).toBe('Loading…');
    expect(status()!.className).toContain('text-muted-foreground');
    expect(status()!.className).toContain('fade');
    expect(document.querySelectorAll(STATUS)).toHaveLength(1);
    expect(document.querySelector('svg')).toBeNull();
  });

  it('replaces "Loading…" with the list when the data arrives', async () => {
    let release: (r: Response) => void = () => {};
    h.fetchMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    await view(<TaskList />);
    await advance(LOADING_DELAY_MS);
    expect(status()!.textContent).toBe('Loading…');

    await act(async () => release(jsonResponse([task({ title: 'Arrived' })])));
    await advance(10);
    expect(status()).toBeNull();
    expect(row('Arrived')).toBeDefined();
  });

  it('shows nothing when the data arrives within 1 s', async () => {
    serve([task({ title: 'Quick' })]);
    await view(<TaskList />);
    await advance(10);
    expect(row('Quick')).toBeDefined();
    await advance(2 * LOADING_DELAY_MS);
    expect(document.body.textContent).not.toContain('Loading…');
  });

  it('never shows "Loading…" on a refetch', async () => {
    serve([task({ title: 'Kept' })]);
    await view(<TaskList />);
    await advance(10);
    expect(row('Kept')).toBeDefined();

    h.fetchMock.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      void h.queryClient.invalidateQueries({ queryKey: listTasksQueryKey() });
    });
    await advance(3 * LOADING_DELAY_MS);
    expect(tasksRequests(h.fetchMock)).toHaveLength(2);
    expect(document.body.textContent).not.toContain('Loading…');
    expect(row('Kept')).toBeDefined();
  });

  it('does not show "Loading…" while the server is unreachable', async () => {
    h.fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await view(<TaskList />);
    await advance(10);
    expect(h.queryClient.getQueryState(listTasksQueryKey())!.fetchFailureReason).toBeInstanceOf(
      NetworkError,
    );
    await advance(2 * LOADING_DELAY_MS);
    expect(document.body.textContent).not.toContain('Loading…');
  });
});

describe('keyboard grid', () => {
  let scrolled: { row: Element; options: unknown }[];

  beforeEach(() => {
    scrolled = [];
    Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
      scrolled.push({ row: this, options });
    } as Element['scrollIntoView'];
  });

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  const titles = () =>
    rows().map((r) => r.querySelector('[data-testid="task-title"]')!.textContent);
  const selectedTitle = () => {
    const id = grid()!.getAttribute('aria-activedescendant');
    return id === null ? null : document.getElementById(id)!.querySelector('[data-testid="task-title"]')!.textContent;
  };

  async function focusGrid(): Promise<void> {
    await act(async () => grid()!.focus());
  }

  async function press(key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    await act(async () => {
      grid()!.dispatchEvent(event);
    });
    return event;
  }

  async function refetchWith(tasks: TaskResponse[]): Promise<void> {
    serve(tasks);
    await act(async () => {
      await h.queryClient.invalidateQueries({ queryKey: listTasksQueryKey() });
    });
  }

  const three = () => [task({ title: 'One' }), task({ title: 'Two' }), task({ title: 'Three' })];

  it('is a single-Tab-stop grid of rows with two cells, described by the instructions', async () => {
    serve(three());
    await renderLoaded();

    const g = grid()!;
    expect(g.tabIndex).toBe(0);
    expect(g.getAttribute('aria-label')).toBe('Tasks');
    const described = document.getElementById(g.getAttribute('aria-describedby')!)!;
    expect(described.textContent).toBe(
      'Use arrow keys to move, S start, B move back, C complete, X cancel, E edit, Backspace delete, Z undo.',
    );
    expect(GRID_INSTRUCTIONS).toBe(described.textContent);
    expect(described.className).toContain('sr-only');
    expect(rows()).toHaveLength(3);
    for (const r of rows()) {
      const cells = r.querySelectorAll(':scope > [role="gridcell"]');
      expect(cells).toHaveLength(2);
      expect(cells[0].querySelector('[data-testid="task-title"]')).not.toBeNull();
      expect(cells[0].querySelector('[data-testid="status-mark"]')).not.toBeNull();
      expect(cells[1].textContent).toBe('Edit');
      expect(r.id).not.toBe('');
      expect(r.getAttribute('aria-selected')).toBe('false');
      expect(r.getAttribute('aria-label')).toMatch(/, To do, due /);
    }
    // Only the grid is in the Tab order: one Tab stop.
    expect(document.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(1);
    expect(g.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('selects the first row on first focus, with the ring and tint', async () => {
    serve(three());
    await renderLoaded();
    await focusGrid();

    expect(selectedTitle()).toBe('One');
    const first = rows()[0];
    expect(grid()!.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.className).toContain('bg-row-selected');
    expect(first.className).toContain('row-ring');
    expect(rows()[1].getAttribute('aria-selected')).toBe('false');
    expect(rows()[1].className).not.toContain('row-ring');
    expect(rows()[1].className).not.toContain('bg-row-selected');
  });

  it('moves with ↑/↓ and stops at the ends without wrapping', async () => {
    serve(three());
    await renderLoaded();
    await focusGrid();

    const up = await press('ArrowUp');
    expect(up.defaultPrevented).toBe(true);
    expect(selectedTitle()).toBe('One');
    await press('ArrowDown');
    expect(selectedTitle()).toBe('Two');
    await press('ArrowDown');
    expect(selectedTitle()).toBe('Three');
    const down = await press('ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(selectedTitle()).toBe('Three');
    await press('ArrowUp');
    expect(selectedTitle()).toBe('Two');
    expect(rows().filter((r) => r.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('ignores the later stories\' letter keys and Home/End', async () => {
    serve(three());
    await renderLoaded();
    await focusGrid();
    await press('ArrowDown');
    for (const key of ['s', 'b', 'c', 'x', 'Backspace', 'z', 'Home', 'End', 'PageDown']) {
      const event = await press(key);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(selectedTitle()).toBe('Two');
    expect(titles()).toEqual(['One', 'Two', 'Three']);
  });

  it('selects a clicked row and focuses the grid', async () => {
    serve(three());
    await renderLoaded();
    await act(async () => rows()[2].click());

    expect(document.activeElement).toBe(grid());
    expect(selectedTitle()).toBe('Three');
    expect(rows()[2].className).toContain('row-ring');
    expect(rows()[0].getAttribute('aria-selected')).toBe('false');
  });

  it('selects on a primary press before the focus, so only the pressed row scrolls', async () => {
    serve(three());
    await renderLoaded();
    await act(async () => {
      rows()[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    await focusGrid();

    expect(selectedTitle()).toBe('Three');
    expect(scrolled.map((s) => s.row)).toEqual([rows()[2]]);
  });

  it('ignores a right or middle press', async () => {
    serve(three());
    await renderLoaded();
    await focusGrid();
    for (const button of [1, 2]) {
      await act(async () => {
        rows()[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button }));
      });
    }
    expect(selectedTitle()).toBe('One');
  });

  it('leaves Shift+ArrowDown alone', async () => {
    serve(three());
    await renderLoaded();
    await focusGrid();
    const event = await press('ArrowDown', { shiftKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(selectedTitle()).toBe('One');
  });

  it('does not scroll while the grid is not focused, and scrolls when a refetch moves the row', async () => {
    const [one, two, three_] = three();
    serve([one, two, three_]);
    await renderLoaded();
    await focusGrid();
    await press('ArrowDown');
    expect(scrolled).toHaveLength(2);

    await refetchWith([three_, one, two]);
    await vi.waitFor(() => expect(titles()).toEqual(['Three', 'One', 'Two']));
    expect(scrolled).toHaveLength(3);
    expect(scrolled[2].row).toBe(rows()[2]);

    await act(async () => grid()!.blur());
    await refetchWith([one, three_]);
    await vi.waitFor(() => expect(titles()).toEqual(['One', 'Three']));
    expect(selectedTitle()).toBe('Three');
    expect(scrolled).toHaveLength(3);
  });

  it('calls onEmptied when the focused grid empties, and not when it was not focused', async () => {
    const onEmptied = vi.fn();
    serve(three());
    await view(<TaskList onEmptied={onEmptied} />);
    await vi.waitFor(() => expect(grid()).not.toBeNull());
    await focusGrid();
    await refetchWith([]);
    await vi.waitFor(() => expect(grid()).toBeNull());
    expect(onEmptied).toHaveBeenCalledTimes(1);

    await refetchWith(three());
    await vi.waitFor(() => expect(grid()).not.toBeNull());
    await refetchWith([]);
    await vi.waitFor(() => expect(grid()).toBeNull());
    expect(onEmptied).toHaveBeenCalledTimes(1);
  });

  it('keeps only the tint when the grid loses focus', async () => {
    serve(three());
    await renderLoaded();
    await focusGrid();
    await press('ArrowDown');
    await act(async () => grid()!.blur());

    const second = rows()[1];
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(second.className).toContain('bg-row-selected');
    expect(second.className).not.toContain('row-ring');

    await focusGrid();
    expect(selectedTitle()).toBe('Two');
    expect(rows()[1].className).toContain('row-ring');
  });

  it('keeps an overdue row\'s tint and rule when selected, adding the ring while focused', async () => {
    serve([task({ title: 'Late', due_at: '2020-01-01T09:00:00Z', is_overdue: true }), task()]);
    await renderLoaded();
    await focusGrid();

    const late = rows()[0];
    expect(late.getAttribute('aria-selected')).toBe('true');
    expect(late.className).toContain('bg-overdue-tint');
    expect(late.className).toContain('shadow-[inset_3px_0_0_var(--overdue)]');
    expect(late.className).toContain('row-ring');
    expect(late.className).not.toContain('bg-row-selected');
    expect(late.getAttribute('aria-label')).toMatch(/, overdue$/);

    await act(async () => grid()!.blur());
    expect(rows()[0].className).toContain('bg-overdue-tint');
    expect(rows()[0].className).not.toContain('row-ring');
  });

  it('scrolls the selected row into view (block: nearest) on every selection change', async () => {
    serve(three());
    await renderLoaded();
    await focusGrid();
    expect(scrolled).toEqual([{ row: rows()[0], options: { block: 'nearest' } }]);
    await press('ArrowDown');
    await press('ArrowDown');
    expect(scrolled.map((s) => s.row)).toEqual([rows()[0], rows()[1], rows()[2]]);
    expect(scrolled.every((s) => (s.options as { block: string }).block === 'nearest')).toBe(true);
    // Pressing into an end changes nothing, so nothing scrolls.
    await press('ArrowDown');
    expect(scrolled).toHaveLength(3);
  });

  it('follows the selected task by ID across a refetch that reorders the list', async () => {
    const [one, two, three_] = three();
    serve([one, two, three_]);
    await renderLoaded();
    await focusGrid();
    await press('ArrowDown');
    expect(selectedTitle()).toBe('Two');

    await refetchWith([three_, one, two]);
    await vi.waitFor(() => expect(titles()).toEqual(['Three', 'One', 'Two']));
    expect(selectedTitle()).toBe('Two');
    expect(rows()[2].getAttribute('aria-selected')).toBe('true');
    // ↓ from the new position stops at the end.
    await press('ArrowDown');
    expect(selectedTitle()).toBe('Two');
    await press('ArrowUp');
    expect(selectedTitle()).toBe('One');
  });

  it('moves to the row at the old index when the selected task is gone, clamped to the list', async () => {
    const [one, two, three_] = three();
    serve([one, two, three_]);
    await renderLoaded();
    await focusGrid();
    await press('ArrowDown');

    await refetchWith([one, three_]);
    await vi.waitFor(() => expect(titles()).toEqual(['One', 'Three']));
    expect(selectedTitle()).toBe('Three');

    await refetchWith([one]);
    await vi.waitFor(() => expect(titles()).toEqual(['One']));
    expect(selectedTitle()).toBe('One');
    expect(rows()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('shows the selected row\'s full title, unclamped', async () => {
    const long = 'A very long title '.repeat(11).trim();
    serve([task({ title: long }), task({ title: long })]);
    await renderLoaded();
    await focusGrid();

    const [selected, other] = rows().map((r) => r.querySelector('[data-testid="task-title"]')!);
    expect(selected.className).not.toContain('line-clamp-2');
    expect(other.className).toContain('line-clamp-2');
    expect(selected.textContent).toBe(long);
  });
});
