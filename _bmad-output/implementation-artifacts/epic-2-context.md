# Epic 2 Context: Capture and manage my tasks

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the secured shell from Epic 1 into a working todo list. The user can add tasks with a due date-time, see them in urgency order with overdue tasks highlighted, open one task, edit tasks and delete them. All of this goes through the API first and then through the web main screen. Every task is To do in this epic; the status workflow (start, complete, cancel, undo, finished section, filter) arrives in Epic 3. Epic 2 still lays the domain groundwork Epic 3 builds on: the Task shape, the transition guards, ordering and overdue logic.

## Stories

- Story 2.1a: Create tasks in the domain and store them
- Story 2.1b: Create a task through the API
- Story 2.2: View my tasks in urgency order through the API
- Story 2.3: Edit a task through the API
- Story 2.4: Delete a task through the API
- Story 2.5a: Show my tasks on the main screen
- Story 2.5b: Add a task from the main screen
- Story 2.5c: Pick any due date-time
- Story 2.5d: Move through my tasks with the keyboard
- Story 2.5e: Know when the server can't be reached
- Story 2.6a: Edit a task in place
- Story 2.6b: Delete a task with an inline confirm

## Requirements & Constraints

- **Create:** the title is trimmed, then must be non-empty and at most 200 code points. The description is optional, at most 5,000 code points. `due_at` is required and must not be earlier than server `now`, with no tolerance (equal to `now` is accepted). The client cannot set the status, so a new task is always To do and `created_at = now`.
- **Edit (active tasks only):** the user can change the title, description and due date-time, with the same limits as create. The due date-time cannot be removed. The past-date check runs only when `due_at` changes to a *different instant*: the same instant sent with another offset counts as unchanged. Other fields of an overdue task stay editable. Moving an overdue task into the future clears its overdue state. Editing a finished task is a `StateConflictError`. This epic proves it with a domain test only.
- **Delete:** only To do tasks can be deleted, permanently, with no undo. Deleting an In progress, Done or Cancelled task is a `StateConflictError`, also proved by a domain test.
- **List order:** active tasks are sorted by `due_at` ascending, then In progress before To do, then `created_at` ascending, then `id` ascending. The order is identical on every request.
- **Overdue:** a task is overdue exactly when it is active and `due_at` is before server `now`. Finished tasks are never overdue.
- **Get one task:** returns the task by ID, including `is_overdue`. A nonexistent ID, or an integer outside the 64-bit range, gets `not_found` (404). A non-integer ID gets `validation_error` (422).
- **Authentication:** every task endpoint requires authentication. Without it the response is 401 and carries no task data.
- **Error messages** are fixed, calm domain strings, and tests assert them exactly. The rules for a blank title, a title over 200 characters and a description over 5,000 characters each have their own message. A past `due_at` returns exactly "That time has already passed.". Missing or naive `due_at` values and other shape errors return the generic request-validation message.
- **Performance:** listing 1,000 tasks must respond in under 300 ms on a local database. This is a manual check, recorded in Story 2.2's notes.
- **Testability:** every rule is tested. Time-dependent rules use a controllable clock and never wait in real time. Frontend-only behaviour is covered by Vitest component tests (with fake timers) and Playwright tests.
- **No extra features.** For example, the list row shows no description and no indicator that a task has one; the description is visible only in the edit row. This is deliberate.

## Technical Decisions

- **Hexagonal layers:** `domain/` (stdlib only) → `application/` (use cases, ports, `TaskView`) → `adapters/http` and `adapters/persistence`. Adapters never import each other. The import-boundary test enforces this.
- **Domain owns every value rule and transition guard.** HTTP schemas check shape only (`extra="forbid"`, no `Field` constraints on business values). The frontend never decides a rule.
- **One `now` per request**, read once from the `Clock` port by a request-scoped dependency and passed to the use case. All datetimes are aware UTC. There are no DB or ORM time defaults.
- **Task shape:** the domain `Task` has `id`, `title`, `description?`, `due_at`, `status` (`to_do|in_progress|done|cancelled`), `created_at`, `finished_at?` and `previous_status?`. `TaskResponse` carries all of these except `previous_status`, plus `is_overdue`.
- **Response codes:** create returns 201. Get and PATCH return 200 with `TaskResponse`. The list is a bare JSON array. DELETE returns 204.
- **Overdue** is computed by the domain into `TaskView(task, is_overdue)` and never stored. Routers never read the Clock.
- **Ordering** lives only in the domain. The repository returns unordered lists, and the frontend never re-sorts.
- **Persistence:** an Alembic migration creates the `tasks` table, and the app never calls `create_all`. SQLModel and SQLAlchemy stay inside `adapters/persistence/`, with a `TaskRow` that maps to and from the domain `Task`. The `UTCDateTime` decorator re-attaches UTC on read.
- **`TaskRepository`** offers `get` (returns `None` when missing), `add` (returns the task with its ID), `save` (the whole task), `delete` and `list(status|None)`. It never commits, orders or raises domain errors, so use cases raise `NotFoundError`. The request-scoped `UnitOfWork` commits or rolls back.
- **PATCH semantics:** an omitted key means unchanged. `description: null` or `""` clears it, stored as `null`. `title: null` or `due_at: null` is a 422. Any other key, including `status`, is a 422.
- **Wire format:** ISO 8601 with an offset is required on input (naive values get a 422). Output is UTC with `Z`.
- **Errors:** every error uses the `{"error": {"code", "message", "reason"?}}` envelope. The precedence is unauthenticated > shape validation > not_found > state_conflict > value validation.
- **Frontend data access** goes only through the generated `@hey-api/openapi-ts` client with TanStack Query. Regenerate `frontend/openapi.json` and the client with every route change, and keep the drift checks passing. There are no optimistic updates: every mutation invalidates `["tasks"]` and the list refetches. Queries retry only on network errors, and mutations never retry.

