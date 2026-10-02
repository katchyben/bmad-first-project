---
title: 'Story 2.1a: Create tasks in the domain and store them'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '2d1a548c6e9669fe5b71105302543180303a47da'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has no notion of a task yet. Every later Epic 2 story (the create API, list, edit, delete and the web screens) needs one domain `Task` with its value rules, plus a `tasks` table and repository to keep it.

**Approach:** Add the domain `Task` (AD-14 fields) with a `new_task` factory that applies the AD-2 value rules against an explicit `now`. Add the `TaskRepository` port, a SQL adapter and migration `0004`, and wire `tasks` into the unit of work. There is no HTTP route and no use case here; Story 2.1b adds both.

## Boundaries & Constraints

**Always:**
- Rules live only in `domain/task.py` (AD-2). The title is trimmed, then 1–200 code points (Python `len`). The description is at most 5,000 code points and is not trimmed. A `due_at` before `now` is rejected; equal to `now` is accepted. Each rule raises `DomainValidationError` with its own module-level message constant.
- A new task is `to_do`, `created_at = now`, `finished_at = None`, `previous_status = None`, `id = None` until stored.
- Datetimes are aware UTC. Columns use `UTCDateTime`; the domain rejects a naive `due_at` or `now` loudly with `ValueError`, not `DomainValidationError`, because the HTTP schema rejects naive input first (AD-13).
- `TaskRepository` never commits, orders or raises domain errors (AD-15). `add` returns the task with its database ID.
- Status is stored as its string value (`to_do`, `in_progress`, `done`, `cancelled`), with a CHECK constraint on `status` and `previous_status`.

**Never:**
- No HTTP route, schema, `TaskResponse`, `TaskView` or `is_overdue`; no OpenAPI or frontend change.
- No `save`, `delete` or `list` on the port yet; Stories 2.2–2.4 add them when they first need them.
- No transition table or status changes (Epic 3).
- No index other than the primary key.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid | title `"  Pay rent "`, description `None`, `due_at = now + 1 day` | `Task(title="Pay rent", status=TO_DO, created_at=now, …)` | N/A |
| Due now | `due_at == now` | accepted | N/A |
| Blank title | `""` or `"   "` | nothing created | `DomainValidationError(BLANK_TITLE_MESSAGE)` |
| Title 200 / 201 | 200 code points after trim / 201 | accepted / rejected | `DomainValidationError(TITLE_TOO_LONG_MESSAGE)` |
| Description 5,000 / 5,001 | code points | accepted / rejected | `DomainValidationError(DESCRIPTION_TOO_LONG_MESSAGE)` |
| Past | `due_at = now − 1 µs` | rejected | `DomainValidationError("That time has already passed.")` |
| Empty description | `""` | stored as `None` | N/A |
| Non-UTC offset | `due_at` at `+02:00` | stored and read back as the same instant in UTC | N/A |
| Naive | naive `due_at` or `now` | rejected | `ValueError` |

