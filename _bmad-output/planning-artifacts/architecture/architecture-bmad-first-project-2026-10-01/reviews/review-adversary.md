---
reviewer: adversary
target: ../ARCHITECTURE-SPINE.md
date: 2026-10-01
lens: "Two units one level down that obey every AD to the letter yet build incompatibly"
verdict: NEEDS-REVISION (paradigm and ADs sound; 5 high-severity seams left open)
---

# Adversarial Review: Architecture Spine (Todo App)

## Verdict

**Needs revision.** The paradigm (light hexagonal), the inward-dependency rule and the domain-owns-rules rule are solid. The status machine (AD-7, AD-8), the derived overdue flag (AD-9) and server-side ordering (AD-10) close the most obvious duplicate-rule risks. But the spine fixes **policies**, not the **shared shapes and ownership seams** between units. Two agents building neighbouring stories can each obey all 13 ADs and still produce code that does not fit together. Below are 9 holes, ranked by severity. Each lists the two clashing units, why both comply, how they clash, and the smallest AD or convention that closes it.

Severity: **High** means it breaks at integration (crash, wrong data, incompatible contract). **Medium** means silent divergence or rework. **Low** is not reported (nits skipped).

---

## H1. No canonical Task shape: the entity's fields and the API response are both undefined (High)

**Units:** Story A "list tasks" (`GET /api/tasks`) vs Story B "complete task" (`POST /api/tasks/{id}/complete`), plus Story C "frontend undo toast".

**Both comply:** No AD lists the Task's fields or the response schema. The ER diagram shows `TASK { int id }` only. AD-9 says `is_overdue` is a response field. AD-8 says `previous_status` and `finished_at` exist on the task. Nothing says which endpoints return what.

**Clash:**
- A defines `TaskOut {id, title, description, due_at, status, is_overdue}`. B returns `204 No Content`, or its own `TaskStatusOut {id, status, finished_at}`. The generated client (AD-11) now has two or three task types. The frontend cannot update a row from an action response, and C has no `finished_at` to key the toast on.
- One agent exposes `previous_status` in the response, another treats it as internal. The frontend agent then builds UI on a field that disappears.
- FR-13 and FR-15 tie-break on **created time**, but no AD gives the Task a `created_at`. One agent adds a `created_at` column. Another reads FR-13's "created time" as "ascending ID" (the conventions already call ID the final tie-break) and adds no column. The ordering function and the repository mapping then disagree on the entity's fields.

**Fix (new AD-14 "Canonical Task shape"):**
- Domain `Task` fields: `id: int | None`, `title`, `description: str | None`, `due_at`, `status`, `created_at`, `finished_at: datetime | None`, `previous_status: Status | None`.
- One HTTP response model `TaskResponse` = all of those except `previous_status`, plus `is_overdue`.
- Every endpoint that touches one task (create, get, patch, start, reopen, complete, cancel, undo) returns `200`/`201` with a `TaskResponse`. `GET /api/tasks` returns `TaskResponse[]` (a bare array, or `{items: [...]}`, but decide which). `DELETE` and logout return `204`.
- Fill in the ER diagram with these columns.

## H2. Datetime representation inside the process is unspecified: aware vs naive, and who stamps `created_at` (High)

**Units:** Persistence adapter (`TaskRow`, SQLModel on SQLite) vs domain rules (`due_at < now`, "different instant", `now − finished_at ≤ 5 s`).

**Both comply:** AD-13 governs only the **wire** ("converted to UTC at the HTTP boundary, stored as UTC"). AD-3 governs where `now` comes from. Neither says what a `datetime` looks like in memory.

**Clash:**
- The Clock adapter returns `datetime.now(UTC)`, which is timezone-aware. SQLAlchemy's `DateTime` on SQLite stores a string and returns a **naive** datetime. The persistence agent, obeying "stored as UTC", writes naive UTC. On the first read back, the domain computes `aware_now - naive_finished_at` and gets a `TypeError` (comparisons with `<` fail the same way). Domain unit tests pass, because they build aware datetimes by hand. API tests then crash.
- `created_at`: the persistence agent uses `server_default=func.now()` or `default=datetime.utcnow` on the column. AD-3 only forbids `datetime.now()` and "equivalents", so a SQL `CURRENT_TIMESTAMP` arguably slips past it. The domain agent sets `created_at = now` from the Clock. Result: two sources, and with a fake clock in tests the ordering tests become non-deterministic.

