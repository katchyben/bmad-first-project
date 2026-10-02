export type PresetId = 'tomorrow' | 'next-monday';

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: 'tomorrow', label: 'Tomorrow 9:00 AM' },
  { id: 'next-monday', label: 'Next Monday 9:00 AM' },
];

export const DEFAULT_PRESET: PresetId = 'tomorrow';

const PRESET_HOUR = 9;
const MONDAY = 1;

/** `date` moved by `days` local calendar days, keeping its wall time (DST-safe). */
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * `candidate`, or its next occurrence `periodDays` local days later, repeated
 * until it is strictly after `now`: a preset never submits a past time.
 */
export function rollForward(candidate: Date, now: Date, periodDays: number): Date {
  let next = candidate;
  while (next.getTime() <= now.getTime()) next = addDays(next, periodDays);
  return next;
}

/**
 * The instant a preset names, in the browser's local time at `now`:
 * Tomorrow is 9:00 AM on the next day; Next Monday is 9:00 AM on the coming
 * Monday, a week ahead when `now` is a Monday. Pure: the caller passes `now`.
 */
export function resolvePreset(preset: PresetId, now: Date): Date {
  const today9 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), PRESET_HOUR, 0, 0, 0);
  if (preset === 'tomorrow') return rollForward(addDays(today9, 1), now, 1);
  const daysToMonday = (MONDAY - now.getDay() + 7) % 7 || 7;
  return rollForward(addDays(today9, daysToMonday), now, 7);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO 8601 with the local offset, e.g. "2026-10-03T09:00:00+02:00". */
export function toLocalIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
