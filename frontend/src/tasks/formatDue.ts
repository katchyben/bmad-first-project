const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const DAY_MS = 86_400_000;

/** ICU may use narrow or no-break spaces ("3:00\u202fPM"); the UX text uses plain ones. */
function plain(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ');
}

/** Whole calendar days from `now`'s local day to `date`'s local day (DST-safe). */
function calendarDaysBetween(now: Date, date: Date): number {
  const from = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const to = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((to - from) / DAY_MS);
}

function dayPart(due: Date, now: Date): string {
  const days = calendarDaysBetween(now, due);
  if (days === -1) return 'Yesterday';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days >= 2 && days <= 6) return WEEKDAY.format(due);
  return calendarDate(due, now);
}

function calendarDate(due: Date, now: Date): string {
  return (due.getFullYear() === now.getFullYear() ? MONTH_DAY : MONTH_DAY_YEAR).format(due);
}

/**
 * The absolute style alone, always as a calendar date: "Oct 12, 9:00 AM", with
 * the year added when it isn't `now`'s year. The picked-due chip shows this.
 */
export function formatDueAbsolute(due: Date, now: Date): string {
  return plain(`${calendarDate(due, now)}, ${TIME.format(due)}`);
}

/**
 * A due date-time as the row shows it, in the browser's time zone:
 * "Yesterday, 5:00 PM", "Today, 3:00 PM", "Tomorrow, 9:00 AM", a weekday within
 * the next 6 days ("Fri, 10:00 AM"), otherwise "Oct 12, 9:00 AM", with the year
 * added when it isn't `now`'s year. Pure: the caller passes `now`.
 */
export function formatDue(due: Date, now: Date): string {
  return plain(`${dayPart(due, now)}, ${TIME.format(due)}`);
}
