import { describe, expect, it } from 'vitest';
import { PRESETS, resolvePreset, rollForward, toLocalIso } from './presets';

// Local-time constructors keep these independent of the machine's time zone.
// October 2026: Mon 5, Tue 6, Wed 7, Thu 8, Fri 2 / 9, Sat 3, Sun 4.

describe('PRESETS', () => {
  it('offers Tomorrow first, then Next Monday', () => {
    expect(PRESETS.map((p) => p.label)).toEqual(['Tomorrow 9:00 AM', 'Next Monday 9:00 AM']);
  });
});

describe('resolvePreset', () => {
  it('resolves Tomorrow to 9:00 AM on the next local day', () => {
    expect(resolvePreset('tomorrow', new Date(2026, 9, 2, 14, 30))).toEqual(
      new Date(2026, 9, 3, 9, 0),
    );
  });

  it('resolves Tomorrow across a month and a year end', () => {
    expect(resolvePreset('tomorrow', new Date(2026, 9, 31, 8, 0))).toEqual(
      new Date(2026, 10, 1, 9, 0),
    );
    expect(resolvePreset('tomorrow', new Date(2026, 11, 31, 23, 59))).toEqual(
      new Date(2027, 0, 1, 9, 0),
    );
  });

  it.each([
    ['Monday', new Date(2026, 9, 5, 8, 0), new Date(2026, 9, 12, 9, 0)],
    ['Tuesday', new Date(2026, 9, 6, 12, 0), new Date(2026, 9, 12, 9, 0)],
    ['Wednesday', new Date(2026, 9, 7, 12, 0), new Date(2026, 9, 12, 9, 0)],
    ['Thursday', new Date(2026, 9, 8, 12, 0), new Date(2026, 9, 12, 9, 0)],
    ['Friday', new Date(2026, 9, 2, 12, 0), new Date(2026, 9, 5, 9, 0)],
    ['Saturday', new Date(2026, 9, 3, 12, 0), new Date(2026, 9, 5, 9, 0)],
    ['Sunday', new Date(2026, 9, 4, 23, 30), new Date(2026, 9, 5, 9, 0)],
  ])('resolves Next Monday on a %s', (_day, now, expected) => {
    expect(resolvePreset('next-monday', now)).toEqual(expected);
  });

  it('resolves Next Monday on a Monday to +7 days, even before 9:00 AM', () => {
    expect(resolvePreset('next-monday', new Date(2026, 9, 5, 6, 0))).toEqual(
      new Date(2026, 9, 12, 9, 0),
    );
  });

  it('never resolves to a time at or before now', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (let day = 1; day <= 14; day++) {
        const now = new Date(2026, 9, day, hour, 59, 59, 999);
        expect(resolvePreset('tomorrow', now).getTime()).toBeGreaterThan(now.getTime());
        expect(resolvePreset('next-monday', now).getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });
});

describe('rollForward', () => {
  const now = new Date(2026, 9, 2, 14, 30);

  it('keeps a time after now', () => {
    expect(rollForward(new Date(2026, 9, 2, 14, 31), now, 1)).toEqual(new Date(2026, 9, 2, 14, 31));
  });

  it('rolls a time equal to now forward by its period', () => {
    expect(rollForward(new Date(now), now, 1)).toEqual(new Date(2026, 9, 3, 14, 30));
  });

  it('rolls a passed time forward by whole periods until it is after now', () => {
    expect(rollForward(new Date(2026, 9, 2, 9, 0), now, 1)).toEqual(new Date(2026, 9, 3, 9, 0));
    expect(rollForward(new Date(2026, 8, 28, 9, 0), now, 1)).toEqual(new Date(2026, 9, 3, 9, 0));
    expect(rollForward(new Date(2026, 8, 28, 9, 0), now, 7)).toEqual(new Date(2026, 9, 5, 9, 0));
    expect(rollForward(new Date(2026, 8, 14, 9, 0), now, 7)).toEqual(new Date(2026, 9, 5, 9, 0));
  });
});

describe('toLocalIso', () => {
  it('writes the local wall time with the local offset', () => {
    const date = new Date(2026, 9, 3, 9, 0);
    const iso = toLocalIso(date);
    expect(iso).toMatch(/^2026-10-03T09:00:00[+-]\d{2}:\d{2}$/);
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    expect(iso.endsWith(`${sign}${hh}:${mm}`)).toBe(true);
  });

  it('names the same instant', () => {
    const date = new Date(2027, 0, 1, 9, 0);
    expect(new Date(toLocalIso(date)).getTime()).toBe(date.getTime());
  });
});