**Fix (tighten AD-3 and AD-13):**
- "Every `datetime` inside the backend is timezone-aware UTC. The Clock returns aware UTC."
- "The persistence adapter owns one `UTCDateTime` type decorator that strips the zone on write and re-attaches UTC on read. Domain and application never see naive values."
- "`created_at` and `finished_at` are set by domain operations from the use case's `now`. No database or ORM defaults for any time column."

## H3. Repository port contract and transaction ownership are undefined (High)

**Units:** Persistence adapter (`SqlTaskRepository`) vs application use cases (`complete_task`, `list_tasks`) vs HTTP adapter (session dependency).

**Both comply:** The application layer names a `TaskRepository` port but gives it no signatures. The conventions say "one database transaction per use case", but not **who** opens it or commits it. AD-1 forbids the application from importing SQLAlchemy, so the use case cannot commit directly.

**Clash:**
- **Commit owner:** the repository agent commits inside `save()`. The HTTP agent also opens a session per request and commits in the dependency. Or, worse, each assumes the other commits, and nothing is persisted. Login (which writes a session) and create-task (which writes a task) end up with different behaviour.
- **Not-found owner:** `get(id)` raises `NotFoundError` in one agent's repository. In another agent's use case, `get(id)` returns `None` and the use case raises. AD-2 says domain errors are raised by domain code, but the domain cannot know whether a row exists. Both readings are compliant, and the use cases written against one repository break against the other.
- **Ordering and filtering owner:** AD-10 says the ordering function lives in the domain. With NFR-4 in mind, the repository agent adds `ORDER BY due_at, ...` and `WHERE status = ?` in SQL. Both compliant, but they produce two sort implementations. SQLite compares datetime strings and status text, so the two can disagree on ties (status `in_progress` vs `to_do` sorts alphabetically by luck, but `created_at` vs ID fallback may not).
- **Mutation path:** one agent's repository offers `update_status(id, status)` or `update(id, **fields)`, which lets a use case mutate a row without going through the domain operation. That is a second state-mutation path that AD-7 only closes at the HTTP layer.

**Fix (new AD-15 "Repository port and unit of work"):**
- `TaskRepository`: `get(id) -> Task | None`, `add(task) -> Task` (returns it with the assigned id), `save(task) -> None` (persists the whole aggregate), `delete(id) -> None`, `list(status: Status | None) -> list[Task]` (unordered).
- No field-level update methods. Repositories never order (the domain does), never commit, and never raise domain errors. The use case raises `NotFoundError` when it gets `None`.
- A `UnitOfWork` port (or the HTTP request-scoped session dependency, written down as the single owner) begins the transaction, commits on success and rolls back on any exception. The CLI uses the same unit of work.

## H4. The validation split between HTTP schemas and the domain is ambiguous, which leaves error precedence and PATCH null semantics undefined (High)

**Units:** HTTP schema story (`TaskCreate`, `TaskPatch` Pydantic models) vs domain validation story, and the frontend edit form (generated client) vs the PATCH handler.

**Both comply:** AD-2 says "routers and repositories never check business rules". Pydantic **schemas** are not routers. AD-13 *requires* the HTTP boundary to reject naive datetimes, so some validation clearly does live in schemas. AD-7 requires a `status` field to be rejected but doesn't say how.

**Clash:**
- The schema agent adds `Field(min_length=1, max_length=200)` to `title` "for nicer OpenAPI". `"   "` passes Pydantic and is caught by the domain, but a 201-character title is now caught by Pydantic with FastAPI's message, re-wrapped (AD-12) with different text. That makes two owners of one rule, and they disagree as soon as one limit changes.
- **Precedence:** `PATCH` on a **Done** task with a 300-character title. Schema-first returns `422 validation_error`. Domain-first (state check before field checks) returns `409 state_conflict`. FR-5 and FR-12 tests written by different agents will contradict each other. The same happens with `PATCH` on a nonexistent id with an invalid body (422 vs 404).
- **PATCH semantics:** the frontend agent sends `{"description": null}` to clear a description and `{"due_at": null}` expecting a validation error (FR-5: "cannot be removed"). The backend agent uses `model_dump(exclude_unset=True)` and treats `null` as "unchanged", or treats every `null` as "clear". There is also no rule on `""` vs `null` for the description. Both readings are AD-compliant.
- **Unknown fields:** AD-7 rejects `status`. One agent sets `extra="forbid"` (every unknown field is a 422). Another drops unknown fields silently and special-cases only `status`.

