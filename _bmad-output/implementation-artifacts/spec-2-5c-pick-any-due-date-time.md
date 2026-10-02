---
title: 'Story 2.5c: Pick any due date-time'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '2b6f37d02bd3e10623dff53c22bc194e838c731b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5b-add-a-task-from-the-main-screen.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A new task can only be due at one of two presets, so anything due at a specific date and time can't be captured.

**Approach:** Add the third chip, "Pick date…", to the add-task form. It opens a modal Radix Popover with the shadcn Calendar and a time field. Implement Story 2.5c's acceptance criteria in `epics.md`: the current month with past days disabled; a `type="time"` field with a visible "Time" label; a primary "Set"; the Enter and Esc flows with their focus returns; the chosen value shown in the chip; the opacity-only motion. Build the picker as a reusable `DuePicker` so 2.6a's edit row can use it.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- Activating "Pick date…" always opens the popover. After Set, that chip is the pressed one and its label is the value in `formatDue`'s absolute style ("Oct 12, 9:00 AM", with the year when not the current year). Pressing a preset clears the custom value and the chip reads "Pick date…" again. A successful add resets to "Tomorrow 9:00 AM", as now.
- Default time: 9:00 AM, or, when today is the chosen day and it is past 9:00, the next full hour, capped at 23:59 so it stays today. A time the user types that is earlier than now is sent as is; the API's "That time has already passed." shows in the error slot (no pre-validation).
- This closes the deferred Popover-motion item: `PopoverContent` drops shadcn's zoom and slide classes and uses only the 180ms `fade` (off under reduced motion). The Button part of that ledger item stays deferred.

## Boundaries & Constraints

**Always:**
- The popover is modal (focus trapped). It opens on the current month, and days before today (local) are disabled.
- Enter on a day selects it and moves focus to the time field. Enter in the time field is Set. Set closes the popover, presses the third chip with the value, and returns focus to the title input. Esc closes without change and returns focus to the "Pick date…" chip.
- The chosen local date and time go out as ISO 8601 with the local offset (reuse `toLocalIso`). Labels: "Time" is visible (UX-DR27), and the chip and popover have accessible names. Every target is at least 24px high.
- Design tokens only; it reflows at 320px with no horizontal scroll. Decorative calendar icons are `aria-hidden`.

**Never:**
- No natural-language parsing, no time zone picker, no clearing of the due date. No changes to the edit row (2.6a).

</frozen-after-approval>

## Code Map

