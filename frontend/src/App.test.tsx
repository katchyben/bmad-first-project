import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client, configureClient } from '@/api/client';
import { FALLBACK_MESSAGE } from '@/api/errors';
import { createQueryClient } from '@/api/queryClient';
import { TOKEN_KEY, getToken, setToken } from '@/api/token';
import { listTasksQueryKey } from '@/client/@tanstack/react-query.gen';
import { answerOthersWith } from '@/tasks/testHarness';
import App from './App';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const ORIGIN = 'http://app.test';
const INVALID = "That username and password don't match.";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const tokenResponse = () => json(200, { access_token: 'fresh-token', token_type: 'bearer' });
const invalidResponse = () =>
  json(401, { error: { code: 'unauthenticated', message: INVALID } });

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

const username = () => document.querySelector<HTMLInputElement>('input[name="username"]');
const password = () => document.querySelector<HTMLInputElement>('input[name="password"]');
const loginButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Log in');
const form = () => document.querySelector('form')!;
const alertSlot = () => document.querySelector<HTMLElement>('[role="alert"]');
const loginRequests = () =>
  fetchMock.mock.calls.filter(([r]) => new URL(r.url).pathname === '/api/auth/token');

async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Enter in a field: jsdom has no implicit submission, so submit the form the same way. */
async function submit(): Promise<void> {
  await act(async () => {
    form().requestSubmit();
  });
}

async function fillAndSubmit(user: string, pass: string): Promise<void> {
  await type(username()!, user);
  await type(password()!, pass);
  await submit();
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  document.title = '';
  stubMatchMedia();
  fetchMock = vi.fn<(request: Request) => Promise<Response>>();
  configureClient(ORIGIN);
  client.setConfig({ fetch: fetchMock as unknown as typeof fetch });
  answerOthersWith(fetchMock, () => Promise.reject(new Error('unexpected request')));
  queryClient = createQueryClient();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  toast.dismiss();
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

describe('no token', () => {
  it('shows Login with its title and focuses Username', async () => {
    await renderApp();
    expect(document.querySelector('h1')?.textContent).toBe('Todo App');
    expect(document.title).toBe('Log in — Todo');
    expect(document.activeElement).toBe(username());
    expect(username()!.autocomplete).toBe('username');
    expect(password()!.autocomplete).toBe('current-password');
    expect(password()!.type).toBe('password');
    // Visible labels name the fields.
    expect(document.querySelector(`label[for="${username()!.id}"]`)?.textContent).toBe('Username');
    expect(document.querySelector(`label[for="${password()!.id}"]`)?.textContent).toBe('Password');
    expect(document.querySelector('h1')?.textContent).toBe('Todo App');
    // Nothing of the main screen is reachable.
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Log out')).toBe(false);
  });
});

describe('stored token', () => {
  it('shows the logged-in view with its title', async () => {
    setToken('stored');
    await renderApp();
    expect(document.querySelector('h1')?.textContent).toBe('Today');
    expect(document.title).toBe('Today — Todo');
    expect(username()).toBeNull();
  });
});

describe('valid login', () => {
  it('is aria-disabled while pending, then stores the token and shows the logged-in view', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    answerOthersWith(fetchMock, async () => {
      await gate;
      return tokenResponse();
    });
    await renderApp();
    queryClient.setQueryData(['old-session'], 'stale');

    await fillAndSubmit('benny', 'secret');
    expect(loginButton()!.getAttribute('aria-disabled')).toBe('true');
    expect(loginButton()!.disabled).toBe(false);

    const [request] = loginRequests()[0];
    expect(request.method).toBe('POST');
    expect(request.headers.get('Content-Type')).toContain('application/x-www-form-urlencoded');
    const body = new URLSearchParams(await request.clone().text());
    expect(body.get('username')).toBe('benny');
    expect(body.get('password')).toBe('secret');

    await act(async () => release());
    await vi.waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Today'));
    expect(localStorage.getItem(TOKEN_KEY)).toBe('fresh-token');
    expect(document.title).toBe('Today — Todo');
    expect(queryClient.getQueryData(['old-session'])).toBeUndefined();
  });
});

