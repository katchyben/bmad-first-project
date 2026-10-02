---
title: 'Story 2.3: Edit a task through the API'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '2d6e49f0da4208f0554e6e95d874d32b374cb863'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-view-my-tasks-in-urgency-order-through-the-api.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Plans change, but a task's title, description and due date-time can't be corrected after it is created.

**Approach:** Add a domain `edit_task`, `TaskRepository.save`, an `edit_task` use case and an authenticated `PATCH /api/tasks/{task_id}` that partially updates `title`, `description` and `due_at` and returns 200 `TaskResponse`. Then regenerate the OpenAPI schema and client.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- Editing a finished (done or cancelled) task raises `StateConflictError("That task is finished and can't be changed.")`, defined in the domain as `FINISHED_TASK_MESSAGE`, with no `reason`.
- An empty body `{}` is valid and returns the task unchanged.

## Boundaries & Constraints

**Always:**
- PATCH semantics follow AD-7: an omitted key is unchanged; `description: null` or `""` clears it (stored as `null`); `title: null` or `due_at: null` is the generic shape 422; any other key, including `status`, is rejected by `extra="forbid"`. Use `model_fields_set` (or equivalent) to tell omitted from null.
- `due_at` uses the same wire rules as create (2.1b): an ISO 8601 string with an offset, converted to UTC at the boundary, with overflow and non-strings as shape 422s. Reuse create's annotated type, not a copy.
- Value rules are 2.1a's, reused (`normalise_title`, `normalise_description`, the same messages). The past-date check runs only when `due_at` changes to a different instant; the same instant in another offset is unchanged, so an overdue task keeps its past `due_at` through other edits.
- Error precedence (AD-12): unauthenticated > shape > `not_found` (missing or out-of-range ID, reusing 2.2's range check) > `state_conflict` (finished) > value `validation_error`. On any error the stored task is unchanged (the unit of work rolls back, and nothing is saved before the rules pass).
- `in_progress` and `to_do` tasks are both editable. `status`, `created_at`, `finished_at` and `previous_status` never change. `is_overdue` in the response uses the request `now`.
- OpenAPI: operation ID `edit_task`; 401, 404 and 409 declared as `ErrorResponse`; `title` and `due_at` optional and non-nullable, `description` optional and nullable.

**Never:**
- No status changes and no other fields. No HTTP-level value validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Subset | `{"title":" New "}` | 200, title "New", everything else unchanged and stored | N/A |
| Clear description | `{"description":null}` or `{"description":""}` | 200, `description: null` stored | N/A |
| Empty body | `{}` | 200, unchanged | N/A |
| Null required | `{"title":null}` or `{"due_at":null}` | 422 generic, unchanged | shape |
| Extra key | `{"status":"done"}` or `{"foo":1}` | 422 generic, unchanged | `extra="forbid"` |
| Bad value | blank or over-200 title, over-5,000 description | 422 with that rule's 2.1a message, unchanged | domain |
| Overdue kept | overdue task; edit only the title, or resend its `due_at` in a different offset | 200, past `due_at` kept, `is_overdue: true` | N/A |
| Past change | overdue task; `due_at` another past instant | 422 "That time has already passed.", unchanged | domain |
| Future change | overdue task; `due_at` in the future | 200, `is_overdue: false` | N/A |
| Missing | `999` or `2**63` | 404 `not_found` | use case |
| Finished | domain unit test: `done` or `cancelled` task | `StateConflictError(FINISHED_TASK_MESSAGE)` | domain |
| No token | missing or invalid bearer, even with a bad body or missing ID | 401, unchanged | auth |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/domain/task.py` -- `normalise_title`, `normalise_description`, `check_due_at` and `TaskStatus` to reuse. Add `FINISHED_TASK_MESSAGE` and `edit_task(task, now, ...)` that returns a new `Task` via `dataclasses.replace`, with an "unset" convention for omitted fields.
- `src/bmad_first_project/application/ports.py` and `adapters/persistence/tasks.py` -- add `save(task)` (persists the whole task by its ID; AD-15).
- `src/bmad_first_project/application/tasks.py` -- `get_task`'s range check and not-found to reuse; add `edit_task`.
- `src/bmad_first_project/adapters/http/tasks.py` -- `CreateTaskBody`'s `due_at` annotated type to share; add `EditTaskBody` and the `edit_task` route.
- Tests: `tests/domain/test_task.py`, `tests/persistence/test_tasks.py`, `tests/application/test_create_task.py` (in-memory fake, add `save`), `tests/api/test_tasks.py` and `tests/api/helpers.py`.
- Regenerate with `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npm run generate`.

## Tasks & Acceptance

**Execution:**
- [x] Domain tests first (red), then `edit_task` and the message.
- [x] `save` on the port and the SQL repository, with a persistence round-trip test.
- [x] `edit_task` use case and its tests (precedence: not found, then finished, then values; nothing saved on error).
- [x] `EditTaskBody`, the PATCH route and API tests for every matrix row except the domain-only Finished row, plus the OpenAPI shape.
- [x] Regenerate `frontend/openapi.json` and the client.

**Acceptance Criteria:**
- Given the regenerated client, when `uv run pytest` runs, then the drift tests pass, and `cd frontend && npm run lint && npm run build && npx vitest run` pass on Node 24.

## Implementation Notes

- Backend 398 passed (319 + 79), ruff check and format clean; frontend lint, build and Vitest 92 passed on Node 24.8.0 after `npm run generate`.
- The "unset" convention is a one-member enum, `Unset.UNSET` (exported as `UNSET`), used as the keyword default of both the domain and application `edit_task`. The route passes only `body.model_fields_set` keys, so an omitted key never reaches the domain.
- Domain `edit_task` checks, in order: finished status (`StateConflictError`, before any value rule, even for an empty edit), title, description, then `due_at`. The past check runs only when `due_at != task.due_at` (instant comparison). The stored `due_at` is always UTC.
- `EditTaskBody` types `title` and `due_at` as `X | SkipJsonSchema[None] = None` with a `mode="before"` validator that rejects an explicit `null`; defaults aren't validated, so an omitted key passes. FastAPI renders both as plain non-nullable, non-required properties. `due_at` reuses the shared `DueAt` annotated type that `CreateTaskBody` now uses too.
- `SqlTaskRepository.save` writes every column of the row with the task's ID and raises `LookupError` for a task with no ID or an unknown one (a programming error, like `AccountStore.save`). The use case shares `get_task`'s range and not-found check through a private `_existing`.
- The domain-only Finished row stays domain-only, as specified (plus use-case tests); there is no API 409 test.
- `tests/api/helpers.py` gained `stored_task(engine, id)`. `test_openapi_declares_list_and_get_task` now expects `get` and `patch` on `/api/tasks/{task_id}`.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 10 findings), Edge Case Hunter (EC, 3), Verification Gap (VG, 1 gap).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| VG1, BH1 | no API test for the 409 on a finished task | low | domain and use-case tests and the generic mapping exist, but nothing exercises the real route | patch: parametrized API test |
| BH2, EC3 | route docstring promises `{}` returns the task unchanged, but a finished task gives 409 | low | the docstring is published in OpenAPI and the generated client; the 409 follows the AD-12 precedence | patch: limit the promise to active tasks |
| BH3 | `EditTaskBody` maintainer docstring is published as the schema description | low | it appears in `openapi.json` and `types.gen.ts` | patch: make it a comment |
| BH7 | the fake's `save` raises `StopIteration`, the SQL one `LookupError`; the port doesn't say | low | `MemoryTasks.save` uses `next(...)` | patch: fake and port docstring |
| BH9 | edit, list and get tests filed in `test_create_task.py` | low | the file name no longer fits | patch: rename to `test_tasks.py` |
| BH4, EC1, EC2 | read-then-save race: a concurrent status change is overwritten, or a concurrent delete gives a 500 from `LookupError` | maybe-false (medium if hit) | the AD-15 whole-task `save` pattern; a single-user app on SQLite; needs two overlapping requests on one task | defer: ledger entry |
| BH5 | `save` writes columns an edit never changes | false | AD-15: `save(task)` persists the whole task | rejected |
| BH6 | an empty edit still writes | low | a harmless same-value UPDATE | rejected |
| BH8 | naive `now` checked after the finished check | low | unreachable from HTTP: `get_now` guarantees aware UTC | rejected |
| BH10 | assorted untested edge cases (whitespace description, non-string description, `[]` body, `id or 0`) | low | covered by shape handling and the domain rules; no reachable defect named | rejected |

## Verification

**Commands:**
- `uv run pytest` -- expected: all pass (319 plus the new tests).
- `uv run ruff check . && uv run ruff format --check .` -- expected: clean.
- `cd frontend && npm run lint && npm run build && npx vitest run` (Node 24) -- expected: pass.
