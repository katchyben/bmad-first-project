import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client, configureClient } from '@/api/client';
import { createQueryClient } from '@/api/queryClient';
import { getToken, setToken } from '@/api/token';
import App from '@/App';
import { answerOthersWith, isTasksRequest, jsonResponse, task } from '@/tasks/testHarness';
import { formatHeadingDate } from './MainScreen';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const ORIGIN = 'http://app.test';

let fetchMock: ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>;
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

async function renderApp(): Promise<void> {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
  });
}

const logOutButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Log out');
const username = () => document.querySelector<HTMLInputElement>('input[name="username"]');
const logoutRequests = () =>
  fetchMock.mock.calls.filter(([r]) => new URL(r.url).pathname === '/api/auth/logout');

async function clickLogOut(): Promise<void> {
  await act(async () => {
    logOutButton()!.click();
  });
}

async function expectLoggedOut(): Promise<void> {
  await vi.waitFor(() => expect(username()).not.toBeNull());
  expect(getToken()).toBeNull();
  expect(document.title).toBe('Log in — Todo');
  expect(document.activeElement).toBe(username());
  expect(queryClient.getQueryData(['tasks'])).toBeUndefined();
  await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0));
}

async function seedToastAndCache(): Promise<void> {
  await act(async () => {
    toast('Something earlier.');
  });
  await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1));
  queryClient.setQueryData(['tasks'], ['old']);
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  document.title = '';
  stubMatchMedia();
  fetchMock = vi.fn<(request: Request) => Promise<Response>>();
  answerOthersWith(fetchMock, () => Promise.reject(new Error('unexpected request')));
  configureClient(ORIGIN);
  client.setConfig({ fetch: fetchMock as unknown as typeof fetch });
  queryClient = createQueryClient();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  setToken('stored');
});

afterEach(async () => {
  toast.dismiss();
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

describe('heading date', () => {
  it('formats as weekday, month day in en-US', () => {
    expect(formatHeadingDate(new Date(2026, 9, 1, 12))).toBe('Thursday, October 1');
    expect(formatHeadingDate(new Date(2026, 9, 2, 0, 5))).toBe('Friday, October 2');
  });
});

describe('main screen', () => {
  it('shows the Today heading, the date and Log out, with its title', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 9, 30));
    try {
      await renderApp();
    } finally {
      vi.useRealTimers();
    }

    expect(document.title).toBe('Today — Todo');
    const heading = document.querySelector('h1')!;
    expect(heading.textContent).toBe('Today');
    expect(heading.nextElementSibling?.textContent).toBe('Thursday, October 1');
    const button = logOutButton()!;
    expect(button.dataset.variant).toBe('ghost');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    // Heading and Log out share one baseline-aligned row.
    expect(button.parentElement?.className).toContain('items-baseline');
  });
});

describe('task list', () => {
  it('loads the tasks once and shows them below the header', async () => {
    await renderApp();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Nothing due. Enjoy the quiet.'),
    );
    const tasksRequests = fetchMock.mock.calls.filter(([r]) => isTasksRequest(r));
    expect(tasksRequests).toHaveLength(1);
    expect(tasksRequests[0][0].method).toBe('GET');
    expect(tasksRequests[0][0].headers.get('Authorization')).toBe('Bearer stored');
    const header = document.querySelector('main > header')!;
    expect(header.nextElementSibling?.textContent).toContain('Nothing due. Enjoy the quiet.');
  });
});

