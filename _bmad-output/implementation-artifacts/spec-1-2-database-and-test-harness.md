---
title: 'Story 1.2a: Database, migrations and test harness'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8f77105312cc5cbcd7123e8f8020108571b496f8'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The backend has no database. Stories 1.4 onward need SQLite persistence that is migrated (never `create_all`), stores aware-UTC datetimes without loss, refuses to run on a stale schema, and gives every API test its own migrated database and fake clock.

**Approach:** Add pydantic-settings config, one `make_engine`, a `UTCDateTime` type decorator, Alembic with an empty baseline migration, a startup schema check, and pytest fixtures that build each test app on a fresh migrated file database under `tmp_path`. This is the first part of Story 1.2. The unit of work (1.2b) was split off by the user's decision and is logged in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- SQLModel, SQLAlchemy and Alembic code lives only under `adapters/persistence/`.
- Every engine comes from `make_engine(url)`, which turns on SQLite `PRAGMA foreign_keys`, sets `check_same_thread=False` for SQLite, and creates the parent directory of a SQLite file.
- Migrations run only through Alembic. `env.py` takes its URL from `config.attributes["url"]` when present, otherwise from `Settings`. The app never calls `create_all`.
- `create_app()` refuses to start when the database isn't at the Alembic head, with a message naming the current and head revisions and the command `uv run alembic upgrade head`.
- `Settings` reads `DATABASE_URL`, defaulting to `sqlite:///./data/app.db`.

