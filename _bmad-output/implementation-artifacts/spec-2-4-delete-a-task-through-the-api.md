---
title: 'Story 2.4: Delete a task through the API'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '4d81d3917d5a40274a5097804da7093a7fcca2af'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A task created by mistake can't be removed, so the list fills with things that aren't real work.

**Approach:** Add an authenticated `DELETE /api/tasks/{task_id}` that permanently removes a To do task and returns 204. The domain decides deletability: only `to_do` can be deleted; In progress, Done and Cancelled raise `StateConflictError`. A missing or out-of-range ID is 404 through 2.2's `_existing`, and a missing token is 401 first. The task is removed through a new `TaskRepository.delete(id)` inside the request's unit of work. Operation ID `delete_task`; OpenAPI declares 401, 404 and 409 as `ErrorResponse`, with no response body. Then regenerate the client.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- The conflict message is "Only a To do task can be deleted.", defined in the domain as `NOT_DELETABLE_MESSAGE`, with no `reason`.
- No undo. A later `GET` of the ID is 404.

</frozen-after-approval>

## Implementation Notes

- Implemented directly in the main session (one-shot route), tests first. The new domain, application, persistence and API tests failed at collection before the code existed.
- Domain: `check_deletable(task)` and `NOT_DELETABLE_MESSAGE`. Port and `SqlTaskRepository.delete(id)`: a no-op for a missing ID, like `SessionStore.delete`. Use case `delete_task(uow, task_id)`: `_existing` (404, including out of range), then `check_deletable` (409), then `delete`. Route: `DELETE /api/tasks/{task_id}`, 204 with `response_class=Response`.
- `test_openapi_declares_list_and_get_task` now expects `get`, `patch` and `delete` on the item path. The client was regenerated (`deleteTask`).
- Verification: backend 431 passed, ruff clean; frontend lint, build and Vitest 92 passed on Node 24.
- Mutations, each caught: deletable only when not finished (5 fail), the check skipped in the use case (8 fail), the delete `WHERE` inverted (4 fail). Reverted from backup copies.

## Spec Change Log

## Review Triage Log

Blind Hunter (11 findings):
- The check-then-delete race (a concurrent status change between `get` and `DELETE`): **maybe-false** (medium if hit). The same read-then-write class as 2.3's deferred race. AD-2 keeps status rules out of the repository's `WHERE`. **Deferred** (ledger).
- `delete` returns nothing for a missing row: **low**, rejected. It matches `SessionStore.delete`, and the use case already 404s first.
- No get → delete → get test in one unit of work: **low**, patched (`test_delete_after_get_in_one_unit_of_work_leaves_nothing_cached`).
- No list check after a delete: **low**, patched (the list shows only the kept task).
- Repeat and negative-ID deletes untested: **low**, patched (a second delete is 404; `-1` and `-(2**63) - 1` are added at the API and application layers).
- Finished-task fixtures lack `finished_at` and `previous_status`: **low**, rejected. `check_deletable` reads only `status`.
- The spec omits 422 from the declared responses: **false**. 422 is the app-wide `ERROR_RESPONSES` on every route.
- The `session` parameter isn't marked auth-only: **low**, rejected. It is the same pattern as every protected route, and the 401 tests would catch its removal.
- Literal message in a domain test; stale module docstring: **low**. The literal pins the exact string on purpose, as in the other domain tests; the docstring is patched.
- No client invalidation after a delete: **false** for this story. The UI wiring is Story 2.6b.
- Tracking files still `in-progress`: **false**. Updated at finalize.
