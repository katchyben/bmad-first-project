---
title: 'Story 1.1b: Error envelope'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1d7bc01edf439decd920bb7612c648c4acf95cd1'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The backend has no error contract. Unknown routes, wrong methods and validation failures return FastAPI's default `{"detail": ...}` with Pydantic text, and there are no domain error types. Yet the frontend shows API messages as written.

**Approach:** This is part of Story 1.1, split from 1.1a. Add the four domain error types, and map them and the framework's 401/404/405/422 in one HTTP exception-handler module to the envelope `{"error": {"code", "message", "reason"?}}` in the calm UX voice. The OpenAPI side (`ErrorResponse` in the schema, 422 refs, operation IDs) was split off by the user's decision as Story 1.1c in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- All mapping lives in `adapters/http/errors.py`: `DomainValidationError`→422 `validation_error`, `StateConflictError`→409 `state_conflict` (carrying `reason`), `NotFoundError`→404 `not_found`, `UnauthenticatedError`→401 `unauthenticated`. A domain error's `message` is sent as is.
- `reason` appears only when set, never as `null`. Envelope bodies carry no Pydantic detail, field paths, codes in the message text, or stack traces.
- Fixed messages: request validation `"Some details aren't valid. Check them and try again."`, unknown route `"There's nothing here."`, wrong method `"That action isn't available here."`, framework 401 `"Log in to continue."`. Any other framework HTTP error keeps its status with code `http_error` and `"That request couldn't be completed."`. Headers on framework errors (e.g. `WWW-Authenticate`, `Allow`) are kept.
- The voice convention is written down in the `errors.py` module docstring: short, plain, calm full sentences ending in a full stop; no exclamation marks, emoji, "successfully", codes or field paths; shown to the user as is.

