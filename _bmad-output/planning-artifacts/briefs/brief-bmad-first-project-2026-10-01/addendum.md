---
title: "Addendum: Todo App (BMad Method demo)"
created: 2026-10-01
updated: 2026-10-01
---

# Addendum: Todo App (BMad Method demo)

Detail behind the [product brief](brief.md), for the PRD and architecture steps. Section headings say which downstream document each section feeds.

Terms: **active** tasks are To do and In progress; **finished** tasks are Done and Cancelled. The **due date-time** is the task's required due date and time.

## Task status model (confirmed)

Statuses: **To do** (initial) · **In progress** · **Done** (terminal) · **Cancelled** (terminal)

| Action | To do | In progress | Done | Cancelled |
|---|---|---|---|---|
| Edit | ✅ | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ | ❌ |
| Start (→ In progress) | ✅ | — | ❌ | ❌ |
| Back to To do | — | ✅ | ❌ | ❌ |
| Mark done | ✅ | ✅ | — | ❌ |
| Cancel | ✅ | ✅ | ❌ | — |
| Undo (5 s window) | — | — | ✅ | ✅ |

**Enforcement:** the API rejects illegal transitions (for example, editing a Done task or deleting an In progress task) whichever client sends them, so the business rules live in the backend.

## Task data model: user-facing fields (for PRD)

| Field | Required | Notes |
|---|---|---|
| title | yes | non-empty; max length to set in PRD |
| description | no | free text |
| due date-time | yes | BR-3, BR-4 |
| status | yes | To do (default on create) · In progress · Done · Cancelled |

Not in the MVP: priority, tags/categories. System fields (id, created/updated timestamps, and the status-changed timestamp needed for BR-5 ordering and the BR-7 undo) are left to architecture.

## Candidate business rules (for PRD)

- **BR-1 Sort order:** active tasks are sorted by due date-time, soonest first.
- **BR-2 Overdue highlighting:** an overdue task (see BR-4) is visually highlighted.
- **BR-3 Mandatory due date-time:** every task must have a due date-time; a task cannot be created or edited without one. _Implication: the API rejects create and update requests without a due date-time; the UI should make picking one fast._
- **BR-4 Due date precision and overdue:** the due date is a date and time. A task is overdue from the instant the current time passes its due date-time while the task is To do or In progress.
- **BR-5 Finished tasks remain visible:** Done and Cancelled tasks stay visible in a separate, collapsible section below the active tasks, most recently finished first (confirmed).
- **BR-6 Terminal statuses are immutable:** once a task is Done or Cancelled, it cannot be edited, deleted or moved to another status, except through the BR-7 undo.
- **BR-7 Undo window:** immediately after a task is marked Done or Cancelled, the user can undo the change, returning the task to its previous status, for 5 seconds (confirmed). After the window closes, BR-6 applies permanently.
- **BR-8 Deletion:** only To do tasks can be deleted. In progress, Done and Cancelled tasks cannot be deleted.

## Candidate use cases (for PRD)

- Log in / log out
- Create a task (title, optional description, mandatory due date-time)
- Edit a task (To do and In progress only)
- Start a task; move an In progress task back to To do
- Mark a task done
- Cancel a task
- Undo marking a task Done or Cancelled (within the undo window only)
- Delete a task (To do only)
- View the list: active tasks sorted by due date-time with overdue tasks highlighted; finished tasks in a collapsible section below
- Filter the list by status (open for PRD: how the filter interacts with the finished section)

## Authentication (for PRD / architecture)

- A single, **pre-created** account (created by a setup script or configuration). There is no self sign-up, so no multi-tenancy and no per-task owner are needed.
- The user logs in to access the app; every task API call requires an authenticated caller.
- Out of the MVP: registration, password reset, change-password (the credential is changed through the setup mechanism), and social/SSO login.
- For architecture: the auth mechanism (for example, session cookie or bearer token/JWT), password hashing, token or session lifetime, and logout.

## Open technical questions (for architecture)

- **Time zones:** confirmed direction: a single user in one local time zone; due date-times are stored in UTC and displayed in the browser's local time. Architecture defines the API datetime format (for example, ISO 8601 with offset) and where overdue is computed: server, client or both.
- **Undo mechanics:** is the undo window enforced server-side (the API accepts an undo within the 5-second window, using the status-changed timestamp) or client-side (the UI delays sending the change until the window passes)? Server-side keeps the rule in the API, independent of the frontend, which is consistent with the frontend-independence goal.
- **Also open (from the brief):** the frontend technology, the login mechanism (see Authentication) and the database.
