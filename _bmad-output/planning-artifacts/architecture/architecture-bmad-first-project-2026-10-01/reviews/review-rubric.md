---
reviewer: rubric (good-spine checklist)
target: ../ARCHITECTURE-SPINE.md
driving-prd: ../../../prds/prd-bmad-first-project-2026-10-01/prd.md
date: 2026-10-01
verdict: pass-with-fixes
---

# Rubric Review: Architecture Spine, Todo App (BMad Method demo)

## Verdict

**Pass with fixes.** The spine is lean and right-sized for a solo learning project. It is well traced to the PRD and fixes most of the real divergence points: the dependency direction, who owns business rules, the clock, the ORM boundary, migrations, auth, action endpoints, undo state, computed overdue, server-side ordering, the generated client, the error envelope and the wire format for date-times. Nothing blocks it. Four gaps would let two stories build things differently, and they are cheap to close: (1) tz-awareness of datetimes between the domain and SQLite, (2) error-envelope coverage of framework `HTTPException`s, (3) where the composition root lives and how the existing `[project.scripts]` entry is handled, and (4) who runs migrations and how the local runtime starts.

## Checklist

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Fixes the real divergence points for epics/stories, misses none | Mostly | Missing: datetime awareness at the persistence boundary (F1), composition root location (F3), when migrations run (F4), where the SPA keeps its token (F6). |
| 2 | Every AD Rule is enforceable and prevents its stated divergence | Mostly | AD-12 does not cover `HTTPException` (F2). AD-1 is ambiguous about the composition root (F3). AD-3, AD-4 and AD-11 name no enforcement mechanism (F7). |
| 3 | Nothing under Deferred lets two units diverge | Pass | Each deferral is a single-owner or post-MVP concern. TypeScript and Node are pinned once at scaffold, so one story owns them. Indexes, CI, Postgres, rate limiting and deployment are all outside MVP behaviour. |
| 4 | Named tech is verified-current | Pass (with one omission) | `.memlog.md` has dated PyPI and npm `(version)` entries that match the Stack table exactly. Passlib and python-jose are avoided correctly. `python-multipart` is missing; FastAPI's OAuth2 password form (AD-6) requires it (F5). |
| 5 | Ratifies rather than contradicts the existing repo | Mostly | Python 3.13, the `src/bmad_first_project` layout and uv tooling are all ratified. It does not mention the existing `bmad-first-project = "bmad_first_project:main"` script or the `uv_build` backend, and gives no entry point for `create-account` (F3). |
| 6 | Covers the PRD's capabilities | Pass | Every FR from FR-1 to FR-17 and every NFR from NFR-1 to NFR-6 appears in `binds` and in the Capability Map. PRD §9 Q1 and Q2 are answered (AD-6, AD-8, React, SQLite). Q3 is deferred to UX/frontend, and the API stays authoritative. |
| 7 | Every owned dimension is decided, deferred or open, especially the operational envelope | Partial | Deployment, hosting, HTTPS, CI and environments are explicitly deferred, which is fine. The local runtime is only half decided: Vite proxy and ports are in the seed, but there is no rule for when migrations run, nothing on how the dev processes start, and no default DB file location (F4). Config, logging and secrets are covered in Conventions. |
| 8 | No rationale prose bloat | Pass | About 2,000 words. "Prevents" lines are one sentence each, and rationale stays in the memlog. |
| 9 | Valid mermaid | Pass | All three blocks parse (`graph LR` with `-.label.->`, `<br/>` in node labels, and an `erDiagram` with a standalone entity). The ERD adds little (F8). |
| 10 | No template comments left | Pass | No `<!--`, `{{` or TODO markers. |

## Findings

### F1. Datetime tz-awareness across the SQLite boundary is undecided (Medium, AD-13 / AD-4)

