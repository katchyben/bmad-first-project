// Joined plainly, not with `cn()`: tailwind-merge would drop the custom
// `text-chip` size as a colour clash.
/** The preset chip (DESIGN.md `preset-chip`), ink-filled when pressed. */
export const chipClass = (pressed: boolean) =>
  [
    'inline-flex min-h-min-target items-center gap-1 rounded-full border px-2.5 text-chip whitespace-nowrap',
    'focus-ring transition-colors',
    pressed
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-muted-foreground hover:text-foreground',
  ].join(' ');
