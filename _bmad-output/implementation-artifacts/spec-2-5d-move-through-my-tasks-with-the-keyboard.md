---
title: 'Story 2.5d: Move through my tasks with the keyboard'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: 'a91dc777c1a51e2677ee385317e1937364e54b85'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5a-show-my-tasks-on-the-main-screen.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5b-add-a-task-from-the-main-screen.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The main screen works only with a mouse: there's no way to jump to the add input or move through tasks from the keyboard.

**Approach:** Turn 2.5a's `<ul>` into the keyboard grid, and add the ⌘K (Ctrl+K off macOS) shortcut and Esc from the add input. Implement Story 2.5d's acceptance criteria in `epics.md`: the grid semantics and instruction text; one Tab stop with the first row selected on first focus; ↑/↓ without wrapping; click to select; the 2px inset ring plus the `row-selected` tint while focused and the tint only when blurred; overdue rows keep their tint and rule; `scrollIntoView({ block: 'nearest' })` on each selection change; full accessible names.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- Focus model: the grid element (`role="grid"`, `tabIndex={0}`, `aria-label="Tasks"`) is the single Tab stop and holds DOM focus. It points at the selected row through `aria-activedescendant`. Each task is a `role="row"` with a stable id, `aria-selected`, the 2.5a accessible name, and two `role="gridcell"`s (cell 1 title and status, cell 2 actions, empty until 2.6).
- Selection follows the task by ID across refetches. If the selected task is gone, it moves to the row now at its old index, clamped to the list. The selected row shows its full title (no clamp) and grows to fit, as UX-DR6 asks.
- ⌘K / Ctrl+K: one global keydown listener (`metaKey` on macOS, `ctrlKey` elsewhere, detected once) focuses the add title input and prevents the browser default, from anywhere on the main screen. The add input's hint shows "⌘K" on macOS and "Ctrl K" elsewhere.
- Esc in the add title input moves focus to the grid. With no tasks there is no grid, so Esc just blurs.
- The letter shortcuts named in the instruction text (S, B, C, X, E, Backspace, Z) belong to later stories; here those keys do nothing.

## Boundaries & Constraints

**Always:**
- The instruction text, exactly "Use arrow keys to move, S start, B move back, C complete, X cancel, E edit, Backspace delete, Z undo.", sits in a visually hidden element the grid references with `aria-describedby`.
- ↑/↓ are handled only while the grid has focus, never while typing. They move one row and stop at the ends. Clicking a row selects it and focuses the grid.
- Selected styling uses tokens: `row-selected` tint, 2px inset `ring` only while the grid has focus. Overdue rows keep `overdue-tint` and the 3px rule, and also show the ring when selected and focused. Selection is never shown only by `aria-selected` or by tint.
- The live overdue promotion, API order and the empty state from 2.5a are unchanged. Design tokens only; no horizontal scroll at 320px.

**Never:**
- No row actions, no edit or delete, no status shortcuts, no Home/End/PageUp handling, no wrap-around.

</frozen-after-approval>

## Code Map

- `frontend/src/tasks/TaskList.tsx` and `TaskRow.tsx` -- convert `<ul>`/`<li>` to grid/row/gridcell; selection state in `TaskList`; `rowLabel` keeps the name.
- `frontend/src/tasks/AddTask.tsx` -- the title input ref and the `kbd` hint; add Esc → grid, and expose a way for the ⌘K handler to focus the input (a ref, or a small `useAddInputFocus`).
- `frontend/src/screens/MainScreen.tsx` -- a good place for the global ⌘K listener and wiring Esc to the grid.
- `frontend/src/index.css` -- `row-selected`, `ring` tokens; DESIGN.md Task row "Selected" and the focus ring.
- `frontend/src/tasks/TaskList.test.tsx`, `testHarness.tsx` -- tests to update for the new roles (they query `li`/`ul` today).
- `frontend/e2e/tasks.spec.ts` -- e2e tests to update for the grid. Add the keyboard test.

## Tasks & Acceptance

