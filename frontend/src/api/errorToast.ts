import { toast } from 'sonner';
import { FALLBACK_MESSAGE, errorMessage, needsGlobalErrorToast } from './errors';

/** One fixed id: repeated failures update the same toast instead of stacking. */
export const ERROR_TOAST_ID = 'global-error';

/** Show the persistent error toast for `error`. It stays until dismissed. */
export function showErrorToast(error?: unknown): void {
  toast.error(error === undefined ? FALLBACK_MESSAGE : errorMessage(error), {
    id: ERROR_TOAST_ID,
    duration: Infinity,
    closeButton: true,
    dismissible: true,
    icon: null,
  });
}

/** The global query and mutation `onError`: toast only failures with nothing specific to say. */
export function handleGlobalError(error: unknown): void {
  if (needsGlobalErrorToast(error)) showErrorToast(error);
}
