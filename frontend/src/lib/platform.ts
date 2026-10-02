type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

/** True on macOS (and other Apple platforms), where shortcuts use ⌘ rather than Ctrl. */
export function isMacPlatform(nav: Navigator = navigator): boolean {
  const platform = (nav as NavigatorWithUAData).userAgentData?.platform || nav.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The add-input shortcut as shown in its hint: "⌘K" on macOS, "Ctrl K" elsewhere. */
export function addShortcutHint(mac: boolean): string {
  return mac ? '⌘K' : 'Ctrl K';
}

/**
 * True for ⌘K on macOS or Ctrl+K elsewhere (no Alt or Shift). The physical key
 * (`code`) counts too, for non-Latin layouts; `key` can be undefined (autofill).
 */
export function isAddShortcut(event: KeyboardEvent, mac: boolean): boolean {
  const modifier = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const isK = event.code === 'KeyK' || (typeof event.key === 'string' && event.key.toLowerCase() === 'k');
  return modifier && !event.altKey && !event.shiftKey && isK;
}
