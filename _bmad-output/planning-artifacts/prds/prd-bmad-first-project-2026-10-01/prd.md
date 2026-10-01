---
title: "PRD: Todo App (BMad Method demo)"
status: final
created: 2026-10-01
updated: 2026-10-01
---

# PRD: Todo App (BMad Method demo)

## 0. Document Purpose

This PRD turns the [product brief](../../briefs/brief-bmad-first-project-2026-10-01/brief.md) and its [addendum](../../briefs/brief-bmad-first-project-2026-10-01/addendum.md) into numbered, testable requirements for the architecture, epics-and-stories and build steps. Features are grouped in §4, with globally numbered FRs (FR-1 to FR-17). Cross-cutting NFRs are in §5. The terms in §3 are used exactly as defined. Technical detail and options for the architect are in [addendum.md](addendum.md).

**Brief business rules → FRs:** BR-1 → FR-13 · BR-2 → FR-14 · BR-3 → FR-4, FR-5 · BR-4 → FR-14, NFR-3 · BR-5 → FR-15 · BR-6 → FR-12 · BR-7 → FR-11 · BR-8 → FR-6.

## 1. Vision

This is a small but complete single-user todo app. A FastAPI backend owns every rule, and a separate frontend consumes it. It exists so Benny can practise the full BMad Method on something finishable. The product is deliberately strict: every task has a due date-time, moves through four statuses, and becomes a permanent record once finished. That strictness gives each BMad step real decisions to work on.

**Constraints (learning goal):** a Python FastAPI backend that publishes an OpenAPI contract, and a frontend that is separate from it.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** see what is due next, in order of urgency, and notice at a glance what is overdue.
- **Functional:** keep an honest record of what was finished or abandoned, without that history crowding today's work.
- **Builder (Benny):** practise every BMad step on a project with real business rules, and come out able to run the sequence unaided at work.

### 2.2 Key User Journeys

- **UJ-1. Benny plans his morning.** He logs in and sees his active tasks, soonest due first. Yesterday's "Submit report" is highlighted as overdue at the top. He starts it, which moves it to In progress, and adds "Call the dentist, Friday 10:00".
- **UJ-2. Benny finishes a task and catches a mis-tap.** He marks "Call the dentist" Done, then realises he tapped the wrong task. Within 5 seconds he taps Undo, and the task returns to its previous status. He then marks the task he meant to finish Done, and it moves to the finished section.
- **UJ-3. Benny cleans up.** A trip is cancelled. He cancels "Book flights", which he had already started, and deletes "Pack bags", which he never started. He fixes a typo in an overdue task's title without having to change its date.

## 3. Glossary

- **Task**: a unit of work with a title, an optional description, a due date-time and a status.
- **Due date-time**: the required date and time by which a task is due. It is stored and compared in UTC and displayed in the browser's time zone.
- **Status**: one of **To do** (the initial status), **In progress**, **Done** or **Cancelled**.
- **Active task**: a task whose status is To do or In progress.
- **Finished task**: a task whose status is Done or Cancelled. Finished tasks are terminal (FR-12).
- **Overdue indicator**: a derived, read-only flag on a task. It is true when the task is active and its due date-time is before the current server time. It is not a status.
- **Finished time**: when the task most recently became Done or Cancelled. Cleared by undo; set again if the task is finished again.
- **Undo window**: the 5 seconds after the finished time, boundary inclusive, during which marking a task Done or Cancelled can be undone (FR-11).
- **Account**: the single pre-created user, identified by a username and password. No other users exist.
- **Client**: any consumer of the API, such as the frontend (NFR-1).

## 4. Features

### 4.1 Authentication

**Description:** One pre-created account protects the app. The user logs in to reach anything and can log out. Realizes UJ-1.

#### FR-1: Log in

The user can log in with the pre-created account's credentials.

**Consequences (testable):**
- Valid credentials start an authenticated session.
- Invalid credentials are rejected as unauthenticated, without revealing which part was wrong.

#### FR-2: Log out and session expiry

The user can log out, and sessions expire on their own.

**Consequences (testable):**
- After logout, requests using the old session are rejected as unauthenticated.
- A session expires 7 days after login, regardless of activity. After that, the user must log in again.

#### FR-3: Every task operation requires authentication

**Consequences (testable):**
- Every task endpoint rejects unauthenticated requests, and no task data is returned.

**Out of Scope:** registration, password reset, change-password and SSO. The account is created and changed only through a setup mechanism (see the addendum).

### 4.2 Task Management

**Description:** Creating, editing and deleting tasks. Each operation is constrained by status and by the due date-time rules. Because every task needs a due date-time, picking one in the frontend must be quick (detail for the UX step). Any operation in §4.2–4.4 on a nonexistent task ID returns a not-found error. Realizes UJ-1 and UJ-3.

