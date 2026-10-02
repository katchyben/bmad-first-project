import { useQuery } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnounceProvider } from '@/a11y/announce';
import { setUnreachable } from '@/api/connection';
import { createHarness, type Harness } from '@/tasks/testHarness';
import { BANNER_TEXT, ConnectionBanner, RECONNECTED } from './ConnectionBanner';

let h: Harness;

beforeEach(() => {
  h = createHarness();
});

afterEach(() => {
  h.cleanup();
});

const banner = () => document.querySelector<HTMLElement>('[data-testid="connection-banner"]');
const announcer = () => document.querySelector('[data-testid="announcer"]')!;

async function set(value: boolean): Promise<void> {
  await act(async () => setUnreachable(value));
}

/** Records every text the announcer shows, so repeats are counted. */
function recordAnnouncements(): string[] {
  const seen: string[] = [];
  const observer = new MutationObserver(() => {
    const text = announcer().textContent ?? '';
    if (text !== '') seen.push(text);
  });
  observer.observe(announcer(), { childList: true, subtree: true, characterData: true });
  return seen;
}

async function renderBanner(extra: ReactNode = null): Promise<void> {
  await h.render(
    <AnnounceProvider>
      <ConnectionBanner />
      {extra}
    </AnnounceProvider>,
  );
}

describe('connection banner', () => {
  it('renders nothing and announces nothing while reachable', async () => {
    await renderBanner();
    expect(banner()).toBeNull();
    expect(announcer().textContent).toBe('');
  });

  it('shows the exact text with the DESIGN.md tokens, and is not a live region', async () => {
    await renderBanner();
    await set(true);
    const el = banner()!;
    expect(el.textContent).toBe(BANNER_TEXT);
    expect(BANNER_TEXT).toBe("Can't reach the server. Retrying…");
    for (const cls of [
      'w-full',
      'min-h-8',
      'justify-center',
      'text-center',
      'text-caption',
      'text-muted-foreground',
      'bg-card',
      'border-b',
      'border-border',
    ]) {
      expect(el.classList.contains(cls), cls).toBe(true);
    }
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('aria-live')).toBe(false);
    expect(el.querySelector('svg, button')).toBeNull();
  });

  it('announces once on appear and "Reconnected." once on clear, with no visible line', async () => {
    await renderBanner();
    const seen = recordAnnouncements();
    await set(true);
    await set(true);
    await set(true);
    expect(seen).toEqual([BANNER_TEXT]);
    await set(false);
    await set(false);
    expect(seen).toEqual([BANNER_TEXT, RECONNECTED]);
    expect(banner()).toBeNull();
    // "Reconnected." lives only in the sr-only announcer.
    expect(announcer().textContent).toBe(RECONNECTED);
    expect(document.body.textContent).toBe(RECONNECTED);
  });

  it('refetches the active queries once on becoming unreachable when none is fetching', async () => {
    const queryFn = vi.fn(async () => 'ok');
    function Active() {
      useQuery({ queryKey: ['active'], queryFn });
      return null;
    }
    await renderBanner(<Active />);
    await vi.waitFor(() => expect(h.queryClient.isFetching()).toBe(0));
    expect(queryFn).toHaveBeenCalledTimes(1);

    await set(true);
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(h.queryClient.isFetching()).toBe(0));
    // Staying unreachable refetches nothing more.
    await set(true);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('does not refetch when a query is already fetching', async () => {
    let release!: (value: string) => void;
    const queryFn = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    function Active() {
      useQuery({ queryKey: ['slow'], queryFn });
      return null;
    }
    await renderBanner(<Active />);
    expect(h.queryClient.isFetching()).toBe(1);
    await set(true);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await act(async () => release('done'));
  });
});
