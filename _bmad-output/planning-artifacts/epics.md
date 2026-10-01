---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-bmad-first-project-2026-10-01/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-bmad-first-project-2026-10-01/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/briefs/brief-bmad-first-project-2026-10-01/brief.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/EXPERIENCE.md
---

# bmad-first-project - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for bmad-first-project (Todo App, BMad Method demo), decomposing the requirements from the PRD, the architecture spine and the final UX spines (DESIGN.md for visual identity, EXPERIENCE.md for behaviour) into implementable stories. Frontend stories implement the UX Design Requirements (UX-DR) below; on any conflict with a mockup, the spines win.

## Requirements Inventory

### Functional Requirements

FR1: The user can log in with the pre-created account's credentials. Valid credentials start an authenticated session; invalid credentials are rejected as unauthenticated without revealing which part was wrong.
FR2: The user can log out, and sessions expire on their own. After logout, the old session is rejected as unauthenticated. A session expires 7 days after login, regardless of activity.
FR3: Every task operation requires authentication. Unauthenticated requests to any task endpoint are rejected and return no task data.
FR4: The user can create a task with a title (required, not blank after trimming, max 200 characters), an optional description (max 5,000 characters) and a required due date-time that is not earlier than the current server time (no tolerance). The client cannot set the status; a new task is always To do.
FR5: The user can edit the title, description and due date-time of an active task. Editing a finished task is a state conflict. The FR4 limits apply; the due date-time cannot be removed. The past-date check runs only when the due date-time changes to a different instant; other fields of an overdue task can be edited. Moving an overdue task into the future clears its overdue state. Editing cannot change the status.
FR6: The user can delete a To do task permanently (no undo). Deleting an In progress, Done or Cancelled task is a state conflict.
FR7: The user can start a To do task, moving it to In progress.
FR8: The user can move an In progress task back to To do.
FR9: The user can mark a To do or In progress task Done; this records its finished time and previous status and opens the undo window.
FR10: The user can cancel a To do or In progress task; this records its finished time and previous status and opens the undo window.
FR11: The user can undo marking Done or Cancelled within 5 seconds of the finished time (inclusive, no grace). The task returns to its previous status. Undo after the window, or on a task without an open window, is a state conflict that says the window has expired. Undo is the only action allowed in the window (no Done↔Cancelled switch). Re-finishing opens a new window. The frontend shows an Undo control for 5 seconds after marking Done or Cancelled, then hides it.
FR12: Finished tasks are immutable. Any edit, delete or status change on a finished task, other than an in-window undo, is a state conflict. Every disallowed transition in PRD §4.3 (both ❌ and "—" cells) is rejected by the API, never silently ignored.
FR13: The user can view all active tasks ordered by due date-time (earliest first), then In progress before To do, then created time (earliest first), then ID (ascending). The order is identical on every request.
FR14: Every task carries an overdue indicator, true exactly when the task is active and its due date-time is before the current server time; finished tasks are never overdue. The frontend visually highlights overdue tasks.
FR15: The user can view finished tasks in a separate collapsible section below active tasks, ordered by finished time (most recent first), then created time (newest first), then ID (ascending). The collapsed state is not remembered between visits.
FR16: The user can filter the list to one status or view All (default: active tasks above the finished section). A single-status filter shows only that status, in its All-view order; Done or Cancelled filters show no separate section. The filter is not remembered between visits.
FR17: Any client can retrieve one task by ID, including its overdue indicator. A nonexistent ID returns not found.
FR-X (cross-cutting, PRD §4.2): any task operation on a nonexistent task ID returns not found.

### NonFunctional Requirements

NFR1: Frontend independence. The API exposes every capability and enforces every rule itself; the frontend only presents data. The API publishes an OpenAPI contract.
NFR2: Consistent errors. Failures fall into documented categories (unauthenticated, validation error, state conflict, not found), each with a human-readable message.
NFR3: Time handling. The server clock is the single source of "now" for past-date validation, the overdue indicator and the undo window. Date-times on the wire include a UTC offset; the frontend shows them in the browser's time zone.
NFR4: Performance. With up to 1,000 tasks, operations respond in under 300 ms on the author's laptop with a local database (manual sanity check, not a load test).
NFR5: Security. Passwords are never stored in plain text; credentials and session tokens never appear in logs, or in responses other than the login response that issues the token.
NFR6: Testability. Every FR consequence is covered by an automated test. Time-dependent rules are tested without real waiting (controllable clock). Frontend-only behaviour is covered by component or end-to-end tests.

### Additional Requirements

From the architecture spine (AD-1 to AD-15). **No starter template:** the project is scaffolded by hand on the existing uv package (Epic 1, Story 1).

- AR1 (AD-1): Light hexagonal layout under `src/bmad_first_project/` (`domain/`, `application/`, `adapters/http/`, `adapters/persistence/`) with `main.py` and `cli.py` as the only composition roots; an import-boundary test in `tests/architecture/` enforces dependency direction and AD-4.
- AR2 (AD-2): All value rules and the transition table live only in the domain; HTTP schemas check shape only with `extra="forbid"`. Domain errors: `DomainValidationError`, `StateConflictError` (optional `reason`), `NotFoundError`, `UnauthenticatedError`. Action endpoints are not idempotent.
- AR3 (AD-3): One `now` per request from a request-scoped dependency reading the `Clock` port; `datetime.now()` only in the clock adapter (Ruff `DTZ` and banned-API rule); all datetimes aware UTC; no database or ORM time defaults.
- AR4 (AD-4): SQLModel/SQLAlchemy only in `adapters/persistence/`; a `UTCDateTime` type decorator re-attaches UTC on read; separate HTTP schemas.
- AR5 (AD-5): Alembic owns the schema; migrations run explicitly (`uv run alembic upgrade head`); app refuses to start if the schema is behind; `env.py` takes its URL from `config.attributes["url"]` or `Settings`; one `make_engine` turns on SQLite foreign keys; per-test file databases under `tmp_path`.
- AR6 (AD-6): Login via OAuth2 password form at `POST /api/auth/token` returning `secrets.token_urlsafe(32)`; `sessions` stores SHA-256 token hash and `expires_at = now + 7 days`; `authenticate` use case checks `now < expires_at`; logout deletes the row; pwdlib Argon2 for passwords only; `create-account` CLI creates or updates the single account and deletes all sessions.
- AR7 (AD-7): Action endpoints `POST /api/tasks/{id}/start|reopen|complete|cancel|undo`; `PATCH /api/tasks/{id}` edits only title, description, due_at with defined omit/null semantics.
- AR8 (AD-8): Task stores `previous_status` and `finished_at`; server-only undo window; frontend Undo timer starts on response receipt and lives in an app-level store keyed by task ID.
- AR9 (AD-9): Use cases return `TaskView(task, is_overdue)`; routers never read the Clock; no overdue column.
- AR10 (AD-10): `GET /api/tasks?status=` returns display order; ordering only in the domain; repositories return unordered lists; frontend never re-sorts.
- AR11 (AD-11): Generated client via `@hey-api/openapi-ts` with TanStack Query plugin; operation IDs from route function names; one client module in `frontend/src/api/` with `localStorage` token and 401 handling; ESLint bans `fetch`/`axios`; no optimistic updates (invalidate and refetch).
- AR12 (AD-12): One error envelope `{"error": {"code", "message", "reason"?}}`, declared in OpenAPI; Starlette 401/404/405 wrapped; ID range rules; error precedence: unauthenticated > shape validation > not found > state conflict > value validation.
- AR13 (AD-13): ISO 8601 with offset in (naive rejected), UTC `Z` out.
- AR14 (AD-14): Canonical Task fields and one `TaskResponse` for every single-task endpoint; list returns a bare array; DELETE and logout return 204.
- AR15 (AD-15): `TaskRepository` port (`get`, `add`, `save`, `delete`, `list`), no field updates, never commits/orders/raises; request-scoped `UnitOfWork` owns commit and rollback.
- AR16 (Conventions): Default DB `./data/app.db` (gitignored); config via pydantic-settings; `[project.scripts]` placeholder replaced by `create-account`; local run with Uvicorn :8000 and Vite :5173 proxying `/api`; pinned stack versions (SQLAlchemy 2.0.54, TypeScript 6.0.3, Node ≥ 22.18).

### UX Design Requirements

From the final UX spines in `_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/` (DESIGN.md = visual, EXPERIENCE.md = behaviour; both `status: final`). "D §" cites DESIGN.md, "E §" cites EXPERIENCE.md. The spines win over any mockup.

**Foundation and voice**

- UX-DR1 (Theme tokens and design system): The frontend uses shadcn/ui (Radix + Tailwind). The Graphite Hush palette is mapped onto shadcn semantic tokens exactly as listed in DESIGN.md `colors` (light values unsuffixed, dark values `-dark`); light or dark follows the OS via `prefers-color-scheme`, with no in-app toggle. The system UI font stack replaces shadcn's Geist (monospace only for keyboard hints); radii are 10px controls, 12px surfaces, full for chips. Vermilion (`overdue`, `toast-action`) appears only on overdue cues and the Undo link, never on errors, Delete or the banner. *(D §Colors, §Typography, §Shapes; E §Foundation)* → Story 1.3
- UX-DR2 (Fluid layout): One centred column, `width: 100%` up to 640px with a 16px gutter each side on `background`; the login card is `width: 100%` up to 360px. No breakpoints and no mobile layout; component heights are minimums, never fixed. The page reflows at 400% zoom with no horizontal scroll (SC 1.4.10, 1.4.12). The connection banner spans the full viewport width above the column. *(D §Layout & Spacing)* → Stories 1.3, 1.6, 2.5, 2.6
- UX-DR3 (Voice and single wording source): Copy is plain, short and calm: full sentences end with a full stop, no exclamation marks, no emoji, no "successfully"; task titles are quoted in single quotes. API error messages are written in this voice and the frontend shows them as written, never rewording, mapping or duplicating them. Only strings no API response carries (placeholders, empty states, toasts, banner, delete confirm, "Loading…", announcements, and the fallback "Something went wrong. Try again." for 5xx or responses with no envelope `message`) live in the frontend. *(E §Voice and Tone)* → Stories 1.1, 1.3, 1.5, 2.1, 2.3, 3.3 (backend wording); 1.6, 2.5, 2.6, 3.5 (shown as written)

