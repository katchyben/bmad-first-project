---
title: 'Story 1.2b: Unit of work'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c7d4610c91709e71834f29ec8e17e1133bfe2b64'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.4 and 1.5 write to the database, but there's no single owner of transactions. Without one, repositories or routes would commit ad hoc, and a commit that fails after the response is sent would tell the client "200" for lost data.

**Approach:** This is the second part of Story 1.2, split from 1.2a. Add a `UnitOfWork` port, a SQL implementation owning one session, and a request-scoped FastAPI dependency. The dependency commits when the route succeeds, before the response is sent, and rolls back and re-raises on any exception, so the error handlers still produce the envelope.

## Boundaries & Constraints

**Always:**
- The application layer sees only the `UnitOfWork` Protocol (a context manager: `__enter__` returns itself; `__exit__` commits on a clean exit, otherwise rolls back and lets the exception propagate). No SQLAlchemy types in the port.
- `SqlUnitOfWork(engine)` lives in `adapters/persistence/`, opens one `Session` on enter and always closes it on exit. It exposes `.session` for future repositories (adapter-internal, not on the port). Nothing else in the codebase calls `commit()`.
- The HTTP adapter must not import the persistence adapter, so `create_app` wires `app.state.unit_of_work_factory: Callable[[], UnitOfWork]`, and the HTTP dependency `get_unit_of_work` uses only that factory.
- `get_unit_of_work` is a `yield` dependency used only through an exported alias `UnitOfWorkDep = Annotated[UnitOfWork, Depends(get_unit_of_work, scope="function")]`, so its exit (and the commit) runs before the response is sent.

**Never:** No repositories, tables, migrations or use cases. No `dependency_overrides` in app wiring. No commit inside routes or helpers. No retries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Success | a route inserts a row via the UoW, then returns | 200; the row is visible from a new connection | — |
| Domain error | a route inserts a row, then raises `NotFoundError("Gone.")` | the row is absent; 404 envelope with "Gone." | rollback, re-raise |
| Unexpected error | a route inserts a row, then raises `RuntimeError` | the row is absent; 500 | rollback, re-raise |
| Commit fails | `session.commit` raises (monkeypatched) after a clean route | the client gets 500, never 200; nothing persisted | the exception propagates |
| Direct use | `with SqlUnitOfWork(engine) as uow:` insert, clean exit / raise | committed / rolled back and re-raised; the session is closed either way | — |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/application/ports.py` -- holds `Clock`; add `UnitOfWork`.
- `src/bmad_first_project/adapters/http/dependencies.py` -- `get_clock`/`get_engine` read `request.app.state`; add `get_unit_of_work` and `UnitOfWorkDep` beside them.
- `src/bmad_first_project/main.py` -- `create_app(clock=None, engine=None)` builds or receives the engine, checks the schema, sets `app.state.engine`; add the factory here (only `main.py` may import both adapters).
- `tests/conftest.py` -- `make_app` (migrated `tmp_path` DB plus `fake_clock`) and `migrated_engine`; reuse them. Scratch tables in tests are created with raw SQL on `migrated_engine`, never by the app.
- Verified on FastAPI 0.142.2: with `scope="function"`, a `NotFoundError` raised in the route passes through the dependency's `with` exit and still yields the 404 envelope, and an exception raised after `yield` (where the commit happens) makes the client get 500, not 200.

## Tasks & Acceptance

**Execution:**
- [x] `src/bmad_first_project/application/ports.py` -- the `UnitOfWork` Protocol -- AR15
- [x] `src/bmad_first_project/adapters/persistence/unit_of_work.py` -- `SqlUnitOfWork` -- AR15
- [x] `src/bmad_first_project/adapters/http/dependencies.py` -- `get_unit_of_work` and `UnitOfWorkDep` -- AR15
- [x] `src/bmad_first_project/main.py` -- `app.state.unit_of_work_factory = lambda: SqlUnitOfWork(engine)` -- AR1, AR15
- [x] `tests/persistence/test_unit_of_work.py` -- the direct-use matrix row -- NFR6
- [x] `tests/api/test_unit_of_work.py` -- the HTTP matrix rows using test-only routes on `make_app()` and `TestClient(raise_server_exceptions=False)` where a 500 is expected -- NFR6

**Acceptance Criteria:**
- Given the repo, when `uv run ruff check .`, `uv run ruff format --check .` and `uv run pytest` run, then all pass, including the import-boundary test.
- Given the source tree, when searched for `.commit(`, then the only hit is in `adapters/persistence/unit_of_work.py`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (blind = B, edge-case = E, verification-gap = V):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| B4 | Public `get_unit_of_work` used via plain `Depends()` gets request scope and commits after the response | medium | Real: only the alias carries `scope="function"`; V's mutation shows request scope breaks commit-before-response. Direct fix: make it private | patch |
| B3/V | "Only the UoW commits" is checked only by a manual grep | medium | `tests/architecture/` has no commit check; a later repository `commit()` would pass CI | patch |
| E1 | If `session.close()` raises, `_session` is never reset and the UoW stays "active" | low | Real at `unit_of_work.py` `finally`; a direct correction with a nested `finally` | patch |
| B5 | `test_success_commits_before_response` can't observe ordering | low | `TestClient` returns after the whole ASGI call; only the commit-failure test proves ordering. Rename | patch |
| B6 | The commit-failure persistence test doesn't assert the session is closed | low | Its two sibling tests do; a direct test addition | patch |
| B1/E2 | A failing `rollback()` masks the route's exception (404 → 500) | low | A rollback failure on SQLite means the connection is broken; a loud 500 is acceptable; the fix adds a guard | reject |
| E3 | `close()` raising after a successful commit gives 500 | low | Contrived; `close()` on a committed SQLite session doesn't raise in practice | reject |
| B2 | `expire_on_commit=True` breaks routes returning ORM objects | false | The architecture maps table rows to plain domain objects inside repositories, and routes return `TaskResponse` from `TaskView`, so no ORM object outlives the session | reject |
| E4 | pysqlite doesn't `BEGIN` before the first DML, so read-then-write isn't atomic | medium | Known pysqlite legacy transaction behaviour, inherited from 1.2a's `make_engine`, not caused by this story | defer |
| B7 | Re-entry and pre-enter `.session` guards untested | low | No caller relies on them (V agrees it's not a gap) | reject |
| B8 | The factory test doesn't check which engine is used | false | The HTTP tests read rows back from `migrated_engine`; a wrong engine would fail them (V) | reject |
| B9 | The port exposes no repositories | low | Repositories are excluded by the intent; 1.4 adds them | reject |
| B10 | Duplicated scratch helpers in two test files | low | Cosmetic | reject |
| B11 | The factory lambda is untyped at wiring | low | Wrong shapes fail every UoW test immediately | reject |
| E5 | A route returning an error `Response` (not raising) commits | low | The codebase signals errors by raising domain errors (1.1b); no route returns error responses | reject |
| E6 | `StreamingResponse` bodies read after the session closes | false | No streaming routes exist or are planned | reject |
| E7 | "database is locked" shows as a 500 | low | Single-user local app | reject |

## Verification

**Commands:**
- `uv run ruff check . && uv run ruff format --check .` -- expected: no findings
- `uv run pytest -q` -- expected: all pass
- `grep -rn "\.commit(" src` -- expected: only `adapters/persistence/unit_of_work.py`
