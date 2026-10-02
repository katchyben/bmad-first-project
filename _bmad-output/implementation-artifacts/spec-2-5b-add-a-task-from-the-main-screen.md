---
title: 'Story 2.5b: Add a task from the main screen'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: 'c5c00239aca4d39077343c0c3d157daf03948fa8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5a-show-my-tasks-on-the-main-screen.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The main screen lists tasks, but the only way to add one is the API.

**Approach:** Above the list, add the add-task input with the preset chips and the "Add description" link, and implement Story 2.5b's acceptance criteria in `epics.md`: create through the generated `createTaskMutation`, invalidate the list query (no optimistic insert), reset the input, announce politely, show API errors in the input's single error slot, resolve presets in browser local time with roll-forward, and reflow at 400% zoom.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- The "Pick date…" chip and its popover belong to Story 2.5c. This story renders the two presets, "Tomorrow 9:00 AM" (preselected) and "Next Monday 9:00 AM", as toggle buttons with `aria-pressed`, exactly one pressed.
- The `kbd-hint` shows "⌘K" unfocused and "Enter" focused. The ⌘K shortcut itself is Story 2.5d's.
- Success is announced through one app-level polite live region (`announce(text)`), which later stories reuse. The text is `Added '<title>', due <formatDue(server due_at)>.`, for example "Added 'Pay rent', due Tomorrow, 9:00 AM."

## Boundaries & Constraints

**Always:**
- No pre-validation: a blank title is sent like any other value. A response with an error envelope (422 with its message) shows that message as written in one error slot under the input (`role="alert"`, linked by `aria-describedby`, input `aria-invalid`), and everything typed (title, preset, description) is kept. A 5xx goes to the existing global toast; a network failure is the connection banner's job (2.5e). The mutation is never retried.
- On success: the title clears, focus stays in the title input, the preset resets to "Tomorrow 9:00 AM", the description clears and collapses to the link, the error slot clears, and the list query (`listTasksQueryKey()`) is invalidated so the task appears in server order.
- Presets resolve at submit in browser local time: Tomorrow → tomorrow 09:00; Next Monday → the next Monday 09:00, or +7 days on a Monday. A resolved time at or before now rolls forward by its period (1 day or 7 days), so a preset never submits a past time. This is a pure function with an explicit `now`, sent as ISO 8601 with the local offset.
- The description is the "Add description" text link (min 24px target). Click, Enter or Space replaces it with a 3-row textarea (placeholder "Description (optional)", label "Description") and focuses it. In the textarea, Enter submits, Shift+Enter inserts a newline, and Esc returns focus to the title with the text kept. It stays open while it has text.
- Labels (UX-DR27): the input is labelled "Add a task" with the placeholder "Add a task" and an `aria-hidden` lucide plus icon. A double submit sends one request (an in-flight ref, as in `LoginScreen`).
- Design tokens only. Everything reflows at 320px with no horizontal scroll, and every target is at least 24px high.

**Never:**
- No "Pick date…" chip or popover, no ⌘K handling, no list keyboard navigation.
- No hand-written `fetch`, no optimistic insert, no client-side sorting.

</frozen-after-approval>

## Code Map

