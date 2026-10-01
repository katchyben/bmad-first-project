---
title: "PRD Addendum: Todo App (BMad Method demo)"
created: 2026-10-01
updated: 2026-10-01
---

# PRD Addendum: Todo App (BMad Method demo)

This addendum holds technical notes and options for the architecture step. They are inputs, not decisions. The requirements themselves are in [prd.md](prd.md).

## Undo mechanics (FR-11)

- Treat undo as **reverting the last status change**, not as an ordinary transition. Otherwise the transition table would need Done → To do and Done → In progress edges that contradict FR-12. Undo then needs the **previous status** and the **finished time**, stored on the task or in a status-change history.
- Enforce the undo window on the **server** (NFR-1), measured from the finished time. FR-11 sets the grace period to zero. If latency proves a problem, propose a small grace period by updating FR-11; it changes what FR-11's tests check. The UI hides the Undo control at 5 seconds, so the user rarely sees a refusal.
- Raised in the party-mode debate on 2026-10-01.

## Time boundaries (NFR-3, FR-4, FR-5, FR-14)

- The past-date check (`due_at < now`) is inherently racy at the boundary. A request sent at 09:59:59.9 with a due date-time of 10:00 can arrive after 10:00 and be rejected. FR-4 sets the tolerance to zero; a change means updating FR-4.
- Overdue indicator: the server computes it (the source of truth, FR-14) and returns it as a field. Still open (PRD §9, question 3): whether the frontend may also recompute it live while a page stays open, or must refresh from the API.
- Inject a clock dependency so tests can freeze and advance time (NFR-6).

## Suggested error mapping (NFR-2)

| Category | Suggested HTTP status |
|---|---|
| Unauthenticated | 401 |
| Validation error | 422 (FastAPI default) |
| State-conflict error (for example, a disallowed transition, a change to a finished task, an expired undo window) | 409 |
| Not found | 404 |

## Deterministic ordering (FR-13, FR-15)

- The final tie-break key must be unique (the ID), so list order and any future pagination are stable.
- The FR-15 ordering needs the finished time, which undo clears.

## Authentication (FR-1 to FR-3, NFR-5)

- Options: a server-side session with an HttpOnly cookie, or a bearer token (JWT). Choose with frontend independence (NFR-1) and the absolute 7-day expiry (FR-2) in mind.
- The setup mechanism for the account (FR-3) could be a CLI or seed script, or environment configuration. Store the password with a slow password hash (for example, argon2 or bcrypt).