**Fix (tighten AD-2 and AD-7):**
- "HTTP schemas validate **shape only**: types, presence of required keys, offset-aware datetimes (AD-13), and `extra="forbid"` on every request body. All value rules (lengths, blank title, past date) live only in the domain. No `Field` constraints on business values."
- "Error precedence: `unauthenticated` > shape `validation_error` > `not_found` > `state_conflict` > value `validation_error`."
- "PATCH: an omitted key means unchanged. `description: null` or `""` clears it (stored as `null`). `title: null` or `due_at: null` is a `validation_error`."

## H5. Auth seams: token hashing method, expiry owner, `now` for auth, and errors that bypass the envelope (High)

**Units:** Login use case (`POST /api/auth/token`) vs the auth dependency that guards task routes, and the auth dependency vs AD-12 error handlers.

**Both comply:** AD-6 says "store only a hash of the token" and lists only one hasher port, `PasswordHasher` (Argon2). It doesn't say who checks expiry or how. AD-12 maps **domain** errors and request-validation errors, and says nothing about Starlette `HTTPException`. AD-2's list of domain errors has no "unauthenticated" type.

**Clash:**
- **Hash method:** the login agent reuses `PasswordHasher` (Argon2, salted) for the token, because it's the only hasher port. The auth-dependency agent computes `sha256(token)` and looks it up by equality. Every authenticated request then fails. Even with both on Argon2, a salted hash can't be looked up by value.
- **Expiry storage:** login stores `expires_at = now + 7d`. The dependency computes `created_at + 7d` from a column the login agent never wrote (or the reverse).
- **`now` for auth:** AD-3 says "each use case reads the Clock once per request". If the auth dependency isn't a use case, it reads the Clock itself, which gives two `now` values in one request. If it reads `datetime.now()` directly ("it's an adapter"), a fake clock in tests can't expire sessions, which breaks FR-2 tests.
- **Envelope bypass:** the dependency agent uses FastAPI's `OAuth2PasswordBearer(auto_error=True)`. A missing header then produces `401 {"detail": "Not authenticated"}`, not the AD-12 envelope. Unknown routes (404) and wrong methods (405) leak `{"detail": ...}` too. The frontend agent writes one error parser against AD-12 and it breaks on exactly the 401 path it most needs to handle.

**Fix (tighten AD-6 and AD-12):**
- "Session token = `secrets.token_urlsafe(32)`. It is stored as SHA-256 hex in `sessions.token_hash` (unique), next to `expires_at`, which is set at login. `PasswordHasher` is for passwords only."
- "An `authenticate(token)` application use case owns lookup and the expiry check. It reads the Clock and raises a domain `UnauthenticatedError`. The HTTP dependency only extracts the bearer string (with `auto_error=False`) and calls it." Add `UnauthenticatedError` to AD-2's error list.
- "AD-12 handlers also wrap Starlette `HTTPException` (401, 404, 405) in the envelope. Every route declares `ErrorResponse` in its OpenAPI `responses`, so the generated client types errors."

## H6. Frontend: client wiring, operation names and the mutation and refetch path are left to each story (Medium)

**Units:** The frontend login story vs the frontend task-list story, and the backend router naming vs the generated client.

**Both comply:** AD-11 says to use the generated client and nothing else. It does not say how the client is configured, where the token lives, or how generated functions are named. AD-10 forbids client-side sorting but says nothing about optimistic updates.

**Clash:**
- **Token storage:** the login story keeps the token in `localStorage`. The list story reads it from a React context. Each sets its own `Authorization` header through a different client instance, or through a request interceptor registered twice.
- **Base path:** one story sets `baseUrl: '/api'`. The OpenAPI paths already include `/api`, so calls go to `/api/api/tasks`.
- **Operation names:** FastAPI's default operationIds (`complete_task_api_tasks__id__complete_post`) change whenever a router function is renamed. The frontend breaks on a harmless backend refactor. Some agents also enable hey-api's TanStack Query plugin, while others hand-write hooks around the SDK functions.
- **Optimistic updates:** after `complete`, one agent optimistically moves the row into the finished section in the cache. That splices it in at a client-chosen position, which is client-side ordering through the back door (AD-10). Another agent refetches.

**Fix (new convention, or extend AD-11):**
- "One module, `frontend/src/api/`, configures the single client instance: base URL, the bearer token from one token store, and a 401 interceptor that clears the token and routes to login."
- "Backend sets `generate_unique_id_function` to the route function name, and route functions are named after the use case (`complete_task`)."
- "Decide once whether to use the hey-api TanStack Query plugin or hand-written hooks."
- "No optimistic list updates. Every mutation invalidates the `['tasks']` query family and the list is refetched."

