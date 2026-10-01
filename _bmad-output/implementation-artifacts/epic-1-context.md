# Epic 1 Context: Secure access to my own app

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up the whole project from scratch (there is no starter template) and lock it behind a single pre-created account. When this epic is done, the owner can create the account from the command line, log in through the web app, stay logged in for up to 7 days, and log out with immediate effect. Every task route is protected by one shared auth dependency. The epic also sets the boundaries, clock, error envelope, database harness and generated frontend client that every later epic builds on, so getting these right here prevents drift later.

## Stories

- Story 1.1: Backend structure and guard rails
- Story 1.2: Database and test harness
- Story 1.3: Frontend skeleton with generated API client
- Story 1.4: Create the account from the command line
- Story 1.5: Log in and log out through the API
- Story 1.6: Log in and out in the web app

## Requirements & Constraints

- **Login:** valid credentials start a session. Invalid credentials return `unauthenticated` with exactly "That username and password don't match.", the same for an unknown username and a wrong password.
- **Logout and expiry:** after logout the old token is rejected. A session expires exactly 7 days after login no matter how much it is used (rejected at `now >= expires_at`).
- **Protection:** every task endpoint rejects unauthenticated requests and returns no task data. A missing, malformed or unknown token gets the envelope, never FastAPI's default `{"detail": ...}`.
- **Account:** there is one account only. No registration, password reset, change-password or SSO. It is created or changed only by the CLI.
- **Security:** passwords are stored only as Argon2 hashes. Passwords, tokens and token hashes never appear in logs. A token appears in no response except the login response.
- **Errors:** every failure is one of `unauthenticated`, `validation_error`, `state_conflict`, `not_found` (plus `method_not_allowed`). Each has a calm, human-readable message the frontend shows exactly as written.
- **Testability:** every rule has an automated test. Time rules are tested with a fake clock, never by waiting. Frontend-only behaviour is covered by Vitest or Playwright.

## Technical Decisions

- **Light hexagonal layout** under `src/bmad_first_project/`: `domain/` (standard library only), `application/` (use cases and ports: `Clock`, `UnitOfWork`, `SessionStore`, `AccountStore`, `PasswordHasher`, `TaskRepository`), `adapters/http/`, `adapters/persistence/`. `main.py` (`create_app()`) and `cli.py` are the only composition roots and the only modules that import adapters. Adapters never import each other. SQLModel and SQLAlchemy are imported only in `adapters/persistence/`. An import-boundary test in `tests/architecture/` enforces all of this.
- **Domain errors:** `DomainValidationError`, `StateConflictError(reason?)`, `NotFoundError`, `UnauthenticatedError`. They are mapped in one exception-handler module to 422/409/404/401. Starlette 401/404/405 are wrapped too. Envelope: `{"error": {"code", "message", "reason"?}}`, declared as `ErrorResponse` on every route. The request-validation handler uses one fixed calm sentence and never Pydantic's text. Precedence: unauthenticated > shape validation > not found > state conflict > value validation.
- **Time:** one `now` per request, read once from the `Clock` port by a request-scoped dependency and passed to `authenticate` and the use case. The CLI reads the Clock once per command. Every datetime is aware UTC. `datetime.now()` and `time.time()` are allowed only in the system clock adapter (Ruff `DTZ` plus a banned-API rule with a per-file exception). Time columns have no database or ORM defaults.
- **Persistence:** Alembic owns the schema. Migrations are applied only with `uv run alembic upgrade head`, the app never calls `create_all`, and it refuses to start if the schema is behind. `env.py` takes its URL from `config.attributes["url"]`, falling back to `Settings`. One `make_engine(url)` builds every engine and turns on SQLite foreign keys. A `UTCDateTime` decorator stores UTC with microseconds and re-attaches UTC on read. A request-scoped `UnitOfWork` commits on success and rolls back on exception. Repositories never commit. The default DB is `./data/app.db` (gitignored). Config comes from pydantic-settings.
- **Auth:** `POST /api/auth/token` takes the OAuth2 password form and returns `secrets.token_urlsafe(32)`. The `sessions` table stores the token's SHA-256 hex (unique), `account_id` and `expires_at = now + 7 days`. The `authenticate(token)` use case owns lookup and expiry. The HTTP dependency reads the bearer header with `auto_error=False`. `POST /api/auth/logout` deletes the row and returns 204. pwdlib Argon2 is for passwords only, never tokens. The `account` table holds `id`, `username` and `password_hash`.
- **CLI:** `create-account = "bmad_first_project.cli:create_account"` replaces the placeholder script. It creates the account or updates its password, deletes all sessions, and uses the same unit of work and Clock pattern as the app.
- **API conventions:** everything lives under `/api`. JSON uses snake_case. `generate_unique_id_function` sets operation IDs to route function names, which match use case names.
- **Frontend:** Vite + React + TypeScript 6.0.3 in `frontend/`. The dev server runs on :5173 and proxies `/api` to :8000. The client is generated by `@hey-api/openapi-ts` 0.99.0 (exact pin) with the TanStack Query plugin into `frontend/src/client/`, which is never edited by hand. One configured client in `frontend/src/api/`: its base URL is the origin only, the token lives under one `localStorage` key, and any `unauthenticated` response clears the token and routes to Login, except for the login request itself. Queries retry only network errors (exponential back-off capped at 30 s, refetch on reconnect and focus). Mutations are never retried. ESLint bans `fetch` and `axios` outside generated code. There are no optimistic updates.
- **Runtime:** `uv run uvicorn bmad_first_project.main:create_app --factory` (port 8000). FastAPI does not serve the built SPA. Stack versions are pinned per the spine (Python 3.13, FastAPI 0.142.2, SQLModel 0.0.47, SQLAlchemy 2.0.54, Alembic 1.20.0, pwdlib 0.3.1, Ruff 0.16.9, React 19.3.0, Vite 8.3.2, Vitest 5.0.3, Playwright 1.63.0, ESLint 10.11.0).
- **Tests:** each API test gets a fresh migrated file DB under `tmp_path`, injected through the engine dependency override, plus a fake Clock override. Include a datetime round-trip test.

