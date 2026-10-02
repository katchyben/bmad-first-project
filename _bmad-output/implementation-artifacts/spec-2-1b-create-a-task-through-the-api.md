---
title: 'Story 2.1b: Create a task through the API'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: 'de659a4a883e42b2bac92ef5ffeaf268f81414f0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1a-create-tasks-in-the-domain-and-store-them.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.1a added the domain `Task`, its rules and storage, but nothing can create a task from outside the code yet.

**Approach:** Add the `create_task` use case and an authenticated `POST /api/tasks` route that returns 201 with `TaskResponse`, then regenerate the committed OpenAPI schema and frontend client.

## Boundaries & Constraints

**Always:**
- The route checks shape only (AD-2): the body has `title: str`, `description: str | None = None` and `due_at: AwareDatetime`, all required except `description`, with `extra="forbid"`. There are no `Field` constraints on values.
- Value rules come only from 2.1a's `new_task`; a `DomainValidationError` becomes the existing 422 envelope with the domain message, and the unit of work rolls back.
- `CurrentSessionDep` guards the route, so a 401 comes before shape validation (AD-12, as in the existing `test_unauthenticated_beats_shape_validation`).
- The use case reads the one request `now` (`NowDep`) and returns a `TaskView(task, is_overdue)` (AD-9). `is_overdue` is `task.due_at < now`, computed in the domain and never stored.
- `TaskResponse` has `id`, `title`, `description`, `due_at`, `status`, `created_at`, `finished_at` and `is_overdue`, and no `previous_status` (AD-14). Datetimes serialize as UTC with `Z` (AD-13).
- The route function and the use case are both named `create_task`, so the operation ID is `create_task`.

