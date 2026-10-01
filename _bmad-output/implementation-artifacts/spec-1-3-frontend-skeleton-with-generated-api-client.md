---
title: 'Story 1.3a: Frontend app with generated API client'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'f30576abfcad55201dffb4b6f8db85bf2f79c7cc'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no frontend. Every later UI story needs a React app that reaches the API only through a client generated from the backend's OpenAPI schema, with one place handling base URL, auth token, 401s, retries and error messages.

**Approach:** Scaffold `frontend/` (Vite + React + TypeScript), generate the client with `@hey-api/openapi-ts` and its TanStack Query plugin, configure it once in `frontend/src/api/`, ban hand-written HTTP calls, and wire Vitest and Playwright. This is the first part of Story 1.3. The design system and shell (1.3b: shadcn/Tailwind tokens, focus ring, column, toast region, motion) were split off by the user's decision and are logged in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- Exact pins: React 19.3.0, Vite 8.3.2, TypeScript 6.0.3 (not 7), `@hey-api/openapi-ts` 0.99.0, `@tanstack/react-query` 5.104.0, Vitest 5.0.3, `@playwright/test` 1.63.0, ESLint 10.11.0. `engines.node: ">=22.18"`; `frontend/.nvmrc` = `24`.
- Dev server on :5173 proxies `/api` to `http://localhost:8000`. The client base URL is the origin only (OpenAPI paths already start with `/api`).
- `frontend/src/client/` is generated, marked generated, never hand-edited, and committed. `npm run generate` regenerates it from `http://localhost:8000/openapi.json`.
- `frontend/src/api/` is the only client configuration: the bearer token under one `localStorage` key; any `unauthenticated` response except `POST /api/auth/token` clears the token and calls an `onUnauthenticated` hook (routing to Login comes in 1.6); the login request's 401 is returned to the caller.
- Queries retry only when the server is unreachable: a network failure (the fetch got no response) or a gateway error (502, 503, 504, which is what the Vite dev proxy returns when the backend is down). Never other 4xx/5xx. Exponential back-off capped at 30 s, no attempt limit, plus refetch on reconnect and window focus. Mutations never retry. *(Amended by Benny on 2026-10-01 after review: originally "never 4xx/5xx".)*
- The error helper returns the envelope `message` exactly as written; for a 5xx or a body with no envelope `message`, it returns `"Something went wrong. Try again."` Showing it in a toast is 1.3b.
- ESLint fails on `fetch` or an `axios` import anywhere outside `src/client/`.
- The app renders a minimal placeholder root (`lang="en"`, the TanStack Query provider) with no styling decisions.

**Never:** No shadcn, Tailwind, theme tokens, toasts or layout (1.3b). No login screen, task UI or routing library (1.6 and later). No optimistic updates. No backend changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Network failure | query fetch rejects with a network `TypeError` | retried with back-off (≤ 30 s), indefinitely | — |
| Gateway error | query gets 502 / 503 / 504 | retried with back-off (≤ 30 s), indefinitely | — |
| HTTP error | query gets 404 / 500 | not retried | — |
| Mutation failure | mutation gets a network error | not retried | — |
| 401 elsewhere | a non-login request returns 401 | token removed; `onUnauthenticated` called once | — |
| 401 on login | `POST /api/auth/token` returns 401 envelope | token untouched; hook not called; the caller gets the envelope | — |
| Token attached | a stored token, any request | `Authorization: Bearer <token>` sent; no header when there's no token | — |
| Envelope error | 409 `{"error":{"code":"state_conflict","message":"That task is already finished."}}` | helper returns that string verbatim | — |
| 5xx / no envelope | 500, or a body without `error.message` | helper returns "Something went wrong. Try again." | — |

</frozen-after-approval>

## Code Map