**Execution:**
- [x] Component tests (red first): grid, row and gridcell roles; `aria-describedby` instruction text; the first focus selects row 1 (`aria-activedescendant`); ↑/↓ clamp at the ends; click selects and focuses; ring only while focused, tint kept on blur; overdue row keeps its tint and rule when selected; `scrollIntoView` called with `block: 'nearest'`; selection by ID kept across a refetch reorder, and the old index used when the task is gone; selected row unclamped.
- [x] `TaskList.tsx` and `TaskRow.tsx` grid conversion and selection.
- [x] ⌘K/Ctrl+K and Esc wiring with tests (the macOS and non-macOS modifier, `preventDefault`, Esc with an empty list), plus the platform-aware hint.
- [x] Update existing tests and e2e locators that used `li`/`ul`.
- [x] Playwright: Tab into the list selects the first row, ↑/↓ move without wrapping, ⌘K (or Ctrl+K on the runner's platform) focuses the add input, and Esc in it focuses the list.

**Acceptance Criteria:**
- Given the frontend, when `npm run lint && npm run build && npx vitest run && npx playwright test` run on Node 24, then all pass, and `uv run pytest` still passes.

## Implementation Notes

- Grid (`tasks/TaskList.tsx`, `TaskGrid`): a `div role="grid"` (`tabIndex=0`, `aria-label="Tasks"`, `aria-describedby` → an `sr-only` `<p>` with `GRID_INSTRUCTIONS`, `aria-activedescendant` → the selected row id `${useId()}-task-<id>`). Its own outline is off; the selected row's ring shows focus. Selection is `{ id, index }` state, re-derived during render by `followSelection` (same id → new index; gone → the row at the old index, clamped). The first focus selects row 1 (`current ?? first`); ↑/↓ (no modifiers) are `preventDefault`ed and clamped; every other key is ignored. A `useEffect` on the selected id calls `scrollIntoView({ block: 'nearest' })`, so it runs on every selection change and never on an unchanged selection.
- Rows (`tasks/TaskRow.tsx`): `role="row"` with `aria-selected` on every row, the 2.5a name, `data-selected`; cell 1 (mark, title, overdue label, due) and an empty cell 2 (`data-testid="row-actions"`). Selected: `bg-row-selected` (overdue rows keep `bg-overdue-tint` and the 3px rule instead), no `line-clamp-2`; with the grid focused, the new `row-ring` utility in `index.css` (`outline: var(--ring-width) solid var(--ring)` with a negative offset, so it combines with the overdue box-shadow rule). Press (`mousedown`) and `click` both select and focus the grid.
- Shortcuts: `lib/platform.ts` has `isMacPlatform()` (`userAgentData.platform`, else `navigator.platform`), `addShortcutHint` ("⌘K" / "Ctrl K") and `isAddShortcut` (⌘ on macOS, Ctrl elsewhere, no Alt/Shift/other modifier). `MainScreen` detects the platform once (`useState`), owns the add-input and grid refs, and installs one `window` keydown listener. `AddTask` gains optional `titleRef`, `onEscape` and `mac` props; Esc in the title calls `onEscape` (focus the grid, or blur when there is none) and blurs by default.
- Playwright: the Desktop Chrome device reports `userAgentData.platform` "Windows" even on a macOS runner (`navigator.platform` "MacIntel"), so the app shows "Ctrl K" there, and the e2e test picks the modifier from what the page reports rather than `ControlOrMeta`.
- Known limit, per the frozen intent: an overdue selected row shows only its overdue tint once the grid is blurred, so its selection is not visible until the grid has focus again.
- Verification: Vitest 248 (after the review patches), Playwright 40 (1 new keyboard test), backend 436, lint and build clean. Mutations, each caught: wrap-around (3 fail), the ring without focus (2), `block: 'center'` (1), the old-index hand-over set to 0 (1), the ⌘K `preventDefault` removed (2). Screenshots at 1280px (focused ring) and 320px (blurred tint) checked.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 15 findings), Edge Case Hunter (EC, 8), Verification Gap (VG, 2 gaps), and the implementer's own note (IM).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| EC1, BH5, EC2 | `isAddShortcut` throws on an undefined `key`; no match on non-Latin layouts | medium | `event.key.toLowerCase()` with no guard or `code` fallback | patch: `code === 'KeyK'` and a guard; `platform.test.ts` |
| BH6, BH7, EC3 | ⌘K acts during IME composition, on already-handled events, and inside the due popover | medium | a bare window listener | patch: skip when composing, defaultPrevented or inside a dialog |
| BH6b, EC4 | Esc during IME composition in the title moves focus | low | no `isComposing` check | patch |
| BH4, EC6 | right-click or middle-click moves the selection | low | `onMouseDown` ignores `button` | patch: primary button only |
| BH8, EC7, EC8 | scroll jumps while typing in the add input; no scroll when a refetch moves the selected row | low | the effect is keyed on `selectedId` only, with no focus check | patch: scroll only while focused, keyed on the index too |
| BH9, EC5 | focus falls to body when the focused grid empties | low | the grid unmounts | patch: focus the add input |
| VG1 | the mousedown first-focus path is untested | low | tests use `.click()` only | patch: add the test |
| VG2, BH11b, BH12 | modifier exclusions untested (⌘K, arrows) | low | no Shift/Alt cases | patch: add the tests |
| IM, BH2 | a selected overdue row has no visible cue when the grid is blurred | maybe-false (medium for a11y if it matters) | the spec's literal rules (overdue keeps its tint; blurred shows tint only) leave no cue. Selection without focus has no effect until 2.6 actions | defer: a design question for Benny/Sally (ledger) |
| BH3 | `aria-activedescendant` on `role="row"` in a non-tree grid; AT support varies | maybe-false | it matches the frozen decision; needs real NVDA/JAWS/VoiceOver testing | defer: ledger (verify with AT before Epic 3) |
| BH1 | the instruction text lists shortcuts not yet built | low | the text is mandated verbatim by UX-DR26 and the AC | rejected |
| BH10 | Esc only from the title input | low | the AC says "Esc in the add input" | rejected |
| BH11a | platform detection runs in two components | low | both read it once, cheaply | rejected |
| BH13 | test files unformatted | false | `npm run lint` is clean; Prettier isn't a project tool | rejected |
| BH14 | the diff omits the spec and sprint files | false | intentionally excluded | rejected |
| BH15 | the grid outline is suppressed; forced-colors unchecked | low | the row ring always shows while focused (focus selects) | rejected |

## Verification

**Commands:**
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npm run lint && npm run build && npx vitest run` -- expected: pass.
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npx playwright test` -- expected: pass.
- `uv run pytest` -- expected: 436 pass.