- `frontend/src/tasks/AddTask.tsx` -- presets state (`PresetId`), `chipClass`, and the success reset with the sent snapshot; extend with a custom-due option.
- `frontend/src/tasks/presets.ts` -- `toLocalIso` to reuse; `PRESETS` and `resolvePreset`.
- `frontend/src/tasks/formatDue.ts` -- the absolute "Oct 12, 9:00 AM" style for the chip label. Expose a helper if needed; don't duplicate the format.
- `frontend/src/components/ui/popover.tsx` -- strip `slide-in-*`, `zoom-*`, `animate-*` and `duration-100`, and apply `fade` with opacity driven by `data-state`.
- `frontend/src/components/ui/calendar.tsx` -- the shadcn Calendar (react-day-picker); `disabled={{ before: today }}`.
- `frontend/src/components/ui/input.tsx` and `button.tsx`; `frontend/src/index.css` tokens; the DESIGN.md "Due popover" component.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the 1.3b Popover-motion entry this closes (don't edit old entries).
- New: `frontend/src/tasks/DuePicker.tsx` with `DuePicker.test.tsx`; a pure `defaultTime(day, now)` with tests.
- `frontend/e2e/tasks.spec.ts` -- add a test with "Pick date…".

## Tasks & Acceptance

**Execution:**
- [x] `defaultTime` tests then the code: before 9:00, after 9:00 today, a future day, near midnight.
- [x] `DuePicker` with component tests: it opens on the current month with past days disabled; Enter on a day focuses Time; Enter in Time sets and returns focus to the title; Esc returns focus to the chip without change; the chip label after Set; a preset clears the custom value.
- [x] `AddTask` integration: submit sends the picked instant; success resets to Tomorrow and "Pick date…".
- [x] `popover.tsx` opacity-only, with a test or assertion that the content carries `fade` and no zoom or slide classes.
- [x] Playwright: add a task through "Pick date…" (a future day, and a typed time) and see it in the list with the expected due text.

**Acceptance Criteria:**
- Given the frontend, when `npm run lint && npm run build && npx vitest run && npx playwright test` run on Node 24, then all pass, and `uv run pytest` still passes.

## Implementation Notes

- `tasks/defaultTime.ts`: `defaultTime(day, now)` returns "HH:MM": 09:00 unless `day` is `now`'s local day and 9:00 has come (at 9:00 exactly too, since 9:00 would not be after now), then the next full hour, 23:59 from 23:00 on. `atTime(day, "HH:MM")` builds the local instant (null for an empty or partial time, so Set does nothing), `timeOf` formats one back.
- `formatDue.ts` exports `formatDueAbsolute(due, now)`, sharing the month/day/year and time formatters with `formatDue` (no duplicated format).
- `tasks/DuePicker.tsx`: the chip is the Radix `PopoverTrigger` (`aria-pressed`, `aria-haspopup="dialog"`, `aria-expanded`), with an `aria-hidden` lucide `CalendarDays`. The `modal` popover content is named "Pick a due date and time". Props: `value`, `pressed`, `onSet(due)`, `focusAfterSet` (a ref), so 2.6a can reuse it. On open it starts on the value's day and time, or today with `defaultTime`; the month shown is that day's month (the current month unless a later value is being re-edited), `startMonth` is the current month and `disabled={{ before: today }}`. Open focus goes to the selected day (`onOpenAutoFocus` prevented; otherwise the first tabbable is the month nav). Enter on an enabled day is handled in `onDayKeyDown`: default prevented (no click), the day selected, focus moved to Time. Until the user types a time, the default follows the picked day. Set (button or Enter in Time) closes and `onCloseAutoFocus` focuses `focusAfterSet`; Esc and outside clicks keep Radix's return to the chip. Both auto-focus handlers prevent the default only when they actually move focus. If the time is empty or partial, Set keeps the popover open, marks Time `aria-invalid` and focuses it; the flag clears when the time changes. A kept value whose day has passed reopens on today with the default time. When a value is picked, the chip is labelled "<value>, pick another date". `collisionPadding={16}` keeps the popover off the edges at 320px. `chipClass` moved to `tasks/chipClass.ts` for both components.
- `AddTask.tsx`: the due state is `{ kind: 'preset', preset } | { kind: 'picked', at }`; a preset press replaces it, so the custom value is cleared. The success reset compares the due object by identity with the sent snapshot, so a re-pick during a slow create is kept. Pressing the preset that is already pressed returns the current object, so the reset still applies. A picked past time goes out unchanged and the API message lands in the slot.
- `popover.tsx`: the zoom, slide, `duration-100` and transform-origin classes are gone. The content keeps tw-animate's opacity-only `data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0` at `duration-(--fade-duration)` (180ms). A keyframe animation, not a transition, because Radix Presence waits only for an animation before it unmounts, so the close fades too. Under reduced motion the global override makes it instant. The Button part of the 1.3b ledger entry stays deferred; the ledger was not edited.
- `e2e/design.spec.ts`: "without ?design-check the app renders" now mocks `/api/tasks`, as its own comment asked. With the fake token the task query's 401 logs out and raced the heading check; it failed once in the full run after this change.
- Verification: Vitest 203 (defaultTime 7, formatDueAbsolute 3, DuePicker 16, AddTask +5), Playwright 39 (3 new: add through "Pick date…" with arrow keys, Enter, a typed time and the row's due text; Esc returns to the chip; 320px fit and 24px targets), backend 436, lint and build clean. Mutations caught: no focus to the title after Set (2 fail), `disabled` removed (2 fail), no due reset on success (2 fail). `shell.spec.ts` "dark: the error toast…" flaked once in 6 full runs (Sonner fixture, not touched here).

- Main-session verification: screenshots at 1280px and 320px (before and after `collisionPadding`). Playwright ran 39/39 on five full runs with no flake. Final: Vitest 207, Playwright 39, backend 436, lint and build clean. This closes the 1.3b ledger's Popover-motion half (opacity-only fade-in and fade-out at 180ms); the Button half (`active:translate-y-px`, `transition-all`) stays open.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 11 findings), Edge Case Hunter (EC, 8), Verification Gap (VG, 1 gap plus 1 other), and the main session's screenshot check (MS).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH1, EC7, VG-o | the exit fade never plays (Radix Presence waits only for animations); the reduced-motion e2e test goes stale | medium | the implementer's own note; Radix unmounts at once on close | patch: opacity-only fade-in/out animations at 180ms |
| MS1 | at 320px the popover touches the viewport edge | low | `pop-320.png`, with no 16px gutter | patch: `collisionPadding={16}` |
| EC1, EC3 | focus is lost: `preventDefault` runs on open with no target, and on close after Set with no target | medium | `onOpenAutoFocus` and `onCloseAutoFocus` | patch: prevent only when focusing |
| BH5, EC2 | reopening with a past picked day selects a disabled day, which Set can send | low | a kept value left open across midnight | patch: open on today |
| BH2, EC4 | Set with an empty or partial time does nothing, with no feedback | low | `set()` returns early silently | patch: `aria-invalid` and focus on Time |
| BH4 | the picked chip's name is just the date | low | it doesn't say it opens a picker | patch: "<value>, pick another date" |
| EC6 | re-clicking the pressed preset in flight defeats the success reset | low | a new object fails the identity check | patch: a functional update |
| VG1 | an equal re-pick while in flight is untested | low | only different values are tested | patch: add the test |
| BH3 | `aria-pressed` on a dialog trigger | low | the toggle-chip decision from 2.5b | rejected |
| BH6 | no inline cue for an earlier time today | low | decision: no pre-validation; the API message shows in the slot | rejected |
| EC5 | open across midnight keeps yesterday selectable | low | needs the popover held open across midnight | rejected |
| BH8 | the e2e tests use the real clock | low | needs a run straddling midnight or new year | rejected |
| BH9, BH11 | duplicated `ResizeObserver` stub and helpers; hardcoded label strings in tests | low | test-only tidiness | rejected |
| BH10b | outside-click dismissal untested | low | Radix default behaviour; Esc is tested | rejected |
| EC8 | reopening shows the picked value's month, not the current month | low | first open is the current month (frozen); a reopen showing the chosen month is better UX | rejected |
| BH7 | the diff omits the spec and sprint files | false | intentionally excluded | rejected |

## Verification

**Commands:**
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npm run lint && npm run build && npx vitest run` -- expected: pass.
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npx playwright test` -- expected: pass.
- `uv run pytest` -- expected: 436 pass.
