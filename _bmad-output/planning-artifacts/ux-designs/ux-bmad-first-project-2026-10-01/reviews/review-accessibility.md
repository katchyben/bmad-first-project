---
lens: accessibility
target: WCAG 2.2 AA
reviewed:
  - ../DESIGN.md
  - ../EXPERIENCE.md
  - ../.memlog.md
  - ../.working/color-themes-1.html (Graphite Hush block)
date: 2026-10-01
verdict: revise before build
---

# Accessibility review: DESIGN.md and EXPERIENCE.md

## Verdict

**Revise before build.** The palette is solid: every text pair passes AA in both modes when recomputed from hex. Overdue, Done and Cancelled are never shown by colour alone. Reduced motion and OS theme are respected. The problems are in focus and interaction design, not colour:

- **Critical (2):** the keyboard-selected row is only shown by a 1.1:1 tint. Enter deletes the task while focus is on "Keep".
- **High (5):** the 5-second Undo has no untimed alternative. The focus ring is invisible on the toast. The list has no ARIA pattern, which the single-key shortcuts depend on. The layout does not reflow at 400% zoom. The live countdown will be read aloud every second.

All of these can be fixed in the spines without changing the visual direction. Undo (H1) is the exception, because it may need a PRD/API decision.

Sources: hex values in DESIGN.md frontmatter match the Graphite Hush block in `.working/color-themes-1.html` (lines 161–200) exactly. All ratios below were recomputed with the WCAG 2.x relative-luminance formula.

---

## 1. Contrast audit (recomputed)

### 1.1 Text (4.5:1, or 3:1 for large text; no text in this app qualifies as large except the 32px heading)