**Never:** No unit of work, sessions or `get_unit_of_work` (1.2b). No tables (the baseline migration is empty; `account` comes in 1.4). No repositories. No database or ORM time defaults. App wiring must not use `dependency_overrides`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Baseline migrate | Alembic `upgrade head` on a URL whose parent dir doesn't exist | dir and DB created, at head; no app tables | — |
| Datetime round-trip | write `2026-10-01T12:30:45.123456+02:00` via `UTCDateTime` | reads back `2026-10-01T10:30:45.123456+00:00`, `tzinfo is UTC` | — |
| Naive datetime write | write a naive datetime | rejected before reaching the database | `ValueError` |
| Foreign keys | `PRAGMA foreign_keys` on any `make_engine` connection | `1` | — |
| Stale schema | `create_app(engine=...)` on an unmigrated DB | doesn't build the app | `RuntimeError` with revisions + command |
| Fixture | any API test | its app runs on its own migrated `tmp_path` DB with the fake clock | — |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/main.py` -- `create_app(clock=None)` sets `app.state.clock`, installs the error handlers and the OpenAPI contract. Becomes `create_app(clock=None, engine=None)`: build the engine from `Settings` when None, run the schema check, set `app.state.engine`.
- `src/bmad_first_project/adapters/http/dependencies.py` -- `get_clock(request)` reads `app.state`; add `get_engine` the same way (1.2b's UoW will depend on it).
- `tests/architecture/test_import_boundaries.py` -- `ORM_PACKAGES = {"sqlmodel", "sqlalchemy"}`; add `"alembic"`. Top-level `bmad_first_project.settings` isn't a layer, so the checker allows adapters to import it.
- `tests/api/test_now.py`, `test_errors.py`, `test_openapi.py` -- call `create_app()` bare. That will fail the schema check, so move them onto the shared fixture, keeping their assertions.

## Tasks & Acceptance

**Execution:**
- [x] `src/bmad_first_project/settings.py` -- `Settings(BaseSettings)` with `database_url` -- AR16
- [x] `src/bmad_first_project/adapters/persistence/engine.py` -- `make_engine(url)` plus the FK pragma listener -- AR5
- [x] `src/bmad_first_project/adapters/persistence/types.py` -- the `UTCDateTime` `TypeDecorator`: aware in, UTC with microseconds stored, UTC re-attached on read -- AR4
- [x] `alembic.ini` (project root, `script_location` pointing into the package), `src/bmad_first_project/adapters/persistence/alembic/{env.py,script.py.mako,versions/0001_baseline.py}` -- `target_metadata = SQLModel.metadata`; an empty baseline -- AR5
- [x] `src/bmad_first_project/adapters/persistence/schema.py` -- `assert_schema_current(engine)`, which builds its Alembic `Config` from the package path so it works from any cwd -- AR5
- [x] `src/bmad_first_project/adapters/http/dependencies.py`, `main.py` -- `get_engine`; the engine wiring and schema check in `create_app` -- AR5
- [x] `tests/conftest.py` -- `migrated_engine` (a file DB under `tmp_path`, upgraded through Alembic with `config.attributes["url"]`), `fake_clock`, and `make_app` → `create_app(clock, engine)`; move the existing API tests onto it -- AR5, NFR6
- [x] `tests/persistence/test_engine_and_types.py`, `tests/persistence/test_migrations.py` -- every matrix row; the round-trip test uses a scratch table created in the test, never in the app -- NFR6
- [x] `tests/architecture/test_import_boundaries.py` -- add `alembic` to `ORM_PACKAGES` -- AR4

**Acceptance Criteria:**
- Given the repo, when `uv run ruff check .`, `uv run ruff format --check .` and `uv run pytest` run, then all pass, and `grep -rn create_all src` finds nothing.
- Given an unmigrated database, when the server starts, then it exits with the schema message. After `uv run alembic upgrade head`, it serves `/openapi.json` with 200.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (blind = B, edge-case = E, verification-gap = V):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| B5/E9 | `script.py.mako` always imports `sa`/`sqlmodel`, so op-only migrations fail F401 | medium | Linted a template-shaped `versions/0002_x.py`: F401 for both. The `sqlmodel` import is the usual SQLModel need (autogen `AutoString`), so keep it and exempt `versions/` from F401 | patch |
| V1 | The real CLI path (`alembic.ini` logging via `fileConfig`) is never run by a test | medium | Every test sets `configure_logger=False`; a broken logging section would crash `uv run alembic upgrade head` with all tests green | patch |
| B12c | FK tests only read the pragma; no violating insert is shown to fail | low | Confirmed: there's no enforcement test; a direct test addition | patch |
| V2 | FKs stay on during migrations, so batch table rebuilds can cascade-delete child rows | medium | Real once a referenced table is batch-altered; no tables exist yet, so the fix guards an undemonstrated state | defer |
| B1 | `env.py` imports no model modules, so autogenerate would see empty metadata | low | Real once 1.4 adds the first table; nothing to import yet | defer (with naming convention) |
| B3 | No constraint naming convention on `SQLModel.metadata` | low | Cheapest to set with the first table (1.4) | defer (with B1) |
| B2 | Generated migrations won't import `UTCDateTime`; `compare_type` not set | false | Alembic's autogenerate adds imports for user-defined types' modules, and `compare_type` defaults on in Alembic ≥ 1.12 | reject |
| B4 | Sequential `0001` vs random generated revision IDs | low | Cosmetic; mixing styles is harmless | reject |
| B6a/E3/V3 | The default DB path is cwd-relative | low | The frozen intent fixes the default `sqlite:///./data/app.db`; commands run from the project root | reject (per intent) |
| B6b | `data/` not gitignored | false | `.gitignore:17` has `data/` (since 1.1a) | reject |
| B7/E1/E2 | The engine isn't disposed on refusal or shutdown | low | The process exits on refusal; single-process local app; a lifespan hook adds complexity | reject |
| B8 | The schema check runs at build time, not startup | low | The frozen intent says `create_app()` refuses to start | reject (per intent) |
| B9/E4 | A refused start still creates an empty DB file | low | Real (SQLite creates it on connect), but harmless: the next run gives the same message | reject |
| B10 | No `busy_timeout`/WAL; in-memory pool trap | low | Single-user local app; no in-memory engines are used | reject |
| B11/E8 | `process_result_value` relabels aware values | low | Verified: a raw-SQL `'…12:00:00+02:00'` reads back as 12:00 UTC, but SQLAlchemy's SQLite parser drops the offset before the decorator, so the proposed fix wouldn't help; the app never writes raw SQL | reject |
| B12a/b | `TypeError` branch, `microsecond=0`, DST storage untested | low | The type contract is covered by the round-trip and naive tests | reject |
| B13 | The ALLOWED case claims `schema` imports `Settings` | false | It's a synthetic module source checked by the pure checker, not a claim about the real file | reject |
| B14 | Loose test typing, duplicate `MakeApp`/`FIXED`, leftover alias | low | Cosmetic | reject |
| B15/E10 | Engines created in tests aren't disposed | low | No ResourceWarnings in the run; macOS `tmp_path` cleanup is unaffected | reject |
| B16 | Every API test runs a full migration | low | 87 tests in 0.9 s | reject |
| B17 | `get_engine` returns `Any` and invites bypassing the UoW | low | 1.2b adds the UoW on top; typed `Any` because of the import boundary | reject |
| B18 | The diff omits `pyproject.toml`/lock/spec | false | Deps were pinned in 1.1a; the spec goes to the edge-case layer only | reject |
| E5/E6 | Malformed or empty `DATABASE_URL` gives a raw `ArgumentError` | false | Loud failure on bad config | reject |
| E7 | A `file:` database name without `uri=true` | low | Contrived; the default and the tests never use it | reject |

## Design Notes

The engine is wired through `create_app(engine=...)` and `app.state`, matching the Clock from 1.1a. The epic's "engine dependency override" is met by `get_engine` being overridable, but tests pass the engine in directly, so the startup schema check runs against the test database, not `./data/app.db`.

## Verification

**Commands:**
- `uv run ruff check . && uv run ruff format --check .` -- expected: no findings
- `uv run pytest -q` -- expected: all pass
- With `DATABASE_URL=sqlite:///<scratch dir>/v.db` (never deleting `./data`): `uv run uvicorn bmad_first_project.main:create_app --factory` -- expected: exits with the schema message; then `uv run alembic upgrade head` and rerun -- expected: serves `/openapi.json` with 200
