---
title: 'Story 2.6a: Edit a task in place'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '5c8343bd0d549ed9f0d5f49765ac56e0a89bf779'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5d-move-through-my-tasks-with-the-keyboard.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A task can be edited only through the API. The main screen has no way to fix a title, description or due date-time.

**Approach:** Implement Story 2.6a's acceptance criteria in `epics.md`. Give active rows an Edit row action (revealed on hover or selection) and the E key. Both replace the row in place with the inline edit row (DESIGN.md `inline-edit-row`), which saves through the generated `editTaskMutation` with only the changed fields.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- **Which actions:** only Edit, the one this story's ACs name. Delete (2.6b) and the status actions (Epic 3) add buttons to the same cell later.
- **When actions show:** the selected row shows its actions whether or not the grid has focus; hover shows them too. On hover the due time fades out. On selection it stays, shifted left of the actions. This also gives a blurred, selected overdue row a visible cue (the 2.5d ledger item).
- **Keyboard:** row action buttons are `tabIndex={-1}`. The grid stays the single Tab stop, and the keyboard route is E. Entering the actions with → / Tab (UX-DR21) is not in 2.6's ACs and goes to the ledger.
- **What closes the edit row:** Save, Cancel or Esc. Opening another edit row discards the first. Clicking or arrowing to another row while one is open leaves it open.
- **Due control:** the presets and "Pick date…" show nothing pressed. The third chip reads the current due ("Yesterday, 5:00 PM"). A picked instant equal to the current due counts as unchanged. A preset resolves at save, as in the add input.
- **Save with nothing changed:** sends no request, closes the row and announces nothing.
- **Clearing the description:** a description emptied from a non-empty value is sent as `description: null`.
- **Tooltip:** shadcn's Tooltip (Radix, via `radix-ui`), themed on DESIGN.md tokens (`toast-background`/`toast-foreground`, caption type, the 180ms opacity fade), shown on hover. The spec is kept whole at about 2,000 tokens (Benny, 2026-10-02).

## Boundaries & Constraints

**Always:**
- Only changed fields go in the `PATCH` body; an unchanged `due_at` is never sent. No pre-validation: the title is sent as typed.
- `validation_error` shows its envelope `message` as written in the row's single `role="alert"` slot, directly above Cancel/Save, referenced by every field's `aria-describedby`. Everything typed is kept. `state_conflict` and `not_found` go to the persistent error toast (`showErrorToast`) with their envelope message; 5xx keeps the global toast; unreachable goes to the banner. The row stays open, with its fields kept, on every failure.
- After a successful save: invalidate `["tasks"]` (no optimistic update), close the row, select the task by ID, focus the grid and announce "Saved.". Cancel/Esc: discard, select the row, focus the grid.
- Opening: the title Input (sr-only label "Task title") is focused with the cursor at the end. The description textarea has the sr-only label "Description". Ghost Cancel carries `kbd-hint` "Esc", and primary Save `kbd-hint` "↵". There is no "clear due date" control. Enter saves from the title or the due chips; in the description, Enter saves and Shift+Enter inserts a newline (no IME-composition Enter).
- E (no modifiers) works only while the grid itself has focus and the selected task is active (`to_do`/`in_progress`); on any other row it does nothing and sends nothing. While the edit row has focus, the grid's ↑/↓/E handling ignores keys from inside it, and a row press does not steal focus from its fields.
- The Edit button: ghost, at least 26px high, with a tooltip "Edit (E)" and `aria-keyshortcuts="E"`. It fades in over 180ms, opacity only, and not under `prefers-reduced-motion`. Finished rows show no actions. Save is `aria-disabled` while in flight. Design tokens only; no horizontal scroll at 320px, reflow at 400% zoom.