**Never:**
- No GET, PATCH or DELETE routes; no ordering; no frontend UI.
- No HTTP-level validation of title, description or the past-date rule.
- Don't hand-edit generated files; regenerate them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Created | authenticated; `{"title":" Pay rent ","due_at":"<now+1d, +02:00>"}` | 201; body as `TaskResponse`: `title "Pay rent"`, `description null`, `status "to_do"`, `created_at` = request `now`, `due_at` in UTC ending `Z`, `finished_at null`, `is_overdue false`; one row stored | N/A |
| Rule broken | blank title, title over 200, description over 5,000 | 422 envelope with that rule's exact 2.1a message; no row | domain error |
| Past | `due_at` = `now − 1 µs` | 422, message "That time has already passed."; no row | domain error |
| Shape | `due_at` missing or naive; `title` missing | 422, generic `VALIDATION_MESSAGE`; no row | request validation |
| Extra field | body includes `status` or `foo` | 422, generic message; no row | `extra="forbid"` |
| No token | missing or invalid bearer, even with a bad body | 401 `unauthenticated`; no row | auth dependency |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/domain/task.py` -- add `TaskView` (frozen: `task`, `is_overdue`) and `view_task(task, now)`.
- `src/bmad_first_project/application/auth.py` -- the shape to follow for use cases: plain functions taking `uow` and `now`.
- `src/bmad_first_project/adapters/http/auth.py` -- router pattern and `error_responses(401)`. The token route's `_NoStoreRoute` is not needed here.
- `src/bmad_first_project/adapters/http/dependencies.py` -- `CurrentSessionDep`, `UnitOfWorkDep`, `NowDep`.
- `src/bmad_first_project/main.py` -- `app.include_router(...)` for the new router.
- `tests/api/test_auth.py:30-100` -- `_create_account`, `_login`, `_token`, `_bearer`, `FIXED_NOW`, `VALIDATION_BODY` and the `app`/`client` fixtures. Move the ones the new file needs into `tests/api/conftest.py`; don't copy them.
- `tests/api/test_openapi.py:126-160` -- pattern for per-route OpenAPI assertions.
- `frontend/package.json` `generate` script -- rewrites `frontend/openapi.json` and the generated client under `frontend/src/api/`. `tests/contract/test_openapi_export.py` fails if they are stale.

## Tasks & Acceptance

**Execution:**
- [x] `tests/application/test_create_task.py` and `tests/domain/test_task.py` -- write first: the use case stores through a unit of work and returns the view; `view_task` is overdue only when `due_at < now`.
- [x] `src/bmad_first_project/domain/task.py` -- `TaskView` and `view_task`.
- [x] `src/bmad_first_project/application/tasks.py` -- `create_task(uow, now, title, description, due_at) -> TaskView`: `new_task`, then `uow.tasks.add`, then `view_task`.
- [x] `src/bmad_first_project/adapters/http/tasks.py` -- `router` with prefix `/api/tasks`, `CreateTaskBody`, `TaskResponse` (`from_view`) and `create_task` (201).
- [x] `src/bmad_first_project/main.py` -- include the tasks router.
- [x] `tests/api/conftest.py` and `tests/api/test_tasks.py` -- every matrix row, asserting exact bodies and the row count; plus an OpenAPI check that `POST /api/tasks` has operation ID `create_task`, a 201 `TaskResponse`, and 401/422 as `ErrorResponse`.
- [x] `frontend/openapi.json` and the generated client -- `cd frontend && npm run generate` (Node 24, see `.nvmrc`).

**Acceptance Criteria:**
- Given the regenerated client, when `uv run pytest` runs, then the drift tests pass, and `cd frontend && npm run lint && npm run build && npx vitest run` pass.

## Implementation Notes

- Implemented by a fresh subagent and verified by the main session from the diff: backend 274 passed (250 + 24), ruff clean; frontend lint, build and Vitest 92 passed on Node 24.8.0; `npm run generate` is stable.
- The generated client is in `frontend/src/client/`, not `frontend/src/api/` as the Code Map said.
- Shared API test helpers moved to `tests/api/conftest.py` and are imported as `from tests.api.conftest import ...`. This works under the project's `--import-mode=importlib`.
- Mutations, each caught by `tests/api/test_tasks.py` or the domain tests: `extra="ignore"` (3 fail), plain `datetime` instead of `AwareDatetime` (1 fails), the auth dependency removed (5 fail), overdue `<` → `<=` (3 fail).
- `is_overdue` is `due_at < now` with no status check. Epic 3 must exclude finished tasks (epic context: finished tasks are never overdue).
- The `Z` suffix comes from Pydantic's default for UTC values; the create path always holds UTC because `new_task` converts.
- Review patches: `due_at` is `Annotated[AwareDatetime, BeforeValidator(_require_string), AfterValidator(_to_utc)]`. `Strict()` was tried and rejected, because FastAPI validates the parsed body in Python mode, where strict datetimes reject ISO strings too. Helpers live in `tests/api/helpers.py`, and conftest keeps only fixtures. After patching: backend 276 passed, frontend checks pass, and `openapi.json` is unchanged by the patch.
- Process slip: a mutation was reverted with `git checkout` on an uncommitted file, which erased `TaskView`/`view_task`. It was restored from the saved review diff and checked identical, and the suite was re-run (274 passed).

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 12 findings), Edge Case Hunter (EC, 3), Verification Gap (VG, no gaps, 1 other).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| EC1 | `due_at` near `datetime.max` with a negative offset → `OverflowError` → 500 | medium | EC reproduced it; nothing converts to UTC at the HTTP boundary, which AD-13 requires | patch: a UTC-converting validator on `due_at` makes it the shape 422 |
| EC2 | a JSON number `due_at` is accepted as a Unix timestamp | medium | EC verified it under Pydantic lax mode; AD-13 requires ISO 8601 with an offset | patch: strict `AwareDatetime` |
| BH1, EC3, VG-o | `test_token_expires_seven_days_afterlog_in`, mangled by find-and-replace | low | `tests/api/test_auth.py:177` | patch: restore the name |
| BH4 | helpers imported from `conftest.py` | low | works only under `--import-mode=importlib`; a conftest is a plugin, not a module | patch: move them to `tests/api/helpers.py` |
| BH8 | `create_task` docstring omits that `uow` must be active | low | `create_or_update_account` documents it | patch: one sentence |
| BH2 | `view_task` would call a finished task overdue | maybe-false (medium if reachable) | frozen intent says `due_at < now`; no task can be finished until Epic 3 | defer: the deferred-work ledger, for Epic 3 |
| BH3 | rollback after `add` untested | low | `tests/persistence/test_tasks.py::test_rollback_stores_nothing` and the UoW tests cover rollback | rejected |
| BH5 | empty/null description and the 200/5,000 boundaries untested at the API | low | the domain tests cover them; the route has no value constraints (pinned by the OpenAPI test) | rejected |
| BH6 | wrong-type bodies (`title: null`, `[]`, …) untested | low | standard Pydantic shape errors route to the generic 422 handler | rejected |
| BH7 | a third copy of the in-memory fakes | low | retro A5 accepted this, to consolidate opportunistically | rejected |
| BH9 | `from_view`'s `RuntimeError` untested; `previous_status` exclusion | low | the OpenAPI test pins the exact property set | rejected |
| BH10 | `session` parameter unused | low | the auth-removal mutation fails 5 tests | rejected |
| BH11 | no `Location` header on 201 | false | AD-14 defines the 201 body only; no story asks for `Location` | rejected |
| BH12 | OpenAPI test doesn't pin the `TaskStatus` enum or required fields | low | the drift tests pin the committed `openapi.json`, which carries both | rejected |

## Verification

**Commands:**
- `uv run pytest` -- expected: all pass (250 plus the new tests).
- `uv run ruff check . && uv run ruff format --check .` -- expected: clean.
- `cd frontend && npm run lint && npm run build && npx vitest run` (Node 24) -- expected: pass.
