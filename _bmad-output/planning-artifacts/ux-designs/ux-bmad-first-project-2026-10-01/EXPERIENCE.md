---
name: 'Todo App (BMad Method demo)'
status: final
created: '2026-10-01'
updated: '2026-10-01'
sources:
  - ../../prds/prd-bmad-first-project-2026-10-01/prd.md
  - ../../architecture/architecture-bmad-first-project-2026-10-01/ARCHITECTURE-SPINE.md
  - ../../epics.md
design: ./DESIGN.md
---

# Todo App — Experience Spine

## Foundation

- **Form factor:** desktop web only. No mobile layout and no touch-specific behaviour; widths are fluid (DESIGN.md Layout) only so the page reflows under browser zoom.
- **UI system:** shadcn/ui (Radix primitives + Tailwind) in the React SPA. This spine specifies only the behavioural delta; Radix defaults (Esc to close, Tabs arrow-key behaviour) are inherited. Popovers are set to `modal` explicitly (Accessibility Floor).
- **Visual identity:** [DESIGN.md](./DESIGN.md). Tokens are referenced by path, e.g. `{colors.overdue}`.
- **Theme:** follows the OS via `prefers-color-scheme`. No in-app toggle.
- **Stakes:** hobby / solo learning project, one pre-created account.
- **Authority:** the API decides every rule (PRD NFR-1, AD-2). The frontend renders the list exactly in the order `GET /api/tasks` returns and never re-sorts or filters by itself (AD-10). The one display-only exception is the live overdue highlight (State Patterns), which never re-sorts, filters or changes status. There are no optimistic updates: every mutation waits for the response, then the `["tasks"]` queries are invalidated and refetched (AD-11).
- **Glossary:** Task, Due date-time, Status (To do, In progress, Done, Cancelled), Active task, Finished task, Overdue indicator, Undo window: as defined in the PRD §3.
- **Mockups:** [key-main.html](./mockups/key-main.html) (main list, light and dark), [key-add-expanded.html](./mockups/key-add-expanded.html) (add input, presets, due popover, description, past-time error), [key-login.html](./mockups/key-login.html) (login and its error). Provenance: [color-themes.html](./mockups/color-themes.html) (Graphite Hush palette chosen) and [design-directions.html](./mockups/design-directions.html) (direction A layout chosen, direction D keyboard model). **The spines win on any conflict with a mockup.** The mocks predate the accessibility fixes (focus ring on every selected row, the "In progress" label, fluid widths, the second-⌫ delete, two-line title clipping, among others); where they differ, the spine governs.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Login | App open without a valid token; any `unauthenticated` response; Log out | Enter the single account's credentials |
| Main list ("Today") | Successful login; app open with a valid token | Everything else: add, scan, act, filter, review finished |

The main list is one screen with these regions, top to bottom:

| Region | Purpose |
|---|---|
| Connection banner | Present only while the server is unreachable |
| Header | Heading "Today", today's date, Shortcuts and Log out (top right, ghost buttons) |
| Status filter | All · To do · In progress · Done · Cancelled |
| Add-task input | Title, preset chips, calendar/time popover, "Add description" link that expands an optional description |
| Active list | Active tasks in API order (or the "Loading…" line during a slow load); overdue ones are wherever the order puts them, which is the top because they are the earliest due |
| Finished section | Done and Cancelled tasks in API order, collapsible, collapsed at the start of every visit (All view only) |
| Toast region | Undo toasts and action-error toasts, bottom centre |

Overlays: the due popover and the Shortcuts popover (one level, never both). There are no dialogs: inline edit and the delete confirm both happen in place in the row. There is no routing beyond Login ↔ Main list.

## Voice and Tone

Plain, short, calm. Full sentences end with a full stop. No exclamation marks, no emoji, no "successfully".

