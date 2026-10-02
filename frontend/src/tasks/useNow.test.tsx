import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOW_TICK_MS, useNow } from './useNow';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;
let seen: Date[];

function Probe() {
  seen.push(useNow());
  return null;
}

const START = new Date(2026, 9, 2, 14, 30, 15);

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(START);
  seen = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const latest = () => seen[seen.length - 1];

describe('useNow', () => {
  it('starts at the current time', () => {
    expect(latest().getTime()).toBe(START.getTime());
  });

  it('re-reads the clock once a minute, not sooner', () => {
    act(() => vi.advanceTimersByTime(NOW_TICK_MS - 1));
    expect(latest().getTime()).toBe(START.getTime());
    act(() => vi.advanceTimersByTime(1));
    expect(latest().getTime()).toBe(START.getTime() + NOW_TICK_MS);
    act(() => vi.advanceTimersByTime(NOW_TICK_MS));
    expect(latest().getTime()).toBe(START.getTime() + 2 * NOW_TICK_MS);
  });

  it('re-reads the clock on window focus', () => {
    vi.setSystemTime(START.getTime() + 5_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(latest().getTime()).toBe(START.getTime() + 5_000);
  });

  it('stops ticking and listening once unmounted', () => {
    act(() => root.unmount());
    const renders = seen.length;
    act(() => vi.advanceTimersByTime(3 * NOW_TICK_MS));
    window.dispatchEvent(new Event('focus'));
    expect(seen).toHaveLength(renders);
    expect(vi.getTimerCount()).toBe(0);
    // afterEach unmounts again; give it a fresh root.
    root = createRoot(container);
  });
});