describe('invalid login', () => {
  it('shows the API message, marks both fields, keeps the username, clears and focuses the password', async () => {
    fetchMock.mockImplementation(async () => invalidResponse());
    await renderApp();
    await fillAndSubmit('benny', 'wrong');

    await vi.waitFor(() => expect(alertSlot()?.textContent).toBe(INVALID));
    expect(username()).not.toBeNull();
    expect(getToken()).toBeNull();
    for (const field of [username()!, password()!]) {
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(field.getAttribute('aria-describedby')).toBe(alertSlot()!.id);
    }
    // The one slot sits directly above Log in.
    expect(alertSlot()!.nextElementSibling).toBe(loginButton());
    expect(username()!.value).toBe('benny');
    expect(password()!.value).toBe('');
    expect(document.activeElement).toBe(password());
    expect(loginButton()!.hasAttribute('aria-disabled')).toBe(false);
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0);
  });

  it('a 5xx keeps both fields and shows no inline message', async () => {
    fetchMock.mockImplementation(async () => json(500, 'Internal Server Error'));
    await renderApp();
    await fillAndSubmit('benny', 'secret');

    await vi.waitFor(() => expect(loginButton()!.hasAttribute('aria-disabled')).toBe(false));
    expect(username()!.value).toBe('benny');
    expect(password()!.value).toBe('secret');
    expect(alertSlot()!.textContent).toBe('');
    expect(password()!.hasAttribute('aria-invalid')).toBe(false);
    await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1));
    expect(document.querySelector('[data-sonner-toast]')!.textContent).toContain(FALLBACK_MESSAGE);
  });

  it('an empty submit answered by a 422 shows the message, keeps the password and focus', async () => {
    // The backend's VALIDATION_MESSAGE (adapters/http/errors.py).
    const message = "Some details aren't valid. Check them and try again.";
    fetchMock.mockImplementation(async () =>
      json(422, { error: { code: 'validation_error', message } }),
    );
    await renderApp();
    await type(password()!, 'kept');
    await act(async () => username()!.focus());
    await submit();

    await vi.waitFor(() => expect(alertSlot()?.textContent).toBe(message));
    for (const field of [username()!, password()!]) {
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(field.getAttribute('aria-describedby')).toBe(alertSlot()!.id);
    }
    expect(password()!.value).toBe('kept');
    expect(document.activeElement).toBe(username());
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0);
  });

  it('a network failure keeps both fields', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await renderApp();
    await fillAndSubmit('benny', 'secret');

    await vi.waitFor(() => expect(loginButton()!.hasAttribute('aria-disabled')).toBe(false));
    expect(username()!.value).toBe('benny');
    expect(password()!.value).toBe('secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('double submit', () => {
  it('sends one request for two quick submits', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    answerOthersWith(fetchMock, async () => {
      await gate;
      return tokenResponse();
    });
    await renderApp();
    await type(username()!, 'benny');
    await type(password()!, 'secret');
    await act(async () => {
      form().requestSubmit();
      form().requestSubmit();
    });
    // Activation is ignored while aria-disabled.
    await act(async () => loginButton()!.click());
    await act(async () => release());
    await vi.waitFor(() => expect(document.title).toBe('Today — Todo'));
    expect(loginRequests()).toHaveLength(1);
  });
});

describe('another tab', () => {
  async function showToastAndCache(): Promise<void> {
    await act(async () => {
      toast('Something earlier.');
    });
    await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1));
    queryClient.setQueryData(['tasks'], ['old']);
  }

  async function expectReset(): Promise<void> {
    expect(queryClient.getQueryData(['tasks'])).toBeUndefined();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0));
  }

  it.each([TOKEN_KEY, null])(
    'logging out elsewhere shows Login and clears cache and toasts (key %s)',
    async (key) => {
      setToken('stored');
      await renderApp();
      await showToastAndCache();

      await act(async () => {
        localStorage.removeItem(TOKEN_KEY);
        window.dispatchEvent(new StorageEvent('storage', { key }));
      });

      expect(username()).not.toBeNull();
      expect(document.title).toBe('Log in — Todo');
      await expectReset();
    },
  );

  it('a new token from elsewhere keeps the logged-in view but clears cache and toasts', async () => {
    setToken('stored');
    await renderApp();
    await showToastAndCache();

    await act(async () => {
      localStorage.setItem(TOKEN_KEY, 'other-tab');
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY }));
    });

    expect(document.querySelector('h1')?.textContent).toBe('Today');
    await expectReset();
  });

  it('logging in elsewhere shows the logged-in view', async () => {
    await renderApp();
    await act(async () => {
      localStorage.setItem(TOKEN_KEY, 'other-tab');
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(document.title).toBe('Today — Todo');
  });
});

describe('empty token', () => {
  it('counts as logged out', async () => {
    localStorage.setItem(TOKEN_KEY, '');
    await renderApp();
    expect(username()).not.toBeNull();
  });
});

describe('token rejected', () => {
  it('shows Login silently, with the token, toasts and cache gone', async () => {
    setToken('stale');
    await renderApp();
    expect(document.title).toBe('Today — Todo');

    await act(async () => {
      toast('Something earlier.');
    });
    await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1));
    queryClient.setQueryData(listTasksQueryKey(), []);

    const before = fetchMock.mock.calls.length;
    fetchMock.mockImplementation(async () =>
      json(401, { error: { code: 'unauthenticated', message: 'Log in again.' } }),
    );
    await act(async () => {
      await client.get({ url: '/api/tasks' });
    });

    expect(getToken()).toBeNull();
    expect(username()).not.toBeNull();
    expect(document.title).toBe('Log in — Todo');
    expect(document.activeElement).toBe(username());
    expect(alertSlot()!.textContent).toBe('');
    expect(queryClient.getQueryData(listTasksQueryKey())).toBeUndefined();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(0));
    // Nothing is replayed.
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
  });
});