**Task list**

- UX-DR4 (Task row and status variants): Row anatomy left to right: 18px status mark (`aria-hidden`) · title · optional labels · due time (muted `row-meta`). To do: empty-circle mark. In progress: half-filled mark in `in-progress` plus a small muted "In progress" label after the title (an overdue In progress row shows "In progress", then the overdue icon and label). Done: finished size (min 50px), title and mark in `finished`, checkmark mark, the word "Done" in place of the due time. Cancelled: as Done plus a 1px title strikethrough, dashed-circle mark and the word "Cancelled". Status is never conveyed by colour alone. *(D §Components → Task row)* → Stories 2.5 (To do), 3.5 (In progress), 3.6 (Done, Cancelled)
- UX-DR5 (Overdue cues and live display): An overdue row has the `overdue-tint` background, a 3px inset left rule in `overdue`, the mark in `overdue`, a 14px alert icon plus the word "Overdue" (`overdue-label`, 600) and the due time in `overdue`. While the page is open, active rows are re-evaluated against the browser clock every minute and on window focus, display only: the check only turns active rows with `due_at` before browser now into overdue, never clears a server `is_overdue: true`, never touches finished rows, and never re-sorts, filters, refetches or changes status; the accessible name gains "overdue" silently. *(D §Components → Task row, Overdue; E §State Patterns, Overdue present)* → Story 2.5
- UX-DR6 (Long-title clamp): In the list a title wraps to two lines and is clipped at the end of the second (`line-clamp: 2`, trailing ellipsis), never a single-line ellipsis; the selected row (focused or not) shows the full title and grows to fit; the accessible name and the inline edit row always carry the full title. When the row is narrow, labels and due time wrap under the title. *(D §Components → Task row, Title; D §Layout & Spacing; E §Component Patterns, Task row)* → Story 2.5
- UX-DR7 (Due display format): Due date-times render in the browser's time zone as "Yesterday, 5:00 PM" · "Today, 3:00 PM" · "Tomorrow, 9:00 AM" · weekday within the next 6 days ("Fri, 10:00 AM") · otherwise "Oct 12, 9:00 AM", with the year added when not the current year. *(E §Due Date-Time Entry, Display format)* → Story 2.5
- UX-DR8 (Row actions reveal): Hover (`row-hover`) reveals the status's actions as ghost `row-action-button`s (min 26px) at the right edge, replacing the due time; selection reveals them too but keeps the due time visible, shifted left; 180ms fade. Actions: To do Start · Complete · Cancel · Edit · Delete; In progress Move back · Complete · Cancel · Edit; Done / Cancelled none. Each button has a tooltip naming its key ("Complete (C)") and `aria-keyshortcuts`. While a row's request is in flight its actions are `aria-disabled` (focusable, activation ignored). *(D §Components → Task row, Hover/Selected; E §Component Patterns, Task row)* → Stories 2.6 (Edit, Delete), 3.5 (status actions)

**Adding tasks**

- UX-DR9 (Add-task input): Min 48px, `input` outline, plus icon (`aria-hidden`), placeholder "Add a task", `kbd-hint` "⌘K" unfocused / "Enter" focused. Enter submits title + selected due + description (if expanded and non-empty). On success: title clears, focus stays, due resets to "Tomorrow 9:00 AM", list refetches, task appears in its sorted position. On error: the envelope message appears in the single error slot under the input and everything typed is kept. The frontend does no pre-validation (a blank title is sent to the API). Esc blurs the input to the list. *(D §Components → Add-task input; E §Component Patterns, Add-task input)* → Story 2.5
- UX-DR10 (Presets and "Pick date…" popover): Chips "Tomorrow 9:00 AM" (preselected) · "Next Monday 9:00 AM" (on a Monday, +7 days) · "Pick date…", exactly one selected (ink fill), resolved in browser local time at submit; a preset whose time has passed rolls forward to its next valid occurrence. "Pick date…" opens a modal Radix Popover: shadcn Calendar (current month, past days disabled) plus a `type="time"` Input with a visible "Time" label, defaulting to 9:00 AM or the next full hour if today is chosen after 9:00 AM, and a primary "Set". Enter on a day moves focus to the time field; Enter in the time field is Set; Set closes the popover, shows the value in the chip ("Oct 12, 9:00 AM") and returns focus to the add input (or edit-row title); Esc closes without change, focus to the chip. No natural-language date parsing. *(D §Components → Add-task input, Due popover; E §Due Date-Time Entry)* → Stories 2.5, 2.6 (edit row reuse)
- UX-DR11 (Add description): A caption-style text link "Add description" under the chip row (min 24px target). Click, Enter or Space replaces it with a 3-row textarea (placeholder "Description (optional)") and focuses it. In the textarea Enter submits the task, Shift+Enter inserts a newline, Esc returns focus to the title with text kept; it stays open while it has text, and after a successful add it clears and collapses back to the link. Collapsed on every visit. *(D §Components → Add description link, Description textarea; E §Component Patterns, Add description link)* → Story 2.5

**Filtering and finished tasks**

- UX-DR12 (Status filter): Radix Tabs above the add input: All · To do · In progress · Done · Cancelled, as text tabs (inactive muted; active `foreground` with a 1.5px underline; no pills, no counts). Selecting a tab requests `GET /api/tasks?status=…` (All omits it) and shows the returned tasks as a plain list with no Finished section for any single-status filter. Default All; not remembered. The change is announced ("In progress: 3 tasks" or "No tasks here."). *(D §Components → Status filter; E §Component Patterns, Status filter)* → Story 3.6
- UX-DR13 (Finished section): In the All view only, a header button inside an `<h2>` (`aria-expanded`, `aria-controls`, chevron `aria-hidden`, min 24px) reading "Finished (n)". Starts collapsed on every visit (load, reload, new login); within a visit it keeps the last state, including across filter changes; never persisted. Collapsed rows are outside the Tab and arrow sequence; expanded rows are reached by ↓ from the last active row and accept no action keys. *(D §Components → Finished section header; E §Component Patterns, Finished section header; E §State Patterns)* → Story 3.6

**Feedback surfaces**