| Pair | Where used | Light | Dark | Result |
|---|---|---|---|---|
| foreground on card | titles, body | 16.48 | 13.86 | Pass |
| foreground on background | heading "Today" | 14.98 | 15.04 | Pass |
| foreground on row-hover | hovered row title | 15.38 | 12.90 | Pass |
| foreground on row-selected | selected row, delete-confirm question | 14.45 | 12.58 | Pass |
| foreground on overdue-tint | overdue row title | 14.59 | 12.72 | Pass |
| muted-foreground on card | due time, placeholders, chips, kbd hints | 6.39 | 6.38 | Pass |
| muted-foreground on background | date, filter tabs, Finished header | 5.80 | 6.92 | Pass |
| muted-foreground on row-selected | "This can't be undone." | 5.60 | 5.79 | Pass |
| muted-foreground on overdue-tint | meta on overdue row | 5.65 | 5.85 | Pass |
| overdue on card | overdue due time | 5.53 | 6.50 | Pass |
| overdue on overdue-tint | "Overdue" label, due time | 4.89 | 5.97 | Pass (light: thin margin) |
| overdue on row-selected | only if selection replaced tint (spec says it does not) | 4.84 | 5.90 | Pass |
| finished on card | Done/Cancelled title, status word (15px / 13px) | 5.41 | 5.92 | Pass |
| finished on row-hover | hovered finished row | 5.05 | 5.52 | Pass |
| finished on row-selected | finished row selected via ↓ | **4.74** | 5.38 | Pass (light: thinnest text margin in the app; do not darken `row-selected`) |
| primary-foreground on primary | selected chip (11.5px), Log in, Set, Save, Delete | 16.48 | 15.04 | Pass |
| toast-foreground on toast-background | toast message | 14.98 | 15.04 | Pass |
| toast-action on toast-background | "Undo" | 7.16 | 5.26 | Pass |
| countdown (toast-foreground @ 70% over toast-bg → #B4B4B3 / #565656) | "5s" | 7.94 | 6.10 | Pass |

### 1.2 Non-text (3:1): marks, rules, boundaries, focus

| Pair | Light | Dark | Result |
|---|---|---|---|
| overdue mark / 3px rule on overdue-tint | 4.89 | 5.97 | Pass |
| in-progress mark on card / tint | 10.86 / 9.62 | 10.70 / 9.82 | Pass |
| finished mark on card | 5.41 | 5.92 | Pass |
| To do empty-circle mark (muted) on card | 6.39 | 6.38 | Pass |
| ring (solid) on card / background / row-selected / tint | 16.48 / 14.98 / 14.45 / 14.59 | 13.86 / 15.04 / 12.58 / 12.72 | Pass, **if drawn at 100% opacity** |
| ring at shadcn's default `ring-ring/50` on card / background / row-selected / tint | 3.23 / 3.14 / 3.11 / 3.16 | 4.46 / 4.58 / 4.27 / 4.27 | Light only just passes |
| **ring on toast-background** (Undo link focus) | **1.00** | **1.00** | **Fail**, see H2 |
| **ring next to a primary-filled control** (selected chip, Log in, Set, Save, Delete) | **1.00** against the fill | **1.00** | Ambiguous, see H2 |
| **row-selected vs card** (sole indicator of the selected row) | **1.14** | **1.10** | **Fail**, see C1 |
| row-selected vs row-hover | 1.06 | 1.03 | Indistinguishable |
| **input / border on card** (input boundaries) | **1.30** | **1.32** | Fail if the boundary is needed to find the input, see M1 |
| border on background | 1.18 | 1.43 | Decorative only |
| card vs background (add input sits on page) | 1.10 | 1.09 | Decorative only |
| add-input soft focus ring (rgba .08 / .12) | 1.17 | 1.38 | Not an indicator; the 1px border change (12.71 / 10.50) carries focus, see L7 |
| active tab underline (foreground) on background | 14.98 | 15.04 | Pass |

DESIGN.md says `row-hover` and `row-selected` "keep AA by the same margin as card". That is roughly right for `foreground`, but not for `finished` on `row-selected` (4.74). The table in DESIGN.md also assumes a solid ring. shadcn v4's default `focus-visible:ring-ring/50` gives the light-mode figures in the second ring row.

---

## 2. Findings

### Critical

**C1. The selected row is not visible enough (SC 2.4.7 Focus Visible, SC 1.4.11 Non-text Contrast).**
The list is one Tab stop with a roving selection, so the selected row is the keyboard focus. Today it is marked only by `row-selected`, which is 1.14:1 against `card` in light mode and 1.10:1 in dark. It is also 1.06:1 against hover, so a hovered row and the selected row look the same. DESIGN.md adds the 2px `ring` outline *only* on selected rows that are also overdue. Every S/B/C/X/E/⌫ press acts on a row the user can barely see, and C, X and ⌫ are destructive or time-limited.
*Fix:* whenever the list has DOM focus, draw a 2px inset `{colors.ring}` outline on the selected row in **every** variant (To do, In progress, overdue, Done, Cancelled, delete-confirm). Keep `row-selected` as a secondary tint. When the list loses focus, keep a quieter cue for the remembered selection (tint only) so focused and unfocused states differ. Update DESIGN.md Task row → *Selected* and EXPERIENCE.md State Patterns → Focus.

**C2. Enter confirms Delete while focus is on "Keep" (SC 3.3.4 Error Prevention (Legal, Financial, Data), SC 4.1.2 Name, Role, Value; predictability under Guideline 3.2).**
After ⌫, focus is placed on "Keep" and a screen reader says "Keep, button". Enter, the standard way to activate the focused button, then *deletes* the task, and delete cannot be undone (EXPERIENCE.md Delete confirm, Keyboard map, Flow 3 step 2). The control's role and name promise one action and Enter does the opposite. ⌫ then Enter is also a common accidental pair. The confirmation step exists on paper, but it does not protect the user. This does not literally fail SC 3.2.1/3.2.2, which cover context changes, but it is the kind of unpredictable behaviour Guideline 3.2 targets. It also undermines the "confirmed" option of SC 3.3.4 for deleting user data.
*Fix:* Enter and Space always activate the **focused** button. Focus opens on Keep, so a reflexive Enter is safe. Confirming Delete then takes a deliberate action: Tab/←/→ to Delete then Enter, or a dedicated second key (⌫ again, or D) shown as a `kbd-hint` on the Delete button. Update the keyboard map row "Enter | Confirm Delete", the Delete confirm row ("Enter confirms Delete (from anywhere in the confirm)") and Flow 3 step 2.

### High

**H1. The 5-second Undo has no untimed alternative (SC 2.2.1 Timing Adjustable).**
The Undo window is fixed at 5 s, and hover and focus explicitly do not pause it. Done and Cancelled rows offer **no actions**, so after 5 s a mis-tapped Complete or Cancel cannot be reversed. FR-11 is a product rule. It is not "essential" in the WCAG sense, because nothing about completing a task requires reversal to be time-boxed, and the server could allow a longer window. A screen-reader user needs about 2–3 s just to hear the polite announcement. The Undo link is the *last* Tab stop on the page, so reaching it by Tab inside 5 s is unrealistic. The Z key helps, but only if focus is still in the list. Not every user can react within 5 s, and nothing currently covers those who cannot.
*Fix (pick one, record the choice in the PRD):*
(a) Add an untimed equivalent: a "Reopen" or "Move to To do" action (and key) on Done and Cancelled rows. This is the cleanest fix and makes the 5 s window only a convenience.
(b) Make the window adjustable or extendable to at least 10× (50 s) by a setting, enforced server-side.
(c) If neither is accepted, record an explicit accepted-risk note citing SC 2.2.1.

Whichever is chosen, also: let Z work whenever a toast is open and focus is not in a text field, not only from the list; document the toast region's jump key (Sonner's default Alt+T / F6 landmark); and have the server measure the window from response delivery, as the spec already does.

