import { describe, expect, it } from 'vitest';
import { formatDue } from './formatDue';

// Local-time constructors keep these independent of the machine's time zone.
const now = new Date(2026, 9, 2, 14, 30); // Fri Oct 2 2026, 2:30 PM

describe('formatDue', () => {
  it.each([
    ['yesterday', new Date(2026, 9, 1, 17, 0), 'Yesterday, 5:00 PM'],
    ['today, earlier', new Date(2026, 9, 2, 9, 5), 'Today, 9:05 AM'],
    ['today, later', new Date(2026, 9, 2, 15, 0), 'Today, 3:00 PM'],
    ['tomorrow', new Date(2026, 9, 3, 9, 0), 'Tomorrow, 9:00 AM'],
    ['2 days ahead: weekday', new Date(2026, 9, 4, 10, 0), 'Sun, 10:00 AM'],
    ['6 days ahead: weekday', new Date(2026, 9, 8, 10, 0), 'Thu, 10:00 AM'],
    ['7 days ahead: date', new Date(2026, 9, 9, 10, 0), 'Oct 9, 10:00 AM'],
    ['2 days ago: date', new Date(2026, 8, 30, 9, 0), 'Sep 30, 9:00 AM'],
    ['later this year', new Date(2026, 9, 12, 9, 0), 'Oct 12, 9:00 AM'],
    ['next year', new Date(2027, 0, 12, 9, 0), 'Jan 12, 2027, 9:00 AM'],
    ['last year', new Date(2025, 11, 12, 21, 45), 'Dec 12, 2025, 9:45 PM'],
    ['noon', new Date(2026, 9, 2, 12, 0), 'Today, 12:00 PM'],
    ['midnight', new Date(2026, 9, 3, 0, 0), 'Tomorrow, 12:00 AM'],
  ])('%s', (_label, due, expected) => {
    expect(formatDue(due, now)).toBe(expected);
  });

  it('uses calendar days, not 24-hour spans, at both day boundaries', () => {
    const lateNight = new Date(2026, 9, 2, 23, 59);
    expect(formatDue(new Date(2026, 9, 3, 0, 1), lateNight)).toBe('Tomorrow, 12:01 AM');
    expect(formatDue(new Date(2026, 9, 2, 0, 0), lateNight)).toBe('Today, 12:00 AM');
    const justAfterMidnight = new Date(2026, 9, 3, 0, 1);
    expect(formatDue(new Date(2026, 9, 2, 23, 59), justAfterMidnight)).toBe('Yesterday, 11:59 PM');
    expect(formatDue(new Date(2026, 9, 3, 23, 59), justAfterMidnight)).toBe('Today, 11:59 PM');
  });

  it('a weekday across the new year carries no year; a date beyond does', () => {
    const dec30 = new Date(2026, 11, 30, 8, 0);
    expect(formatDue(new Date(2027, 0, 2, 9, 0), dec30)).toBe('Sat, 9:00 AM');
    expect(formatDue(new Date(2027, 0, 6, 9, 0), dec30)).toBe('Jan 6, 2027, 9:00 AM');
  });

  it('uses plain spaces only', () => {
    expect(formatDue(new Date(2026, 9, 2, 15, 0), now)).not.toMatch(/[\u00a0\u202f]/);
  });
});
