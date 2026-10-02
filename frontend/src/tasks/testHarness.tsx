import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { client, configureClient } from '@/api/client';
import { createQueryClient } from '@/api/queryClient';
import type { TaskResponse } from '@/client/types.gen';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

export type FetchMock = ReturnType<typeof vi.fn<(request: Request) => Promise<Response>>>;

export type Harness = {
  fetchMock: FetchMock;
  queryClient: QueryClient;
  render: (node: ReactNode) => Promise<void>;
  cleanup: () => void;
};

/** A test harness on the real query client and generated client, with fetch mocked. */
export function createHarness(): Harness {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const fetchMock: FetchMock = vi.fn<(request: Request) => Promise<Response>>();
  configureClient('http://app.test');
  client.setConfig({ fetch: fetchMock as unknown as typeof fetch });
  const queryClient = createQueryClient();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  return {
    fetchMock,
    queryClient,
    render: async (node) => {
      await act(async () => {
        root.render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
      });
    },
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
      queryClient.clear();
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let nextId = 1;

/** A To do task as the API returns it; override any field. */
export function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  const id = nextId++;
  return {
    id,
    title: `Task ${id}`,
    description: null,
    due_at: '2026-10-03T09:00:00Z',
    status: 'to_do',
    created_at: '2026-10-01T09:00:00Z',
    finished_at: null,
    is_overdue: false,
    ...overrides,
  };
}

export const isTasksRequest = (r: Request) => new URL(r.url).pathname === '/api/tasks';

/** The task list loads empty; every other request gets `answer`. */
export function answerOthersWith(fetchMock: FetchMock, answer: () => Promise<Response>): void {
  fetchMock.mockImplementation((r) =>
    isTasksRequest(r) ? Promise.resolve(jsonResponse([])) : answer(),
  );
}

export const tasksRequests = (fetchMock: FetchMock) =>
  fetchMock.mock.calls.filter(
    ([r]) => r.method === 'GET' && new URL(r.url).pathname === '/api/tasks',
  );
