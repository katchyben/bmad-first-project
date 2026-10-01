---
title: 'Story 1.3a: Frontend app with generated API client'
type: 'feature'
created: '2026-10-01'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
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
- Queries retry only network failures (never 4xx/5xx), with exponential back-off capped at 30 s and no attempt limit, plus refetch on reconnect and window focus. Mutations never retry.
- The error helper returns the envelope `message` exactly as written; for a 5xx or a body with no envelope `message`, it returns `"Something went wrong. Try again."` Showing it in a toast is 1.3b.
- ESLint fails on `fetch` or an `axios` import anywhere outside `src/client/`.
- The app renders a minimal placeholder root (`lang="en"`, the TanStack Query provider) with no styling decisions.

**Never:** No shadcn, Tailwind, theme tokens, toasts or layout (1.3b). No login screen, task UI or routing library (1.6 and later). No optimistic updates. No backend changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Network failure | query fetch rejects with a network `TypeError` | retried with back-off (≤ 30 s), indefinitely | — |
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
- [ ] `frontend/package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `.nvmrc`, root `.gitignore` -- the scaffold, pins, proxy, scripts (`dev`, `build`, `lint`, `test`, `e2e`, `generate`) -- AR16
- [ ] `frontend/openapi-ts.config.ts`, `frontend/src/client/**` -- generation config with the TanStack Query plugin; the generated output committed with a "generated, do not edit" marker -- AR11
- [ ] `frontend/src/api/{client.ts,token.ts,errors.ts,queryClient.ts}` -- the single client config, token store, auth header, 401 interceptor with login exemption, error-message helper, retry policy -- AR11, UX-DR16, UX-DR24
- [ ] `frontend/eslint.config.js` -- the fetch/axios ban outside `src/client/` -- AR11
- [ ] `frontend/src/{main.tsx,App.tsx}` -- providers and a placeholder root -- AR11
- [ ] `frontend/src/api/*.test.ts`, `frontend/vitest.config.ts` -- every matrix row, plus a lint test proving the ban fails on a `fetch` call outside `src/client/` -- NFR6
- [ ] `frontend/playwright.config.ts`, `frontend/e2e/smoke.spec.ts` -- starts against the dev servers; the page loads with `lang="en"`, and `GET /api/nope` through the :5173 proxy returns the `not_found` envelope (only `/api` is proxied, so `/openapi.json` is not) -- NFR6

**Acceptance Criteria:**
- Given `frontend/`, when `npm run lint`, `npm run build`, `npm test` and `npm run e2e` run under Node 24, then all pass.
- Given the backend running on a scratch DB, when `npm run generate` runs, then `git diff --exit-code src/client` shows no diff.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands (Node 24, from `frontend/`):**
- `npm run lint && npm run build && npm test` -- expected: all pass
- With the backend running on a scratch DB: `npm run generate && git diff --exit-code src/client` -- expected: no diff; `npm run e2e` -- expected: pass