- No `frontend/` exists. `.gitignore` covers Python only; add `frontend/node_modules/`, `frontend/dist/`, `frontend/test-results/`, `frontend/playwright-report/`.
- Node: the default `node` is v20.19.4, below the floor. nvm has v24.8.0, so run every npm command via `source ~/.nvm/nvm.sh && nvm exec 24 …` (or `nvm use 24`).
- Backend for generation and Playwright: `uv run alembic upgrade head` then `uv run uvicorn bmad_first_project.main:create_app --factory`, both with a scratch `DATABASE_URL` (e.g. under `/tmp`), never the user's `./data`. Operation IDs are route function names; the schema always has `ErrorResponse`/`ErrorBody`. Today there are no routes, so the generated client is mostly types plus the client core; the login exemption has to match the path string `/api/auth/token`.
- The `401 on login` and interceptor tests can't use a real login route yet (1.5); test the interceptor against mocked responses for that path.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `.nvmrc`, root `.gitignore` -- the scaffold, pins, proxy, scripts (`dev`, `build`, `lint`, `test`, `e2e`, `generate`) -- AR16
- [x] `frontend/openapi-ts.config.ts`, `frontend/src/client/**` -- generation config with the TanStack Query plugin; the generated output committed with a "generated, do not edit" marker -- AR11
- [x] `frontend/src/api/{client.ts,token.ts,errors.ts,queryClient.ts}` -- the single client config, token store, auth header, 401 interceptor with login exemption, error-message helper, retry policy -- AR11, UX-DR16, UX-DR24
- [x] `frontend/eslint.config.js` -- the fetch/axios ban outside `src/client/` -- AR11
- [x] `frontend/src/{main.tsx,App.tsx}` -- providers and a placeholder root -- AR11
- [x] `frontend/src/api/*.test.ts`, `frontend/vitest.config.ts` -- every matrix row, plus a lint test proving the ban fails on a `fetch` call outside `src/client/` -- NFR6
- [x] `frontend/playwright.config.ts`, `frontend/e2e/smoke.spec.ts` -- starts against the dev servers; the page loads with `lang="en"`, and `GET /api/nope` through the :5173 proxy returns the `not_found` envelope (only `/api` is proxied, so `/openapi.json` is not) -- NFR6

**Acceptance Criteria:**
- Given `frontend/`, when `npm run lint`, `npm run build`, `npm test` and `npm run e2e` run under Node 24, then all pass.
- Given the backend running on a scratch DB, when `npm run generate` runs, then `git diff --exit-code src/client` shows no diff.

## Implementation Notes

- The client is configured with `client.setConfig` and interceptors in `src/api/client.ts` rather than `runtimeConfigPath`, so generated code never imports from `src/api/`. `configureClient()` is idempotent and is called once in `main.tsx`.
- The generated core throws the parsed body for HTTP errors and drops the status, so the error interceptor turns any 5xx into a `ServerError`; `errorMessage(error)` then falls back without needing the response. The same interceptor wraps a fetch rejection (request sent, no response, `TypeError`) in a `NetworkError`. Queries retry only a `NetworkError` or a `ServerError` with status 502/503/504, so a `TypeError` from a code bug in a `queryFn` is not retried.
- The 401 interceptor exempts only `POST` to path `/api/auth/token`; other methods on that path are treated as ordinary requests. It acts only when the request's `Authorization` header equals `Bearer <currently stored token>`, so a tokenless 401, a second concurrent 401 or a stale-token 401 after re-login is ignored.
- No operations exist yet, so the TanStack Query plugin emits no `@tanstack/react-query.gen.ts`; it will appear once routes are added (regenerate after 1.5).
- Test files are type-checked by `tsconfig.test.json` (with Node types) so app code under `tsconfig.app.json` does not see Node globals.
- `npm audit` reports high-severity `js-yaml` advisories through `@hey-api/openapi-ts` 0.99.0 (dev-only, parses our own schema). The version is an exact pin, so it is left as is.

## Spec Change Log

