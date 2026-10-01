---
title: 'Story 1.1c: OpenAPI error contract'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The runtime returns the error envelope (1.1b), but the OpenAPI schema doesn't say so. Routes advertise FastAPI's default `HTTPValidationError` for 422, `ErrorResponse` is missing from the schema, and operation IDs are FastAPI's generated `name_path_method` strings. Story 1.3 generates the frontend client from this schema, so it would get the wrong error types and unstable function names.

**Approach:** This is the last part of Story 1.1, deferred from 1.1b. In `create_app()`, declare `ErrorResponse` as every route's 422 response, set operation IDs to route function names, and always publish `ErrorResponse`/`ErrorBody` in `components.schemas`, even with no routes, exactly as FastAPI would generate them. Publish `ErrorBody.reason` as an optional, non-nullable string, matching the runtime rule that `reason` is never `null`. Runtime response bodies don't change.

</frozen-after-approval>

## Implementation Notes

- `adapters/http/errors.py`: `ErrorBody.reason` is now `str | SkipJsonSchema[None]`, so the schema shows an optional `string` with no null branch; runtime bodies are unchanged (`exclude_none`). Added `ERROR_RESPONSES` (422 → `ErrorResponse`) and `install_openapi_error_contract(app)`, which wraps `app.openapi` and `setdefault`s the error schemas into `components.schemas`, cached in `app.openapi_schema`.
- Surprise: pydantic's `models_json_schema` emits `"default": null` for `reason`, but FastAPI's own rendering does not. To guarantee the always-present schemas are identical to what a route would generate, `_error_schemas()` renders them through FastAPI's public `get_openapi` with a throwaway `APIRoute`.
- `main.py`: `FastAPI(responses=ERROR_RESPONSES, generate_unique_id_function=lambda route: route.name)` and calls `install_openapi_error_contract`.
- `tests/api/test_openapi.py`: a bare app publishes exactly `ErrorResponse`/`ErrorBody`; `reason` is optional and non-null; the bare schemas equal the route-generated ones; a route's 422 refs `ErrorResponse` with `operationId` == function name and no `HTTPValidationError`/`ValidationError`; the schema is cached.
- Review patch: added `test_included_router_routes_inherit_the_contract` (an `APIRouter` + `include_router` route gets the 422 `ErrorResponse` and a function-name operation ID) and a docstring note on why `_error_schemas()` renders through FastAPI.

## Review Triage Log

- Duplicate operation IDs only warn (two routes sharing a function name get the same `operationId`) — medium: verified by the reviewer; it would give the Story 1.3 client clashing function names. Guarding routes that don't exist yet is out of the one-shot patch rule → defer.
- Only 422 is documented, not 401/404/405/409 — low: real; AD-12 has each route declare its own error statuses, which belongs to the stories adding those routes (1.5+) → defer.
- Parameterless routes still advertise a 422 — low: real but harmless (an extra error type in the client); the fix needs per-route logic → reject.
- `code` isn't an enum; `WWW-Authenticate` isn't documented — low: cosmetic for the client, which shows `message` as written → reject.
- `setdefault` could hide a clashing `ErrorBody`/`ErrorResponse` model — low: contrived, no other model has those names → reject.
- Router-level overrides of responses or ID function aren't tested — low: real test gap for the `include_router` path later stories use → patched (new test); a deliberate per-route override is intended behaviour.
- No body route test; Input/Output schema split — false: `ErrorBody` is only ever an output model, so FastAPI never splits it.
- `test_reason_is_optional_and_never_null` is brittle — low: exact-dict assert, but the pinned FastAPI/Pydantic make churn rare → reject.
- The cache test is weak — low: a rebuild after resetting `openapi_schema` goes through the same wrapper → reject.
- The operation-ID lambda lives in `main.py` — low: cosmetic placement → reject.
- `_error_schemas()` is opaque and recomputed per rebuild — low: the schema is built once per app; the docstring now explains the FastAPI rendering → patched (docstring).
- No snapshot of `openapi.json` — low: Story 1.3's generated client makes drift visible → reject.