## UX & Interaction Patterns

- **Layout:** one fluid column up to 640px with a 16px gutter, and the list sits in one bordered card. The page reflows at 400% zoom with no horizontal scroll. Every target is at least 24px high; row action buttons are at least 26px.
- **Row:** shows an `aria-hidden` status mark, the title, then the due time. The title is clamped to two lines with an ellipsis, and the selected row shows the full title. Due times render in the browser's time zone as "Yesterday, 5:00 PM", "Today, …", "Tomorrow, …", a weekday within 6 days ("Fri, 10:00 AM"), otherwise "Oct 12, 9:00 AM", with the year added when it is not the current year.
- **Overdue row:** gets the `overdue-tint` background, a 3px left rule, the mark and due time in `overdue`, an alert icon and the word "Overdue". It is never shown by colour alone, and "overdue" is added to the accessible name. A live re-check every minute and on window focus only *promotes* active rows to overdue, silently. It never clears a server `true`, never refetches or re-sorts, and never touches finished rows.
- **Add input:** the chips are "Tomorrow 9:00 AM" (preselected), "Next Monday 9:00 AM" and "Pick date…". Presets resolve in browser local time at submit and roll forward if already past. "Pick date…" opens a modal popover with a calendar (past days disabled), a labelled "Time" field and "Set". "Add description" expands to a textarea: Enter submits and Shift+Enter inserts a newline. The frontend does no pre-validation. API errors show *as written* in the single `role="alert"` error slot, and everything typed is kept.
- **Inline edit row:** Save sends only changed fields, and an unchanged due date-time is never sent. A `validation_error` goes to the row's single error slot. `state_conflict`, `not_found` and 5xx go to an error toast that stays until dismissed, with a "Dismiss" button.
- **Inline delete confirm:** shows "Delete 'X'?" with "This can't be undone.". Focus starts on Keep, so a reflexive Enter keeps the task. A second ⌫ deletes.
- **Keyboard:** ⌘K focuses the add input and Esc blurs it to the list. The list is a single Tab stop as a `role="grid"`; ↑/↓ move the selection without wrapping. E opens edit and ⌫ opens the delete confirm. A key that doesn't apply to the selected row does nothing and sends no request.
- **Feedback:** "Loading…" appears only when a cold load is still pending after 1 s. The connection banner reads "Can't reach the server. Retrying…", then "Reconnected.", and also appears on the login screen. The empty state reads "Nothing due. Enjoy the quiet.". Polite announcements include "Added 'X', due …", "Saved." and "Deleted 'X'.". Motion is 180ms opacity fades only, switched off under `prefers-reduced-motion`.
- **Voice:** sentences are plain and calm and end with a full stop. Use no exclamation marks and no "successfully", and put task titles in single quotes. Only strings that no API response carries live in the frontend.

## Cross-Story Dependencies

- Builds on Epic 1: the error envelope and voice convention, the Clock port and `now` dependency, the unit of work, the migrated per-test databases, auth, the generated client with its drift check, the app shell and the error toast plumbing.
- Each API story (2.2, 2.3, 2.4) builds on 2.1a, which provides the domain Task, the rules, the `tasks` migration and the repository, and on 2.1b, which provides the route and schema patterns.
- 2.5a–e need the list and create APIs (2.1b, 2.2). 2.5b–c depend on 2.5a, and the edit row in 2.6a reuses the chips and popover from 2.5b–c. 2.6a needs 2.3 and the selection model from 2.5d; 2.6b needs 2.4 and 2.5d.
- The domain tests in 2.3 and 2.4 that check finished and in-progress tasks raise `StateConflictError` prepare for Epic 3's API tests. The Task fields `previous_status` and `finished_at` exist now but are used in Epic 3.