AD-13 says "stored as UTC", and AD-3 has the domain compare `now` against `due_at` and `finished_at`. SQLite has no timezone-aware type. SQLAlchemy's `DateTime(timezone=True)` on SQLite gives back **naive** datetimes. If the clock adapter returns an aware `now` and the repository returns naive values, the domain raises `TypeError: can't compare offset-naive and offset-aware datetimes`. Two stories could each "fix" this differently: the persistence story strips tzinfo, while the domain story assumes aware values. This affects FR-4, FR-5, FR-9 to FR-11, FR-13 to FR-15 and every time test.

**Fix:** add one line to AD-13 or AD-4: "Domain datetimes are always tz-aware UTC. The persistence adapter stores UTC and re-attaches `UTC` on read (a single `TypeDecorator`). The `Clock` port returns aware UTC."

### F2. AD-12 does not cover framework `HTTPException`s, so its stated divergence leaks (Medium, AD-12)

The rule maps domain errors and re-wraps `RequestValidationError`. It does not cover Starlette/FastAPI `HTTPException`, which comes from:
- `OAuth2PasswordBearer`, which raises 401 `{"detail": "Not authenticated"}` when the header is missing. This is exactly FR-3's path.
- unknown routes (404) and wrong methods (405).

Those responses come back as `{"detail": ...}`, the very "different error shapes" AD-12 says it prevents. There is a related trap: a domain error class named `ValidationError` (AD-2) collides with `pydantic.ValidationError` in the one module that handles both (the HTTP adapter's handlers).

**Fix:** extend the AD-12 rule so that `StarletteHTTPException` is also re-wrapped (401 → `unauthenticated`, 404 → `not_found`, anything else → a generic code). Consider renaming the domain errors (for example `DomainValidationError` or `TaskValidationError`), or require them to be imported by module (`domain.errors.ValidationError`).

### F3. Composition root location and existing entry point not ratified (Medium, AD-1 / Structural Seed / brownfield)

AD-1 says nothing imports an adapter "except the composition root (app factory and CLI)". The seed, however, puts the "FastAPI app factory" inside `adapters/http/`. The factory has to wire `adapters/persistence` repositories into the routers, so either `adapters/http` imports `adapters/persistence`, which reads as a breach of AD-1, or a story invents its own wiring module. The import-boundary test needs an exact allow-list, and the spine does not give one.

On the brownfield side, `pyproject.toml` already declares `bmad-first-project = "bmad_first_project:main"`, which prints "Hello". The spine introduces `cli.py` with `create-account` but does not say whether it replaces that script, how the CLI is invoked (`uv run create-account`?), or what starts the server.

**Fix:** name the composition-root modules explicitly. For example, `bmad_first_project/main.py` holds `create_app()` and wires the adapters, and `bmad_first_project/cli.py` is the second root. These are the only modules allowed to import more than one adapter, and the boundary test allow-lists exactly these. Then add one line ratifying `[project.scripts]`: replace the hello `main` with `create-account = "bmad_first_project.cli:create_account"`, and run the server with `uv run uvicorn bmad_first_project.main:create_app --factory`.

### F4. The local operational envelope is half-decided: migrations and run workflow (Medium, Deferred / Conventions)

Deferring deployment is fine. But "local only" is the MVP's environment, so this altitude has to decide it. AD-5 forbids `create_all` but does not say **who runs `alembic upgrade head`** against the dev database: app startup, the `create-account` CLI, or a manual step. Two stories (the persistence setup story and the auth/CLI story) could each pick differently, and a fresh clone would fail with "no such table". Also unstated:
- the default SQLite file path and whether it is gitignored (`.gitignore` currently has no `*.db` entry)
- the dev start sequence (Uvicorn on :8000 plus Vite on :5173 with the proxy)
- whether FastAPI ever serves the built SPA (implicitly no, but say so)

**Fix:** add a "Local runtime" row to Conventions covering the DB path default (for example `./data/app.db`, gitignored), "migrations are applied by an explicit `uv run alembic upgrade head` (documented in the README); the app fails fast if the schema is behind", and the two start commands. Keep built-SPA serving under Deferred together with deployment.

### F5. Stack omits `python-multipart` (Low, Stack / AD-6)

FastAPI's `OAuth2PasswordRequestForm` (AD-6) needs `python-multipart`, and without it the import fails at startup. Add it with a verified version to the Stack and the memlog. `time-machine` was verified in the memlog but is absent from the Stack. That is fine if the fake `Clock` replaces it; drop it or list it, but say which.

### F6. SPA token storage and header injection undecided (Low, AD-6 / AD-11)

AD-6 fixes bearer tokens with a 7-day absolute session, but nothing says where the SPA keeps the token. If it is kept in memory only, a reload logs the user out and the 7-day session means nothing. If it goes in `localStorage`, that is an XSS trade-off worth naming. Nothing says how the generated client attaches the header either. The login story and the API-client story could diverge.

**Fix:** one rule, for example "the token is kept in `localStorage` under one key and attached by a single request interceptor configured on the generated client; on any 401 the token is cleared and the user is sent to login."

### F7. Some Rules lack an enforcement mechanism (Low, AD-3 / AD-4 / AD-11)

AD-1 names its import-boundary test. The others do not:
- AD-4 (SQLModel/SQLAlchemy only under `adapters/persistence/`) can be enforced by the same test.
- AD-3 can use Ruff `DTZ` plus `flake8-tidy-imports` banned-api for `datetime.now`/`time.time`, with a per-file ignore for the clock adapter.
- AD-11 (no `fetch`/`axios`) needs a frontend linter, and none is in the Stack (no ESLint).

Adding a half-clause to each rule makes them checkable instead of just aspirational.

### F8. ERD is a stub (Low, Structural Seed)

The `erDiagram` shows three entities with only `int id`, and TASK is unconnected. It conveys almost nothing. Either drop it, or list the columns the ADs already imply: TASK `title`, `description`, `due_at`, `status`, `previous_status`, `finished_at`, `created_at`; SESSION `token_hash`, `account_id`, `expires_at`; ACCOUNT `username`, `password_hash`. That fixes the persistence shape the domain and migration stories must share, and it makes explicit that `created_at` (the FR-13/FR-15 tie-break) comes from the `Clock` port.

## What is good (keep)

- The ADs are crisp, each has a one-line "Prevents", and the Rules are concrete: exact endpoints, codes, field names and the undo inequality.
- AD-7 (action endpoints only) and AD-8 (undo state on the task) remove the two most likely design forks the PRD addendum raised.
- AD-9 and AD-10 keep NFR-1 honest: the server computes overdue and owns order, and the frontend never re-sorts.
- The Deferred table gives a real reason for each item and names the trigger for revisiting it (HTTPS and rate limiting "before any network exposure").
- The memlog holds versions, rejected options and rationale, so the spine itself stays free of prose.
