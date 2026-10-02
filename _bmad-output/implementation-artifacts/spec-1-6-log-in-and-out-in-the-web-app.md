---
title: 'Story 1.6a: Log in through the web app'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2465a75e09e923b206feb114365bfff4fa273c7f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The API can log in (1.5), but the web app has no way in: anyone opening it sees a placeholder, and a rejected token has nowhere to send the user.

**Approach:** Show a Login screen whenever there's no stored token, and the existing placeholder when there is, switching through one small auth state fed by the token store and 1.3a's `onUnauthenticated` hook. Use only the generated `loginMutation` and the shadcn components, with no routing library. This is the first part of Story 1.6. The main screen header and Log out (1.6b) were split off by the user's decision and are logged in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- Login screen (document title "Log in — Todo"): a centred card on `background`, `width: 100%` up to 360px, 32px padding, `rounded-lg`, on `card`. App name `<h1>` "Todo App" in heading typography. Username (`autocomplete="username"`) and Password (`autocomplete="current-password"`) as shadcn Input + visible Label. Then a full-width primary "Log in". Paste and password managers work; Enter in either field submits. Nothing else is reachable while logged out.
- In flight, Log in is `aria-disabled` (focusable, activation ignored), with no spinner and no double submit.
- Invalid credentials: stay on Login; the API envelope `message` ("That username and password don't match.") shown as written in one error slot directly above Log in (`role="alert"`, caption typography, `foreground`); both fields `aria-invalid` and `aria-describedby` the slot. The username is kept, the password cleared and focused. Other failures (5xx, network) don't clear the fields; the 1.3c global toast or retry rules apply.
- Success: the token is stored via `setToken` (the one `localStorage` key) and the logged-in view (today the `<main>` placeholder, given the document title "Today — Todo") shows. The query cache is cleared on every login and token rejection, so each session loads fresh.
- Token rejected: the 1.3a `onUnauthenticated` hook switches to Login silently (no message), drops toasts (`toast.dismiss()`) and clears the cache; the attempted action isn't replayed after re-login. Focus moves to Username whenever Login appears.
- The Login screen reflows at a 320px viewport with no horizontal scroll; every target is at least 24px.
- From deferred notes: Button drops `active:translate-y-px` and `transition-all` (opacity/colour transitions only, per DESIGN.md "nothing slides or grows"), now that buttons are first used; an e2e test proves the running app sends requests same-origin to `/api` on :5173 with `Authorization: Bearer <token>` after login (`main.tsx` wiring).

**Never:** No main-screen header, date or Log out (1.6b). No task UI (Epic 2). No routing library, no "remember me", no password reveal toggle. No backend changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No token | open the app | Login, title "Log in — Todo", focus on Username | — |
| Stored token | open the app with a token in storage | the logged-in placeholder, title "Today — Todo" | — |
| Valid login | correct credentials, Enter in Password | Log in `aria-disabled` while pending; then the logged-in view; token stored | — |
| Invalid login | wrong password | stays; the exact API message in the slot; both fields `aria-invalid`; username kept; password empty and focused | the login 401 is exempt from the global handler |
| Double submit | press Enter twice quickly | one request | — |
| Token rejected | a request returns 401 for the stored token | Login silently; token gone; toasts gone | 1.3a hook |
| Wiring | after login, the next API request | same-origin `/api/...` on :5173 with `Authorization: Bearer <token>` | — |
| Narrow | 320px viewport | no horizontal scroll on Login | — |

</frozen-after-approval>

## Code Map