#### FR-4: Create a task

The user can create a task with a title, an optional description and a due date-time. A new task's status is To do.

**Consequences (testable):**
- The title is required, must not be empty or whitespace only, and has a maximum of 200 characters.
- The description is optional, with a maximum of 5,000 characters.
- The due date-time is required. A missing due date-time is a validation error.
- A due date-time earlier than the current server time is a validation error. There is no tolerance at the boundary. `[NOTE FOR PM]` Architecture may propose a small tolerance only by updating this PRD.
- The client cannot set the status on create. A new task is always To do.

#### FR-5: Edit a task

The user can edit the title, description and due date-time of an active task.

**Consequences (testable):**
- Editing a finished task is rejected with a state-conflict error (FR-12).
- The same title and description limits as FR-4 apply.
- The due date-time cannot be removed.
- The past-date check runs **only when the due date-time changes**. "Changes" means a different instant; resubmitting the same instant in any UTC offset is not a change. Changing it to a past time is a validation error. Editing other fields of an overdue task succeeds, and its existing past due date-time is kept.
- Moving an overdue task's due date-time into the future succeeds, and the task is no longer overdue.
- Editing cannot change the status. Status changes happen only through FR-7 to FR-11.

#### FR-6: Delete a task

The user can delete a task whose status is To do.

**Consequences (testable):**
- Deleting a To do task removes it permanently, with no undo or recycle bin.
- Deleting an In progress, Done or Cancelled task is rejected with a state-conflict error.

### 4.3 Status Lifecycle

**Description:** Tasks move through four statuses. Done and Cancelled are terminal, with a 5-second undo as the only exit. Realizes UJ-1, UJ-2 and UJ-3. The table below lists the only allowed transitions. Every other action, whether marked ❌ (forbidden) or — (does not apply), is rejected with a state-conflict error and never silently ignored:

| From \ Action | Start | Back to To do | Mark done | Cancel | Undo (window only) |
|---|---|---|---|---|---|
| To do | → In progress | — | → Done | → Cancelled | — |
| In progress | — | → To do | → Done | → Cancelled | — |
| Done | ❌ | ❌ | — | ❌ | → previous status |
| Cancelled | ❌ | ❌ | ❌ | — | → previous status |

#### FR-7: Start a task

The user can move a To do task to In progress.

**Consequences (testable):**
- Starting a To do task sets its status to In progress.

#### FR-8: Move a task back to To do

The user can move an In progress task back to To do.

**Consequences (testable):**
- Moving an In progress task back sets its status to To do.

#### FR-9: Mark a task done

The user can mark a To do or In progress task Done.

**Consequences (testable):**
- Marking a To do or In progress task done sets its status to Done, records its finished time and previous status, and opens the undo window (FR-11).

#### FR-10: Cancel a task

The user can mark a To do or In progress task Cancelled.

**Consequences (testable):**
- Cancelling a To do or In progress task sets its status to Cancelled, records its finished time and previous status, and opens the undo window (FR-11).

#### FR-11: Undo marking Done or Cancelled

The user can undo marking a task Done or Cancelled within the undo window. The task returns to the status it had immediately before.

**Consequences (testable):**
- An undo within the 5-second undo window returns the task to its previous status, To do or In progress.
- An undo is accepted if the server receives it no more than 5 seconds after the finished time (boundary inclusive). There is no extra grace period. `[NOTE FOR PM]` Architecture may propose a latency grace period only by updating this PRD; the frontend still shows Undo for exactly 5 seconds.
- An undo after the window closes is rejected with a state-conflict error that says the undo window has expired.
- Undo is the only action allowed during the undo window. Switching directly between Done and Cancelled is rejected.
- After an undo, the task behaves like any active task. Marking it Done or Cancelled again opens a new undo window.
- Undo on a task that is not in an open undo window (for example, an active task) is rejected with a state-conflict error.
- The frontend shows an Undo control for 5 seconds after the user marks a task Done or Cancelled, then hides it.

**Accepted risk:** the 5-second undo window cannot be paused or extended, so it does not meet WCAG 2.2 SC 2.2.1 (Timing Adjustable). This is accepted for this single-user learning project because finished tasks being permanent is the point of the product. Revisit before the app has other users.

#### FR-12: Finished tasks are immutable

**Consequences (testable):**
- Any edit, delete or status change on a finished task, other than an FR-11 undo within the window, is rejected with a state-conflict error.
- Every disallowed transition in the §4.3 table is rejected by the API, whichever client sends it.
- Actions in "—" cells (for example, starting an In progress task or marking a Done task done) are rejected the same way.

### 4.4 Task List

**Description:** One list view: active tasks on top in order of urgency, finished tasks in a collapsible section below, and an optional status filter. Realizes UJ-1, UJ-2 and UJ-3.