## UX & Interaction Patterns

- **Shell:** shadcn/ui on Radix and Tailwind, with the Graphite Hush palette mapped onto shadcn semantic tokens (light unsuffixed, dark `-dark`). Light or dark follows `prefers-color-scheme` only. The font is the system UI stack (Geist removed). Radii are 10px for controls and 12px for surfaces. Every focusable element gets a solid 2px ring with a 2px offset. Interactive targets are at least 24px. Motion is 180ms opacity fades only, turned off under reduced motion. The layout is one centred column, fluid up to 640px with a 16px gutter and no breakpoints, and it reflows at 400% zoom. The page has `lang="en"`. A Sonner toast region sits bottom centre, labelled "Notifications".
- **Login card:** fluid up to 360px with 32px padding. It shows the app name, visible "Username" and "Password" labels (`autocomplete` username and current-password) and a full-width "Log in". Paste and password managers work. Enter in either field submits. Log in is `aria-disabled` while the request is in flight, with no spinner. On invalid credentials the API message appears in one `role="alert"` slot above Log in, linked to both fields by `aria-describedby`, both fields get `aria-invalid`, the username is kept and the password is cleared.
- **After login:** the document title changes from "Log in — Todo" to "Today — Todo". The page has `<h1>` "Today" with today's date beneath it and a ghost "Log out" at the right of the heading row. The list loads fresh.
- **Log out:** calls logout, always clears the token locally (even if the request fails), drops open toasts and shows Login.
- **Token rejected:** handled silently. The client clears the token, drops toasts and shows Login with no message. Attempted actions are not replayed.
- **Errors:** the frontend shows envelope messages as written. For a 5xx or a response with no envelope `message`, it falls back to "Something went wrong. Try again." in an error toast that stays until dismissed.
- **Voice:** plain, short and calm. Full sentences end with a full stop. No exclamation marks, no emoji, no "successfully".

## Cross-Story Dependencies

- 1.1 comes first: it provides the layout, Clock, `now` dependency, error envelope and voice convention that every later story uses.
- 1.2 builds on 1.1 and provides the engine, migrations, unit of work and test fixtures that 1.4 and 1.5 need.
- 1.3 needs 1.1's OpenAPI schema with stable operation IDs. Regenerate the client after 1.5 adds the auth routes.
- 1.4 adds the `account` migration. 1.5 adds the `sessions` migration and depends on 1.4 for the account, and for the CLI to delete all sessions.
- 1.5's auth dependency is the one every Epic 2 and 3 task route must use. Verify it here with a test-only protected route.
- 1.6 depends on 1.3 (client, 401 handling, toasts) and 1.5 (auth endpoints). The main screen's Finished-collapsed behaviour arrives with Epic 3.
