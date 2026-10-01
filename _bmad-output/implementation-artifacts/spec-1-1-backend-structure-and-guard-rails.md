---
title: 'Story 1.1a: Backend structure and time guard rails'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd06839451e656911bbeb46e469d49f0298271bc4'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The uv package `src/bmad_first_project` is an empty "hello" scaffold. Every later story needs the same layer boundaries and one source of "now" already enforced, or each story will invent its own.

**Approach:** Lay out the light hexagonal skeleton, pin the backend stack, and add the guard rails: an import-boundary test, Ruff `DTZ` with banned clock APIs, and a `Clock` port read once per request. A runnable `create_app()` serves OpenAPI. This is the first half of Story 1.1. The error envelope and OpenAPI contract (1.1b) were split off by the user's decision and are logged in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- `domain/` imports only the standard library. `application/` imports only `domain/` and itself. An adapter may import `application/` and `domain/`, never another adapter. Only `main.py` and `cli.py` import adapters. SQLModel and SQLAlchemy are imported only under `adapters/persistence/`.
- Every datetime is timezone-aware UTC. `datetime.now`/`utcnow`/`today`, `date.today` and `time.time`/`time_ns` appear only in `adapters/clock.py`.

**Never:** No error types, exception handlers, `ErrorResponse` or operation-ID config (1.1b). No real routes, database, Settings, migrations or auth (1.2 and later). No new tooling beyond the pinned stack (no `import-linter`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One `now` per request | a test route and its sub-dependency both depend on `get_now` | the fake clock is called exactly once, and both see the same aware-UTC value | — |
| Naive clock value | the clock returns a naive datetime, or one with a non-zero offset | the request fails | `get_now` raises `RuntimeError` (explicit check, not `assert`) |
| Forbidden import | a synthetic module, e.g. `domain` importing `fastapi`, `application` importing an adapter, `adapters.http` importing `adapters.persistence`, `sqlmodel` outside persistence, or a relative `from ..adapters import x` | the checker reports a violation | — |
| Banned clock call | a temp file outside the clock adapter calling `datetime.now()` or `time.time()` | `ruff check` exits non-zero with `DTZ`/`TID251` | — |

</frozen-after-approval>

## Code Map

- `pyproject.toml` -- currently no dependencies, and the placeholder `[project.scripts] bmad-first-project`, which goes. Add the pinned runtime deps, a `dev` group, `[tool.ruff]` and `[tool.pytest.ini_options]`.
- `src/bmad_first_project/__init__.py` -- holds the placeholder `main()`; empty it.
- `.gitignore` -- add `data/`.
- Pinned versions (verified to resolve on 3.13): fastapi 0.142.2, pydantic 2.13.5, pydantic-settings 2.15.0, python-multipart 0.0.32, uvicorn 0.54.0, sqlmodel 0.0.47, sqlalchemy 2.0.54, alembic 1.20.0, pwdlib[argon2] 0.3.1. Dev: pytest 9.1.1, httpx 0.28.1, ruff 0.16.9.
- `.agents/`, `.claude/`, `_bmad/`, `_bmad-output/` hold BMad tooling with its own Python. Ruff must `extend-exclude` them.
- Untracked `ruff.json` / `sqlalchemy.json` at the root are PyPI dumps; leave them alone.

## Tasks & Acceptance

**Execution:**
- [x] `pyproject.toml`, `.gitignore`, `src/bmad_first_project/__init__.py` -- pin deps, remove the placeholder script, configure Ruff (default rules plus `DTZ` and `TID251` with `banned-api` for the clock APIs, `per-file-ignores` for `src/bmad_first_project/adapters/clock.py`, the `extend-exclude` above) and pytest (`testpaths = ["tests"]`), ignore `data/`, then `uv sync` -- AR1, AR3, AR16
- [x] `src/bmad_first_project/domain/__init__.py`, `adapters/persistence/__init__.py` -- empty packages with a one-line docstring naming their role -- AR1
- [x] `src/bmad_first_project/application/__init__.py`, `application/ports.py` -- a `Clock` Protocol with `now() -> datetime` -- AR3
- [x] `src/bmad_first_project/adapters/__init__.py`, `adapters/clock.py` -- `SystemClock.now()` returns `datetime.now(UTC)` -- AR3
- [x] `src/bmad_first_project/adapters/http/__init__.py`, `adapters/http/dependencies.py` -- `get_clock(request)` returns `request.app.state.clock`; `get_now(clock=Depends(get_clock))` reads it once and enforces aware UTC; FastAPI's per-request dependency cache makes one read per request -- AR3
- [x] `src/bmad_first_project/main.py` -- `create_app(clock: Clock | None = None)`: a FastAPI app with `app.state.clock = clock or SystemClock()` -- AR1, AR16
- [x] `src/bmad_first_project/cli.py` -- a composition-root module with a docstring only (`create-account` arrives in 1.4) -- AR1
- [x] `tests/architecture/test_import_boundaries.py` -- an AST checker over `src/bmad_first_project` as a pure function (relative imports resolved to absolute names first), the real-tree test, and parametrized synthetic cases from the matrix -- AR1, AR4
- [x] `tests/architecture/test_clock_lint.py` -- the banned-clock matrix row, running `ruff` through `sys.executable -m ruff` against the project config -- AR3
- [x] `tests/api/test_now.py` -- the `now` matrix rows, using a `FakeClock` with a call counter passed to `create_app` and a test-only route -- AR3, NFR6

**Acceptance Criteria:**
- Given the repo, when `uv run ruff check .` and `uv run ruff format --check .` run, then both pass.
- Given the repo, when `uv run pytest` runs, then all tests pass.
- Given the repo, when `uv run uvicorn bmad_first_project.main:create_app --factory` starts, then `GET http://127.0.0.1:8000/openapi.json` returns 200.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (blind = B, edge-case = E, verification-gap = V):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| E1/E11/B6a | `from bmad_first_project import adapters` in an adapter is not flagged | low | Ran `check_imports`: it returns `[]`, because `_adapter()` is None for the two-part name | patch |
| E2 | `from bmad_first_project.adapters import *` in an adapter is not flagged | low | Ran it: `[]`; same root cause as E1 | patch (with E1) |
| E3/B6c | Dynamic `importlib`/`__import__` not seen | low | Real, but unlikely in this codebase, and the fix adds a call-parsing branch | reject |
| E4 | alembic not treated as an ORM package | low | The spine restricts only SQLModel/SQLAlchemy; Alembic lives in persistence anyway; going through `alembic.op` is contrived | reject |
| E5/B4 | `time.localtime`/`gmtime`/`ctime` not banned | low | Linting `time.localtime()` from stdin: no TID251. Direct config addition. `monotonic`/`perf_counter` aren't wall-clock "now", so they stay allowed | patch |
| E6/E12/B1 | A zero-offset non-UTC zone (London in winter) passes `get_now` | low | The `utcoffset()==0` check passes it, and a non-UTC tzinfo reaches callers. Only a misbehaving fake can produce it; the fix is one line: return `now.astimezone(UTC)` | patch |
| E7/B8 | A non-datetime clock value raises AttributeError, not RuntimeError | false | Fails loudly on an input no code path produces; `Clock.now` is typed `datetime` | reject |
| E8/B9 | `app.state.clock` unset gives AttributeError | false | Loud failure; every app comes from `create_app`, which always sets it | reject |
| E9 | WebSocket routes can't use `get_clock` | false | No websocket routes exist or are planned | reject |
| E10/B2 | `clock or SystemClock()` drops a falsy fake clock | low | Real but contrived; a direct correction to `is None` | patch |
| B3 | The `DTZ` exemption on `clock.py` hides a naive `now()` there | medium | Linting `datetime.now()` from stdin as `adapters/clock.py`: no DTZ005. Narrow it to `["TID251"]` | patch |
| B5/V2 | Lint tests never put an offender under `src/`, so widening the exemption goes unnoticed; `datetime.today` and alias forms untested | medium | V mutated the key to `src/**` and every test stayed green | patch |
| B7/V3 | No automated test that `create_app()` serves `/openapi.json` | low | Searched `tests/`: no `openapi`. It's this story's AC3; a one-line test | patch |
| B6b | An adapter importing `main`/`cli` is not flagged | low | Real, but unlikely; the fix adds a rule branch | reject |
| B10 | One read per request relies on FastAPI's cache (`use_cache=False` bypasses it) | low | No code uses `use_cache=False`; this is the documented FastAPI contract | reject |
| B11 | Starlette deprecation warning from pinned `httpx` | low | Comes from the architecture's stack pin, not this story | defer |
| B12 | The non-UTC test doesn't assert the HTTP 5xx | low | The behaviour (RuntimeError) is asserted; 5xx shaping belongs to 1.1b | reject |
| B13 | The review diff omitted the lock, spec and status; the PyPI dumps aren't gitignored | false | Excluded on purpose (bookkeeping and generated lock); `uv sync` validated the lock; the dumps are the user's files | reject |
| V1 | The composition-root branch has no test that would fail without it | medium | V mutated it to `if False:` and all tests passed | patch |
| V4 | The clock-lint test depends on the cwd | low | Ran pytest from `tests/`: `test_clock_adapter_is_exempt` fails | patch |

## Verification

**Commands:**
- `uv run ruff check . && uv run ruff format --check .` -- expected: no findings
- `uv run pytest -q` -- expected: all pass
- `uv run uvicorn bmad_first_project.main:create_app --factory` + `curl -s -o /dev/null -w '%{http_code}' localhost:8000/openapi.json` -- expected: `200`