**Never:** No OpenAPI changes (`responses=`, `generate_unique_id_function`, `openapi()` override; that's 1.1c). No 5xx/unhandled-exception handler. No auth, real routes or precedence logic (later stories). No change to 1.1a's clock or boundary rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unknown route | `GET /api/nope` | 404, body exactly `{"error":{"code":"not_found","message":"There's nothing here."}}` | framework 404 wrapped |
| Wrong method | `DELETE` on a GET-only test route | 405 `method_not_allowed`, fixed message, `Allow` header kept | framework 405 wrapped |
| Request validation | missing query param; malformed datetime; extra body field on an `extra="forbid"` model | 422, body exactly the `validation_error` envelope with the fixed message | `RequestValidationError` handler |
| Domain errors | test routes raising each of the four types with a message | 422 / 409 / 404 / 401 with that message; 409 includes `reason` when given and omits it when not | one mapping per type |
| Framework 401 | a route raising `HTTPException(401, headers={"WWW-Authenticate": "Bearer"})` | 401 `unauthenticated`, `"Log in to continue."`, header kept | wrapped |
| Other framework error | `HTTPException(400)` | 400 `http_error`, fixed message | wrapped |

</frozen-after-approval>

## Code Map

- `src/bmad_first_project/main.py` -- `create_app(clock=None)` builds `FastAPI(title=...)` and sets `app.state.clock`. Add the `install_error_handlers(app)` call here; keep the `is not None` clock wiring.
- `src/bmad_first_project/adapters/http/dependencies.py` -- `get_clock`/`get_now`; don't touch.
- `src/bmad_first_project/domain/__init__.py` -- the domain package, standard library only (enforced by `tests/architecture/test_import_boundaries.py`).
- Register the handler for `starlette.exceptions.HTTPException` (FastAPI's `HTTPException` subclasses it) so routing 404/405 are caught.
- Define `ErrorBody`/`ErrorResponse` Pydantic models in `errors.py` and use them to build bodies; 1.1c will publish them in OpenAPI.

## Tasks & Acceptance

**Execution:**
- [x] `src/bmad_first_project/domain/errors.py` -- a `DomainError(Exception)` base with a `message` attribute; `DomainValidationError`, `StateConflictError(message, reason: str | None = None)`, `NotFoundError`, `UnauthenticatedError` -- AR2
- [x] `src/bmad_first_project/adapters/http/errors.py` -- `ErrorBody`/`ErrorResponse` models, the message constants, the voice docstring, and `install_error_handlers(app)`; the envelope is serialized with `reason` excluded when None -- AR12, NFR2, UX-DR3
- [x] `src/bmad_first_project/main.py` -- call `install_error_handlers(app)` -- AR12
- [x] `tests/api/test_errors.py` -- every matrix row, using test-only routes on a `create_app()` instance; assert whole response bodies (not just codes) so no extra keys or Pydantic text can sneak in -- NFR6
- [x] `tests/domain/test_errors.py` -- `message`/`reason` attributes and the `DomainError` subclassing -- AR2

**Acceptance Criteria:**
- Given the repo, when `uv run ruff check .`, `uv run ruff format --check .` and `uv run pytest` run, then all pass, including 1.1a's boundary and clock tests.
- Given `uv run uvicorn bmad_first_project.main:create_app --factory`, when `GET /api/nope` is requested, then the body is the `not_found` envelope.

## Implementation Notes

- `pyproject.toml` gained `addopts = ["--import-mode=importlib"]` under pytest: the spec's `tests/api/test_errors.py` and `tests/domain/test_errors.py` share a basename and the test dirs have no `__init__.py`, which pytest's default import mode rejects.

## Spec Change Log

## Review Triage Log

Pass 1 (blind = B, edge-case = E; verification-gap reported no gaps):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| E1 | `HTTPException(204/304)` gets a JSON body | low | Real, but nothing raises a 204/304 HTTPException; the fix adds a branch | reject |
| E2 | Unhandled exceptions / bare `DomainError` give a plain-text 500 | low | Real, but the frozen intent says "No 5xx/unhandled-exception handler"; the frontend falls back for 5xx | reject (out of intent) |
| E3 | `ResponseValidationError` gives a plain-text 500 | low | Same as E2 | reject (out of intent) |
| E4/B5 | Framework `HTTPException(422)` is `http_error`, not `validation_error` | low | Matches the frozen intent ("any other framework HTTP error … `http_error`"); no code raises it | reject |
| E5/B6 | `StateConflictError(reason="")` emits `"reason": ""` | low | `model_dump(exclude_none=True)` keeps `""`. A direct correction: `exc.reason or None` | patch |
| E6 | A non-str message breaks the handler | false | `message: str` is typed; it fails loudly on an input no code produces | reject |
| E7/B2 | Mapping lookup uses dict order, not MRO | false | A subclass of one mapped type matches correctly via `isinstance`; the handler is registered only for mapped types, so `StopIteration` can't happen; only contrived multiple inheritance differs | reject |
| B1 | Domain `UnauthenticatedError` 401 has no `WWW-Authenticate` | low | `_handle_domain_error` passes no headers; RFC 9110 requires the header on 401. Trivial: add `Bearer` for that type | patch |
| B3 | Nothing checks that every `DomainError` subclass is mapped | medium | A future type forgotten in `_DOMAIN_ERRORS` silently becomes a plain-text 500; the test-only fix is small | patch |
| B4 | The voice convention isn't enforced on the constants | false | `tests/api/test_errors.py` asserts every fixed string exactly, so any edit fails tests | reject |
| B7 | `reason: str \| None` will publish as nullable in the 1.1c OpenAPI schema | low | Real for 1.1c; it doesn't affect 1.1b's runtime bodies | defer (note on 1.1c) |
| B8 | `--import-mode=importlib` not explained in the spec | low | The fix edits this build's spec; recorded in Implementation Notes | reject |
| B9 | `assert isinstance` in the handlers | false | Handlers are registered only for those types, so the assert can't fail, and under `-O` only the narrowing hint disappears | reject |
| B10 | The review diff omits the spec | false | Deliberate; the spec goes only to the edge-case layer | reject |
| B11 | Bare status numbers instead of `starlette.status` | low | Cosmetic | reject |

## Verification

**Commands:**
- `uv run ruff check . && uv run ruff format --check .` -- expected: no findings
- `uv run pytest -q` -- expected: all pass
- `uv run uvicorn bmad_first_project.main:create_app --factory`, then `curl -s localhost:8000/api/nope` -- expected: `{"error":{"code":"not_found","message":"There's nothing here."}}`