**Decisions (Benny, 2026-10-02):**
- Messages: blank title "Enter a title."; title over 200 "Keep the title to 200 characters or fewer."; description over 5,000 "Keep the description to 5,000 characters or fewer."
- Spec kept whole at about 2,190 tokens (over the 1,600 guideline) rather than split again.

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/domain/account.py` -- pattern to copy: frozen dataclass, `normalise_*` and `check_*` functions, message constants.
- `src/bmad_first_project/domain/errors.py` -- `DomainValidationError(message)`; reuse, don't add types.
- `src/bmad_first_project/domain/session.py` -- frozen dataclass with `id: int | None = None` last.
- `src/bmad_first_project/application/ports.py` -- add `TaskRepository` Protocol and `UnitOfWork.tasks`.
- `src/bmad_first_project/adapters/persistence/tables.py` -- add `TaskRow`; naming convention gives `pk_tasks` and `ck_tasks_*`.
- `src/bmad_first_project/adapters/persistence/sessions.py` -- pattern for the SQL store: `_to_domain`, constructor takes `Session`.
- `src/bmad_first_project/adapters/persistence/unit_of_work.py` -- add `tasks` the same way as `sessions`: a property guard, set in `__enter__`, cleared in `__exit__`.
- `src/bmad_first_project/adapters/persistence/alembic/versions/0003_sessions.py` -- pattern for `0004_tasks.py` (`op.f` names, `down_revision = "0003"`).
- `tests/persistence/test_migrations.py` and `src/bmad_first_project/adapters/persistence/schema.py` -- head is checked at startup; existing tests read the head dynamically, so check whether any literal `0003` needs updating.
- `tests/persistence/test_sessions.py` and `tests/persistence/test_unit_of_work.py` -- fixtures (`migrated_engine`) and round-trip test patterns.
- `tests/application/test_auth.py:20-80` -- in-memory port fakes. If a fake `UnitOfWork` must now expose `tasks` to satisfy the Protocol, add a minimal one there.
- `tests/architecture/test_import_boundaries.py` -- must keep passing: the domain imports only stdlib and `domain.*`.

## Tasks & Acceptance

**Execution:**
- [x] `tests/domain/test_task.py` -- write first: every matrix row, exact message strings, code points via a non-BMP character (e.g. `"😀" * 200`), an explicit `now`, no sleeping -- red before green.
- [x] `src/bmad_first_project/domain/task.py` -- `TaskStatus(StrEnum)`, frozen `Task`, the three message constants plus `PAST_DUE_MESSAGE`, and `new_task(title, description, due_at, now) -> Task` -- the single owner of the rules.
- [x] `src/bmad_first_project/application/ports.py` -- `TaskRepository` with `add(task) -> Task` and `get(id) -> Task | None`; `UnitOfWork.tasks` property -- port per AD-15.
- [x] `src/bmad_first_project/adapters/persistence/tables.py` and `.../alembic/versions/0004_tasks.py` -- the `tasks` table: `id` PK, `title` and `status` not null, `description` and `previous_status` nullable, `due_at` and `created_at` `UTCDateTime` not null, `finished_at` nullable, CHECKs on both status columns -- AD-14 columns.
- [x] `src/bmad_first_project/adapters/persistence/tasks.py` -- `SqlTaskRepository` (`add` flushes to obtain the ID and returns `dataclasses.replace(task, id=…)`; `get`) -- the adapter.
- [x] `src/bmad_first_project/adapters/persistence/unit_of_work.py` -- expose `tasks`.
- [x] `tests/persistence/test_tasks.py` -- round-trip through `SqlUnitOfWork` (add, commit, new UoW, get equals the task with its ID, `due_at` UTC from a `+02:00` input), `get` of a missing ID returns `None`, rollback stores nothing, a CHECK rejects an unknown status, and the migration reaches head with the `tasks` columns.

**Acceptance Criteria:**
- Given migrations run on an empty scratch DB, when `alembic upgrade head` completes, then head is `0004` and the app starts (the schema check passes).
- Given the full suite, when `uv run pytest` runs, then it passes, including the import-boundary and commit-rule architecture tests, and `ruff check` and `ruff format --check` are clean.

## Implementation Notes

- Implemented by a fresh subagent from this spec, then verified by the main session from the diff. Backend 247 passed (219 + 28), ruff clean, and `npm run generate` produced no drift.
- Mutations, each caught by `tests/domain/test_task.py`: `<` → `<=` on the due check (1 fails); title limit +1 (1 fails); no trim (4 fail); description `>` → `>=` (1 fails).
- Existing tests that hard-coded head `0003` or the table set were updated: `test_sessions.py` (its test-only revision now sits on `0004`), `test_migrations.py` and `test_accounts.py`.
- `TaskRow` declares the CHECKs in `__table_args__`. Correction (review): `compare_metadata` does not compare CHECK constraints. The model builds its list from `TaskStatus`; the migration keeps a literal copy on purpose, because migrations must stay frozen; the all-status round trip proves the migration's list.
- Not done: the in-memory `FakeUnitOfWork` in `tests/application/test_auth.py` has no `tasks`. Nothing type-checks it against the Protocol, and 2.1b's use-case tests will need their own fake anyway.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 10 findings), Edge Case Hunter (EC, 7), Verification Gap (VG, 1 gap plus 1 other).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH1, EC3, VG1 | `cancelled` (and `to_do`/`done` as `previous_status`) are never stored through the migrated schema, so a misspelled CHECK value would pass | medium | the round-trip tests store only `to_do`, `done` and `in_progress`; the CHECK test rejects only `'nope'` | patch: parametrized round-trip over every `TaskStatus` |
| BH2, VG-other | `tables.py` hand-copies the status list; `compare_metadata` ignores CHECK text, so the Implementation Notes claim was wrong | medium | VG reproduced it: a model CHECK of `IN ('x')` still gave `[]` from `compare_metadata` | patch: build from `TaskStatus` under a private name (grouped with BH1, same root cause: an untested, hand-copied status list) |
| BH3, EC7 | `add` returns the caller's offset (`+02:00`); `get` returns UTC | medium | `new_task` stored `due_at` as given, and `add` returns `replace(task, id=…)` | patch: `new_task` converts to UTC |
| BH6 | `_require_aware` runs twice per call | low | `new_task` and `check_due_at` both call it | patch: delete the calls in `new_task` |
| BH4, EC1 | `add` with an `id` already set inserts a duplicate | low | no caller passes a stored task to `add` (only `new_task` output reaches it), and the guard covers an undemonstrated state | rejected |
| BH5 | `Task` enforces no invariants when built directly | low | AD-2 puts the rules in `new_task` and the domain functions; direct construction is test-only | rejected |
| EC2 | no DB CHECK on title or description length | false | AD-2: value rules live only in the domain, not in schemas or the DB | rejected |
| BH7, EC4 | a whitespace-only description is kept | low | frozen intent: the description "is not trimmed"; only `""` becomes `None` | rejected |
| BH8 | messages hard-code 200 and 5,000 | low | the tests pin the exact strings, so a changed limit fails a test | rejected |
| BH9 | `FakeUnitOfWork` in `test_auth.py` lacks `tasks` | low | no type checker runs, and the auth tests never touch `tasks` | rejected |
| BH10 | no downgrade→upgrade round trip; CHECK text not asserted | low | the new all-status round trip proves the migration's list; downgrade is tested | rejected |
| EC5 | a title of only zero-width characters passes the blank check | low | outside the frozen rule ("trimmed, then non-empty"); rare | rejected |
| EC6 | control characters or newlines in a title are accepted | low | no rule forbids them; the UI clamps display | rejected |

## Design Notes

`new_task` returns a new frozen `Task` instead of mutating, matching `Account` and `UserSession`. Later stories will add `edit`, `start` and the rest as functions returning replacements, and `save` will persist the whole task (AD-15).

## Verification

**Commands:**
- `uv run pytest` -- expected: all pass (was 219, plus the new tests).
- `uv run ruff check . && uv run ruff format --check .` -- expected: clean.
- `cd frontend && npm run generate && git status --short` -- expected: no change (no OpenAPI impact).