| Moment | Copy |
|---|---|
| Empty (All view, no active tasks) | "Nothing due. Enjoy the quiet." / "Type above when something comes up." |
| Empty (filtered view) | "No tasks here." |
| Add input placeholder | "Add a task" |
| Description reveal / placeholder | "Add description" / "Description (optional)" |
| Completed | "Marked 'Pay rent' done · Undo" |
| Cancelled | "Cancelled 'Book flights' · Undo" |
| Past due time chosen | "That time has already passed." |
| Server unreachable | "Can't reach the server. Retrying…" |
| Delete confirm | "Delete 'Pack bags'? This can't be undone." with buttons "Delete" / "Keep" |
| Slow load (after 1 s) | "Loading…" |
| Login button | "Log in" |
| Invalid credentials | "That username and password don't match." (the API's message, shown as written) |
| Undo expired, past due time, validation and other API errors | The API envelope's `message`, shown as written (stories 2.5, 2.6, 3.5) |
| 5xx or response with no envelope `message` | "Something went wrong. Try again." (frontend fallback) |
| Undo toast announcement | "Marked 'Pay rent' done. Undo available for 5 seconds, press Z." / "Cancelled 'Book flights'. Undo available for 5 seconds, press Z." |
| Undo succeeded | "Restored 'Pay rent'." (announced) |
| Success announcements | "Added 'Call the dentist', due Tomorrow, 9:00 AM." · "Started 'Submit report'." · "Moved 'Submit report' back to To do." · "Saved." · "Deleted 'Pack bags'." · filter change: "In progress: 3 tasks" or "No tasks here." |
| Back online | "Reconnected." (announced only) |
| List instructions (screen readers) | "Use arrow keys to move, S start, B move back, C complete, X cancel, E edit, Backspace delete, Z undo." |
| Delete confirm description | "This can't be undone. Escape to keep." |

| Do | Don't |
|---|---|
| "Marked 'Pay rent' done · Undo" | "Task completed successfully!" |
| "Can't reach the server. Retrying…" | "Network Error (ERR_CONNECTION_REFUSED)" |
| Quote the task title in single quotes | Refer to "item" or "entry" |

**One wording source.** API error messages are written in this voice and the frontend shows them as written: it never rewords, maps or duplicates them. "That time has already passed." is the API's message, not UI copy. Only the strings in the table above that no API response carries (placeholders, empty states, toasts, banner, delete confirm, "Loading…", announcements, the 5xx fallback) live in the frontend.

## Component Patterns

Behavioural. Visual specs live in DESIGN.md Components.

| Component | Behavioural rules |
|---|---|
| Task row | Click selects the row. Hover (`{colors.row-hover}`) reveals the actions for its status as `{components.row-action-button}`s, replacing the due time (fade, 180ms); selection reveals them too but keeps the due time visible, shifted left (DESIGN.md Task row). Actions: **To do** Start · Complete · Cancel · Edit · Delete; **In progress** Move back · Complete · Cancel · Edit; **Done / Cancelled** none. Each button's tooltip names its key, e.g. "Complete (C)", and carries `aria-keyshortcuts`. While an action request is in flight, that row's actions are `aria-disabled` (still focusable, activation ignored); on success the list refetches, the row appears in its new position or section, and a one-shot success message is announced. A `state_conflict` or `not_found` answer shows the envelope message in an error toast. Due date-times render in the browser's time zone. Long titles are clipped at two lines in the list; selecting the row (click or arrow keys) expands it to the full title, and moving the selection away clips it again. The row's accessible name always carries the full title, and the inline edit row shows it in full. |
| Add-task input | Enter submits title + selected due date-time (+ description if expanded and non-empty). The burst stays title → Enter: the description is never required and never in the way. On success: title clears, focus stays in the input, due selection resets to "Tomorrow 9:00 AM", list refetches, new task appears in its sorted position. On error: the envelope message appears in the input's single error slot under it and everything typed is kept. Empty or whitespace title is sent to the API like any other value; the API's validation message is shown (the frontend decides no rule). Esc blurs the input and moves focus to the list. |
| Add description link | `{components.add-description-link}` under the chip row. Click, Enter or Space replaces it with `{components.add-description-textarea}` and focuses the textarea. In the textarea, Enter submits the whole task (same as Enter in the title) and Shift+Enter inserts a newline; Esc returns focus to the title input with the text kept. The textarea stays open while it has text. After a successful add it clears and collapses back to the link, and focus returns to the title input, so the next burst entry is title → Enter again. Collapsed is the default on every visit. |
| Preset chips + due popover | See **Due Date-Time Entry**. |
| Status filter | Radix Tabs. Selecting a tab requests `GET /api/tasks?status=…` (All omits the parameter) and shows only the returned tasks. Done or Cancelled filter: those tasks as a plain list in `{components.task-row-done}` / `{components.task-row-cancelled}` styling, no Finished section. To do / In progress filter: plain list, no Finished section. Default All; not remembered — a reload or new visit returns to All. |
| Finished section header | Button with `aria-expanded`; click, Enter or Space toggles. Shown in the All view only, with the count of finished tasks. Starts **collapsed** on every visit (load, reload, new login); within a visit it keeps whatever state Benny last set, including across filter changes. Never persisted. |
| Undo toast | Opens when a Complete or Cancel success response arrives; open for exactly 5 s from that moment, with a visible second countdown. Hover and focus do not pause it, and there is no Reopen action on finished rows (accepted risk, Accessibility Floor). State lives in one app-level store keyed by task ID, so refetches and filter changes don't remove it. Undo (click, Enter on the focused link, or Z) sends `/undo`; once sent, the link is `aria-disabled` and dimmed (repeat activations ignored) and the toast stays until the response, even past 5 s. Success: toast closes, list refetches, task returns to its previous status and position, "Restored 'X'." is announced. `undo_window_expired`: Undo link and countdown disappear, the API message shows and is announced, and the toast fades after 3 s; that fade timer pauses while the toast is hovered or focused. Several toasts may be open at once (one per task), newest at the bottom. |
| Error toast | Envelope message, as written, for action, delete, undo and edit-save errors other than `validation_error` (`state_conflict`, `not_found`), and for 5xx or unexpected responses (envelope `message`, or "Something went wrong. Try again." when there is none). Stays until dismissed with its close button; never fades on a timer. |
| Login card | Username (`autocomplete="username"`) + Password (`autocomplete="current-password"`) + Log in; paste and password managers allowed. Enter in either field submits. Log in is `aria-disabled` while the request is in flight, no spinner. Invalid credentials: stay on the screen, show the API message ("That username and password don't match.") in the single error slot above Log in, keep the username, clear the password. The login request is exempt from the global `unauthenticated` → Login handler, so its 401 reaches the form instead of resetting it. Success: token stored under one `localStorage` key, main list shown. |
| Log out | Calls logout, clears the token, shows Login. |
| Empty state | `{components.empty-state}`. Shown in the list position when the All view has no active tasks (the Finished section still renders below if it has tasks), or when a filtered view returns nothing. |
| Connection banner | Appears when a request fails at the network level; text "Can't reach the server. Retrying…"; disappears on the next successful response. Announced once when it appears and "Reconnected." once when it goes; never re-announced during retries. TanStack Query retries **only network errors** (never 4xx or 5xx), with its default exponential back-off (capped at 30 s) for as long as the server is unreachable, plus refetch on reconnect and on window focus, so "Retrying…" stays true. Mutations are never retried automatically — the user repeats the action. |
| Loading line | `{components.loading-line}`. While a load is pending and the server is reachable: nothing for the first 1 s; after 1 s, a quiet "Loading…" line where the list goes. Replaced by the list (180ms fade) when data arrives. Never a spinner or skeleton. Not shown for refetches after a mutation (the current list stays visible). |
| Inline edit row | Opened by Edit or E on an active task; replaces the row in place, title focused with cursor at end. Fields: title, description, due date-time (current value shown; presets and calendar available, nothing preselected). Enter saves from title or due controls; in the description, Enter saves and Shift+Enter inserts a newline. Esc discards all changes. Save sends only changed fields via `PATCH`; an emptied description is sent as cleared. An unchanged due date-time is never sent, so an overdue task's past date survives other edits. The AD-12 envelope has no field pointer, so every `validation_error` message appears in the row's one error slot above Cancel/Save, linked to every field in the row via `aria-describedby`; everything typed is kept. `state_conflict` and `not_found` go to the error toast. One edit row at a time; opening another discards the first. |
| Delete confirm | `{components.delete-confirm}`. Opened by the Delete button or ⌫ on a To do task only. Inline in the row, no dialog: the row's content becomes "Delete 'Pack bags'? This can't be undone." with Delete / Keep. Focus moves to Keep. Enter and Space always activate the **focused** button, so a reflexive Enter keeps the task. Deleting takes a deliberate action: a second ⌫, or Tab (or ←/→) to Delete and then Enter or Space. Esc or Keep restores the row unchanged with it still selected. Delete sends `DELETE`; while in flight both buttons are `aria-disabled`; on success the list refetches, the row disappears and "Deleted 'X'." is announced. Tab, ← and → cycle only between Delete and Keep while the confirm is open (Esc and Keep exit, and the description says so). One confirm at a time; clicking anywhere outside the row, or ⌘K, counts as Keep. No undo for delete. |

## Due Date-Time Entry

- Every task needs a due date-time; the add input always has one selected, so a title + Enter is a complete task.
- **Presets:** "Tomorrow 9:00 AM" and "Next Monday 9:00 AM", in browser local time. On a Monday, "Next Monday" is +7 days. "Tomorrow 9:00 AM" is preselected.
- **Roll-forward:** presets are relative labels resolved to an instant at submit time; a preset whose time has passed rolls forward to its next valid occurrence, so a preset never submits a past time.
- **Anything else:** the "Pick date…" chip opens the due popover (modal: focus is trapped inside until it closes): shadcn Calendar plus a time field (shadcn has no time picker; the field is a composed `type="time"` Input). The calendar opens on the current month with past days disabled. The time field defaults to 9:00 AM, or to the next full hour if today is chosen after 9:00 AM. In the calendar grid, Enter selects the focused day and moves focus to the time field; in the time field, Enter is "Set". "Set" closes the popover, the chip shows the chosen value, and focus returns to the add input (or the edit row's title); Esc closes without change and returns focus to the chip.
- **Past time:** a calendar day of today with a time already passed is sent like any other value; the API rejects it and its message ("That time has already passed.") appears in the add input's or edit row's error slot. The frontend does not pre-validate.
- **No natural-language parsing.** Text typed in the title is never interpreted as a date.
- **Display format** (browser time zone): "Yesterday, 5:00 PM" · "Today, 3:00 PM" · "Tomorrow, 9:00 AM" · weekday within the next 6 days ("Fri, 10:00 AM") · otherwise "Oct 12, 9:00 AM", with the year added when not the current year. These relative-day rules extend the examples in [key-main.html](./mockups/key-main.html).

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| No token | App open | Login only; nothing else reachable. |
| Token rejected | Any request except the login request | Client clears the token and routes to Login (AD-11). Silent: no message beyond the login screen itself. After login, the main list loads fresh (All view, Finished collapsed). |
| Cold load (fast) | Main list | No spinner or skeleton; the list region is empty until data arrives, then fades in over 180ms. |
| Cold load (slow but reachable) | Main list | Nothing for the first 1 s; then `{components.loading-line}` "Loading…" where the list goes, until data arrives and the list fades in. |
| Refetch after mutation | Main list | Current list stays visible until the new one arrives; rows re-render in place, no fade per row. |
| Empty | Main list | Empty state (see Component Patterns). |
| Overdue present | Active list | Overdue rows highlighted per `{components.task-row-overdue}` (`{colors.overdue}` on `{colors.overdue-tint}`); the API order puts them first. The highlight updates live, display only, while the page stays open: active rows are re-evaluated against the browser clock every minute and when the window regains focus, so a task whose due time passes gains the overdue treatment without a refetch. Limits: it only turns active rows (To do, In progress) with `due_at` before browser now into overdue; it never clears a server `is_overdue: true` and never touches finished rows. Small browser/server clock skew can make the highlight appear slightly early or late until the next fetch; this is accepted. The row's accessible name gains "overdue" silently (no announcement). It never re-sorts, filters, refetches or changes status; the API remains authoritative and the next fetch replaces the client's view. Covered by a Vitest fake-timer test. |
| Finished section collapsed (default each visit) | All view | Header only, count visible; finished rows not in the tab or arrow sequence. |
| Finished section expanded | All view | Finished rows below the header, Done with a checkmark, Cancelled struck through; reachable by ↓ from the last active row. |
| Delete confirm open | One To do row | Row shows the inline confirm; other rows and list shortcuts stay inert until Delete or Keep. ⌘K still works and counts as Keep. |
| Filter = Done / Cancelled | Main list | Plain list of that status, no section header. |
| Server unreachable | Global | `{components.connection-banner}` at the top; current content stays visible and interactive; failed actions leave the row unchanged. |
| Field error | Add input, inline edit | One error slot per form (under the add input; above Cancel/Save in the edit row); input kept. |
| Login error | Login | One error slot above Log in (`role="alert"`, linked to both fields via `aria-describedby`, both fields `aria-invalid`); username kept, password cleared. |
| Action error | Row actions, delete, undo | Error toast with the envelope message, announced; stays until dismissed. |
| Server error (5xx / unexpected) | Global | Error toast with the envelope message or "Something went wrong. Try again."; stays until dismissed. |
| Undo expired | Undo toast | API message replaces the `{colors.toast-action}` Undo link; toast fades. |
| Focus | All | Solid 2px `{colors.ring}` ring with 2px offset on every focusable element (`{colors.ring-on-toast}` on toasts). While the list has focus, the selected row carries the inset ring in every variant plus the `{colors.row-selected}` tint; when the list loses focus, the remembered selection keeps the tint only. |

## Interaction Primitives

**Keyboard map** (direction D's model on direction A's layout; see [design-directions.html](./mockups/design-directions.html)):

| Key | Action | Active when |
|---|---|---|
| ⌘K (Ctrl+K off macOS) | Focus the add-task input (counts as Keep if a delete confirm is open) | Global, including while typing elsewhere |
| Enter | Add the task; focus stays in the input | Add input focused |
| ↑ / ↓ | Move selection to previous / next row | Focus in the list |
| → / Tab | Move into the selected row's action buttons (← / Shift+Tab back) | Focus in the list |
| S | Start (To do → In progress) | Focus in list, To do row selected |
| B | Move back (In progress → To do) | Focus in list, In progress row selected |
| C | Complete | Focus in list, active row selected |
| X | Cancel | Focus in list, active row selected |
| E | Edit inline (Enter saves, Esc discards) | Focus in list, active row selected |
| ⌫ | Open the inline delete confirm (focus on Keep) | Focus in list, To do row selected |
| ⌫ (again) | Confirm Delete | Inline delete confirm open |
| Enter / Space | Activate the focused button (Keep, unless the user moved to Delete) | Inline delete confirm open |
| Z | Undo the most recent open Undo toast (when several are open) | An Undo toast is open (not pending) and focus is not in a text field |
| Alt+T | Move focus to the toast region (Sonner's default hotkey; the region is a landmark labelled "Notifications") | A toast is open |
| ? | Open the Shortcuts popover | Focus in the list |
| Esc | Close popover / edit row; Keep in the delete confirm; blur add input or description to the list / title | Context |

**Focus rules:**

- "Focus in the list" means DOM focus on the list grid or one of its descendants. Single-letter shortcuts (except Z, see the map) fire only then, never while typing in any input, textarea or popover.
- A key that doesn't apply to the selected row's status does nothing; it never sends a request.
- Every shortcut has a visible button equivalent (row action buttons, toast Undo link, the add input itself) and is listed in the Shortcuts popover.
- The list is one Tab stop into a `role="grid"` (one row per task; cell 1 holds title and status, cell 2 the action buttons); ↑/↓ move a roving selection. On first focus the first row is selected. Selection does not wrap. Clicking a row selects it and focuses the list.
- When the expanded Finished section is present, ↓ from the last active row continues into finished rows; finished rows accept no action keys.
- After an action, selection follows the task by ID if it is still visible in the current view; if it moved out of view (e.g. into Finished while filtered, or deleted), selection moves to the row that now occupies its old position.
- After the edit row closes (save or discard), focus returns to that row. After the delete confirm closes, focus returns to the list: on Keep the same row stays selected; on Delete the row now in its position is selected.
- In-flight controls use `aria-disabled`, never `disabled`, so focus never drops to the page body.
- When a toast that holds focus closes (Undo success, expiry, dismissal), focus returns to the list's selected row, or to the add input if the list is empty.
- The selected row is scrolled into view (`block: nearest`) on every selection change, and scroll padding keeps it clear of the toast stack (DESIGN.md Layout).
- Tab order: Shortcuts → Log out → filter tabs → add input → chips → "Add description" link (or textarea) → list → Finished header → open toasts' Undo links and close buttons.

**Mouse:** hover reveals row actions; click acts. No drag, no right-click menus, no double-click editing.

**Motion:** 180ms opacity fades only (row actions, list fade-in, "Loading…" line, delete-confirm swap, toast in/out). Nothing slides or grows. All motion off under `prefers-reduced-motion`: content swaps instantly, with no change to timings (the Undo countdown and the 1 s "Loading…" delay are unaffected).

## Accessibility Floor

Behavioural. Contrast lives in DESIGN.md Colors.

- WCAG 2.2 AA target. Fully keyboard-operable; every action reachable without a mouse.
- **Focus:** solid 2px ring with 2px offset on every focusable element (DESIGN.md Components → Focus ring), `{colors.ring-on-toast}` on toasts. The selected row shows the inset ring whenever the list has focus, in every variant; the tint is secondary, and selection is never only `aria-selected`.
- **Semantics:** `lang="en"`. Document titles "Log in — Todo" and "Today — Todo". `<h1>` "Today"; the Finished toggle is a button inside an `<h2>`, with `aria-expanded` and `aria-controls`. Decorative icons (plus, alert, chevron, calendar, status marks) are `aria-hidden`.
- **List:** `role="grid"` with an `aria-describedby` instruction (Voice and Tone), so screen readers switch to focus mode and the single-key shortcuts reach the app. Each row's accessible name has title, status (including "In progress", "Done", "Cancelled"), due date-time and "overdue" when applicable; each row and action button carries `aria-keyshortcuts` (e.g. `c` on Complete). The words "Done" / "Cancelled" stay visible in the Done and Cancelled filter views.
- **Labels:** every field has a programmatic label whose name contains any visible placeholder: add input "Add a task", description "Description", inline edit "Task title" / "Description" (visually hidden `<Label>`s); login "Username" / "Password" and the time field "Time" (visible). Calendar navigation keeps react-day-picker's built-in names.
- **Errors:** every error slot is `role="alert"` (announced once on appearance), linked from its field(s) via `aria-describedby`; the add input and login fields also take `aria-invalid`. Field errors are not additionally pushed through the polite live region.
- **Announcements (polite, one-shot):** Undo toast once on open, with the countdown `aria-hidden` so the ticking seconds are never read; the result once ("Restored 'X'." or the API's expired message); success messages for add, start, move back, save, delete and filter changes (Voice and Tone); the connection banner once on appear and "Reconnected." once on recovery; "Loading…" once. Error toasts are announced. Live overdue changes update the row's accessible name silently, and the selected row is not re-announced when its name changes.
- **Popovers** (due, Shortcuts) are Radix Popover with `modal` set: focus is trapped, Esc closes, focus returns to the trigger.
- **Delete confirm:** `role="group"`, `aria-labelledby` the question and `aria-describedby` "This can't be undone. Escape to keep."; announced when it opens; Tab stays within Delete and Keep until Delete, Keep or Esc.
- Overdue, Done and Cancelled are never conveyed by colour alone (DESIGN.md).
- Motion respects `prefers-reduced-motion`; theme respects `prefers-color-scheme`. Layout reflows at 400% zoom (DESIGN.md Layout).
- **Undo timing (accepted risk):** the 5-second window cannot be paused or extended and finished rows have no Reopen action, so the app does not meet WCAG 2.2 SC 2.2.1 (Timing Adjustable). This is recorded as an accepted risk in PRD FR-11. Mitigations: Z works whenever an Undo toast is open (focus not in a text field), Alt+T jumps to the toast region, and the opening announcement names the Z key.
- **Single-key shortcut off-switch (deferred):** single-key shortcuts fire only while focus is in the list (Focus rules). There is no off-switch: deferred, since there is one user and no settings surface. Revisit if the app gains other users (speech-input users dictating while the list has focus could trigger C or X; accessibility review L1).

## Key Flows

### Flow 1 — Benny plans his morning (UJ-1; 8:30, coffee in hand)

Screens: [key-login.html](./mockups/key-login.html), [key-main.html](./mockups/key-main.html), [key-add-expanded.html](./mockups/key-add-expanded.html).

1. Benny opens the app. His token has expired, so Login shows. He types username and password and presses Enter.
2. The main list fades in. "Submit report" sits at the top with the tint, left rule and "Overdue · Yesterday, 5:00 PM". He sees it before anything else.
3. He presses ↓ into the list (first row selected), then S. The request returns, the list refetches, and "Submit report" shows the half-filled In progress mark, still overdue.
4. He presses ⌘K. Focus jumps to the add input with "Tomorrow 9:00 AM" already selected.
5. He types "Call the dentist", clicks "Pick date…", picks Friday, sets 10:00 AM and presses Enter to set it; focus is back in the input, so a second Enter adds the task. The task lands in its sorted position; the input clears and keeps focus.
6. He types "Buy coffee beans", Enter. "Email landlord", Enter. Each lands at tomorrow 9:00 AM without touching the date.
7. **Climax:** three tasks added in under a minute without leaving the keyboard; the overdue report is started and the list already shows the order he'll work in.
8. Through the day he selects rows and presses C as he finishes them; each moves to Finished with an Undo toast.

Failure: the backend isn't running → the connection banner shows "Can't reach the server. Retrying…"; when it comes back the banner disappears and the list loads. A past time picked in step 5 → "That time has already passed." under the input, text kept.

### Flow 2 — Benny catches a mis-tap (UJ-2)

1. Benny hovers "Call the dentist" and clicks Complete, meaning to complete "Buy coffee beans".
2. The response arrives; the row leaves the active list (Finished, collapsed, counts one more), and the toast reads "Marked 'Call the dentist' done · Undo 5s".
3. **Climax:** two seconds in, he clicks Undo. The toast closes, the list refetches, and "Call the dentist" is back in its old place as To do.
4. He selects "Buy coffee beans" and presses C. It moves to Finished with its own toast, which he lets expire.

Failure: his Undo reaches the server after the window → the Undo link vanishes, the toast shows the API's expired message and fades; the task stays Done.

### Flow 3 — Benny cleans up (UJ-3)

1. The Lisbon trip is off. Benny selects "Book flights" (In progress) and presses X. It leaves the active list for Finished; "Cancelled 'Book flights' · Undo" shows and expires.
2. He selects "Pack bags" (To do) and presses ⌫. The row itself turns into "Delete 'Pack bags'? This can't be undone." with Delete / Keep, focus on Keep. He presses ⌫ again to confirm Delete (Tab to Delete and Enter would do the same). The row disappears after refetch.
3. He notices "Submit reprot", overdue since yesterday. He selects it and presses E. The row turns into the edit row with the title focused; the due chip shows "Yesterday, 5:00 PM".
4. He fixes the typo and presses Enter. Only the title is sent.
5. **Climax:** the row returns as "Submit report", still overdue, its date untouched — no forced reschedule to fix a typo.

Failure: he presses ⌫ on an In progress task → nothing happens (Delete isn't offered for that status). If the API still answers `state_conflict` for any action, the message shows in an error toast. He presses ⌫ on a To do task by mistake → focus is already on Keep; Esc, Keep or a reflexive Enter puts the row back unchanged.

### Flow 4 — Benny's Friday wrap-up (Friday, 5:30 PM)

1. Benny opens the app at the end of the week. The main list loads in the All view; the Finished section header reads "Finished (9)", collapsed as on every visit.
2. He clicks the header (or Tabs to it and presses Enter). It expands: the week's finished tasks in API order, Done ones with a checkmark, Cancelled ones muted and struck through, "Book flights" among them.
3. **Climax:** in one glance he sees what the week actually closed — what got done, what he chose to drop — with nothing to tidy and no counts or charts in the way.
4. He clicks the "In progress" tab. The list shows only the tasks still open in progress, as a plain list with no Finished section.
5. "Submit report" can wait until Monday. He selects it and presses B (or hovers and clicks Move back). The request returns, the list refetches, and it drops out of this filtered view; selection moves to the row now in its place.
6. He clicks "All". The full list returns with "Submit report" back among the To do tasks; the Finished section is still expanded for this visit. A reload, or Monday's first visit, will show it collapsed again.
7. He clicks Log out. The token is cleared and Login shows.

Failure: his 7-day session expired during the week → the first request (step 1, or any later action) answers `unauthenticated`; the token is cleared and he is routed to Login silently, with no error message. He logs in and lands on the main list (All view, Finished collapsed), then picks up from step 2. Any action he had attempted is not replayed; he repeats it.
