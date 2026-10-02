import { describe, expect, it } from 'vitest';
import { addShortcutHint, isAddShortcut, isMacPlatform } from './platform';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('isMacPlatform', () => {
  it.each([
    ['MacIntel', true],
    ['iPhone', true],
    ['Win32', false],
    ['Linux x86_64', false],
    ['', false],
  ])('%s → %s', (platform, mac) => {
    expect(isMacPlatform({ platform } as Navigator)).toBe(mac);
  });

  it('prefers userAgentData.platform', () => {
    const nav = { platform: 'Win32', userAgentData: { platform: 'macOS' } } as unknown as Navigator;
    expect(isMacPlatform(nav)).toBe(true);
  });
});

describe('addShortcutHint', () => {
  it('shows ⌘K on macOS and Ctrl K elsewhere', () => {
    expect(addShortcutHint(true)).toBe('⌘K');
    expect(addShortcutHint(false)).toBe('Ctrl K');
  });
});

describe('isAddShortcut', () => {
  it('takes ⌘K on macOS, not Ctrl+K', () => {
    expect(isAddShortcut(key({ key: 'k', metaKey: true }), true)).toBe(true);
    expect(isAddShortcut(key({ key: 'K', metaKey: true }), true)).toBe(true);
    expect(isAddShortcut(key({ key: 'k', ctrlKey: true }), true)).toBe(false);
  });

  it('takes Ctrl+K elsewhere, not ⌘K', () => {
    expect(isAddShortcut(key({ key: 'k', ctrlKey: true }), false)).toBe(true);
    expect(isAddShortcut(key({ key: 'k', metaKey: true }), false)).toBe(false);
  });

  it.each([true, false])('rejects Shift, Alt and both modifiers together (mac: %s)', (mac) => {
    const mod = mac ? { metaKey: true } : { ctrlKey: true };
    expect(isAddShortcut(key({ key: 'k', ...mod, shiftKey: true }), mac)).toBe(false);
    expect(isAddShortcut(key({ key: 'k', ...mod, altKey: true }), mac)).toBe(false);
    expect(isAddShortcut(key({ key: 'k', metaKey: true, ctrlKey: true }), mac)).toBe(false);
    expect(isAddShortcut(key({ key: 'k' }), mac)).toBe(false);
  });

  it('falls back to the physical key on non-Latin layouts', () => {
    expect(isAddShortcut(key({ key: 'л', code: 'KeyK', ctrlKey: true }), false)).toBe(true);
    expect(isAddShortcut(key({ key: 'л', code: 'KeyL', ctrlKey: true }), false)).toBe(false);
  });

  it('does not throw on an undefined key (autofill)', () => {
    const event = { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: undefined, code: '' };
    expect(isAddShortcut(event as unknown as KeyboardEvent, false)).toBe(false);
  });
});