**H2. The focus ring is invisible on the toast and unclear on ink-filled controls (SC 2.4.7 Focus Visible, SC 1.4.11).**
The `ring` token equals `toast-background` in both modes (#1F1F1F on #1F1F1F, #EAEAEA on #EAEAEA, 1.00:1), so a keyboard user Tabbing to "Undo" sees no focus change. On the selected preset chip, Log in, Set, Save and the ink Delete button, a ring with no offset blends into the fill and reads as a slightly larger button, not focus. In the delete confirm, telling whether Delete or Keep is focused matters a great deal (see C2). shadcn's default `ring-ring/50` drops light-mode ring contrast to 3.11–3.23:1, which barely passes.
*Fix:* add a `ring-on-toast` token equal to `toast-foreground` (14.98 / 15.04:1). Use a 2px solid ring with a 2px offset in the surface colour (`ring-offset-2 ring-offset-{card|background}`) on every filled control. State in DESIGN.md that the ring is solid (100% opacity), overriding shadcn's `/50`.

**H3. The list has no ARIA pattern, and the single-key shortcuts depend on one (SC 4.1.2 Name, Role, Value, SC 2.1.1 Keyboard, SC 1.3.1 Info and Relationships).**
The spine says "the list is one Tab stop; ↑/↓ roving selection" but gives no role. If it is built as a `listbox`, its options cannot contain the revealed buttons, because interactive children are not allowed. If it is a plain list, NVDA and JAWS stay in browse mode. There S, B, C, X, E and Z are their own quick-navigation keys (B = button, C = combo box, E = edit field, X = checkbox, and so on), so the app's shortcuts never fire for screen-reader users. The revealed action buttons also have no defined keyboard path except the letter keys.
*Fix:* specify `role="grid"` (one row = one task; cell 1 holds the name and status, cell 2 the actions), or `role="listbox"` with `aria-activedescendant` and the action buttons *outside* the options in a per-row toolbar. Either role makes screen readers switch to focus mode automatically. Add `aria-keyshortcuts` on each row and button (e.g. `aria-keyshortcuts="c"` on Complete) and an `aria-describedby` instruction on the list ("Use arrow keys to move, S start, C complete, X cancel, E edit, Backspace delete"). Let Tab or → move into the selected row's action buttons.

**H4. The layout does not reflow at 400% zoom and long titles are cut off (SC 1.4.10 Reflow, SC 1.4.4 Resize Text).**
"No breakpoints" plus a fixed 640px column, a fixed 360px login card and a single-line row means that at 400% zoom on a 1280px screen (320 CSS px) the page scrolls horizontally and the row actions and meta collide. "Desktop only" does not exempt the page from zoom. Titles truncate with an ellipsis and there is no way to read the full title other than opening Edit, so text is lost at 200%.
*Fix:* make the column `width:100%; max-width:640px` with a 16px gutter, and the login card `max-width:100%`. Let the due time and labels wrap under the title when there is no room. Let titles wrap to two lines (clamp) rather than a single-line ellipsis, or show the full title on focus or hover. This is not a responsive redesign, only fluid widths.

**H5. The live countdown will be read aloud every second (SC 4.1.3 Status Messages, best practice against noisy announcements).**
The Accessibility Floor puts Undo toasts in a polite live region. shadcn's toast (Sonner) region uses `aria-relevant="additions text"`, so the "5s, 4s, 3s…" text change is announced each second. That talks over the message, and with several toasts it becomes constant chatter.
*Fix:* mark the countdown `aria-hidden="true"`. Announce once, when the toast opens: "Marked 'Pay rent' done. Undo available for 5 seconds, press Z." Announce once on the result: "Restored 'Pay rent'." or the API's expired message. Write the countdown exclusion into EXPERIENCE.md Accessibility Floor.

### Medium

**M1. Input outlines are too faint (SC 1.4.11).** The `input` token is 1.30:1 on card (light) and 1.32:1 (dark). The add input sits on the page at a 1.10 surface difference. The login fields, inline edit input and textarea depend on that outline to show where to click. *Fix:* give `input` its own value separate from `border`: light #8A8A8A (3.45:1 on card, 3.14:1 on background), dark #707070 (3.37:1 on card, 3.65:1 on background). Keep #E2E2E0 / #333333 for dividers.

**M2. Several fields have no programmatic label (SC 3.3.2 Labels or Instructions, SC 1.3.1, SC 2.5.3 Label in Name).** The add input relies on the "Add a task" placeholder. The description textarea, inline edit title and description, and the popover's time field have no label specified. *Fix:* visually hidden `<Label>` "Task title" / "Description"; a visible "Time" label on the time field; the accessible name must contain the visible placeholder text (e.g. aria-label "Add a task"). Calendar month navigation keeps react-day-picker's built-in names ("Go to previous month").

**M3. Login and field errors: linking, double announcements, autofill (SC 3.3.1 Error Identification, SC 4.1.3, SC 1.3.5 Identify Input Purpose, SC 3.3.8 Accessible Authentication (Minimum)).** The invalid-credentials message sits above Log in and is linked to neither field. "Field errors are announced through a live region" *and* linked via `aria-describedby`, so they are read twice. *Fix:* render the login error with `role="alert"` (or describe both inputs by it) and set `aria-invalid` on both. For field errors, set `aria-invalid` plus `aria-describedby` and announce once. Specify `autocomplete="username"` / `"current-password"` and allow paste and password managers.

**M4. Successful actions are silent for screen-reader users (SC 4.1.3).** Only Complete and Cancel (toast) and errors are announced. Add task, Start, Move back, Edit save, Delete and filter changes give no status message. After Add, the input simply clears. *Fix:* send polite one-shot messages: "Added 'Call the dentist', due Tomorrow, 9:00 AM." "Started 'Submit report'." "Deleted 'Pack bags'." "Saved." "In progress: 3 tasks" / "No tasks here." on filter change.

**M5. Toasts can cover the focused row (SC 2.4.11 Focus Not Obscured (Minimum)).** Toasts float bottom-centre and stack upward over the list. A row selected with ↓ near the bottom, or the last finished rows, can sit entirely under one or more toasts. *Fix:* set `scroll-padding-bottom` to the toast stack height plus 24px, and `scrollIntoView({block:'nearest'})` on every selection change. Alternatively, keep the toast column clear of the 640px column.

**M6. Focus can drop to the page body (SC 2.4.3 Focus Order).** Three cases are undefined: (a) focus is on an Undo link when its toast expires or closes; (b) Log in, delete-confirm buttons and row actions are `disabled` while a request is in flight, and a disabled control drops focus; (c) the expired toast fades after 3 s while focused. *Fix:* use `aria-disabled` (keep focusable) for in-flight states. When a toast with focus closes, return focus to the list's selected row, or to the add input if the list is empty. Write both rules into Focus rules.

**M7. Error toasts vanish too fast (SC 2.2.1).** Error toasts fade after 5 s and the expired-Undo message after 3 s, with no pause and no way to reread. These messages explain why an action failed. *Fix:* pause timers on hover and focus for error toasts, or keep error toasts until dismissed with a 24×24 close button. Keep the Undo timer as decided under H1.

**M8. The popover and the delete confirm have unclear focus rules (SC 2.1.2 No Keyboard Trap, SC 4.1.2, SC 3.3.2).**
- EXPERIENCE.md says "popovers trap and restore focus (Radix)", but Radix Popover is non-modal by default and does not trap focus. *Fix:* choose explicitly. Either `modal` (trap, Esc closes, focus returns to the chip), or non-modal with focus-outside closing. Also settle what Enter does in the calendar grid (select the day and move to the time field) versus in the time field (Set).
- The delete confirm limits Tab to Delete and Keep. That is acceptable under SC 2.1.2 because Esc and Keep exit, but the user must be told. *Fix:* `role="group"` with `aria-labelledby` set to the question and `aria-describedby` set to "This can't be undone. Escape to keep." State whether ⌘K still works while the confirm is open; "shortcuts stay inert" currently conflicts with "⌘K global".

**M9. Keyboard users cannot discover the shortcuts (SC 3.3.2, supports SC 2.1.1).** The keys are named only in tooltips that appear on mouse hover ("Complete (C)"). The action buttons are never focused, so keyboard and screen-reader users never see them. *Fix:* `aria-keyshortcuts` (H3), the list instruction (H3), and a visible shortcut list (a `?` key or a small "Shortcuts" link next to Log out). Optionally show `kbd-hint`s inside the revealed buttons of the selected row.

### Low

**L1. Single-key shortcuts pass SC 2.1.4 on the "only active when focused" rule.** S/B/C/X/E/⌫/Z fire only when focus is in the list, never in inputs. *Fix (hardening):* define "focus in the list" as DOM focus on the list widget or its descendants, so the rule holds. Consider a setting to turn single-key shortcuts off: speech-input users dictating while the list is focused can trigger C or X.

**L2. Strikethrough alone does not tell assistive technology a task is Cancelled (SC 1.4.1 Use of Color, SC 1.3.1).** The visible cues are good (dashed mark, the word "Cancelled", strikethrough), but `text-decoration` and `<s>`/`<del>` are not reliably announced. *Fix:* the row's accessible name must say "Cancelled" (already required). Keep the word "Cancelled"/"Done" in the Done and Cancelled filter views. Mark status icons `aria-hidden`.

**L3. Say that live overdue changes are not announced (SC 4.1.3, noise).** The minute-by-minute re-evaluation must not use a live region. *Fix:* add to the Accessibility Floor: "Overdue changes update the row's accessible name silently; nothing is announced." Do not re-announce the selected row when its name changes.

**L4. Target size passes SC 2.5.8, with small margins.** Chips are 24px, row buttons 26px, tabs about 26px, Log out 32–36px, calendar days 32–36px. The inline text targets ("Add description" at about 19.5px, the Undo link, the Finished header with no height given) pass only through the spacing exception. *Fix:* give all of them `min-height:24px` and say so in DESIGN.md.

**L5. Revealing row actions hides the due time (SC 1.4.13 Content on Hover or Focus, usability).** On hover *and on keyboard selection* the due time is replaced by buttons, so sighted keyboard users cannot see the due time of the row they are on. *Fix:* on selection, keep the due time visible and shift it left of the actions, or make the swap dismissible with Esc.

**L6. Fixed heights can clip text (SC 1.4.12 Text Spacing).** Chips (24), row buttons (26), banner (32), input (48) and the 58px rows are given as fixed heights. *Fix:* express them as `min-height`.

**L7. The add input's soft focus ring is too faint to count (SC 2.4.7).** rgba .08 / .12 rings measure 1.17 / 1.38:1. Focus is carried by the 1px border going from #E2E2E0 to foreground (12.71:1), which passes but is thin and inconsistent with the global ring. *Fix:* use the standard 2px solid ring on the add input and textarea.

**L8. Small semantic gaps (SC 2.4.2 Page Titled, SC 1.3.1, SC 3.1.1 Language of Page).** *Fix:* document titles "Log in — Todo" / "Today — Todo"; `<h1>` "Today", with the Finished toggle inside an `<h2>`; `lang="en"`; decorative icons (plus, alert, chevron, calendar, status marks) `aria-hidden`; Finished toggle with `aria-controls`.

**L9. Connection banner announcements (SC 4.1.3).** It is announced when it appears, but its disappearance is silent and retries could re-announce it. *Fix:* announce once on appear and once "Reconnected." on recovery. Do not re-announce during retries.

**L10. Reduced motion passes.** All fades are turned off under `prefers-reduced-motion` (SC 2.3.3 is AAA anyway). *Fix (note):* swap content instantly with no timing changes. The Undo countdown and the 1 s "Loading…" delay are unaffected.

---

## 3. What already works

- Every text pair passes AA in both modes. Recomputed values match the theme file.
- Overdue uses tint, a 3px rule, an icon, the word "Overdue" and a coloured due time, never colour alone. Done and Cancelled differ by mark, word and strikethrough.
- Every shortcut has a visible button equivalent, and single-key shortcuts are scoped to list focus.
- Inline confirm and edit avoid modal dialogs. Esc always backs out.
- Reduced motion and OS colour scheme are respected. The only motion is opacity fades.
- Tab order is specified. The Finished toggle uses `aria-expanded`. The filter is a real tablist.
- The 1 s delay before "Loading…" avoids flashes and announces only once.

## 4. Suggested spine edits (summary)

| Spine / section | Edit |
|---|---|
| DESIGN.md Colors | Add `ring-on-toast` (= toast-foreground) and a separate `input` border (#8A8A8A / #707070). Say the ring is solid with a 2px offset. |
| DESIGN.md Task row → Selected | 2px inset ring on every selected row while the list has focus (C1). Keep the due time visible on selection (L5). |
| DESIGN.md Layout | Fluid width with max-width, wrapping meta, two-line title clamp (H4). Heights as min-height (L6). |
| EXPERIENCE.md Delete confirm and Keyboard map | Enter activates the focused button; Delete needs a deliberate action (C2). Update Flow 3 step 2. |
| EXPERIENCE.md Undo toast | Untimed alternative or adjustable window (H1). Countdown aria-hidden, one-shot announcement (H5). Focus return on close (M6). |
| EXPERIENCE.md Interaction Primitives | ARIA pattern (grid or listbox + toolbar), aria-keyshortcuts, list instructions, shortcut sheet (H3, M9). Scroll padding under toasts (M5). |
| EXPERIENCE.md Accessibility Floor | Labels (M2), login/field error wiring and autocomplete (M3), success announcements (M4), overdue changes silent (L3), popover modality (M8). |