- **2026-10-01, review pass 1 (intent gap, resolved by Benny).** Trigger: the edge-case finding that the Vite dev proxy answers 502 when the backend is down (verified: `GET /api/tasks` on :5199 with no backend → `502 Bad Gateway`). Because every browser request goes through the proxy, "never retry 5xx" meant "server unreachable" was never retried, and the UX's reconnect banner (2.5) couldn't work locally. Amended: the frozen retry rule now also retries 502/503/504, plus a new matrix row. Known-bad state avoided: queries failing immediately in local dev whenever the backend restarts. Benny chose to patch in place rather than revert and re-derive. KEEP: the generated-client setup, the single `src/api` module, the `ServerError` error interceptor carrying the status, and the matrix tests.

## Review Triage Log

Pass 1 (blind = B, edge-case = E, verification-gap = V):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| E2 | 502/503/504 from the dev proxy aren't retried | high | Verified: the Vite proxy returns `502 Bad Gateway` with the backend down; the frozen intent said never retry 5xx | intent_gap → resolved by Benny (retry 502/503/504), patched in place |
| B1/E1 | Any `TypeError` (a code bug in `queryFn`/`select`) counts as a network failure and retries forever, silently | medium | `isNetworkError` is `instanceof TypeError`; the generated client passes fetch rejections through the error interceptor with `request` set and `response` undefined, so they can be tagged precisely there | patch |
| B3/E3/E4/E5 | 401 clears the token and fires the hook even with no token sent, once per concurrent 401, and for a stale token after a fresh login | medium | One root cause: the interceptor doesn't compare the 401 to the token that was sent | patch |
| B2/E9/E10 | `reuseExistingServer` lets e2e run against a hand-started backend on `./data` | medium | `playwright.config.ts` reuses :8000/:5173 outside CI | patch |
| B6a/E11 | `XMLHttpRequest`, `EventSource`, `navigator.sendBeacon` not banned | low | The intent bans hand-written HTTP calls; a direct config addition | patch |
| E12 | `.mjs`/`.cjs`/`.jsx` files aren't linted | low | `files` glob is `**/*.{ts,tsx,js}`; a direct correction | patch |
| B5 | Anything can import `client.gen` and reconfigure the client | low | The rule is only a comment; a direct `no-restricted-imports` pattern | patch |
| B6b/V3 | `self.fetch`, `axios/*` and `require('axios')` bans untested | low | V: deleting those rules leaves `lint.test.ts` green | patch |
| B9 | The `/openapi.json` e2e passes on an error or empty body | low | It only asserts the body lacks `"openapi"`; tighten to status + `text/html` | patch |
| V1 | `main.tsx`'s `configureClient()`/`createQueryClient()` wiring is unverified | medium | Deleting either keeps all tests green; no app request exists until 1.5/1.6 | defer |
| B7/V2 | No drift check between the committed client and the backend schema | medium | Only a manual command; nothing consumes generated operations yet | defer |
| B4/E6/V | `setToken` throws when storage is unavailable | false | A loud failure at login is correct; silently not persisting would leave the user stuck | reject |
| E7 | Login exemption misses a trailing slash or base-path prefix | low | The base URL is the origin only and the generated path is exactly `/api/auth/token` | reject |
| E8 | `configureClient()` default param needs `window` | false | It's only called from `main.tsx` in the browser; tests pass a base URL | reject |
| B8 | No React hooks lint rules | low | No hooks exist yet; add with the first UI story | reject |
| B10 | `engines >=22.18` vs `.nvmrc` 24 / `@types/node` 24 | low | Matches the architecture (floor 22.18, choose 24) | reject |
| B11 | `configured` guard untested | false | V: `beforeEach` reruns `configureClient` and the hook is asserted called once | reject |
| B12 | No CI workflow | low | CI is deferred in the architecture | reject |

## Verification

**Commands (Node 24, from `frontend/`):**
- `npm run lint && npm run build && npm test` -- expected: all pass
- With the backend running on a scratch DB: `npm run generate && git diff --exit-code src/client` -- expected: no diff; `npm run e2e` -- expected: pass
