const DEFAULT_HOUR = 9;

const pad = (n: number) => String(n).padStart(2, '0');

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * The time field's starting value ("HH:MM") for a picked `day`: 9:00 AM, or,
 * when `day` is today and 9:00 has come, the next full hour, capped at 23:59 so
 * it stays today. Pure: the caller passes `now`.
 */
export function defaultTime(day: Date, now: Date): string {
  if (!sameLocalDay(day, now)) return `${pad(DEFAULT_HOUR)}:00`;
  const nine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEFAULT_HOUR);
  if (now.getTime() < nine.getTime()) return `${pad(DEFAULT_HOUR)}:00`;
  const next = now.getHours() + 1;
  return next > 23 ? '23:59' : `${pad(next)}:00`;
}

/** `day`'s local date at the wall time `time` ("HH:MM"), or null when `time` is not one. */
export function atTime(day: Date, time: string): Date | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (match === null) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(match[1]), Number(match[2]));
}

/** `date`'s local time as "HH:MM", the time field's value format. */
export function timeOf(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
