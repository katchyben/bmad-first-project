import { useEffect, useState } from 'react';

export const NOW_TICK_MS = 60_000;

/**
 * The browser's current time, re-read once a minute and whenever the window
 * gains focus, so time-dependent rows (live overdue promotion) re-evaluate
 * without a refetch.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, NOW_TICK_MS);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);

  return now;
}
