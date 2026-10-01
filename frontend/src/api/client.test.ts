import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client, configureClient, setOnUnauthenticated } from './client';
import { FALLBACK_MESSAGE, NetworkError, ServerError, errorMessage } from './errors';
import { TOKEN_KEY, getToken, setToken } from './token';

const ORIGIN = 'http://app.test';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UNAUTHENTICATED = {
  error: { code: 'unauthenticated', message: "That username and password don't match." },
};

let fetchMock: ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>;
let hook: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn<(request: Request) => Promise<Response>>();
  hook = vi.fn<() => void>();
  configureClient(ORIGIN);
  client.setConfig({ fetch: fetchMock as unknown as typeof fetch });
  setOnUnauthenticated(hook);
});

afterEach(() => {
  setOnUnauthenticated(() => {});
});

describe('base URL', () => {
  it('is the origin only, so /api paths are used as-is', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await client.get({ url: '/api/things' });
    expect(fetchMock.mock.calls[0][0].url).toBe(`${ORIGIN}/api/things`);
  });

  it('defaults to the page origin', () => {
    configureClient();
    expect(client.getConfig().baseUrl).toBe(window.location.origin);
  });
});

describe('auth header', () => {
  it('sends the stored token as a bearer token', async () => {
    setToken('abc123');
    fetchMock.mockResolvedValue(json(200, {}));
    await client.get({ url: '/api/things' });
    expect(fetchMock.mock.calls[0][0].headers.get('Authorization')).toBe('Bearer abc123');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('abc123');
  });

  it('sends no Authorization header without a token', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await client.get({ url: '/api/things' });
    expect(fetchMock.mock.calls[0][0].headers.has('Authorization')).toBe(false);
  });
});

describe('401 handling', () => {
  it('clears the token and calls the hook once for a non-login request', async () => {
    setToken('stale');
    fetchMock.mockResolvedValue(json(401, { error: { code: 'unauthenticated', message: 'x' } }));
    const result = await client.get({ url: '/api/tasks' });
    expect(result.error).toBeDefined();
    expect(getToken()).toBeNull();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('treats other methods on the login path as ordinary requests', async () => {
    setToken('stale');
    fetchMock.mockResolvedValue(json(401, UNAUTHENTICATED));
    await client.get({ url: '/api/auth/token' });
    expect(getToken()).toBeNull();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('leaves the token alone and returns the envelope for the login request', async () => {
    setToken('existing');
    fetchMock.mockResolvedValue(json(401, UNAUTHENTICATED));
    const result = await client.post({ url: '/api/auth/token', body: {} });
    expect(result.error).toEqual(UNAUTHENTICATED);
    expect(errorMessage(result.error)).toBe("That username and password don't match.");
    expect(getToken()).toBe('existing');
    expect(hook).not.toHaveBeenCalled();
  });

  it('throws the envelope to the caller for the login request with throwOnError', async () => {
    fetchMock.mockResolvedValue(json(401, UNAUTHENTICATED));
    await expect(
      client.post({ url: '/api/auth/token', body: {}, throwOnError: true }),
    ).rejects.toEqual(UNAUTHENTICATED);
    expect(hook).not.toHaveBeenCalled();
  });

  it('ignores a 401 for a request sent without a token', async () => {
    fetchMock.mockResolvedValue(json(401, UNAUTHENTICATED));
    await client.get({ url: '/api/tasks' });
    expect(hook).not.toHaveBeenCalled();
  });

  it('calls the hook once for two concurrent 401s', async () => {
    setToken('stale');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    fetchMock.mockImplementation(async () => {
      await gate;
      return json(401, UNAUTHENTICATED);
    });
    const both = Promise.all([client.get({ url: '/api/a' }), client.get({ url: '/api/b' })]);
    release();
    await both;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getToken()).toBeNull();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('keeps a fresh token when a 401 answers the stale one', async () => {
    setToken('stale');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    fetchMock.mockImplementation(async () => {
      await gate;
      return json(401, UNAUTHENTICATED);
    });
    const pending = client.get({ url: '/api/tasks' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    setToken('fresh');
    release();
    await pending;
    expect(getToken()).toBe('fresh');
    expect(hook).not.toHaveBeenCalled();
  });

  it('does nothing for other error statuses', async () => {
    setToken('keep');
    fetchMock.mockResolvedValue(json(404, { error: { code: 'not_found', message: 'Gone.' } }));
    await client.get({ url: '/api/tasks/1' });
    expect(getToken()).toBe('keep');
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('error shapes', () => {
  it('passes 4xx envelopes through unchanged', async () => {
    const body = { error: { code: 'state_conflict', message: 'That task is already finished.' } };
    fetchMock.mockResolvedValue(json(409, body));
    const result = await client.post({ url: '/api/tasks/1/finish' });
    expect(result.error).toEqual(body);
    expect(errorMessage(result.error)).toBe('That task is already finished.');
  });

  it('turns a 5xx into a ServerError so the helper falls back', async () => {
    fetchMock.mockResolvedValue(json(500, { error: { code: 'x', message: 'Internal.' } }));
    const result = await client.get({ url: '/api/tasks' });
    expect(result.error).toBeInstanceOf(ServerError);
    expect(errorMessage(result.error)).toBe(FALLBACK_MESSAGE);
  });

  it('tags a fetch rejection as a NetworkError wrapping the original', async () => {
    const cause = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(cause);
    const result = await client.get({ url: '/api/tasks' });
    expect(result.error).toBeInstanceOf(NetworkError);
    expect((result.error as NetworkError).cause).toBe(cause);
  });
});
