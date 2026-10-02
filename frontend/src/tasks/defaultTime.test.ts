import { describe, expect, it } from 'vitest';
import { atTime, defaultTime } from './defaultTime';

// Local-time constructors keep these independent of the machine's time zone.
const today = new Date(2026, 9, 2);
const at = (h: number, m: number, s = 0) => new Date(2026, 9, 2, h, m, s);

describe('defaultTime', () => {
  it('is 9:00 AM on today before 9:00', () => {
    expect(defaultTime(today, at(8, 59, 59))).toBe('09:00');
    expect(defaultTime(today, at(0, 0))).toBe('09:00');
  });

  it('is the next full hour on today from 9:00 on', () => {
    expect(defaultTime(today, at(9, 0))).toBe('10:00');
    expect(defaultTime(today, at(14, 30))).toBe('15:00');
    expect(defaultTime(today, at(14, 0))).toBe('15:00');
  });

  it('is 9:00 AM on a future day, whatever the time now', () => {
    expect(defaultTime(new Date(2026, 9, 3), at(23, 30))).toBe('09:00');
    expect(defaultTime(new Date(2026, 10, 12, 18, 0), at(14, 30))).toBe('09:00');
  });

  it('stays today near midnight, capped at 23:59', () => {
    expect(defaultTime(today, at(22, 59))).toBe('23:00');
    expect(defaultTime(today, at(23, 0))).toBe('23:59');
    expect(defaultTime(today, at(23, 45))).toBe('23:59');
  });

  it('compares local calendar days, not the time of day on `day`', () => {
    expect(defaultTime(new Date(2026, 9, 2, 23, 59), at(14, 30))).toBe('15:00');
  });
});

describe('atTime', () => {
  it("puts an HH:MM wall time on the day's local date", () => {
    expect(atTime(new Date(2026, 9, 12, 18, 30, 5), '09:05')).toEqual(new Date(2026, 9, 12, 9, 5));
  });

  it('returns null for an empty or partial time', () => {
    expect(atTime(today, '')).toBeNull();
    expect(atTime(today, '9:')).toBeNull();
    expect(atTime(today, '25:00')).toBeNull();
  });
});
