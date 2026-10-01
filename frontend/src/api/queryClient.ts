import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { handleGlobalError } from './errorToast';
import { isUnreachable } from './errors';

export const MAX_RETRY_DELAY_MS = 30_000;

/** Exponential back-off: 1 s, 2 s, 4 s ... capped at 30 s. */
export function retryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, MAX_RETRY_DELAY_MS);
}

/** Retry forever while the server is unreachable; never retry any other error. */
export function shouldRetryQuery(_failureCount: number, error: unknown): boolean {
  return isUnreachable(error);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    // A failure with nothing specific to say shows the fallback error toast.
    queryCache: new QueryCache({ onError: handleGlobalError }),
    mutationCache: new MutationCache({ onError: handleGlobalError }),
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