- UX-DR14 (Undo toast): Opens on a Complete or Cancel success response: "Marked 'X' done · Undo" / "Cancelled 'X' · Undo" with a visible seconds countdown (`aria-hidden`, tabular figures), open exactly 5 s from that moment; hover and focus do not pause it. State lives in one app-level store keyed by task ID (refetches and filter changes don't remove it). Undo by click, Enter on the focused link, or Z; once sent the link is `aria-disabled` and dimmed to 60%, repeat activations are ignored, and the toast stays until the response even past 5 s. Success: toast closes, list refetches, "Restored 'X'." announced. `undo_window_expired`: link and countdown removed, the API message shown and announced, toast fades after 3 s (that fade pauses while hovered or focused). Opening announcement: "Marked 'X' done. Undo available for 5 seconds, press Z." Several toasts may be open (one per task), stacked with 8px gaps, newest at the bottom. *(D §Components → Undo toast; E §Component Patterns, Undo toast; E §Voice and Tone)* → Story 3.5
- UX-DR15 (Error toast): Same surface and position as the Undo toast; shows the envelope `message` as written (or "Something went wrong. Try again." for 5xx or no envelope message) for action, delete, undo and edit-save errors other than `validation_error` (`state_conflict`, `not_found`) and for 5xx or unexpected responses. A 24×24 close button with accessible name "Dismiss"; it stays until dismissed and never fades on a timer; it is announced; it never uses `toast-action`. *(D §Components → Error toast; E §Component Patterns, Error toast)* → Stories 1.3 (5xx plumbing), 2.6, 3.5
- UX-DR16 (Connection banner and retry policy): A request failing at the network level shows a full-width 32px line "Can't reach the server. Retrying…" (muted caption, bottom border, no icon, no colour), announced once; it disappears on the next successful response with "Reconnected." announced once. TanStack Query retries only network errors (never 4xx or 5xx) with default exponential back-off capped at 30 s for as long as the server is unreachable, plus refetch on reconnect and window focus; mutations are never retried automatically. Current content stays visible and interactive; failed actions leave the row unchanged. *(D §Components → Connection banner; E §Component Patterns, Connection banner)* → Stories 1.3 (policy), 2.5 (banner)
- UX-DR17 (Loading line and cold load): A fast cold load shows no spinner or skeleton; the list fades in over 180ms. A load still pending after 1 s (server reachable) shows a single muted "Loading…" line where the list goes, announced once, replaced by the list's fade-in. Not shown for refetches after a mutation (the current list stays visible). *(D §Components → Loading line; E §Component Patterns, Loading line; E §State Patterns)* → Story 2.5
- UX-DR18 (Empty states): All view with no active tasks: a card in the list position with a 44px outlined ring, "Nothing due. Enjoy the quiet." and "Type above when something comes up." (the Finished section still renders below if it has tasks). A filtered view that returns nothing: "No tasks here." *(D §Components → Empty state; E §Component Patterns, Empty state; E §Voice and Tone)* → Stories 2.5, 3.6

**Editing and deleting**

- UX-DR19 (Inline edit row with single error slot): Opened by Edit or E on an active task; replaces the row in place, title focused with the cursor at the end. Fields: title (38px Input), description textarea, due control (same chips and popover, current value in the third chip, nothing preselected), ghost "Cancel" (`kbd-hint` "Esc") and primary "Save" (`kbd-hint` "↵"). Enter saves from title or due controls; in the description Enter saves and Shift+Enter inserts a newline; Esc discards. Save sends only changed fields via `PATCH`; an emptied description is sent as cleared; an unchanged due date-time is never sent; no "clear due date" control. Every `validation_error` message appears in one error slot directly above Cancel/Save, `role="alert"`, linked to every field via `aria-describedby`, with everything typed kept; `state_conflict` and `not_found` go to the error toast. One edit row at a time; opening another discards the first. *(D §Components → Inline edit row; E §Component Patterns, Inline edit row)* → Story 2.6
- UX-DR20 (Inline delete confirm): Opened by Delete or ⌫ on a To do row only; the row keeps its 58px height, takes `row-selected`, and shows "Delete 'X'?" + "This can't be undone." with "Delete" (ink `destructive`, `kbd-hint` "⌫") and "Keep" (outline). Focus moves to Keep; Enter and Space always activate the focused button. Deleting needs a second ⌫, or Tab / ← / → to Delete then Enter or Space. Tab, ← and → cycle only between the two buttons; Esc, Keep, a click outside the row, or ⌘K count as Keep and restore the row still selected. `role="group"`, `aria-labelledby` the question, `aria-describedby` "This can't be undone. Escape to keep.", announced on open. In flight both buttons are `aria-disabled`; on success the list refetches, the row disappears and "Deleted 'X'." is announced. Other rows and list shortcuts are inert while open; one confirm at a time; no undo. *(D §Components → Delete confirm; E §Component Patterns, Delete confirm; E §Accessibility Floor)* → Story 2.6

**Keyboard**

- UX-DR21 (Keyboard map): ⌘K (Ctrl+K off macOS) focuses the add input, globally; Enter adds (focus stays); ↑/↓ move the selection; → / Tab enter the selected row's actions (← / Shift+Tab back); S start; B move back; C complete; X cancel; E edit inline; ⌫ open delete confirm, ⌫ again confirm; Z undo the most recent open, non-pending Undo toast whenever one is open and focus is not in a text field; Alt+T moves focus to the toast region (landmark "Notifications"); ? opens the Shortcuts popover; Esc closes popover / edit row, keeps in the confirm, blurs the add input. Single-letter keys (except Z) fire only when focus is in the list grid, never while typing; a key that doesn't apply to the selected row's status does nothing and sends no request; every shortcut has a visible button equivalent. *(E §Interaction Primitives, Keyboard map, Focus rules)* → Stories 2.5 (⌘K, ↑/↓, Esc), 2.6 (E, ⌫), 3.5 (S, B, C, X, Z, Alt+T, ?)
- UX-DR22 (Focus rules): The list is one Tab stop; on first focus the first row is selected; selection does not wrap; clicking a row selects it and focuses the list. After an action, selection follows the task by ID if still visible, otherwise moves to the row now in its old position. After the edit row closes, focus returns to that row; after the delete confirm closes, focus returns to the list (same row on Keep, the row in its position on Delete). When a focused toast closes, focus returns to the selected row, or to the add input if the list is empty. In-flight controls use `aria-disabled`, never `disabled`. The selected row is scrolled into view (`block: nearest`) with `scroll-padding-bottom` keeping it clear of the toast stack (SC 2.4.11). Tab order: Shortcuts → Log out → filter tabs → add input → chips → "Add description" → list → Finished header → open toasts' controls. *(E §Interaction Primitives, Focus rules; D §Layout & Spacing)* → Stories 2.5, 2.6, 3.5, 3.6
- UX-DR23 (Shortcuts popover): A ghost "Shortcuts" button immediately left of Log out opens a modal Radix Popover listing every key in the keyboard map, each as a `kbd-hint` beside its action; ? opens it when focus is in the list; focus is trapped, Esc closes and returns focus to the trigger; never open at the same time as the due popover. *(D §Components → Shortcuts; E §Interaction Primitives; E §Accessibility Floor, Popovers)* → Story 3.5

**Login and header**

- UX-DR24 (Login card and session states): Login card centred, fluid up to 360px, 32px padding: app name (heading style), Username (`autocomplete="username"`) and Password (`autocomplete="current-password"`) with visible labels, full-width primary "Log in"; paste and password managers allowed; Enter in either field submits; Log in is `aria-disabled` in flight, no spinner. Invalid credentials: the API message in one error slot above Log in (`role="alert"`, linked to both fields via `aria-describedby`, both fields `aria-invalid`), username kept, password cleared; the login request is exempt from the global `unauthenticated` handler. Header: `<h1>` "Today", today's date, ghost Log out at the right of the heading row. Token rejection is silent; after (re-)login the list loads fresh (All view, Finished collapsed); attempted actions are not replayed. Log out always clears the token locally, even if the request fails; open toasts are dropped on logout or token rejection. *(D §Components → Login card, Log out; E §Component Patterns, Login card, Log out; E §State Patterns; reconcile F8, F9)* → Stories 1.3 (401 exemption), 1.6

**Accessibility floor**

- UX-DR25 (Focus ring): Every focusable element shows one solid 2px `ring` at 100% opacity with a 2px offset in the colour of the surface behind (overriding shadcn's `ring-ring/50`); toast controls use `ring-on-toast` on `toast-background`. While the list has focus the selected row carries a 2px inset ring in every variant (To do, In progress, overdue, Done, Cancelled, delete confirm, edit row) plus the `row-selected` tint (overdue rows keep their tint and rule); when the list loses focus the remembered selection keeps the tint only. Selection is never only `aria-selected` or tint. *(D §Components → Focus ring, Task row Selected; E §State Patterns, Focus; E §Accessibility Floor)* → Stories 1.3 (global ring), 2.5 (row selection), 3.5 (toast ring)
- UX-DR26 (Grid semantics and accessible names): The list is `role="grid"` (one row per task; cell 1 title and status, cell 2 actions) with `aria-describedby` pointing at "Use arrow keys to move, S start, B move back, C complete, X cancel, E edit, Backspace delete, Z undo." Each row's accessible name has the full title, status ("To do", "In progress", "Done", "Cancelled"), due date-time and "overdue" when applicable; rows and action buttons carry `aria-keyshortcuts`. The words "Done" / "Cancelled" stay visible in the Done and Cancelled filter views. *(E §Accessibility Floor, List)* → Stories 2.5, 3.5, 3.6
- UX-DR27 (Labels and document semantics): `lang="en"`; document titles "Log in — Todo" and "Today — Todo"; `<h1>` "Today". Every field has a programmatic label containing any visible placeholder: add input "Add a task", description "Description", inline edit "Task title" / "Description" (visually hidden), login "Username" / "Password" and the time field "Time" (visible). Decorative icons (plus, alert, chevron, calendar, status marks) are `aria-hidden`. Every error slot is `role="alert"` and linked from its field(s) via `aria-describedby`; the add input and login fields also take `aria-invalid`. *(E §Accessibility Floor, Semantics, Labels, Errors)* → Stories 1.3, 1.6, 2.5, 2.6
- UX-DR28 (Live announcements): One polite live region, one-shot: success messages "Added 'X', due Tomorrow, 9:00 AM." · "Started 'X'." · "Moved 'X' back to To do." · "Saved." · "Deleted 'X'." · filter changes; Undo toast once on open (countdown never read) and its result once; the connection banner once on appear and "Reconnected." once on recovery; "Loading…" once; error toasts announced. Field errors are announced by their `role="alert"` slot only, not also through the live region; live overdue changes are silent. *(E §Accessibility Floor, Announcements; E §Voice and Tone)* → Stories 2.5, 2.6, 3.5, 3.6
- UX-DR29 (Motion and reduced motion): Motion is 180ms opacity fades only (row actions, list fade-in, "Loading…" line, delete-confirm swap, toast in/out); nothing slides or grows. Under `prefers-reduced-motion` all motion is off and content swaps instantly, with no change to timings (Undo countdown, 1 s "Loading…" delay, 3 s expired fade unaffected). *(E §Interaction Primitives, Motion; D §Brand & Style)* → Stories 1.3, 2.5
- UX-DR30 (Target size): Every interactive target is at least 24px high, including inline text targets ("Add description", the Undo link, the toast close button, the Finished header, preset chips); row action and delete-confirm buttons are at least 26px. *(D §Layout & Spacing; DESIGN `spacing.min-target`)* → Stories 1.3 (token), 2.5, 2.6, 3.5, 3.6
- UX-DR31 (Undo timing accepted risk): The 5-second Undo window cannot be paused or extended and finished rows have no Reopen action, so the app does not meet WCAG 2.2 SC 2.2.1 (Timing Adjustable). This is a documented accepted risk (PRD FR-11), not a defect to fix; the mitigations are Z whenever an Undo toast is open, Alt+T to the toast region, and an opening announcement that names the Z key. *(E §Accessibility Floor, Undo timing; PRD FR-11)* → Story 3.5

### FR Coverage Map

FR1: Epic 1 - Log in with the pre-created account
FR2: Epic 1 - Log out; 7-day absolute session expiry
FR3: Epic 1 - Every task route requires authentication
FR4: Epic 2 - Create a task (title, description, due date-time, To do)
FR5: Epic 2 - Edit an active task's fields
FR6: Epic 2 - Delete a To do task
FR7: Epic 3 - Start a task
FR8: Epic 3 - Move an In progress task back to To do
FR9: Epic 3 - Mark a task Done
FR10: Epic 3 - Cancel a task
FR11: Epic 3 - Undo within 5 seconds; frontend Undo control
FR12: Epic 3 - Finished tasks immutable; disallowed transitions rejected
FR13: Epic 2 - Active tasks in urgency order
FR14: Epic 2 - Overdue indicator and highlighting
FR15: Epic 3 - Collapsible finished section
FR16: Epic 3 - Filter by status
FR17: Epic 2 - Retrieve one task
FR-X: Epic 2 - Not found for any operation on a nonexistent task ID (extended by Epic 3 action endpoints)

**UX-DR coverage:** UX-DR1 → 1.3 · UX-DR2 → 1.3, 1.6, 2.5, 2.6 · UX-DR3 → 1.1, 1.3, 1.5, 1.6, 2.1, 2.3, 2.5, 2.6, 3.3, 3.5 · UX-DR4 → 2.5, 3.5, 3.6 · UX-DR5 → 2.5 · UX-DR6 → 2.5 · UX-DR7 → 2.5 · UX-DR8 → 2.6, 3.5 · UX-DR9 → 2.5 · UX-DR10 → 2.5, 2.6 · UX-DR11 → 2.5 · UX-DR12 → 3.6 · UX-DR13 → 3.6 · UX-DR14 → 3.5 · UX-DR15 → 1.3, 2.6, 3.5 · UX-DR16 → 1.3, 2.5 · UX-DR17 → 2.5 · UX-DR18 → 2.5, 3.6 · UX-DR19 → 2.6 · UX-DR20 → 2.6 · UX-DR21 → 2.5, 2.6, 3.5 · UX-DR22 → 2.5, 2.6, 3.5, 3.6 · UX-DR23 → 3.5 · UX-DR24 → 1.3, 1.6 · UX-DR25 → 1.3, 2.5, 3.5 · UX-DR26 → 2.5, 3.5, 3.6 · UX-DR27 → 1.3, 1.6, 2.5, 2.6 · UX-DR28 → 2.5, 2.6, 3.5, 3.6 · UX-DR29 → 1.3, 2.5 · UX-DR30 → 1.3, 2.5, 2.6, 3.5, 3.6 · UX-DR31 → 3.5

## Epic List

### Epic 1: Secure access to my own app
I can create my account from the command line, log in through the web app, stay logged in for up to 7 days, and log out with immediate effect. Every task route is protected. Includes the project scaffold (no starter template).
**FRs covered:** FR1, FR2, FR3

### Epic 2: Capture and manage my tasks
I can add tasks with a due date-time, see them in urgency order with overdue tasks highlighted, open, edit and delete them: a working todo list.
**FRs covered:** FR4, FR5, FR6, FR13, FR14, FR17, FR-X

### Epic 3: Work through tasks to done, with a safety net
I can start, move back, complete or cancel tasks, undo a mistake within 5 seconds, see finished tasks in their own collapsible section, and filter by status.
**FRs covered:** FR7, FR8, FR9, FR10, FR11, FR12, FR15, FR16

## Epic 1: Secure access to my own app

I can create my account from the command line, log in through the web app, stay logged in for up to 7 days, and log out with immediate effect. Every task route is protected. The epic starts by scaffolding the project, because there is no starter template.

### Story 1.1: Backend structure and guard rails

As the developer,
I want a runnable FastAPI backend laid out in the agreed hexagonal structure, with its guard rails in place,
So that every later story builds on the same boundaries, clock and error format.

**Acceptance Criteria:**

**Given** the existing uv package `src/bmad_first_project`
**When** the skeleton is created
**Then** it has `domain/`, `application/`, `adapters/http/`, `adapters/persistence/`, `main.py` (with `create_app()`) and `cli.py`, with dependencies pinned to the spine's Stack versions (including SQLAlchemy 2.0.54 and python-multipart)
**And** the placeholder `bmad-first-project` script in `[project.scripts]` is removed, and `data/` is added to `.gitignore` (AR1, AR16)

**Given** the import-boundary test in `tests/architecture/`
**When** any module in `domain/` or `application/` imports FastAPI, SQLModel, SQLAlchemy or an adapter, or an adapter imports another adapter, or SQLModel/SQLAlchemy is imported outside `adapters/persistence/`
**Then** the test fails, and only `main.py` and `cli.py` may import adapters (AR1, AR4)

**Given** Ruff is configured with `DTZ` and a banned-API rule
**When** `datetime.now()` or `time.time()` is used anywhere except the system clock adapter
**Then** linting fails (AR3)

**Given** the `Clock` port, a system clock adapter and a request-scoped `now` dependency
**When** a request is handled
**Then** the Clock is read exactly once, and the value is timezone-aware UTC (AR3)

**Given** the HTTP adapter's exception handlers
**When** a request hits an unknown route, uses a wrong method, or fails request validation
**Then** the response uses the envelope `{"error": {"code", "message"}}` with `not_found` (404), `method_not_allowed` (405) or `validation_error` (422), and `ErrorResponse` appears in the OpenAPI schema (AR12, NFR2)
**And** OpenAPI operation IDs are the route function names (AR11)

**Given** the domain error types `DomainValidationError`, `StateConflictError` (with optional `reason`), `NotFoundError` and `UnauthenticatedError`
**When** one is raised while a request is handled
**Then** the single exception-handler module maps it to `validation_error` (422), `state_conflict` (409, carrying `reason`), `not_found` (404) or `unauthenticated` (401) in the envelope (AR2, AR12)

**Given** the message-voice convention, documented in the exception-handler module and followed by every later story
**When** any error envelope is produced
**Then** its `message` is a plain, short, calm sentence ending with a full stop: no exclamation marks, no emoji, no "successfully", no codes, stack traces or field paths, and it is written to be shown to the user as is, because the frontend never rewords it (NFR2, UX-DR3)

**Given** a request that fails FastAPI/Pydantic request validation (for example a missing field, a malformed datetime or an extra field)
**When** the request-validation handler builds the envelope
**Then** `message` is one fixed calm generic sentence defined in the handler, never Pydantic's default text (such as "Field required" or "Input should be a valid datetime"), and no Pydantic error detail appears in the response (AR12, NFR2, UX-DR3)
**And** the 404 and 405 envelopes for unknown routes and wrong methods also carry calm fixed sentences, and a test asserts the exact strings (NFR6)

**Given** the backend
**When** `uv run uvicorn bmad_first_project.main:create_app --factory` runs
**Then** the server starts on port 8000 and serves its OpenAPI schema (AR16)

### Story 1.2: Database and test harness

As the developer,
I want the SQLite database, migrations and per-test databases set up the agreed way,
So that every later story persists data and tests it without schema drift or timezone bugs.

**Acceptance Criteria:**

**Given** `make_engine(url)`, the `UTCDateTime` type decorator and an Alembic setup whose `env.py` takes its URL from `config.attributes["url"]` or `Settings`
**When** `uv run alembic upgrade head` runs against the default `./data/app.db`
**Then** it succeeds with a baseline migration that creates no tables, and SQLite foreign keys are on (AR4, AR5, AR16)

**Given** a value written through `UTCDateTime`
**When** it is read back
**Then** a round-trip test shows it is timezone-aware UTC with microseconds preserved (AR4)

**Given** the database schema is behind the latest migration
**When** `create_app()` starts
**Then** it refuses to start with a clear message (AR5)

**Given** a request-scoped `UnitOfWork`
**When** a use case succeeds or raises
**Then** it commits or rolls back respectively, and nothing else commits (AR15)

**Given** a test fixture
**When** an API test runs
**Then** it gets a fresh file database under `tmp_path`, migrated with its URL and injected through the engine dependency override, plus a fake Clock injected through dependency overrides (AR5, NFR6)
**And** the app never calls `create_all` (AR5)

### Story 1.3: Frontend skeleton with generated API client

As the developer,
I want a React app that talks to the backend only through a client generated from its OpenAPI contract,
So that frontend and backend can never silently drift apart.

**Acceptance Criteria:**

**Given** `frontend/` created with Vite, React and TypeScript at the spine's pinned versions (TypeScript 6.0.3, Node ≥ 22.18)
**When** `npm run dev` runs
**Then** the app is served on port 5173, and requests to `/api` are proxied to the backend on port 8000 (AR16)

**Given** `@hey-api/openapi-ts` (exact pinned version) with its TanStack Query plugin
**When** the generate script runs against the backend's OpenAPI schema
**Then** the client is written to `frontend/src/client/`, and the folder is marked as generated and never edited by hand (AR11)

**Given** `frontend/src/api/`
**When** the app starts
**Then** it configures the single client instance with the origin as base URL (no extra `/api` prefix) and a TanStack Query provider (AR11)

**Given** ESLint is configured
**When** any file outside `frontend/src/client/` uses `fetch` or imports `axios`
**Then** linting fails (AR11)

**Given** shadcn/ui and Tailwind are set up in `frontend/`
**When** the app renders in a browser whose OS is set to light, then to dark
**Then** the shadcn semantic CSS variables take the DESIGN.md `colors` values (unsuffixed for light, `-dark` for dark) switched only by `prefers-color-scheme`, with no in-app toggle; the font is the DESIGN.md system UI stack (Geist removed); radii are 10px (`DEFAULT`) and 12px (`lg`); and the Button, Input, Textarea, Tabs, Popover, Calendar, Label and Sonner toast components are installed unchanged except for token mapping (UX-DR1)

**Given** any focusable element in the app shell
**When** it receives keyboard focus
**Then** it shows a solid 2px `ring` at 100% opacity with a 2px offset in the colour of the surface behind it, overriding shadcn's `ring-ring/50`, and the shared tokens include `min-target` 24px used as the minimum height of every interactive target (UX-DR25, UX-DR30)

**Given** the app shell
**When** it renders at any viewport width, including at 400% browser zoom
**Then** content sits in one centred column `width: 100%` up to 640px with a 16px gutter on `background`, there are no breakpoints, component heights are minimums, there is no horizontal page scroll, the document has `lang="en"`, and a toast region (Sonner) is mounted bottom centre as a landmark labelled "Notifications" (UX-DR2, UX-DR27)

**Given** the shared motion utility
**When** an element fades in or out
**Then** it uses a 180ms opacity fade only, and under `prefers-reduced-motion` the change is instant with no change to any timer (UX-DR29)

**Given** the TanStack Query client in `frontend/src/api/`
**When** a request fails
**Then** queries are retried only on network-level failures (never on 4xx or 5xx), with the default exponential back-off capped at 30 s and no attempt limit while the server is unreachable, plus refetch on reconnect and on window focus; mutations are never retried automatically (AR11, UX-DR16)

**Given** the global `unauthenticated` handler in the client module
**When** any request except `POST /api/auth/token` returns `unauthenticated`
**Then** the token is cleared and the app routes to Login; the login request is exempt, so its 401 envelope is passed to the login form instead of resetting it (AR11, UX-DR24)

**Given** a response that is a 5xx or carries no envelope `message`
**When** the shared error helper reads it
**Then** it yields "Something went wrong. Try again." and shows it in an error toast that stays until dismissed; for envelope responses it yields the envelope `message` exactly as written, never reworded or mapped (NFR2, UX-DR3, UX-DR15)

**Given** Vitest and Playwright are installed
**When** their sample tests run
**Then** both pass, and Playwright can start against the local dev servers (NFR6)
**And** component tests cover the retry policy (network error retried, 4xx/5xx and mutations not retried), the login-request 401 exemption and the 5xx fallback (NFR6)

### Story 1.4: Create the account from the command line

As the app's owner,
I want to create my single account, or change its password, with one command,
So that the app is protected without needing a sign-up screen.

**Acceptance Criteria:**

**Given** a migrated database with no account
**When** I run `uv run create-account` and enter a username and password
**Then** a migration-created `account` table holds one row with the username and an Argon2 hash from pwdlib, and the plain password is stored nowhere (AR6, NFR5)

**Given** an account already exists
**When** I run `create-account` again
**Then** the existing account's password is updated, and no second account is created (AR6)

**Given** `create-account` runs
**When** it writes to the database
**Then** it uses the same unit-of-work pattern and Clock reading as the app, and passwords never appear in logs or output (AR3, AR15, NFR5)
**And** `[project.scripts]` defines `create-account = "bmad_first_project.cli:create_account"` (AR16)

### Story 1.5: Log in and log out through the API

As the app's owner,
I want to log in with my credentials and get a session that lasts 7 days, and to log out with immediate effect,
So that only I can use my tasks, and logging out really locks the door.

**Acceptance Criteria:**

**Given** the account exists
**When** I send valid credentials to `POST /api/auth/token` (OAuth2 password form)
**Then** I receive a `secrets.token_urlsafe(32)` token, and a migration-created `sessions` table stores only its SHA-256 hash with `expires_at = now + 7 days` (FR1, AR6)

**Given** a wrong username or password
**When** I request a token
**Then** I get `unauthenticated` (401) with the message exactly "That username and password don't match.", identical for an unknown username and a wrong password, so it gives no hint which part was wrong (FR1, AR12, UX-DR3)

**Given** a valid token
**When** a protected route is called with `Authorization: Bearer <token>`
**Then** the `authenticate` use case accepts it while `now < expires_at`, using the request's single `now` (FR2, AR3, AR6)

**Given** a fake clock set to exactly login time + 7 days or later
**When** the same token is used
**Then** the request is rejected as `unauthenticated` (FR2, NFR6)

**Given** a missing, malformed or unknown bearer token
**When** a protected route is called
**Then** the response is the envelope with `unauthenticated` (401) and a calm fixed sentence per the Story 1.1 voice convention, not FastAPI's default `{"detail": ...}` (FR3, AR12, UX-DR3)
**And** this is verified with a protected test-only route, and the auth dependency is the one every task route will use (FR3)

**Given** I am logged in
**When** I call `POST /api/auth/logout`
**Then** it returns 204, the session row is deleted, and the old token is rejected afterwards (FR2, AR6, AR14)

**Given** sessions exist
**When** `create-account` is run again
**Then** all sessions are deleted (AR6)
**And** tokens never appear in logs or in any response other than the token response (NFR5)

### Story 1.6: Log in and out in the web app

As the app's owner,
I want a login screen and a logout button in the web app,
So that I can get into my app from the browser and leave it safely.

**Acceptance Criteria:**

**Given** I am not logged in
**When** I open the app
**Then** I see the login screen (document title "Log in — Todo"), and nothing else is reachable
**And** the login card is centred, `width: 100%` up to 360px with 32px padding, and shows the app name in the heading style, Username (`autocomplete="username"`) and Password (`autocomplete="current-password"`) fields with visible labels, and a full-width primary "Log in" button; paste and password managers work, and the card reflows at 400% zoom with no horizontal scroll (UX-DR2, UX-DR24, UX-DR27)

**Given** the login screen
**When** I submit valid credentials (Log in, or Enter in either field)
**Then** Log in is `aria-disabled` while the request is in flight, with no spinner; the token is stored under one `localStorage` key, the client attaches it to every request, and I see the main screen (document title "Today — Todo") with `<h1>` "Today", today's date beneath it and a ghost "Log out" button at the right of the heading row, loaded fresh (All view; once Epic 3 exists, Finished collapsed) (FR1, AR11, UX-DR24, UX-DR27)

**Given** invalid credentials
**When** I submit the form
**Then** I stay on the login screen; the API's message ("That username and password don't match.") appears as written in the single error slot above Log in, `role="alert"`, linked to both fields via `aria-describedby`, with both fields `aria-invalid`; the username is kept and the password is cleared (FR1, NFR2, UX-DR3, UX-DR24, UX-DR27)
**And** the global `unauthenticated` handler does not reset the form, because the login request is exempt from it (AR11, UX-DR24)

**Given** I am logged in
**When** I click Log out
**Then** the app calls logout, clears the token and shows the login screen; the token is cleared locally even if the logout request fails (for example, server unreachable), and any open toasts are dropped (FR2, UX-DR24)

**Given** a stored token that the API rejects (for example after expiry)
**When** any request other than login returns `unauthenticated`
**Then** the client clears the token, drops any open toasts and routes to the login screen silently, with no error message; the attempted action is not replayed after re-login (FR2, AR11, UX-DR24)
**And** a Playwright test covers log in → main screen → log out, and invalid credentials keeping the username and clearing the password (NFR6)

## Epic 2: Capture and manage my tasks

I can add tasks with a due date-time, see them in urgency order with overdue tasks highlighted, open, edit and delete them: a working todo list. Every task is To do in this epic; the status workflow arrives in Epic 3.

### Story 2.1: Create a task through the API

As the app's owner,
I want to add a task with a title, an optional description and a due date-time,
So that I capture what I need to do and when.

**Acceptance Criteria:**

**Given** I am authenticated
**When** I send `POST /api/tasks` with a valid title, optional description and a future `due_at` with an offset
**Then** I get 201 with a `TaskResponse` (`id`, `title`, `description`, `due_at`, `status`, `created_at`, `finished_at`, `is_overdue`), status `to_do`, `created_at` equal to the request's `now`, and `due_at` returned in UTC with `Z` (FR4, AR13, AR14)
**And** a migration-created `tasks` table stores the task with the AD-14 columns, written through the `TaskRepository` port and the unit of work (AR14, AR15)

**Given** a title that is blank after trimming, or longer than 200 code points after trimming, or a description longer than 5,000 code points
**When** I create the task
**Then** I get `validation_error` (422) from the domain, and the stored title is the trimmed value when valid (FR4, AR2)
**And** each rule has its own fixed calm message defined in the domain per the Story 1.1 voice convention (one for a blank title, one for a title over 200 characters, one for a description over 5,000 characters), and tests assert the exact strings (NFR2, UX-DR3)

**Given** a missing `due_at`, a naive `due_at` without an offset, or a `due_at` earlier than the request's `now` (even by one microsecond)
**When** I create the task
**Then** I get `validation_error` (422) (FR4, AR13, NFR3)
**And** a past `due_at` returns the message exactly "That time has already passed."; a missing or naive `due_at` returns the calm generic request-validation message from Story 1.1 (NFR2, UX-DR3)

**Given** a request body that includes `status` or any other unknown field
**When** I create the task
**Then** I get `validation_error` (422) because schemas forbid extra fields (FR4, AR2, AR7)

**Given** no valid bearer token
**When** I call `POST /api/tasks`
**Then** I get `unauthenticated` (401) and nothing is created (FR3)
**And** domain unit tests cover every rule with an explicit `now`, with no real waiting (NFR6)

### Story 2.2: View my tasks in urgency order through the API

As the app's owner,
I want to fetch my task list in urgency order, with overdue tasks flagged, and to fetch any single task,
So that I always know what to do next.

**Acceptance Criteria:**

**Given** I am authenticated and have tasks
**When** I call `GET /api/tasks`
**Then** I get a bare JSON array of `TaskResponse`, with active tasks ordered by `due_at` ascending, then In progress before To do, then `created_at` ascending, then `id` ascending (FR13, AR10, AR14)
**And** the ordering function lives in the domain, the repository returns tasks unordered, and domain tests cover every tie-break level, including the In progress rule, by building tasks directly (AR10, NFR6)

**Given** a task whose `due_at` is before the request's `now`
**When** it is returned by any endpoint
**Then** `is_overdue` is `true`; otherwise it is `false`, computed by the domain in a `TaskView` with the request's single `now`, and never stored (FR14, AR9)

**Given** I am authenticated
**When** I call `GET /api/tasks/{id}` for an existing task
**Then** I get 200 with its `TaskResponse` including `is_overdue` (FR17)

**Given** an ID that does not exist, or an integer outside the 64-bit range
**When** I call `GET /api/tasks/{id}`
**Then** I get `not_found` (404); a non-integer ID gets `validation_error` (422) (FR17, FR-X, AR12)

**Given** no valid bearer token
**When** I call either endpoint
**Then** I get `unauthenticated` (401) and no task data (FR3)

**Given** 1,000 tasks in a local database
**When** I list them on the author's laptop
**Then** the response takes under 300 ms (manual check, recorded in the story's notes) (NFR4)

### Story 2.3: Edit a task through the API

As the app's owner,
I want to change a task's title, description or due date-time,
So that my list stays accurate as plans change.

**Acceptance Criteria:**

**Given** an active task
**When** I send `PATCH /api/tasks/{id}` with any subset of `title`, `description`, `due_at`
**Then** only the sent fields change, omitted fields stay as they were, and I get 200 with the updated `TaskResponse` (FR5, AR7, AR14)

**Given** a PATCH with `description: null` or `""`
**When** it is applied
**Then** the description is cleared and stored as `null` (AR7)

**Given** a PATCH with `title: null`, `due_at: null`, an invalid title or description, or any field other than the three allowed (including `status`)
**When** it is applied
**Then** I get `validation_error` (422), and the task is unchanged (FR5, AR2, AR7)
**And** an invalid title or description returns the same fixed calm message as on create (Story 2.1), and a shape error returns the calm generic request-validation message from Story 1.1 (NFR2, UX-DR3)

**Given** an overdue task
**When** I edit only its title, or resend its existing `due_at` as the same instant in a different UTC offset
**Then** the edit succeeds and the past `due_at` is kept, because the past-date check runs only when `due_at` changes to a different instant (FR5)

**Given** an overdue task
**When** I change `due_at` to another past instant
**Then** I get `validation_error` (422) with the message exactly "That time has already passed."; changing it to a future instant succeeds and `is_overdue` becomes `false` (FR5, FR14, UX-DR3)

**Given** a nonexistent task ID, or no valid bearer token
**When** I send the PATCH
**Then** I get `not_found` (404) or `unauthenticated` (401) respectively, following the AD-12 precedence (FR-X, FR3, AR12)
**And** a domain unit test shows that editing a Done or Cancelled task raises `StateConflictError`, ready for Epic 3's API tests (FR5, FR12)

### Story 2.4: Delete a task through the API

As the app's owner,
I want to delete a task I created by mistake,
So that my list only holds real work.

**Acceptance Criteria:**

**Given** a To do task
**When** I call `DELETE /api/tasks/{id}`
**Then** I get 204, the task is permanently removed, and a later `GET` returns `not_found` (FR6, AR14)

**Given** a nonexistent task ID, or no valid bearer token
**When** I call `DELETE`
**Then** I get `not_found` (404) or `unauthenticated` (401) respectively (FR-X, FR3)
**And** a domain unit test shows that deleting an In progress, Done or Cancelled task raises `StateConflictError`, ready for Epic 3's API tests (FR6)

### Story 2.5: See and add tasks in the web app

As the app's owner,
I want my main screen to show my tasks in urgency order and let me add new ones quickly,
So that I can plan my day from the browser.

**Acceptance Criteria:**

**Given** I am logged in
**When** the main screen loads
**Then** it shows the tasks in exactly the order the API returns, with no client-side sorting, in one bordered list card inside the fluid 640px column (FR13, AR10, UX-DR2)
**And** each row shows, left to right, an `aria-hidden` empty-circle status mark, the title and the due date-time in the browser's time zone in the UX format ("Yesterday, 5:00 PM", "Today, 3:00 PM", "Tomorrow, 9:00 AM", "Fri, 10:00 AM" within 6 days, otherwise "Oct 12, 9:00 AM", plus the year when not the current year) (NFR3, UX-DR4, UX-DR7)

**Given** a task with `is_overdue: true`
**When** it is shown
**Then** it has the `overdue-tint` background, a 3px left rule in `overdue`, the mark in `overdue`, an `aria-hidden` alert icon plus the word "Overdue" and the due time in `overdue`, so overdue is never shown by colour alone, and the row's accessible name includes "overdue" (FR14, UX-DR5, UX-DR26)

**Given** the page stays open and an active task's due time passes in the browser clock
**When** the minute tick or a window focus re-evaluates active rows
**Then** that row gains the overdue treatment and "overdue" in its accessible name silently, without a refetch, re-sort, filter or status change; a server `is_overdue: true` is never cleared and finished rows are never touched (FR14, NFR1, UX-DR5)
**And** a Vitest fake-timer test covers the live promotion and its limits (NFR6)

**Given** a title longer than two lines at the current width
**When** the row is shown unselected
**Then** the title is clipped at the end of the second line with a trailing ellipsis (`line-clamp: 2`), the labels and due time wrap under it rather than collide, and the accessible name carries the full title; when the row is selected (focused or not) the full title shows and the row grows to fit (UX-DR6)

**Given** the add-task input (placeholder "Add a task", label "Add a task", `aria-hidden` plus icon, `kbd-hint` "⌘K" unfocused and "Enter" focused) with the chips "Tomorrow 9:00 AM" (preselected), "Next Monday 9:00 AM" and "Pick date…" beneath it
**When** I type a title and press Enter
**Then** the task is created through the generated client with the selected due date-time resolved in browser local time at submit, the task list query is invalidated and refetched (no optimistic insert), and the new task appears in its sorted position (FR4, AR11, UX-DR9, UX-DR10)
**And** the title clears, focus stays in the input, the due selection resets to "Tomorrow 9:00 AM", and "Added 'X', due Tomorrow, 9:00 AM." (with the actual due) is announced politely (UX-DR9, UX-DR28)

**Given** a preset chip is selected
**When** I submit and its label is resolved to an instant in browser local time
**Then** "Next Monday 9:00 AM" on a Monday resolves to +7 days, and a preset whose time has already passed at submit rolls forward to its next valid occurrence, so a preset never submits a past time (UX-DR10)

**Given** I activate "Pick date…"
**When** the due popover opens
**Then** it is a modal Radix Popover (focus trapped) with a shadcn Calendar on the current month with past days disabled, a `type="time"` field with a visible "Time" label defaulting to 9:00 AM (or the next full hour if today is chosen after 9:00 AM) and a primary "Set" button; the date-time picker therefore starts at or after the current time (UX-DR10, UX-DR27)
**And** Enter on a day moves focus to the time field, Enter in the time field is Set, Set closes the popover, shows the value in the third chip (e.g. "Oct 12, 9:00 AM") and returns focus to the add input; Esc closes it without change and returns focus to the chip (UX-DR10)

**Given** the "Add description" link under the chip row
**When** I click it or press Enter or Space on it
**Then** it is replaced by a 3-row textarea (placeholder "Description (optional)", label "Description") with focus in it; Enter submits the whole task, Shift+Enter inserts a newline, Esc returns focus to the title with the text kept; it stays open while it has text and, after a successful add, clears and collapses back to the link with focus back in the title (FR4, UX-DR11, UX-DR27)

**Given** the API rejects the new task (including a blank title or "That time has already passed." for a past time)
**When** the error comes back
**Then** the envelope message appears as written in the input's single error slot under it (`role="alert"`, linked via `aria-describedby`, input `aria-invalid`), and everything I typed is kept; the frontend does no pre-validation and sends a blank title to the API like any other value (NFR1, NFR2, UX-DR3, UX-DR9, UX-DR27)

**Given** the main screen
**When** I press ⌘K (Ctrl+K off macOS) from anywhere, or Esc in the add input
**Then** ⌘K focuses the add input, and Esc blurs it and moves focus to the list (UX-DR21)

**Given** the task list
**When** I Tab into it
**Then** it is a single Tab stop into a `role="grid"` (one row per task; cell 1 title and status, cell 2 actions) with `aria-describedby` pointing at the instruction "Use arrow keys to move, S start, B move back, C complete, X cancel, E edit, Backspace delete, Z undo."; the first row is selected; ↑/↓ move the selection without wrapping; clicking a row selects it and focuses the list (UX-DR21, UX-DR22, UX-DR26)
**And** while the list has focus the selected row carries a 2px inset `ring` plus the `row-selected` tint (overdue rows keep their tint and rule), and when the list loses focus it keeps the tint only; the selected row is scrolled into view (`block: nearest`) on every selection change (UX-DR22, UX-DR25)
**And** each row's accessible name has the full title, status, due date-time and "overdue" when applicable (UX-DR26)

**Given** the All view has no active tasks
**When** the main screen loads
**Then** a card in the list position shows a 44px outlined ring, "Nothing due. Enjoy the quiet." and "Type above when something comes up." instead of a blank list (UX-DR18)

**Given** a cold load
**When** the data arrives within 1 s
**Then** no spinner or skeleton shows and the list fades in over 180ms; when the load is still pending after 1 s and the server is reachable, a single muted "Loading…" line appears where the list goes, is announced once and is replaced by the list; it never shows for refetches after a mutation (UX-DR17, UX-DR28, UX-DR29)

**Given** a request fails at the network level
**When** the server is unreachable
**Then** a full-width line "Can't reach the server. Retrying…" appears above the column, announced once; current content stays visible and interactive; on the next successful response it disappears and "Reconnected." is announced once (UX-DR16, UX-DR28)

**Given** `prefers-reduced-motion` is set
**When** the list, "Loading…" line or row content changes
**Then** content swaps instantly with no fade, and the 1 s "Loading…" delay is unchanged (UX-DR29)

**Given** the main screen at 400% browser zoom
**When** it renders
**Then** it reflows into the single column with no horizontal scroll, and every interactive target (chips, "Add description" link, add input) is at least 24px high (UX-DR2, UX-DR30)
**And** a Playwright test covers adding a task by title + Enter and with "Pick date…", and seeing it in the list; component tests cover overdue highlighting, the two-line clamp, preset roll-forward, the 1 s "Loading…" delay (fake timers) and the connection banner (NFR6)

### Story 2.6: Edit and delete tasks in the web app

As the app's owner,
I want to edit or delete a task from the main screen,
So that I can fix mistakes without leaving the app.

**Acceptance Criteria:**

**Given** an active task row
**When** I hover it or select it
**Then** its Edit action (and Delete, on a To do row) fades in (180ms) as ghost buttons at least 26px high at the right edge, replacing the due time on hover and keeping the due time visible, shifted left, on selection; each button has a tooltip naming its key ("Edit (E)", "Delete (⌫)") and `aria-keyshortcuts`; finished rows offer neither (FR5, FR6, UX-DR8, UX-DR30)

**Given** an active task is selected with focus in the list
**When** I press E or activate Edit
**Then** the row is replaced in place by the inline edit row, with the title Input (visually hidden label "Task title") focused and the cursor at the end, a description textarea (label "Description"), the due control showing the current value in the third chip with presets and the "Pick date…" popover available and nothing preselected, ghost "Cancel" (`kbd-hint` "Esc") and primary "Save" (`kbd-hint` "↵"); there is no "clear due date" control, and opening another edit row discards the first (FR5, UX-DR10, UX-DR19, UX-DR21, UX-DR27)

**Given** the inline edit row is open
**When** I change the title, description or due date-time and save (Save, Enter in the title or due controls, or Enter in the description, where Shift+Enter inserts a newline)
**Then** only the changed fields are sent with `PATCH`; an unchanged due date-time is never sent, so an overdue task's past date survives other edits; the list is refetched, the task moves to its new sorted position if its due date-time changed, focus returns to that row with selection following it by ID, and "Saved." is announced (FR5, AR7, AR11, UX-DR19, UX-DR22, UX-DR28)

**Given** I clear the description field
**When** I save
**Then** the description is sent as cleared and is cleared (AR7, UX-DR19)

**Given** the inline edit row is open
**When** I press Esc or activate Cancel
**Then** all changes are discarded and focus returns to the row (UX-DR19, UX-DR22)

**Given** the API rejects a save with `validation_error` (for example "That time has already passed.")
**When** the error comes back
**Then** the envelope message appears as written in the row's single error slot directly above Cancel/Save, `role="alert"`, linked to every field in the row via `aria-describedby`, and everything I typed is kept (NFR2, UX-DR3, UX-DR19, UX-DR27)

**Given** the API rejects an edit or a delete with `state_conflict` or `not_found`, or answers with a 5xx
**When** the error comes back
**Then** the envelope message (or "Something went wrong. Try again.") appears as written in an error toast with a 24×24 "Dismiss" close button; it is announced and stays until dismissed (NFR2, UX-DR15)

**Given** a To do task is selected with focus in the list
**When** I press ⌫ or activate Delete
**Then** the row's content becomes the inline confirm "Delete 'X'?" / "This can't be undone." with "Delete" (ink, `kbd-hint` "⌫") and "Keep" (outline), keeping the row's 58px height, in a `role="group"` labelled by the question and described by "This can't be undone. Escape to keep.", announced on open; focus moves to Keep, and other rows and list shortcuts stay inert until it closes (FR6, UX-DR20, UX-DR21)

**Given** the inline delete confirm is open with focus on Keep
**When** I press Enter or Space, Esc, activate Keep, click outside the row or press ⌘K
**Then** the row is restored unchanged and still selected, and focus returns to the list (⌘K then focuses the add input); Enter and Space always activate the focused button, so a reflexive Enter keeps the task (UX-DR20, UX-DR22)

**Given** the inline delete confirm is open
**When** I press ⌫ a second time, or move to Delete with Tab, ← or → (which cycle only between Delete and Keep) and press Enter or Space
**Then** `DELETE` is sent with both buttons `aria-disabled` while in flight; on success the list refetches, the row disappears, the row now in its position is selected, and "Deleted 'X'." is announced; there is no undo (FR6, UX-DR20, UX-DR22, UX-DR28)

**Given** an In progress or finished task is selected
**When** I press ⌫ (or E on a finished task)
**Then** nothing happens and no request is sent (FR6, UX-DR21)

**Note (reconcile F6, accepted):** a task's description is visible only inside the inline edit row; the list row shows no description and no indicator that one exists. This is a deliberate decision under SM-C1 (no extra features), not a gap to fill in this story.

**Given** the edit row and delete confirm
**When** they render at 400% zoom
**Then** they reflow without horizontal scroll and every button is at least 24px high (UX-DR2, UX-DR30)
**And** a Playwright test covers editing a task (only changed fields sent), deleting a task with a second ⌫ and with Tab to Delete + Enter, and a reflexive Enter keeping the task; a component test covers the edit row's single error slot (NFR6)

## Epic 3: Work through tasks to done, with a safety net

I can start, move back, complete or cancel tasks, undo a mistake within 5 seconds, see finished tasks in their own collapsible section, and filter by status.

### Story 3.1: Start a task and move it back through the API

As the app's owner,
I want to mark a task as started, and move it back if I started it by mistake,
So that my list shows what I'm actually working on.

**Acceptance Criteria:**

**Given** a To do task
**When** I call `POST /api/tasks/{id}/start`
**Then** I get 200 with a `TaskResponse` whose status is `in_progress` (FR7, AR7, AR14)

**Given** an In progress task
**When** I call `POST /api/tasks/{id}/reopen`
**Then** I get 200 with status `to_do` (FR8, AR7)

**Given** an In progress task
**When** I call `/start` again, or call `/reopen` on a To do task (the "—" cells)
**Then** I get `state_conflict` (409), never a silent 200 (FR12, AR2)

**Given** an In progress task
**When** I call `DELETE /api/tasks/{id}`
**Then** I get `state_conflict` (409) and the task remains (FR6)

**Given** two active tasks with the same `due_at`, one In progress and one To do
**When** I list tasks
**Then** the In progress task comes first (FR13)

**Given** a nonexistent ID, or no valid bearer token
**When** I call either action
**Then** I get `not_found` (404) or `unauthenticated` (401) respectively (FR-X, FR3)

### Story 3.2: Complete or cancel a task through the API

As the app's owner,
I want to mark a task done or cancelled, after which it can't be changed,
So that my record of finished and abandoned work stays honest.

**Acceptance Criteria:**

**Given** a To do or In progress task
**When** I call `POST /api/tasks/{id}/complete` or `/cancel`
**Then** I get 200 with status `done` or `cancelled`, `finished_at` equal to the request's `now` and `is_overdue: false`, and the stored `previous_status` is the status it had before (`previous_status` is not in the response) (FR9, FR10, FR14, AR8, AR14)

**Given** a Done or Cancelled task
**When** I call `PATCH`, `DELETE`, `/start`, `/reopen`, `/complete` or `/cancel` on it (including switching directly between Done and Cancelled)
**Then** every call returns `state_conflict` (409) and the task is unchanged (FR5, FR6, FR11, FR12)

**Given** a PATCH on a Done task with an invalid title
**When** it is applied
**Then** I get `state_conflict` (409), because state conflicts outrank value validation errors (AR12)

**Given** active and finished tasks
**When** I list tasks
**Then** active tasks come first in FR13 order, followed by finished tasks ordered by `finished_at` descending, then `created_at` descending, then `id` ascending (FR15, AR10)

**Given** a nonexistent ID, or no valid bearer token
**When** I call either action
**Then** I get `not_found` (404) or `unauthenticated` (401) respectively (FR-X, FR3)

### Story 3.3: Undo completing or cancelling through the API

As the app's owner,
I want 5 seconds to undo marking a task done or cancelled,
So that a mis-tap doesn't permanently lock the wrong task.

**Acceptance Criteria:**

**Given** a task completed or cancelled at time T
**When** I call `POST /api/tasks/{id}/undo` with the fake clock at T + 5 seconds or earlier (boundary inclusive)
**Then** I get 200, the task returns to its previous status (`to_do` or `in_progress`), and `finished_at` and `previous_status` are cleared (FR11, AR8)

**Given** the same task
**When** I call `/undo` with the fake clock at T + 5 seconds + 1 microsecond or later
**Then** I get `state_conflict` (409) with `reason: "undo_window_expired"` and a fixed calm message, per the Story 1.1 voice convention, saying plainly that the undo window has expired (for example "Too late to undo. The task stays finished."); the frontend shows it in the Undo toast as written, and a test asserts the exact string (FR11, AR8, AR12, UX-DR3)

**Given** an active task (no open undo window)
**When** I call `/undo`
**Then** I get `state_conflict` (409) with the same calm undo-expired message (FR11, UX-DR3)

**Given** a task that was undone
**When** I complete or cancel it again
**Then** a new 5-second undo window opens from the new `finished_at` (FR11)

**Given** a nonexistent ID, or no valid bearer token
**When** I call `/undo`
**Then** I get `not_found` (404) or `unauthenticated` (401) respectively (FR-X, FR3)
**And** all window tests use the fake clock, with no real waiting (NFR6)

### Story 3.4: Filter tasks by status through the API

As the app's owner,
I want to ask for only the tasks with one status,
So that I can focus on one part of my list.

**Acceptance Criteria:**

**Given** tasks in all four statuses
**When** I call `GET /api/tasks?status=<status>` with `to_do`, `in_progress`, `done` or `cancelled`
**Then** I get only tasks with that status, in the order that status uses in the unfiltered list (FR16, AR10)

**Given** no `status` parameter
**When** I list tasks
**Then** I get all tasks, as in the All view (FR16)

**Given** an unknown status value
**When** I list tasks
**Then** I get `validation_error` (422) (AR10)

### Story 3.5: Move tasks through their statuses in the web app, with Undo

As the app's owner,
I want buttons to start, move back, complete and cancel tasks, and an Undo control right after finishing one,
So that I can work through my day and recover from mis-taps in the browser.

**Acceptance Criteria:**

**Given** a task in the list
**When** I hover or select it
**Then** it reveals the actions for its status (To do: Start, Complete, Cancel, Edit, Delete; In progress: Move back, Complete, Cancel, Edit; finished: none) as ghost buttons at least 26px high, each with a tooltip naming its key ("Start (S)", "Move back (B)", "Complete (C)", "Cancel (X)") and `aria-keyshortcuts`. This is presentation only; the API stays the authority (FR7–FR10, NFR1, UX-DR8, UX-DR30)

**Given** an In progress task
**When** it is shown
**Then** it has the half-filled mark in `in-progress` and a small muted "In progress" label after the title (an overdue In progress row shows "In progress", then the overdue icon and label), and its accessible name includes "In progress" (FR7, UX-DR4, UX-DR26)

**Given** a task is selected with focus in the list grid (never while typing in an input, textarea or popover)
**When** I press S, B, C or X
**Then** it starts, moves back, completes or cancels the task exactly like the matching button; a key that doesn't apply to the row's status does nothing and sends no request (FR7–FR10, UX-DR21)

**Given** I trigger an action
**When** the request is in flight
**Then** that row's actions are `aria-disabled` (still focusable, activation ignored) (UX-DR8, UX-DR22)

**Given** I trigger an action
**When** the API succeeds
**Then** the list is refetched (no optimistic update), the task appears in its new position or section, a one-shot message is announced ("Started 'X'." / "Moved 'X' back to To do."), and selection follows the task by ID if it is still visible, otherwise moves to the row now in its old position (AR11, UX-DR22, UX-DR28)

**Given** the API answers an action or Undo with `state_conflict` or `not_found`, or with a 5xx
**When** the error comes back
**Then** the envelope message (or "Something went wrong. Try again.") is shown as written in an error toast with a "Dismiss" close button, announced, and it stays until dismissed (NFR2, UX-DR3, UX-DR15)

**Given** I complete or cancel a task
**When** the success response arrives
**Then** an Undo toast opens at the bottom centre reading "Marked 'X' done · Undo" or "Cancelled 'X' · Undo" with a visible seconds countdown (`aria-hidden`), open for exactly 5 seconds from that moment, then it disappears; hover and focus do not pause it; its state lives in one app-level store keyed by task ID, so a list refetch or filter change doesn't remove it (FR11, AR8, UX-DR14)
**And** "Marked 'X' done. Undo available for 5 seconds, press Z." (or "Cancelled 'X'. Undo available for 5 seconds, press Z.") is announced once, and the ticking countdown is never read (UX-DR14, UX-DR28)

**Given** one or more Undo toasts are open (one per task, stacked upward with 8px gaps, newest at the bottom)
**When** I click Undo, press Enter on the focused Undo link, or press Z while focus is not in a text field (Z acts on the most recent open, non-pending toast)
**Then** `/undo` is sent; the link becomes `aria-disabled` and dimmed to 60%, repeat activations are ignored, and the toast stays pending until the response even past 5 seconds (FR11, UX-DR14, UX-DR21)

**Given** an Undo request is pending
**When** the API succeeds
**Then** the toast closes, the list refetches, the task returns to its previous status and position, "Restored 'X'." is announced, and if the toast held focus, focus returns to the list's selected row (or to the add input if the list is empty) (FR11, UX-DR14, UX-DR22, UX-DR28)

**Given** I send Undo but the API answers `undo_window_expired`
**When** the error comes back
**Then** the Undo link and countdown are removed, the API message is shown as written and announced once, and the toast fades after 3 seconds; that fade timer pauses while the toast is hovered or focused (FR11, AR8, UX-DR3, UX-DR14)

**Given** a toast is open
**When** I press Alt+T
**Then** focus moves to the toast region (landmark "Notifications"), where the Undo link and close button show the `ring-on-toast` focus ring; the toast stack never covers the selected row, because the scroll container's `scroll-padding-bottom` equals the stack height plus 24px (UX-DR21, UX-DR22, UX-DR25)

**Given** the header
**When** I activate the ghost "Shortcuts" button immediately left of Log out, or press ? with focus in the list
**Then** a modal Radix Popover opens listing every key in the keyboard map (⌘K, Enter, ↑/↓, →/Tab, S, B, C, X, E, ⌫, Z, Alt+T, ?, Esc), each as a `kbd-hint` beside its action; focus is trapped inside, Esc closes it and returns focus to the trigger, and it never opens at the same time as the due popover (UX-DR21, UX-DR23)

**Given** WCAG 2.2 SC 2.2.1 (Timing Adjustable)
**When** the story is reviewed
**Then** the 5-second Undo window stays non-pausable and non-extendable with no Reopen action on finished rows, and this is recorded as the accepted risk documented in PRD FR-11 (referenced in the story notes), not fixed; the shipped mitigations are Z whenever an Undo toast is open, Alt+T to the toast region, and the opening announcement naming Z (FR11, UX-DR31)
**And** a Playwright test using its clock covers complete → Undo → task restored, and the toast disappearing after 5 seconds; component tests with Vitest fake timers cover the countdown, Undo pending past 5 seconds, and the 3-second expired fade; a component test covers S, B, C, X and Z only firing with focus in the list (NFR6)

### Story 3.6: Finished section and status filter in the web app

As the app's owner,
I want finished tasks in their own collapsible section, and a status filter,
So that today's work isn't buried under history, and I can focus when I need to.

**Acceptance Criteria:**

**Given** the All view
**When** the main screen loads
**Then** active tasks are shown first, and Done and Cancelled tasks appear in a separate section below, in the order the API returns (FR15, AR10)
**And** the section header is a button inside an `<h2>` reading "Finished (n)" with an `aria-hidden` chevron (right when collapsed, down when expanded), `aria-expanded` and `aria-controls`, at least 24px high, and the section starts **collapsed** on every visit (load, reload, new login) (FR15, UX-DR13, UX-DR30)

**Given** a finished task is shown
**When** it is Done or Cancelled
**Then** it uses the finished size (min 50px) with title and mark in `finished`; Done has a checkmark mark and the word "Done" in place of the due time; Cancelled has a dashed-circle mark, a 1px title strikethrough and the word "Cancelled"; the two differ by mark and strikethrough, never colour alone, and the row's accessible name includes its status (FR15, UX-DR4, UX-DR26)

**Given** the finished section
**When** I collapse or expand it (click, or Enter or Space on the header)
**Then** it toggles; within the visit it keeps the state I last set, including across filter changes; it is never persisted, so it is collapsed again on the next visit (FR15, UX-DR13)
**And** while collapsed, finished rows are outside the Tab and arrow-key sequence; while expanded, ↓ from the last active row continues into finished rows, which accept no action keys (UX-DR13, UX-DR22)

**Given** the status filter (Radix Tabs above the add input: All · To do · In progress · Done · Cancelled, inactive tabs muted, active tab in `foreground` with a 1.5px underline, no pills or counts)
**When** the screen loads
**Then** All is selected by default; choosing a status requests `GET /api/tasks?status=...` and shows only those tasks as a plain list, with no separate finished section for any single-status filter; in the Done and Cancelled views the words "Done" / "Cancelled" stay visible on each row (FR16, UX-DR12, UX-DR26)
**And** the change is announced once, e.g. "In progress: 3 tasks" (UX-DR12, UX-DR28)

**Given** a filtered view
**When** the API returns no tasks
**Then** the list position shows "No tasks here.", and that is what is announced (FR16, UX-DR18, UX-DR28)

**Given** I reload the page
**When** the screen loads again
**Then** the filter is back to All and the Finished section is collapsed (not remembered) (FR15, FR16, UX-DR12, UX-DR13)

**Given** the complete main screen
**When** I press Tab repeatedly from the top
**Then** focus moves in the order Shortcuts → Log out → filter tabs → add input → chips → "Add description" link (or textarea) → list → Finished header → open toasts' Undo links and close buttons (UX-DR22)
**And** component tests cover the collapsible section (collapsed default, kept across filter changes) and filter behaviour, and a Playwright test covers filtering and the filtered empty state (NFR6)
