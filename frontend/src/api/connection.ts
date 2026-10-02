// Whether the server is reachable, as the last request found it. One app-wide
// value, set only by the client's interceptors (api/client.ts). It is not tied
// to the token: logging in or out neither sets nor clears it.

type Listener = () => void;

const listeners = new Set<Listener>();
let unreachable = false;

/**
 * Call `listener` whenever reachability changes. Returns the unsubscribe
 * function, so it fits `useSyncExternalStore`.
 */
export function subscribeConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUnreachable(): boolean {
  return unreachable;
}

/** Record what the last request found. Setting the current value notifies nobody. */
export function setUnreachable(value: boolean): void {
  if (value === unreachable) return;
  unreachable = value;
  for (const listener of listeners) listener();
}
