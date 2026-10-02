import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUnreachable, setUnreachable, subscribeConnection } from './connection';

afterEach(() => setUnreachable(false));

describe('connection store', () => {
  it('starts reachable', () => {
    expect(getUnreachable()).toBe(false);
  });

  it('notifies subscribers on each change and reports the new value', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConnection(listener);
    setUnreachable(true);
    expect(getUnreachable()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setUnreachable(false);
    expect(getUnreachable()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('notifies nobody when set to its current value', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConnection(listener);
    setUnreachable(false);
    setUnreachable(true);
    setUnreachable(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    subscribeConnection(listener)();
    setUnreachable(true);
    expect(listener).not.toHaveBeenCalled();
  });
});