describe('keyboard', () => {
  const addInput = () => document.querySelector<HTMLInputElement>('input[name="title"]')!;
  const grid = () => document.querySelector<HTMLElement>('[role="grid"]');

  function serveTasks(): void {
    fetchMock.mockImplementation((r) =>
      isTasksRequest(r)
        ? Promise.resolve(jsonResponse([task({ title: 'First' }), task({ title: 'Second' })]))
        : Promise.reject(new Error('unexpected request')),
    );
  }

  async function keydown(target: EventTarget, init: KeyboardEventInit): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    await act(async () => {
      target.dispatchEvent(event);
    });
    return event;
  }

  it('⌘K on macOS focuses the add input from anywhere and prevents the default', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    serveTasks();
    await renderApp();
    await vi.waitFor(() => expect(grid()).not.toBeNull());
    await act(async () => grid()!.focus());

    const ctrl = await keydown(grid()!, { key: 'k', ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(grid());

    const meta = await keydown(grid()!, { key: 'k', metaKey: true });
    expect(meta.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(addInput());

    await act(async () => addInput().blur());
    const fromBody = await keydown(document.body, { key: 'K', metaKey: true });
    expect(fromBody.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(addInput());
    expect(document.querySelector('[data-testid="kbd-hint"]')!.textContent).toBe('Enter');
  });

  it('Ctrl+K off macOS focuses the add input and prevents the default; ⌘K does not', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    await renderApp();
    await vi.waitFor(() => expect(addInput()).not.toBeNull());
    expect(document.querySelector('[data-testid="kbd-hint"]')!.textContent).toBe('Ctrl K');

    const meta = await keydown(document.body, { key: 'k', metaKey: true });
    expect(meta.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(addInput());

    const plain = await keydown(document.body, { key: 'k' });
    expect(plain.defaultPrevented).toBe(false);

    const ctrl = await keydown(document.body, { key: 'k', ctrlKey: true });
    expect(ctrl.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(addInput());
  });

  it('Esc in the add input moves focus to the task grid, which selects its first row', async () => {
    serveTasks();
    await renderApp();
    await vi.waitFor(() => expect(grid()).not.toBeNull());
    await act(async () => addInput().focus());

    const esc = await keydown(addInput(), { key: 'Escape' });
    expect(esc.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(grid());
    const selected = document.getElementById(grid()!.getAttribute('aria-activedescendant')!)!;
    expect(selected.textContent).toContain('First');
  });

  it.each([
    ['MacIntel', 'metaKey'],
    ['Win32', 'ctrlKey'],
  ] as const)('on %s ignores the shortcut with Shift or Alt, composing, or already handled', async (platform, mod) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    await renderApp();
    await vi.waitFor(() => expect(addInput()).not.toBeNull());
    for (const extra of [{ shiftKey: true }, { altKey: true }, { isComposing: true }]) {
      const event = await keydown(document.body, { key: 'k', [mod]: true, ...extra });
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).not.toBe(addInput());
    }
    const handled = new KeyboardEvent('keydown', { key: 'k', [mod]: true, bubbles: true, cancelable: true });
    handled.preventDefault();
    await act(async () => {
      document.body.dispatchEvent(handled);
    });
    expect(document.activeElement).not.toBe(addInput());
  });

  it('leaves focus in an open dialog, such as the due popover', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    await renderApp();
    await vi.waitFor(() => expect(addInput()).not.toBeNull());
    const pick = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Pick date'))!;
    await act(async () => pick.click());
    const dialog = await vi.waitFor(() => {
      const d = document.querySelector<HTMLElement>('[role="dialog"]');
      expect(d).not.toBeNull();
      return d!;
    });
    await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const inside = document.activeElement!;

    const event = await keydown(inside, { key: 'k', ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(inside);
  });

  it('moves focus to the add input when the focused list becomes empty', async () => {
    serveTasks();
    await renderApp();
    await vi.waitFor(() => expect(grid()).not.toBeNull());
    await act(async () => grid()!.focus());
    answerOthersWith(fetchMock, () => Promise.reject(new Error('unexpected request')));
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await vi.waitFor(() => expect(grid()).toBeNull());
    expect(document.activeElement).toBe(addInput());
  });

  it('Esc in the add input just blurs it when there are no tasks', async () => {
    await renderApp();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Nothing due. Enjoy the quiet.'),
    );
    await act(async () => addInput().focus());
    await keydown(addInput(), { key: 'Escape' });
    expect(grid()).toBeNull();
    expect(document.activeElement).not.toBe(addInput());
  });
});

describe('log out', () => {
  it('ends the session at once and revokes it with the old token', async () => {
    let release: () => void = () => {};
    answerOthersWith(fetchMock, 
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Response(null, { status: 204 }));
        }),
    );
    await renderApp();
    await seedToastAndCache();

    await clickLogOut();
    // Login shows before the server answers.
    await expectLoggedOut();
    await vi.waitFor(() => expect(logoutRequests()).toHaveLength(1));
    expect(logoutRequests()[0][0].headers.get('Authorization')).toBe('Bearer stored');

    await act(async () => release());
    expect(username()).not.toBeNull();
  });

  it.each([
    ['a 5xx', () => Promise.resolve(new Response('boom', { status: 500 }))],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'a 401',
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'unauthenticated', message: 'Log in to continue.' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    ],
  ])('still ends the session on %s, with no error toast', async (_label, answer) => {
    const errorToast = vi.spyOn(toast, 'error');
    answerOthersWith(fetchMock, answer);
    await renderApp();

    await clickLogOut();
    await expectLoggedOut();
    await vi.waitFor(() => expect(logoutRequests()).toHaveLength(1));
    // Let the failure settle, then check nothing was toasted at any point.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(errorToast).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0);
    // Mutations are never retried.
    expect(logoutRequests()).toHaveLength(1);
  });

  it('does not wait for a server that never answers', async () => {
    answerOthersWith(fetchMock, () => new Promise(() => {}));
    await renderApp();

    await clickLogOut();
    await expectLoggedOut();
  });
});
