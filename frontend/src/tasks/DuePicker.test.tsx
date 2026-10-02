import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverContent, Popover } from '@/components/ui/popover';
import { DuePicker } from './DuePicker';

// Fri Oct 2 2026, 2:30 PM local. Only Date is faked, so promises, React and
// Radix's focus timers run normally.
const NOW = new Date(2026, 9, 2, 14, 30);

let root: Root;
let container: HTMLDivElement;
let onSet: ReturnType<typeof vi.fn<(due: Date) => void>>;

/** A title input, a preset chip and the picker, wired as the add form wires them. */
function Host() {
  const titleRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Date | null>(null);
  return (
    <>
      <input ref={titleRef} name="title" aria-label="Add a task" />
      <button type="button" data-testid="preset" onClick={() => setPicked(null)}>
        Tomorrow 9:00 AM
      </button>
      <DuePicker
        value={picked}
        pressed={picked !== null}
        onSet={(due) => {
          onSet(due);
          setPicked(due);
        }}
        focusAfterSet={titleRef}
      />
    </>
  );
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  // Radix's popper measures its anchor and content.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  onSet = vi.fn<(due: Date) => void>();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Host />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const chip = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')][0];
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const day = (iso: string) =>
  document.querySelector<HTMLButtonElement>(`[role="dialog"] td[data-day="${iso}"] button`)!;
const timeField = () => document.querySelector<HTMLInputElement>('[role="dialog"] input[type="time"]')!;
const setButton = () =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (b) => b.textContent === 'Set',
  )!;
const titleInput = () => document.querySelector<HTMLInputElement>('input[name="title"]')!;

/** Let Radix's deferred focus moves (setTimeout 0) run. */
const settle = () => act(async () => new Promise<void>((r) => setTimeout(r, 0)));

async function press(el: Element, key: string): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
  await settle();
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => el.click());
  await settle();
}

async function open(): Promise<HTMLElement> {
  // Radix opens the trigger on pointerdown-free click.
  await click(chip());
  return dialog()!;
}

