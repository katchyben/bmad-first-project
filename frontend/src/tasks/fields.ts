import type { KeyboardEvent } from 'react';

// Class lists that mix the custom `text-<role>` sizes with colours are joined
// plainly, not with `cn()`: tailwind-merge would drop one as a colour clash.
// The shadcn Input and Textarea go through `cn()`, so they take the 15px input
// size as an arbitrary value, which tailwind-merge does recognise as a size.
export const FIELD_TEXT = 'text-[15px] md:text-[15px]';

/** The keyboard hint (DESIGN.md `kbd-hint`), for a hint beside or inside a control. */
export const KBD_HINT =
  'rounded-xs border border-b-2 border-border bg-card px-1 text-kbd text-muted-foreground';

/**
 * True for the Enter that submits: not Shift+Enter, and not one that ends an IME
 * composition (Safari reports that one with `isComposing` false but keyCode 229).
 */
export function isSubmitEnter(event: KeyboardEvent): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229
  );
}
