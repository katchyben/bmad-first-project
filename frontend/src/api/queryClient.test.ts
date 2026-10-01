import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client, configureClient } from './client';
import { MAX_RETRY_DELAY_MS, createQueryClient, retryDelay } from './queryClient';

let fetchMock: ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A queryFn that goes through the configured client, as generated hooks do. */
const viaClient = () => client.get({ url: '/api/tasks', throwOnError: true }).then((r) => r.data);

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn<(request: Request) => Promise<Response>>();
  configureClient('http://app.test');
  client.setConfig({ fetch: fetchMock as unknown as typeof fetch });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Run a query for 25 windows of 30 s and return when each fetch happened. */
async function fetchTimes(): Promise<number[]> {
  const calledAt: number[] = [];
  const respond = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((request) => {
    calledAt.push(Date.now());
    return respond(request);
  });
  const queryClient = createQueryClient();
  void queryClient.fetchQuery({ queryKey: ['tasks'], queryFn: viaClient }).catch(() => {});
  for (let i = 0; i < 25; i++) {
    await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS);
  }
  queryClient.clear();
  return calledAt;
}

function expectIndefiniteCappedBackoff(calledAt: number[]): void {
  // Far past TanStack's default limit of 3 retries.
  expect(calledAt.length).toBeGreaterThanOrEqual(21);
  const gaps = calledAt.slice(1).map((t, i) => t - calledAt[i]);
  gaps.forEach((gap, i) => {
    expect(gap).toBeLessThanOrEqual(MAX_RETRY_DELAY_MS);
    if (i > 0) expect(gap).toBeGreaterThanOrEqual(gaps[i - 1]);
  });
  expect(gaps[0]).toBeLessThan(gaps[3]);
  expect(gaps.at(-1)).toBe(MAX_RETRY_DELAY_MS);
}

describe('retryDelay', () => {
  it('backs off exponentially and caps at 30 s', () => {
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(1)).toBe(2000);
    expect(retryDelay(4)).toBe(16000);
    expect(retryDelay(5)).toBe(MAX_RETRY_DELAY_MS);
    expect(retryDelay(50)).toBe(30_000);
  });
});

describe('query retries', () => {
  it('retries a network failure indefinitely with capped back-off', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    expectIndefiniteCappedBackoff(await fetchTimes());
  });

  it.each([502, 503, 504])(
    'retries a gateway error (%i) indefinitely with capped back-off',
    async (status) => {
      fetchMock.mockImplementation(async () => new Response('Bad Gateway', { status }));
      expectIndefiniteCappedBackoff(await fetchTimes());
    },
  );

  it.each([
    [404, { error: { code: 'not_found', message: "There's nothing here." } }],
    [500, 'Internal Server Error'],
  ])('does not retry an HTTP error (%i)', async (status, body) => {
    fetchMock.mockImplementation(async () => json(status, body));
    expect(await fetchTimes()).toHaveLength(1);
  });

  it('does not retry a plain TypeError thrown by a queryFn (a code bug)', async () => {
    const queryClient = createQueryClient();
    const queryFn = vi.fn(() => Promise.reject(new TypeError('x is undefined')));
    await expect(queryClient.fetchQuery({ queryKey: ['bug'], queryFn })).rejects.toBeInstanceOf(
      TypeError,
    );
    await vi.advanceTimersByTimeAsync(10 * MAX_RETRY_DELAY_MS);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('refetches on reconnect and window focus', () => {
    const defaults = createQueryClient().getDefaultOptions().queries;
    expect(defaults?.refetchOnReconnect).toBe(true);
    expect(defaults?.refetchOnWindowFocus).toBe(true);
  });
});

describe('mutation retries', () => {
  it('never retries, even a network failure', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    const queryClient = createQueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: viaClient });
    await expect(mutation.execute(undefined)).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(10 * MAX_RETRY_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
