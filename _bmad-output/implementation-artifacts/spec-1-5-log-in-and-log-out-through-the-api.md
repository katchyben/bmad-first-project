---
title: 'Story 1.5a: Log in and log out through the API'
type: 'feature'
created: '2026-10-02'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The account exists (1.4), but the API can't log anyone in, and nothing protects routes. Every task route in Epics 2–3 needs one shared auth dependency.

**Approach:** Add a `sessions` table, `login`/`authenticate`/`logout` use cases, `POST /api/auth/token` (OAuth2 password form) and `POST /api/auth/logout`, and one bearer-token auth dependency, verified with a test-only protected route. `create-account` deletes all sessions. This is the first part of Story 1.5. The offline schema export, drift check and regenerated frontend client (1.5b) were split off by the user's decision and are logged in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- Login returns `{"access_token": <secrets.token_urlsafe(32)>, "token_type": "bearer"}`. Only the token's SHA-256 hex is stored (unique), with `account_id` (FK → `account.id`, `ON DELETE CASCADE`) and `expires_at = now + 7 days`, using the request's single `now`.
- Wrong password, unknown username (compared exactly after trimming) → 401 `unauthenticated` with exactly "That username and password don't match.", identical for both. Empty form fields are a 422 shape error.
- `authenticate(token, now)` accepts only while `now < expires_at`. A missing, malformed, unknown, expired or logged-out token → 401 envelope with "Log in to continue." (never FastAPI's `{"detail": …}`), with `WWW-Authenticate: Bearer`. Unauthenticated wins over shape validation.
- The auth dependency (`OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)` → `authenticate`) is the one every protected route uses, exported as a reusable alias. It shares the request's `UnitOfWorkDep` and `now`.
- `POST /api/auth/logout` requires auth, deletes that session row and returns 204. The old token is rejected afterwards.
- Every `create-account` success deletes all sessions in the same unit of work.
- Tokens, token hashes and passwords never appear in logs, or in any response except the login response's token.
- OpenAPI: the auth routes declare their 401 as `ErrorResponse`; operation IDs `login`/`logout` (function names); all operation IDs are unique (a test fails on duplicates).
- From deferred notes: the `sessions` table lives in `tables.py`; `env.py` runs migrations with SQLite foreign keys off on the migration connection (then `PRAGMA foreign_key_check`).

**Never:** No frontend changes, schema export or client regeneration (1.5b). No login UI (1.6). No refresh tokens, sliding expiry, rate limiting or lockout. No task routes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Login | account `benny`/`s3cret`; form `benny`/`s3cret` | 200 token body; one session row: hash = sha256(token), `expires_at` = now + 7 d | — |
| Bad password / unknown user | `benny`/`nope`, `alice`/`s3cret` | 401, identical bodies, the exact message | `UnauthenticatedError` |
| Valid token | Bearer token at login + 7 d − 1 µs | protected test route 200 | — |
| Expired | Bearer token at exactly login + 7 d, or later | 401 "Log in to continue." | — |
| Bad token | missing / `Basic x` / unknown | 401 envelope, `WWW-Authenticate: Bearer` | — |
| Auth beats shape | no token plus an invalid body | 401 | — |
| Logout | valid token | 204; row gone; the same token → 401 | — |
| create-account rerun | sessions exist | all rows deleted; old tokens → 401 | — |
| No leaks | any run | token/hash/password absent from caplog; token only in the login body | — |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/application/{ports.py,accounts.py}` -- `AccountStore`, `PasswordHasher`, `UnitOfWork.accounts`; `create_or_update_account` returns `AccountResult`. Add `SessionStore` and `UnitOfWork.sessions`; the use case calls `uow.sessions.delete_all()`.
- `src/bmad_first_project/adapters/persistence/{tables.py,unit_of_work.py,accounts.py}` -- `AccountRow` after the naming convention; `SqlUnitOfWork` builds `.accounts` in `__enter__`. Mirror this for `SessionRow`/`SqlSessionStore`/`.sessions` (`expires_at` uses `UTCDateTime`).
- `src/bmad_first_project/adapters/persistence/alembic/{env.py,versions/}` -- `0001`, `0002`; add `0003_sessions.py` hand-written; extend `tests/persistence/test_accounts.py::test_models_match_migrations` so it covers sessions.
- `src/bmad_first_project/adapters/http/{dependencies.py,errors.py}` -- `get_now`, `UnitOfWorkDep` (scope="function"), the error handlers, `ERROR_RESPONSES`. Add the auth dependency here, and an `error_responses(*codes)` helper.
- `src/bmad_first_project/main.py` -- wires the clock, engine, UoW factory and error handlers; add the auth router and the hasher on `app.state` (the HTTP adapter mustn't import `adapters/passwords.py`).
- `tests/conftest.py` -- `make_app`, `migrated_engine`, `fake_clock` (settable `value`); reuse them; create the account through the use case with the real hasher.
- Verified on FastAPI 0.142.2: a raising auth dependency yields 401 before body validation; empty OAuth2 form fields give 422; `OAuth2PasswordBearer` adds a security scheme.

## Tasks & Acceptance

**Execution:**
- [ ] `src/bmad_first_project/domain/session.py` -- `SESSION_LIFETIME`, the validity rule -- FR2
- [ ] `src/bmad_first_project/application/{ports.py,auth.py,accounts.py}` -- `SessionStore`; `login`, `authenticate`, `logout`; session deletion in `create_or_update_account` -- FR1–FR3, AR6
- [ ] `src/bmad_first_project/adapters/persistence/{tables.py,sessions.py,unit_of_work.py}`, `alembic/env.py`, `alembic/versions/0003_sessions.py` -- the table, store, UoW wiring, FK-off migrations -- AR4, AR5, AR6
- [ ] `src/bmad_first_project/adapters/http/{auth.py,dependencies.py,errors.py}`, `main.py` -- routes, the auth dependency alias, `error_responses` -- AR6, AR12, AR14
- [ ] `tests/...` -- every matrix row, operation-ID uniqueness, and model/migration sync including sessions -- NFR6

**Acceptance Criteria:**
- Given the repo, when `uv run ruff check .`, `uv run ruff format --check .` and `uv run pytest` run, then all pass, including the boundary and commit-rule tests.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `uv run ruff check . && uv run ruff format --check . && uv run pytest -q` -- expected: all pass
- With a scratch `DATABASE_URL` migrated to head and an account created, start uvicorn and `curl -s -X POST -d 'username=benny&password=s3cret' localhost:8000/api/auth/token` -- expected: a token body; never use `./data`
