---
title: 'Story 2.2: View my tasks in urgency order through the API'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '779719675cbb5908280c8ca9d570e12144e6b9b2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1b-create-a-task-through-the-api.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tasks can be created but not read back, so nothing can show the list or open a task.

**Approach:** Add a domain ordering function, `TaskRepository.list()`, the `list_tasks` and `get_task` use cases, and two authenticated routes: `GET /api/tasks` (a bare array of `TaskResponse` in urgency order) and `GET /api/tasks/{task_id}`. Then regenerate the OpenAPI schema and client.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- The not-found message is "That task no longer exists.", defined in the domain as `TASK_NOT_FOUND_MESSAGE`.
- Only the FR-13 active order is in scope. Placing finished tasks (FR-15) and the `?status=` filter belong to Epic 3, and `list()` takes no parameters until then.

## Boundaries & Constraints

**Always:**
- The order is domain-only (AD-10): `due_at` ascending, then `in_progress` before `to_do`, then `created_at` ascending, then `id` ascending. `SqlTaskRepository.list()` returns rows unordered (no `ORDER BY`).
- Every response is built from `view_task` with the request's single `now` (AD-9), reusing 2.1b's `TaskResponse.from_view`.
- The path ID is a shape `int` (a non-integer is the generic shape 422). An integer outside `-2**63 … 2**63-1` is `NotFoundError` in the use case, before the repository is called (AD-12; SQLite raises `OverflowError` otherwise). A missing ID is `NotFoundError`, a 404 envelope.
- `CurrentSessionDep` on both routes, so the 401 wins over shape and not-found (AD-12 precedence). Operation IDs are `list_tasks` and `get_task`. OpenAPI declares 401 and 404 (get) as `ErrorResponse`.

**Never:**
- No `status` query parameter, no finished-task ordering, no pagination.
- No sorting in SQL or the route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty | no tasks | `GET /api/tasks` → 200 `[]` | N/A |
| Ordered | tasks inserted out of order | array in domain order | N/A |
| Ties | equal `due_at`; then equal `created_at` | `in_progress` before `to_do`; then earlier `created_at`; then lower `id` | N/A |
| Overdue | a stored task whose `due_at` < request `now` (advance the fake clock) | `is_overdue: true` in the list and in get-one; otherwise `false` | N/A |
| Get one | existing ID | 200 `TaskResponse` | N/A |
| Missing | `999`, `0`, `-1`, `2**63`, `-2**63-1` | 404 `{"error":{"code":"not_found","message":"That task no longer exists."}}` | `NotFoundError` |
| Non-integer | `abc`, `1.5` | 422 generic message | request validation |
| No token | either route; also `/api/tasks/abc` without a token | 401 `unauthenticated`, no task data | auth dependency |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/domain/task.py` -- add `TASK_NOT_FOUND_MESSAGE`, plus `order_tasks(tasks) -> list[Task]` or a sort key. Domain tests build `Task(...)` directly to cover each tie-break, including `in_progress`.
- `src/bmad_first_project/application/ports.py` and `adapters/persistence/tasks.py` -- `list() -> list[Task]`, reusing `_to_domain`.
- `src/bmad_first_project/application/tasks.py` -- `list_tasks(uow, now) -> list[TaskView]` and `get_task(uow, now, task_id) -> TaskView`, both raising `NotFoundError(TASK_NOT_FOUND_MESSAGE)` where needed.
- `src/bmad_first_project/adapters/http/tasks.py` -- the two GET routes, next to `create_task`, reusing `TaskResponse.from_view` and `error_responses`.
- `tests/api/helpers.py` and `tests/api/test_tasks.py` -- helpers and the existing create tests to extend; the `fake_clock` fixture sets `now`.
- `tests/application/test_create_task.py` -- the in-memory fake to extend with `list` for use-case tests.
- `frontend/src/client/` and `frontend/openapi.json` -- regenerate with `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npm run generate`.

## Tasks & Acceptance

**Execution:**
- [x] `tests/domain/test_task.py` -- red first: each tie-break level and the input order not mattering.
- [x] `src/bmad_first_project/domain/task.py` -- ordering and the message.
- [x] Port and `SqlTaskRepository.list()`, with a persistence test that all rows come back.
- [x] `src/bmad_first_project/application/tasks.py` and its tests -- `list_tasks` and `get_task`, including the range and missing cases.
- [x] `src/bmad_first_project/adapters/http/tasks.py` and `tests/api/test_tasks.py` -- the routes; every matrix row; OpenAPI operation IDs and declared responses.
- [x] Regenerate `frontend/openapi.json` and the client.
- [x] Performance: with 1,000 tasks in a scratch DB, time `GET /api/tasks` through `TestClient` on this laptop and record the result here (NFR4: under 300 ms). This is a manual check, not a committed test.

**Acceptance Criteria:**
- Given the regenerated client, when `uv run pytest` runs, then the drift tests pass, and `cd frontend && npm run lint && npm run build && npx vitest run` pass on Node 24.

## Implementation Notes

- Backend 317 passed (276 + 41), ruff check and format clean; frontend lint, build and Vitest 92 passed on Node 24.8.0 after `npm run generate`.
- Performance (NFR4): 1,000 tasks (100-char descriptions, mixed To do / In progress) in a scratch SQLite DB under the session scratchpad, `GET /api/tasks` through `TestClient` on an Apple M1 Max: first request 20.2 ms, median 13.0 ms, max 37.8 ms over 20 requests. Well under 300 ms.
- `order_tasks` raises `ValueError` for a task with no `id` (a programming error, like a naive datetime). Every status other than In progress sorts as To do; finished-task placement is left to Epic 3.
- The use-case tests for `list_tasks` and `get_task` sit in `tests/application/test_create_task.py` next to the in-memory fake (now with `list` and a record of `get` calls, which proves the int64 range check runs before the repository), rather than a second file importing the fake.
- `test_openapi_declares_create_task` now expects `get` and `post` on `/api/tasks`.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 8 findings), Edge Case Hunter (EC, 1), Verification Gap (no gaps).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH3 | 401 versus an out-of-range ID is untested | low | the matrix covers `/1`, `/999` and `/abc` only | patch: add a 2**63 case |
| BH4 | list OpenAPI responses not pinned as a full set | low | get pins `{200,401,404,422}`; list checks only two | patch |
| BH6 | the overdue test hides failures in `all(...)` | low | a 404 or 500 would show only `assert False` | patch: per-response status asserts |
| BH5 | the 64-bit ID rule is stated only as a SQLite comment in the application layer | low | `TaskRepository.get` doesn't state the contract | patch: port docstring and comment wording |
| BH1, EC1 | finished tasks would be ordered as To do in the list | low | frozen decision: finished-task placement belongs to Epic 3 (Story 3.6); no task can be finished yet | rejected (out of scope by intent) |
| BH2 | no `Cache-Control: no-store` on task reads | low | RFC 6749's no-store applies to token responses; shared caches don't store responses to `Authorization` requests by default | rejected |
| BH7 | `order_tasks` doesn't reject naive datetimes | false | the only caller sorts repository output, and `UTCDateTime` always returns aware UTC | rejected |
| BH8 | the review diff omits the spec and sprint-status files | false | intentionally excluded: they are workflow records, not code | rejected |

## Verification

**Commands:**
- `uv run pytest` -- expected: all pass (276 plus the new tests).
- `uv run ruff check . && uv run ruff format --check .` -- expected: clean.
- `cd frontend && npm run lint && npm run build && npx vitest run` (Node 24) -- expected: pass.