**Never:**
- No Delete or status actions or keys. No → / Tab into actions. No description in the list row or indicator of one. No optimistic updates, no mutation retries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Title only | title changed | `PATCH {title}`; "Saved."; focus on the row | N/A |
| Overdue, title edit | past due, title changed | body has no `due_at` | N/A |
| Due change reorders | preset chosen | `PATCH {due_at}`; row moves; selection follows by ID | N/A |
| Clear description | "Notes" → "" | `PATCH {description: null}` | N/A |
| No change | Save | no request; row closes | N/A |
| Past due picked | API 422 "That time has already passed." | message in the slot, fields kept | slot |
| Gone or finished | 404 / 409 envelope | toast with the envelope message; row stays open | toast |
| Esc / Cancel | edits made | row closes, nothing sent, focus on the row | N/A |
| E on finished | finished row selected | nothing; no request | N/A |
| Second edit | E on row B while A is open | A discarded, B open | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/tasks/TaskRow.tsx` -- fill the `row-actions` gridcell with the Edit button; due-time fade on hover (`group-hover`); `row-hover` tint on hover. Keep `rowLabel` and the overdue treatment.
- `frontend/src/tasks/TaskList.tsx` (`TaskGrid`) -- holds `editingId`; the E key next to ↑/↓ in `onKeyDown`, which must return early when `event.target !== event.currentTarget`. Render the edit row instead of `TaskRow` for `editingId`. After save or cancel, `setSelection` to that task and `ref.current.focus()`. `followSelection` already follows by ID across the refetch.
- New `frontend/src/tasks/EditTaskRow.tsx` -- the edit row. Reuse from `AddTask.tsx`: `isSubmitEnter` (export it or move it to a shared module), `FIELD_TEXT`, `chipClass`, `PRESETS`/`resolvePreset`/`toLocalIso`, and `DuePicker` with `focusAfterSet` = the title ref. It also needs a `label` override on the third chip so it can show the current due unpressed. Use the `kbd` styling from AddTask's hint. Keep the row's `role="row"` with the same id, so `aria-activedescendant` stays valid.
- `frontend/src/tasks/DuePicker.tsx` -- `value` seeds the popover, and `pressed` drives the chip; add an optional label override if the chip text can't otherwise show the current due unpressed.
- `frontend/src/client/@tanstack/react-query.gen.ts` -- `editTaskMutation()`, body `EditTaskBody { title?, description?: string | null, due_at? }`, path `{ task_id }`. Don't edit generated files.
- `frontend/src/api/errors.ts` / `errorToast.ts` -- `isEnvelopeError`, `errorCode`, `errorMessage`, `showErrorToast`; the global handler already toasts 5xx, so call `showErrorToast` only for envelope codes other than `validation_error`.
- `frontend/src/a11y/announce.tsx` -- `useAnnounce()` for "Saved.".
- `frontend/src/components/ui/` -- add `tooltip.tsx` via the shadcn generator (`npx shadcn add tooltip`), then theme it.
- `frontend/src/tasks/TaskList.test.tsx`, `testHarness.tsx` -- component tests; `frontend/e2e/tasks.spec.ts` -- the edit e2e.

## Tasks & Acceptance

**Execution:**
- [x] `TaskRow.tsx` -- Edit action, hover/selected reveal, the due-time behaviour, the tooltip.
- [x] `EditTaskRow.tsx` -- fields, the due control, the slot, keys, the changed-fields body, the error routing, the in-flight `aria-disabled`.
- [x] `TaskList.tsx` -- edit state, the E key, the guard for keys from inside the row, the focus/selection hand-back, the "Saved." announcement.
- [x] Component tests -- every I/O matrix row; the single slot linked to every field; the cursor at the end of the title; Shift+Enter newline; the tooltip text and `aria-keyshortcuts`; no actions on a finished row (a fixture with `status: 'done'`); arrows inside the textarea don't move the selection.
- [x] Playwright -- edit a task's title (the request body holds only `title`), see it saved and the row focused; change the due so it reorders; 320px with no horizontal scroll with the edit row open.

**Acceptance Criteria:**
- Given the frontend, when `npm run lint && npm run build && npm test && npm run e2e` run on Node 24, then all pass, and `uv run pytest -q` still passes.

## Implementation Notes

- Shared field helpers moved from `AddTask.tsx` to `tasks/fields.ts` (`FIELD_TEXT`, `KBD_HINT`, `isSubmitEnter`); `isActive` added to `tasks/overdue.ts`.
- `DuePicker` gained optional `label` (the edit row's unpressed current-due text, e.g. "Yesterday, 5:00 PM"; `value` still seeds the popover with the current due) and `describedBy` (the error slot).
- Tooltip: generated with `npx shadcn add tooltip`, then themed: `toast-background`/`toast-foreground`, 13px/1.5 caption type as arbitrary values (tailwind-merge would drop `text-caption` beside a colour), opacity fade at `--fade-duration`, zoom/slide removed. `TooltipProvider` wraps the grid's rows.
- `TaskRow`: `group relative`; unselected active rows lay the actions cell absolutely over the due time's place (opacity 0, `group-hover` reveals it while the due time fades out); a selected row puts it in flow (opacity 100), so the due time stays, shifted left, focused or not. Unselected, non-overdue rows take `hover:bg-row-hover`. Finished rows render an empty actions cell. The Edit button stops the row's click so the grid doesn't take focus first.
- `TaskGrid`: `editing = { id, focusRequest }`. E (no modifiers, `e`/`E`) and Edit both call `openEdit`, which selects the task and bumps `focusRequest` (E on the already-open task refocuses its title, edits kept). `onKeyDown` returns early when `event.target !== event.currentTarget`, which also covers keys bubbling through the React tree from the due popover's portal. `closeEdit` selects the task by ID, focuses the grid and announces "Saved." on a save.
- `EditTaskRow`: the PATCH body comes from `changedFields` (title as typed; description `null` when emptied; a preset resolves at save; a due equal to the current instant is never sent). On success it awaits the `["tasks"]` invalidation before closing, so the row never flashes the old values. A `validation_error` fills the slot; other envelope codes go to `showErrorToast` except `unauthenticated` (the global 401 handler owns that); 5xx and unreachable are left to the global toast and banner. Esc is handled on the row container, skipping IME composition, already-handled events (Radix's popover Esc) and portal events. Enter on a due chip saves (Space still presses it). A save that lands after the row was closed (Cancel during flight, or another row opened) refreshes the list but moves no focus.
- Layout: at the 640px column the chip row and Cancel/Save do not fit on one line (about 611px needed for 594px), so Cancel/Save wrap to their own right-aligned line under the chips.
- Known limits: the edit row has no inset selection ring of its own (its fields carry the focus ring); on deselection the actions fade out over the due time for 180ms; at narrow widths the hover overlay can sit over the end of a wrapped title.
- Verification: Vitest 316 after the review patches (39 in `EditTaskRow.test.tsx`), Playwright 47 (3 new), backend 436, lint and build clean. Mutations, each caught: the grid's inside-key guard removed (1 fail), the description sent as "" instead of null (1), the due always sent (7), the non-validation toast removed (2). Screenshots at 1280px and 320px checked: hover, selected overdue focused and blurred, edit row with an error.
- Review patch: Enter on the "Pick date…" chip opens the popover (its activation) rather than saving; Enter on a preset chip applies it and saves. This reads the frozen "Enter saves from the due chips" as "Enter on a chip activates it and saves", which the picker chip can only half do.
- The new Tooltip takes the bundle to 512 kB, so Vite's 500 kB chunk warning now shows; the build passes.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 11 findings), Edge Case Hunter (EC, 6), Verification Gap (VG, 4 gaps + 1 other).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH1, EC2 | Enter on a due chip saves without applying it; Enter on "Pick date…" saves instead of opening the popover | medium | `onChipsKeyDown` calls `preventDefault()` on every Enter in the group, which cancels the button's activation; the test presses Enter only on an already-pressed chip | patch: Enter on a preset chip applies it and saves with it; Enter on the "Pick date…" chip opens the popover (activation), as in the add input |
| BH2, EC3, VG1 | Cancel/Esc during an in-flight save closes the row as a discard while the change still lands; the late-success guard is untested | medium | `close(false)` is not blocked by `inFlight`; no test cancels mid-flight | patch: ignore Cancel/Esc while in flight (Cancel `aria-disabled` too); test a late success after another row opened (no "Saved.", focus and selection stay) |
| BH3, BH4, EC1, VG-other | The edit state goes stale when a refetch drops the task or makes it finished; 404/409 leave the row open on a dead task | medium | the edit row unmounts with `closed=true`, so `onClose` never runs and focus drops to body; `onError` doesn't invalidate the list | patch: on `not_found`/`state_conflict` also invalidate the list; in `TaskGrid`, when the edited task is gone or not active, clear `editing` and focus the grid if focus was inside the row; test both |
| VG2 | The `unauthenticated` exclusion is untested | low | no 401 case in the `errors` block | patch: test |
| VG3 | E on the already-open edit row (refocus title, keep edits) is untested | low | no `focusRequest` re-run test | patch: test |
| VG4 | Upper-case E is untested | low | every press is `'e'` | patch: test |
| BH11 | Esc from the description or a chip is untested | low | only the title's Esc is tested | patch: test |
| BH10 | Stale or orphaned comments (`DuePicker` "later", AddTask's module-level padding comment, the `TaskGrid` doc) | low | read in the diff | patch: correct them |
| BH7 | The tooltip exit fade never runs | false | `shadcn/tailwind.css` defines `data-closed` as `[data-state="closed"]`, which Radix Tooltip sets | rejected |
| BH8 | `tooltip.tsx` breaks the codebase conventions; `delayDuration` 0 | false / low | it is generated shadcn code like `popover.tsx` (same `cn` import, quotes); tooltips show only over the action buttons | rejected |
| BH9 | The edit row has one gridcell where read rows have two; straight quotes in its label | low / false | the column-count read-out is cosmetic for AT; straight single quotes are the project voice (`'X'`) | rejected |
| BH5 | The validation message stays until the next save | low | matches the add input, which also clears its slot on the next submit | rejected |
| BH6 | A successful save whose refetch fails closes onto stale data | low | needs the connection to drop between PATCH and GET; the banner then shows and the next refetch corrects it | rejected |
| EC4 | A `validation_error` after the row closed is lost | low | with Cancel blocked in flight, only reachable by opening another row mid-save | rejected (rare) |
| EC5 | A task prop change mid-edit diffs against new values | low | needs another tab to edit the same task while this row is open | rejected (rare) |
| EC6 | Safari's IME-ending Esc (keyCode 229) closes the row | low | the add input's Esc has the same `isComposing`-only check | rejected (consistent; rare) |
| BH12 | The diff omits the spec and ledger files | false | intentionally excluded | rejected |

## Verification

**Commands:**
- `cd frontend && source ~/.nvm/nvm.sh && nvm use 24 && npm run lint && npm run build && npm test` -- expected: pass.
- `cd frontend && source ~/.nvm/nvm.sh && nvm use 24 && npm run e2e` -- expected: pass (stop dev servers first).
- `uv run pytest -q` -- expected: 436 pass.

**Manual checks:**
- Screenshots at 1280px and 320px: a hovered row, a selected row (focused and blurred, including overdue), and the edit row with an error.
