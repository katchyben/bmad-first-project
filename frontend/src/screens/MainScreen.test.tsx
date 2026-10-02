import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client, configureClient } from '@/api/client';
import { createQueryClient } from '@/api/queryClient';
import { getToken, setToken } from '@/api/token';
import App from '@/App';
import { answerOthersWith, isTasksRequest } from '@/tasks/testHarness';
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