- `frontend/src/App.tsx` -- `Shell` (640px column) plus `Toaster`, and `Content` (the dev-only `?design-check` fixture, otherwise the `<main>Todo</main>` placeholder). Show Login when logged out; keep the placeholder as the logged-in view and the fixture branch.
- `frontend/src/api/{token.ts,client.ts}` -- `getToken`/`setToken`/`clearToken` (key `todo.auth_token`); `setOnUnauthenticated(handler)`, called on a 401 only for the currently stored token (1.3a). Add a tiny subscribe/notify (or `useSyncExternalStore`) so React re-renders on token changes. Keep the 1.3a tests green.
- `frontend/src/client/@tanstack/react-query.gen.ts` -- the generated `loginMutation` (1.5b). The body is form-encoded (`username`, `password`), and the response is `{access_token, token_type}`. Never hand-edit `src/client/`.
- `frontend/src/api/errors.ts` -- `errorMessage(error)` returns the envelope message as written.
- `frontend/src/components/ui/{button,input,label}.tsx` -- 1.3b shadcn components; edit Button only for the motion change.
- `frontend/playwright.config.ts` -- Playwright migrates a scratch DB under the system temp dir and starts both servers. For login e2e, create the account by running `uv run create-account` with `DATABASE_URL` set to that scratch DB (piped input) in the backend `webServer` command or a global setup. Never use `./data`. For the Wiring row, any authenticated request works; with no task routes yet, trigger one (e.g. the dev-only fixture, or a page-level `fetch` spy on the generated client's request) and assert URL and header via `page.waitForRequest`.
- Run all npm commands under Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`).

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/auth/useAuth.ts` (or similar) -- the auth state over the token store, plus the `onUnauthenticated` wiring -- AR11, UX-DR24
- [x] `frontend/src/screens/LoginScreen.tsx` -- the card, form, in-flight and error slot -- FR1, UX-DR24, UX-DR27
- [x] `frontend/src/App.tsx` -- switch Login and the logged-in view; document titles; focus on Login -- UX-DR27
- [x] `frontend/src/components/ui/button.tsx` -- motion per DESIGN.md -- UX-DR29
- [x] `frontend/src/**/*.test.tsx` -- every matrix row except Wiring and Narrow (Vitest with mocked fetch through the configured client) -- NFR6
- [x] `frontend/playwright.config.ts`, `frontend/e2e/login.spec.ts` -- account setup; valid login; invalid credentials keep the username and clear the password; the Wiring and Narrow rows -- NFR6

**Acceptance Criteria:**
- Given `frontend/` under Node 24, when `npm run lint`, `npm run build`, `npm test` and `npm run e2e` run, then all pass, and `uv run pytest` still passes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Pass 1 (blind = B, edge-case = E, verification-gap = V):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| E7 | With a controlling terminal, `create-account` reads the password from `/dev/tty`, so the piped e2e account setup hangs | high | Reproduced under `script` (a pty): it prints "Username: Password:" and hangs until a 15 s timeout; no account row. Running `npm run e2e` from a terminal would fail | patch (in `cli.run`: read the password lines from stdin when stdin isn't a TTY) |
| B1/E4/V1 | A token change from another tab (`storage` event) flips the view but doesn't clear the query cache or toasts; the listener is untested | medium | `queryClient.clear()`/`toast.dismiss()` run only in `logIn` and the 401 hook; no test dispatches a `StorageEvent` | patch |
| E5 | A stored empty-string token counts as logged in, but no header is sent, so the user is stuck | low | A direct correction (`Boolean(token)`) | patch |
| E6/B8 | `printf '${accountInput}'` breaks on `'` or `%` in the e2e credentials | low | Use `printf '%s\n' …` with separate quoted arguments; a direct correction | patch |
| B4/E3/V2 | An empty submit (422 `validation_error`) path is untested | low | V: dropping the `unauthenticated` guard or narrowing `isEnvelopeError` keeps tests green | patch (test) |
| B5/V3 | A login 5xx test never asserts the global toast appears | low | It only asserts what doesn't happen | patch (test) |
| E8/B3 | The wiring probe calls the real `logout` | low | No read-only authenticated route exists yet; the test ends right after; add a comment saying why | patch (comment) |
| B10b | `client.ts` comment "1.6 routes to Login" is outdated | low | Routing is driven by the token store; a direct comment fix | patch |
| B2/E1 | `setToken` throws when storage is unavailable, failing login | low | Not silent: the throw from `onSuccess` reaches the global mutation `onError`, which shows "Something went wrong. Try again." (no envelope); storage-blocked browsers are rare | reject |
| E2 | A 4xx envelope message with no `code` shows nothing | false | The API's envelope always carries a `code` (1.1b) | reject |
| B6 | Error and `aria-invalid` persist while the user edits | low | A common pattern (persist until next submit); the spec doesn't ask otherwise | reject |
| B7 | The error slot collapses during a retry, shifting Log in | low | Cosmetic | reject |
| B9 | The Button motion change has no story note | false | The spec's Boundaries list it explicitly (deferred from 1.3b) | reject |
| B10a | Redundant `ServerError`/`isUnreachable` checks in `isEnvelopeError` | low | Cosmetic | reject |

## Design Notes

"Todo App" comes from the login mockup (key-login.html); the spines specify the app name's typography but not its text.

## Verification

**Commands (Node 24, from `frontend/`):**
- `npm run lint && npm run build && npm test && npm run e2e` -- expected: all pass
- From the repo root: `uv run pytest -q` -- expected: all pass
