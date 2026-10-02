import { isCancelledError } from '@tanstack/react-query';

export const FALLBACK_MESSAGE = 'Something went wrong. Try again.';

/** A 5xx response. Its body is never shown, so the helper falls back. */
export class ServerError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Server error ${status}`);
    this.name = 'ServerError';
    this.status = status;
    this.body = body;
  }
}

/** The request got no response: fetch rejected. Tagged by the client's error interceptor. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network failure', { cause });
    this.name = 'NetworkError';
  }
}

/** Gateway statuses: the proxy answered, but the backend behind it did not. */
export const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/**
 * True when the server is unreachable: a network failure, or a gateway error
 * (what the Vite dev proxy returns while the backend is down).
 */
export function isUnreachable(error: unknown): boolean {
  return (
    error instanceof NetworkError ||
    (error instanceof ServerError && GATEWAY_STATUSES.has(error.status))
  );
}

function envelopeMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('error' in error)) return undefined;
  const body = (error as { error: unknown }).error;
  if (typeof body !== 'object' || body === null || !('message' in body)) return undefined;
  const message = (body as { message: unknown }).message;
  return typeof message === 'string' && message !== '' ? message : undefined;
}

/** The envelope `code` of a 4xx failure (e.g. `unauthenticated`), or undefined. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('error' in error)) return undefined;
  const body = (error as { error: unknown }).error;
  if (typeof body !== 'object' || body === null || !('code' in body)) return undefined;
  const code = (body as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** True for a 4xx envelope: something the API has to say about this attempt. */
export function isEnvelopeError(error: unknown): boolean {
  return !(error instanceof ServerError) && !isUnreachable(error) && errorCode(error) !== undefined;
}

/**
 * The message to show for a failed request: the envelope `message` exactly as
 * written, or the fallback for a 5xx or a body without one.
 */
export function errorMessage(error: unknown, response?: Response): string {
  if (error instanceof ServerError) return FALLBACK_MESSAGE;
  if (response !== undefined && response.status >= 500) return FALLBACK_MESSAGE;
  return envelopeMessage(error) ?? FALLBACK_MESSAGE;
}

/**
 * True when a failure has nothing user-specific to say, so the app shows the
 * fallback in the global error toast: a 5xx, or a body without an envelope
 * `message`. Unreachable failures (network, gateway 502/503/504) belong to the
 * connection banner, envelope messages to the place the user acted, and a
 * cancelled query is not a failure, so none of these is toasted globally.
 */
export function needsGlobalErrorToast(error: unknown): boolean {
  if (isUnreachable(error) || isCancelledError(error)) return false;
  if (error instanceof ServerError) return true;
  return envelopeMessage(error) === undefined;
}
