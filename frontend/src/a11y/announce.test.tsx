import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '@/tasks/testHarness';
import { AnnounceProvider, useAnnounce } from './announce';

let h: Harness;
let announce: (text: string) => void;

function Probe() {
  announce = useAnnounce();
  return null;
}

beforeEach(() => {
  h = createHarness();
});

afterEach(() => {
  h.cleanup();
});

const regions = () => [...document.querySelectorAll('[aria-live]')];

describe('announce', () => {
  it('places each message in one polite status region', async () => {
    await h.render(
      <AnnounceProvider>
        <Probe />
      </AnnounceProvider>,
    );
    expect(regions()).toHaveLength(1);
    const region = regions()[0];
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');

    await act(async () => announce("Added 'Pay rent', due Tomorrow, 9:00 AM."));
    expect(region.textContent).toBe("Added 'Pay rent', due Tomorrow, 9:00 AM.");

    await act(async () => announce('Second.'));
    expect(regions()).toHaveLength(1);
    expect(region.textContent).toBe('Second.');
  });

  it('re-announces the same text as a fresh node', async () => {
    await h.render(
      <AnnounceProvider>
        <Probe />
      </AnnounceProvider>,
    );
    await act(async () => announce('Same.'));
    const first = regions()[0].firstElementChild;
    await act(async () => announce('Same.'));
    const second = regions()[0].firstElementChild;
    expect(second?.textContent).toBe('Same.');
    expect(second).not.toBe(first);
  });
});
