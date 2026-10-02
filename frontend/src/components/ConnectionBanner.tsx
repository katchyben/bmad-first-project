import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAnnounce } from '@/a11y/announce';
import { getUnreachable, subscribeConnection } from '@/api/connection';

export const BANNER_TEXT = "Can't reach the server. Retrying…";
export const RECONNECTED = 'Reconnected.';

/**
 * The connection banner (DESIGN.md `connection-banner`): a full-width line at
 * the very top while the server is unreachable. It is not a live region; its
 * text is announced once through the app's polite announcer when it appears,
 * and "Reconnected." once when it goes.
 */
export function ConnectionBanner() {
  const unreachable = useSyncExternalStore(subscribeConnection, getUnreachable);
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  // What was last announced; reachable at first, so a reachable mount says nothing.
  const announced = useRef(false);

  useEffect(() => {
    if (unreachable === announced.current) return;
    announced.current = unreachable;
    announce(unreachable ? BANNER_TEXT : RECONNECTED);
    // A failed mutation has nothing retrying behind it, so refetch the active
    // queries once: their retry loop is what keeps "Retrying…" true and what
    // clears the banner. A query already fetching is retrying already.
    if (unreachable && queryClient.isFetching() === 0) {
      void queryClient.refetchQueries({ type: 'active' });
    }
  }, [unreachable, announce, queryClient]);

  if (!unreachable) return null;
  return (
    <div
      data-testid="connection-banner"
      className="flex min-h-8 w-full items-center justify-center border-b border-border bg-card px-4 py-1 text-center text-caption text-muted-foreground"
    >
      {BANNER_TEXT}
    </div>
  );
}