- `frontend/src/screens/LoginScreen.tsx` -- patterns to mirror: the single error slot, `aria-invalid` and `aria-describedby`, the in-flight ref, `isEnvelopeError` and `errorMessage` from `@/api/errors`.
- `frontend/src/screens/MainScreen.tsx` -- mount the add form between the header and `TaskList`; the spacing token there (`mt-heading-to-filter`) may need adjusting per DESIGN.md Layout.
- `frontend/src/client/@tanstack/react-query.gen.ts` -- `createTaskMutation` and `listTasksQueryKey`.
- `frontend/src/tasks/formatDue.ts` -- for the announcement text. `frontend/src/tasks/testHarness.tsx` -- shared test helpers.
- `frontend/src/components/ui/input.tsx`, `textarea.tsx` and `button.tsx` -- shadcn primitives. `frontend/src/index.css` -- tokens. Build class lists without `cn()` when they mix custom `text-*` sizes and colours (see 2.5a's notes).
- DESIGN.md: the Add-task input, Preset chip and Add description link components.
- New: `frontend/src/tasks/presets.ts` (pure resolver) and `AddTask.tsx`; `frontend/src/a11y/announce.tsx` (live region provider and `useAnnounce`, mounted once in `App.tsx`).
- `frontend/e2e/tasks.spec.ts` -- extend with adding by title + Enter.

## Tasks & Acceptance

**Execution:**
- [x] `presets.test.ts` then `presets.ts` -- Tomorrow; Next Monday on each weekday, including Monday +7; roll-forward when the resolved time ≤ now; local offset in the ISO output.
- [x] `announce.tsx` with a test that a message is placed in one polite region.
- [x] `AddTask.tsx` with component tests: Enter sends the title, the pressed preset's instant and the description; success resets everything and announces; the list query is invalidated; a 422 envelope shows in the slot with fields kept and `aria-invalid`/`aria-describedby`; a blank title is still sent; the description link opens, Shift+Enter makes a newline, Esc returns focus with the text kept; a double Enter sends one request.
- [x] Mount it in `MainScreen.tsx`, and the live region in `App.tsx`.
- [x] Playwright: add a task by title + Enter and see it in the list; add one with a description; at 320px, no horizontal scroll.

**Acceptance Criteria:**
- Given the frontend, when `npm run lint && npm run build && npx vitest run && npx playwright test` run on Node 24, then all pass, and `uv run pytest` still passes.

## Implementation Notes

- Presets (`tasks/presets.ts`): `resolvePreset(preset, now)` builds 09:00 on the local day and moves it by local calendar days (`setDate`, DST-safe); Next Monday adds `(1 - day + 7) % 7 || 7` days. Both pass through the exported `rollForward(candidate, now, periodDays)`, which adds whole periods while the time is at or before `now`. With today's two presets the candidate is always at least a day ahead, so the roll-forward is a guard; its tests drive it directly, plus a sweep that no preset ever resolves at or before `now`. `toLocalIso` writes the local wall time with the local offset (`2026-10-03T09:00:00+02:00`).
- `isEnvelopeError` moved from `LoginScreen.tsx` to `api/errors.ts` so the add form shares it.
- `a11y/announce.tsx`: `AnnounceProvider` (mounted once in `App.tsx`, around the shell and the Toaster) renders one `role="status" aria-live="polite"` `sr-only` region; each `announce(text)` renders a fresh keyed node so repeating a message is announced again. `useAnnounce` throws outside the provider.
- `AddTask.tsx`: Enter in the title (and Enter without Shift in the textarea) calls `submit()` from `onKeyDown`, guarded by an in-flight ref; IME-composing Enters are ignored. The description is sent only when non-empty, as typed. The error slot (`role="alert"`, always rendered) is linked from the title input and, when open, the textarea. 5xx bodies are left to the global toast and network failures to 2.5e; neither touches the fields. An empty textarea folds back to the link on blur (including Esc); one with text stays open.
- Tokens: `index.css` gains `--spacing-input-to-list`, `description-link-gap`, `add-input-padding-x`, `add-input-min-height` and `--text-chip`, `--text-kbd`. The shadcn Input and Textarea go through `cn()`, so the 15px input size is passed as `text-[15px] md:text-[15px]` (tailwind-merge drops the primitive's `text-base`/`md:text-sm`) and the textarea's 16px horizontal padding as `px-4`; `cn()` would not replace `px-2.5` with the unknown `px-add-input-padding-x`. The input text, chips and link start at 40px (`pl-10`/`ml-10`), as in key-add-expanded.html. MainScreen: the form sits `heading-to-filter` under the header, the list `input-to-list` under the form.
- Verification: Vitest 167 (presets 16, announce 2, AddTask 19 new), Playwright 36 (4 new: add by Enter, add with description + Next Monday + Shift+Enter newline, blank title in the slot, 320px reflow and 24px targets), backend 436, lint and build clean. Screenshots at 1280px and 320px checked against DESIGN.md.

- Main-session verification: mutations, each caught: roll-forward `<=` → `<` (1 fails), the Monday +7 removed (2 fail), list invalidation removed (1 fails), the envelope → slot removed (2 fail). After the review patches the focus rule was refined in the main session: success returns focus to the title from the form or the page, but not from a description that stays open with newer text (test added; the mutation is caught). Final: Vitest 172, Playwright 36, backend 436, lint and build clean. Screenshots at 1280px and 320px were checked.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 15 findings), Edge Case Hunter (EC, 8), Verification Gap (VG, 3 gaps).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH2, EC1 | text typed while a create is in flight is wiped on success | medium | the fields stay editable, and `onSuccess` resets unconditionally | patch: reset only fields still equal to the submitted snapshot |
| BH5, EC3 | Safari's IME-commit Enter (`keyCode` 229, `isComposing` false) submits | low | `isSubmitEnter` checks only `isComposing` | patch |
| EC2 | a slow create pulls focus back from wherever the user went | low | `onSuccess` always focuses the title | patch: refocus only from inside the form or body |
| VG1, BH8a | 5xx → global toast unproven; 422 → no toast unasserted | low | `renderAddTask` mounts no `Toaster` | patch |
| VG2, BH8b | a network failure staying out of the slot is untested | low | no rejecting-fetch case | patch |
| VG3 | the textarea's `aria-invalid`/`aria-describedby` are unasserted | low | the 422 test checks only the title's | patch |
| BH9, EC8 | "opens on Enter or Space" never presses either key | low | it checks `tagName` and `type` only | patch: rename or dispatch the keys |
| BH1 | ⌘K hint with no shortcut; ⌘ shown off macOS | low | decision: ⌘K is 2.5d's (UX-DR21 there includes Ctrl+K off macOS) | rejected (2.5d) |
| BH3 | the error is also linked from the description | low | one slot for the form; linking every field matches the edit-row rule (UX-DR19) | rejected |
| BH4 | toggle buttons rather than a radiogroup | low | decision recorded in the frozen intent | rejected |
| BH6 | the error lingers after the user edits | low | UX specifies clearing on success; no rule for edits | rejected |
| BH7, EC4 | `rollForward` is never needed and loops on `periodDays <= 0` | low | the spec mandates roll-forward; the only callers pass 1 or 7 | rejected |
| BH10, EC7 | e2e blank-title checks thin; midnight flake | low | the component tests cover the slot; the flake needs a run across midnight | rejected |
| BH11, EC5 | the last announcement persists after logout | low | single-user app; the region holds only the user's own title | rejected |
| BH12 | the announce test imports the tasks harness | low | a test-only dependency | rejected |
| BH13 | form `onSubmit` is unreachable | low | harmless fallback | rejected |
| BH14 | `--text-kbd--line-height` in px | low | cosmetic | rejected |
| BH15 | the diff omits the spec and sprint-status files | false | intentionally excluded workflow records | rejected |
| EC6 | `setError` on a 401 during logout teardown | low | React ignores state updates on unmount; nothing visible | rejected |

## Verification

**Commands:**
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npm run lint && npm run build && npx vitest run` -- expected: pass.
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npx playwright test` -- expected: pass.
- `uv run pytest` -- expected: 436 pass.
