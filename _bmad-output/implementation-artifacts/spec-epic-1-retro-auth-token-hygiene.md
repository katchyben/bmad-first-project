---
title: 'Epic 1 retro remediation: no-store on every login response, real 422 copy in login tests'
type: 'bugfix'
created: '2026-10-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 1 retro findings B2 and B3 (action items 1–2). `POST /api/auth/token` sends `Cache-Control: no-store` and `Pragma: no-cache` on its 200 and 401 but not on the request-validation 422 (e.g. an empty field), because FastAPI rejects the form before the route body runs (`adapters/http/auth.py:32,49`). Separately, the frontend 422 login test mocks a message the backend never sends ("Check the highlighted fields and try again." at `frontend/src/App.test.tsx:208`, vs `VALIDATION_MESSAGE` "Some details aren't valid. Check them and try again." in `adapters/http/errors.py:32`), and no e2e test covers an empty Login submit.

**Approach:** Make every response from `POST /api/auth/token`, including the 422 envelope, carry both no-store headers, and pin that with a backend test on the existing empty/missing-field cases. Change the unit test's mocked 422 to the backend's real message, and add a Playwright test that submits an empty Login form against the real backend and sees that message inline, with no token stored and no toast.

Decisions:
- Only the token route changes; logout and other routes keep their current headers.
- The 422 body, status and message are unchanged; only headers are added.
- No OpenAPI change: `frontend/openapi.json` and the generated client must not drift.
- Per Epic 1 retro action item 7, the build's three-layer review counts as code review for `done`; on finishing, mark sprint-status `action_items` `epic-1-retro-item-1-…` and `epic-1-retro-item-2-…` as `done`.

</frozen-after-approval>

## Implementation Notes

- `adapters/http/auth.py`: new `_NoStoreRoute` (an `APIRoute` subclass) wraps the token route's handler, renders a `RequestValidationError` through the app's registered handler (`request.app.exception_handlers`), and adds `NO_STORE_HEADERS` to every response. The token route is registered with `router.add_api_route(..., route_class_override=_NoStoreRoute)` because `router.post` takes no route class. The route body no longer sets headers itself, and the injected `Response` parameter is gone.
- `adapters/http/errors.py`: `domain_error_response`'s `extra_headers` parameter had only the login route as caller, so it was removed.
- `tests/api/test_auth.py`: `test_empty_or_missing_form_fields_are_a_shape_error` now asserts no-store on all four 422 cases.
- `frontend/src/App.test.tsx`: the mocked 422 uses the backend's `VALIDATION_MESSAGE`. `frontend/e2e/login.spec.ts`: new "empty submit" test against the real backend (422, `cache-control: no-store`, inline message, `aria-invalid`, no token, no toast).
- Verification: backend 219 passed, ruff check and format clean; frontend lint, build and Vitest 92 passed; Playwright 30 passed (29 + 1). `npm run generate` produced no drift.
- Mutation: with the route's `except RequestValidationError` neutered, the 4 backend 422 cases fail and the new e2e test fails (`cache-control` undefined).
- Surprise: the shell's default Node is v20.19.4, and Vitest fails to start under it (`webidl.util.markAsUncloneable is not a function`). `frontend/.nvmrc` says 24, and every frontend check passes under v24.8.0.

## Spec Change Log

<!-- Retro action item 8: record here any review change to the frozen intent, one-shot specs included. -->

## Review Triage Log

Blind Hunter (13 findings):
- Route class covers only the 422, not every response (500, HTTPException, DomainError): **low**, patched in the docstring only. The login route has no dependency that raises a DomainError or HTTPException, and unhandled 500s are plain text on every route (retro B7, accepted). The docstring now names the covered statuses.
- Handler lookup by key raises `KeyError` without `install_error_handlers`: **false**. `create_app` always installs the handlers, and no app mounts this router without them. A missing handler would fail loudly.
- No test that logout keeps its headers: **low**, rejected. That decision is a non-goal, not an invariant to guard.
- No test that the 401 has both `WWW-Authenticate` and no-store: **false**. `test_bad_credentials_are_401_with_the_exact_message` asserts both.
- The e2e test checks `cache-control` but not `pragma`: **low**, patched with a `pragma: no-cache` assertion.
- The e2e test doesn't check focus or field values after the 422: **low**, rejected. The unit test covers them, and clicking the button moves focus anyway.
- The `aria-describedby` exact-match check is brittle: **low**, rejected. It is the same pattern as the existing invalid-credentials e2e test.
- The 422 copy is duplicated in two frontend files: **low**, patched with a source comment in the e2e test. The frontend cannot import the Python constant.
- Status and action items not marked done: **false**. That happens at finalization.
- Unrelated untracked AGENTS.md, CLAUDE.md and .claude/settings.json: **false** for this change. They are identical copies of main's `4fd4d9d`, from another session, and are left out of this commit.
- The `fix/` branch breaks the `story/<story-key>` policy: **low**, rejected. This is retro remediation, not a story, and the policy arrived after the branch was cut.
- `add_api_route` registration is easy to miss: **low**, rejected. A comment marks the registration, right under the function.
- OpenAPI drift not shown: **false**. `npm run generate` left `frontend/openapi.json` and the generated client unchanged, and the drift tests pass in the 219.
