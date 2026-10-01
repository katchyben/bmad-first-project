import { MutationObserver, type QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { FALLBACK_MESSAGE, NetworkError, ServerError } from './errors';
import { createQueryClient } from './queryClient';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function stubMatchMedia(): void {
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
}

/** Let Sonner's setTimeout / requestAnimationFrame updates land. */
async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function failQuery(error: unknown, retry?: false): Promise<void> {
  await queryClient
    .fetchQuery({
      queryKey: ['failing', Math.random()],
      queryFn: () => Promise.reject(error),
      ...(retry === false ? { retry } : {}),
    })
    .catch(() => {});
  await settle();
}

async function failMutation(error: unknown): Promise<void> {
  const observer = new MutationObserver(queryClient, {
    mutationFn: () => Promise.reject(error),
  });
  await observer.mutate().catch(() => {});
  await settle();
}

function toasts(): Element[] {
  return [...document.querySelectorAll('[data-sonner-toast]')];
}

function dismissButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Dismiss"]')];
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  stubMatchMedia();
  queryClient = createQueryClient();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Toaster />);
  });
});

afterEach(async () => {
  toast.dismiss();
  await settle(1000);
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.useRealTimers();
});

describe('global error toast', () => {
  it('a 5xx query shows one persistent fallback toast with a Dismiss button', async () => {
    await failQuery(new ServerError(500, null));

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].textContent).toContain(FALLBACK_MESSAGE);
    expect(dismissButtons()).toHaveLength(1);
    expect(toasts()[0].querySelector('[data-icon]')).toBeNull();

    await settle(30_000);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].textContent).toContain(FALLBACK_MESSAGE);
  });

  it('an envelope-less mutation failure shows the same fallback toast', async () => {
    await failMutation('Internal Server Error');

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].textContent).toContain(FALLBACK_MESSAGE);
    expect(dismissButtons()).toHaveLength(1);
  });

  it('repeated failures reuse one toast', async () => {
    await failQuery(new ServerError(500, null));
    await failQuery(new ServerError(500, null));
    await failMutation(new ServerError(500, null));

    expect(toasts()).toHaveLength(1);
  });

  it('an envelope error is not toasted globally', async () => {
    await failQuery({ error: { code: 'state_conflict', message: 'That task is already done.' } });

    expect(toasts()).toHaveLength(0);
  });

  it('a gateway error on a mutation is not toasted globally', async () => {
    await failMutation(new ServerError(503, null));

    expect(toasts()).toHaveLength(0);
  });

  it('a network error is not toasted globally', async () => {
    // retry: false so the query actually fails instead of retrying forever.
    await failQuery(new NetworkError(new TypeError('Failed to fetch')), false);

    expect(toasts()).toHaveLength(0);
  });

  it('Dismiss closes the toast, and a later failure shows it again', async () => {
    await failQuery(new ServerError(500, null));
    expect(toasts()).toHaveLength(1);

    await act(async () => {
      dismissButtons()[0].click();
    });
    await settle(1000);
    expect(toasts()).toHaveLength(0);

    await failQuery(new ServerError(500, null));
    expect(toasts()).toHaveLength(1);
  });
});