## H7. The undo toast's timer origin and lifetime are unowned (Medium)

**Units:** The frontend undo-toast component vs the task-row component and list refetch (H6), measured against AD-8's server window.

**Both comply:** AD-8 says "the window is enforced only on the server". FR-11 says the frontend shows Undo for 5 s. Neither says when those 5 s start or which component owns the timer.

**Clash:**
- One agent starts the timer from `finished_at` in the response, computing `5 s − (browser_now − finished_at)`. Browser clock skew can make the toast show for 0 s or 30 s. Another agent starts it when the response arrives.
- The row agent keeps undo state inside the task row. On refetch the row moves to the finished section (or is filtered out under `status=to_do`) and unmounts, taking the timer and the toast with it.

**Fix (extend AD-8):** "The frontend timer starts when the successful action response is received. It never uses the browser clock against `finished_at`. Undo state lives in one app-level store keyed by task id, so it survives list refetches and filter changes. If the toast is shown and the server answers `state_conflict` (window expired), the toast closes and the user sees the message."

## H8. Migrations vs per-test databases: who decides the database URL (Medium)

**Units:** The Alembic setup story (`adapters/persistence/alembic/env.py`) vs the API test fixture story.

**Both comply:** AD-5 says tests build each database by running migrations. The conventions say config comes from pydantic-settings env vars. Neither says how Alembic gets its URL.

**Clash:**
- The migration agent hardcodes `sqlalchemy.url` in `alembic.ini`. The test agent creates a temp database through `Settings` and calls `alembic upgrade head`, which migrates the dev file instead. Tests then hit an empty schema.
- If the test agent uses `sqlite://` (in-memory), every new connection opens a new empty database, so the migrated schema disappears before the TestClient's engine connects.
- One agent enables `PRAGMA foreign_keys=ON` on its engine and the other doesn't, so cascades and constraint failures behave differently between test and app.

**Fix (tighten AD-5):** "`env.py` reads the URL from `config.attributes['url']` when present, otherwise from `Settings`. One `make_engine(url)` in persistence sets SQLite pragmas (foreign keys on). Test databases are files under `tmp_path`, migrated with that URL and then handed to the app through the engine dependency override."

## H9. A single request can see two different "now" values for read-after-write responses (Medium)

**Units:** The `complete_task` use case vs the response mapper that adds `is_overdue` (AD-9).

**Both comply:** AD-9 says the domain computes `is_overdue` "from the request's `now`". AD-3 says the use case reads the Clock once. Nothing says who computes `is_overdue` for action, create and patch responses.

**Clash:** The router agent calls `domain.is_overdue(task, clock.now())` after the use case returns. That reads the Clock a second time in a router, which is arguably compliant because the domain still does the computing. Another agent has the use case return the flag. Under a stepping fake clock the two disagree, and a router-level clock read also creeps business decisions into the HTTP layer.

**Fix (extend AD-9):** "Use cases return a read model `TaskView(task, is_overdue)` computed with that use case's single `now`. Routers only map `TaskView` to `TaskResponse` and never touch the Clock."

---

## Summary of proposed spine changes

| # | Severity | Change |
| --- | --- | --- |
| H1 | High | New AD-14: canonical Task fields (including `created_at`) and one `TaskResponse` returned by every single-task endpoint |
| H2 | High | Tighten AD-3 and AD-13: aware UTC everywhere in the process, a `UTCDateTime` type decorator, no DB or ORM time defaults |
| H3 | High | New AD-15: `TaskRepository` signatures, unordered list, no field updates, repositories never commit or raise, one unit-of-work owner |
| H4 | High | Tighten AD-2 and AD-7: schemas check shape only with `extra="forbid"`; fixed error precedence; PATCH null and omit semantics |
| H5 | High | Tighten AD-6 and AD-12: SHA-256 token hash plus `expires_at`, an `authenticate` use case with `UnauthenticatedError`, wrap Starlette HTTPExceptions, declare `ErrorResponse` |
| H6 | Medium | Extend AD-11: one client module and token store, route-name operationIds, no optimistic list updates |
| H7 | Medium | Extend AD-8: frontend undo timer starts on response receipt and lives in an app-level store |
| H8 | Medium | Tighten AD-5: Alembic URL injection, one `make_engine`, file-based temp test databases |
| H9 | Medium | Extend AD-9: use cases return `TaskView` with `is_overdue`, and routers never read the Clock |