#### FR-13: View active tasks in order of urgency

The user can view all active tasks in a deterministic order.

**Consequences (testable):**
- Active tasks are ordered by due date-time, earliest first.
- Ties are broken by status (In progress before To do), then by created time (earliest first), then by ID (ascending). The order is identical on every request.

#### FR-14: Overdue tasks are highlighted

**Consequences (testable):**
- Every task carries an overdue indicator. It is true exactly when the task is active and its due date-time is before the current server time.
- Finished tasks are never overdue.
- The frontend visually highlights overdue tasks.

#### FR-15: Finished tasks section

The user can view finished tasks in a separate, collapsible section below the active tasks.

**Consequences (testable):**
- Finished tasks are ordered by finished time, most recent first, then by created time (newest first), then by ID (ascending).
- The section can be collapsed and expanded. The collapsed or expanded state is not remembered between visits.

#### FR-16: Filter by status

The user can filter the list to a single status, or view All.

**Consequences (testable):**
- **All** is the default view, with active tasks (FR-13) above the finished section (FR-15).
- Filtering to one status shows only tasks with that status, in the same order that status uses in the All view. Filtering to Done or Cancelled shows those tasks without a separate section.
- The selected filter is not remembered between visits.

#### FR-17: Retrieve a single task

Any client can retrieve one task by ID.

**Consequences (testable):**
- The response includes the task's overdue indicator.
- A nonexistent ID returns a not-found error.

## 5. Cross-Cutting NFRs

- **NFR-1 Frontend independence:** the API exposes every capability in §4 and enforces every rule in §4.2–4.4 itself. A frontend only presents data and never decides a business rule. The API publishes a machine-readable contract (OpenAPI).
- **NFR-2 Consistent errors:** failures fall into distinct, documented categories: unauthenticated, validation error, state-conflict error and not found. Each carries a human-readable message. Suggested HTTP status codes are in the addendum.
- **NFR-3 Time handling:** the server clock is the single source of "now" for past-date validation, the overdue indicator and the undo window. The API exchanges date-times in an unambiguous format that includes the UTC offset. The frontend shows them in the browser's time zone.
- **NFR-4 Performance:** with up to 1,000 tasks, list and other operations respond in under 300 ms on the author's laptop with a local database. This is a sanity target, checked manually, not a load test.
- **NFR-5 Security:** passwords are never stored in plain text. Credentials and session tokens never appear in logs or responses.
- **NFR-6 Testability:** every FR consequence in §4 is covered by an automated test. Time-dependent rules (the overdue indicator, the undo window, past dates) are testable without real waiting, for example through a controllable clock. Frontend-only consequences (highlighting, the collapsible section, the Undo control, filter behaviour) are covered by component or end-to-end tests.

## 6. Non-Goals

- This is not a product to launch or compete with. It is a learning vehicle.
- It does not support multiple users, sharing or collaboration.
- It does not remind or notify the user, and it does not schedule recurring work.
- It does not backlog completed work: a task cannot be created already Done.

## 7. MVP Scope

### 7.1 In Scope

- FR-1 to FR-17 and NFR-1 to NFR-6.
- A FastAPI backend and a separate frontend. The frontend technology is chosen in architecture.

### 7.2 Out of Scope for MVP

- Account management: registration, password reset, change-password and SSO.
- Task features: reminders and notifications, recurring tasks, search, subtasks, priority and tags.
- Platforms and data: a mobile app, offline use, and export or import.

## 8. Success Metrics

- **SM-1 (primary, learning):** Benny can run the full BMad sequence on a new project without help. Pass condition: on the next work project, he produces the brief through stories without consulting this repo's artifacts.
- **SM-2:** every BMad step leaves its artifact: brief, PRD, architecture, epics and stories, implementation.
- **SM-3:** 100% of the FR consequences in §4 pass automated tests. Validates FR-1 to FR-17.
- **SM-C1 (counter-metric):** feature count. Do not add features beyond §7.1 to make the demo look impressive. It trades off against finishing the sequence. Counterbalances SM-2.

## 9. Open Questions

1. **For architecture:** the frontend technology (the brief's early recommendation is a separate single-page app that talks only to the API), the auth mechanism and the database.
2. **For architecture:** how undo is implemented on the server (options are in the addendum). Tolerances at the past-date boundary and the undo window default to zero (FR-4, FR-11); changing either means updating this PRD.
3. **For architecture:** overdue is decided by the server (FR-14). Decided in UX: the frontend refreshes the indicator's display live while a page stays open (display only; the API stays authoritative, per NFR-1). See the addendum.

## 10. Assumptions Index

None open. The three draft assumptions (permanent deletion, finished-section collapse state not remembered, status filter not remembered) were confirmed by Benny on 2026-10-01.
