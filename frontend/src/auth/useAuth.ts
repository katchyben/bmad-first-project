import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { setOnUnauthenticated } from '@/api/client';
import { getToken, setToken, subscribeToken } from '@/api/token';

export type Auth = {
  /** True while a non-empty token is stored. The server judges whether it is still valid. */
  loggedIn: boolean;
  /** Start a session with a token from the login response. */
  logIn: (token: string) => void;
};

/**
 * The app's one auth state: logged in exactly while the token store holds a token.
 *
 * Whenever the stored token changes, from any source (login here, a 401 the
 * client cleared, or another tab), the query cache and all toasts are dropped,
 * so each session loads fresh. This runs in the store listener, before the new
 * view renders. A rejected token shows Login with no message; nothing is replayed.
 */
export function useAuth(): Auth {
  const queryClient = useQueryClient();
  const token = useSyncExternalStore(subscribeToken, getToken, () => null);

  useEffect(() => {
    const reset = () => {
      toast.dismiss();
      queryClient.clear();
    };
    let last = getToken();
    const unsubscribe = subscribeToken(() => {
      const current = getToken();
      if (current === last) return;
      last = current;
      reset();
    });
    // The 1.3a hook: the client has already cleared the rejected token.
    setOnUnauthenticated(reset);
    return () => {
      unsubscribe();
      setOnUnauthenticated(() => {});
    };
  }, [queryClient]);

  return { loggedIn: Boolean(token), logIn: setToken };
}