async function typeTime(value: string): Promise<void> {
  const el = timeField();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('due picker: chip', () => {
  it('reads "Pick date…" with a hidden calendar icon, unpressed, at least 24px', () => {
    const c = chip();
    expect(c.textContent).toBe('Pick date…');
    expect(c.getAttribute('aria-pressed')).toBe('false');
    expect(c.getAttribute('type')).toBe('button');
    expect(c.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(c.className).toContain('min-h-min-target');
    // Unpicked, the name is the visible text alone.
    expect(c.getAttribute('aria-label')).toBeNull();
  });
});

describe('due picker: opening', () => {
  it('opens a named modal dialog on the current month with past days disabled', async () => {
    const d = await open();
    expect(d.getAttribute('aria-label')).toBe('Pick a due date and time');
    expect(chip().getAttribute('aria-expanded')).toBe('true');
    expect(d.textContent).toContain('October 2026');
    expect(day('2026-10-01').disabled).toBe(true);
    expect(day('2026-10-02').disabled).toBe(false);
    expect(day('2026-10-31').disabled).toBe(false);
    // No way back before the current month.
    const previous = d.querySelector<HTMLButtonElement>('.rdp-button_previous')!;
    expect(previous.disabled || previous.getAttribute('aria-disabled') === 'true').toBe(true);
    // Modal: the rest of the page is hidden from assistive technology.
    expect(titleInput().closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('starts on today, focused, with the time at the next full hour after 9:00', async () => {
    await open();
    expect(day('2026-10-02').closest('td')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(day('2026-10-02'));
    expect(timeField().value).toBe('15:00');
  });

  it('labels the time field "Time", visibly', async () => {
    await open();
    const label = document.querySelector(`label[for="${timeField().id}"]`)!;
    expect(label.textContent).toBe('Time');
    expect(label.className).not.toContain('sr-only');
  });

  it('gives the content the opacity fade only, without zoom or slide', async () => {
    const d = await open();
    expect(d.className.split(' ')).toContain('data-open:fade-in-0');
    expect(d.className).not.toMatch(/zoom|slide/);
  });
});

describe('due picker: keyboard', () => {
  it('selects a day on Enter and moves focus to Time, defaulting to 9:00 AM', async () => {
    await open();
    await press(day('2026-10-12'), 'Enter');
    expect(day('2026-10-12').closest('td')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(timeField());
    expect(timeField().value).toBe('09:00');
  });

  it('ignores Enter on a past day', async () => {
    await open();
    await press(day('2026-10-01'), 'Enter');
    expect(day('2026-10-02').closest('td')!.getAttribute('aria-selected')).toBe('true');
  });

  it('sets on Enter in Time, shows the value in the chip and returns focus to the title', async () => {
    await open();
    await press(day('2026-10-12'), 'Enter');
    await typeTime('18:45');
    await press(timeField(), 'Enter');
    expect(dialog()).toBeNull();
    expect(onSet).toHaveBeenCalledExactlyOnceWith(new Date(2026, 9, 12, 18, 45));
    expect(chip().textContent).toBe('Oct 12, 6:45 PM');
    expect(chip().getAttribute('aria-label')).toBe('Oct 12, 6:45 PM, pick another date');
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(titleInput());
  });

  it('keeps the popover open on Set with an empty time, flags and focuses Time', async () => {
    await open();
    await typeTime('');
    await press(timeField(), 'Enter');
    expect(dialog()).not.toBeNull();
    expect(onSet).not.toHaveBeenCalled();
    expect(timeField().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(timeField());
    await click(setButton());
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(timeField());
    await typeTime('10:00');
    expect(timeField().getAttribute('aria-invalid')).toBeNull();
    await press(timeField(), 'Enter');
    expect(onSet).toHaveBeenCalledExactlyOnceWith(new Date(2026, 9, 2, 10, 0));
  });

  it('closes on Esc without change and returns focus to the chip', async () => {
    await open();
    await press(day('2026-10-12'), 'Enter');
    await press(timeField(), 'Escape');
    expect(dialog()).toBeNull();
    expect(onSet).not.toHaveBeenCalled();
    expect(chip().textContent).toBe('Pick date…');
    expect(document.activeElement).toBe(chip());
  });
});

describe('due picker: value', () => {
  it('sets from the Set button too', async () => {
    await open();
    await click(day('2026-10-20'));
    await click(setButton());
    expect(onSet).toHaveBeenCalledExactlyOnceWith(new Date(2026, 9, 20, 9, 0));
    expect(chip().textContent).toBe('Oct 20, 9:00 AM');
  });

  it('adds the year when the value is not in the current year', async () => {
    await open();
    for (let i = 0; i < 3; i++) {
      await click(dialog()!.querySelector<HTMLButtonElement>('.rdp-button_next')!);
    }
    await click(day('2027-01-04'));
    await click(setButton());
    expect(chip().textContent).toBe('Jan 4, 2027, 9:00 AM');
  });

  it('keeps a typed time when the day changes', async () => {
    await open();
    await typeTime('07:15');
    await click(day('2026-10-14'));
    expect(timeField().value).toBe('07:15');
  });

  it('reopens on the picked day and time', async () => {
    await open();
    await press(day('2026-10-12'), 'Enter');
    await typeTime('18:45');
    await press(timeField(), 'Enter');
    await open();
    expect(day('2026-10-12').closest('td')!.getAttribute('aria-selected')).toBe('true');
    expect(timeField().value).toBe('18:45');
  });

  it('reopens on today with the default time once the kept day has passed', async () => {
    await open();
    await click(setButton()); // Today, 15:00.
    expect(onSet).toHaveBeenCalledExactlyOnceWith(new Date(2026, 9, 2, 15, 0));
    vi.setSystemTime(new Date(2026, 9, 3, 10, 30));
    await open();
    expect(day('2026-10-03').closest('td')!.getAttribute('aria-selected')).toBe('true');
    expect(day('2026-10-02').disabled).toBe(true);
    expect(timeField().value).toBe('11:00');
    await click(setButton());
    expect(onSet).toHaveBeenLastCalledWith(new Date(2026, 9, 3, 11, 0));
  });

  it('reads "Pick date…" again once a preset clears the value', async () => {
    await open();
    await click(setButton());
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    await click(document.querySelector<HTMLButtonElement>('[data-testid="preset"]')!);
    expect(chip().textContent).toBe('Pick date…');
    expect(chip().getAttribute('aria-pressed')).toBe('false');
  });

  it('starts at 9:00 AM before 9:00 today', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 8, 15));
    await open();
    expect(timeField().value).toBe('09:00');
  });
});

describe('popover motion', () => {
  it('fades opacity only, on open and close, at the 180ms fade duration', async () => {
    await act(async () =>
      root.render(
        <Popover open>
          <PopoverContent data-testid="content">x</PopoverContent>
        </Popover>,
      ),
    );
    const content = document.querySelector('[data-testid="content"]')!;
    const classes = content.className.split(' ');
    expect(classes).toEqual(
      expect.arrayContaining([
        'duration-(--fade-duration)',
        'data-open:animate-in',
        'data-open:fade-in-0',
        'data-closed:animate-out',
        'data-closed:fade-out-0',
      ]),
    );
    expect(content.className).not.toMatch(/zoom-|slide-|duration-100/);
  });
});
