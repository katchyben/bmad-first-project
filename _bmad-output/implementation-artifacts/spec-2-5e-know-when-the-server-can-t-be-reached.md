---
title: "Story 2.5e: Know when the server can't be reached"
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '6c48b540406ede33fe753d60ddf579d6d2c817d5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When the server can't be reached, nothing tells the user. Unreachable failures are kept out of the error toast on purpose, and Login ignores them, so a login attempt while the backend is down gives no feedback at all (Epic 1 retro B1, action item 4).

**Approach:** Implement Story 2.5e's acceptance criteria in `epics.md` (UX-DR16, UX-DR28). Keep one app-wide connection state, set from the generated client's interceptors. Render DESIGN.md's `connection-banner` above the column on both Login and Main. Announce its text once when it appears and "Reconnected." once when it clears, through the existing polite announcer.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- "Unreachable" means exactly what `isUnreachable` already covers: fetch rejected with no response, or a 502/503/504 (the Vite proxy returns 502 while the backend is down).
- Any other response from any request, 4xx included, proves the server is reachable and clears the banner. A wrong-password 401 therefore clears it.
- The state is global and outlives a token change. Logging in or out neither shows nor clears the banner.
- On Main, a failed mutation sets the banner. If no query is already fetching, the active queries are refetched once, so the tasks query's existing retry loop is what clears the banner, and "Retrying…" stays true. Mutations themselves are still never retried.
- On Login, the banner clears on the next login attempt that reaches the server, whether it gets a 401 or a 200 (Benny, 2026-10-02). There is no probe, so the banner may stay after the server is back until the user tries again.

## Boundaries & Constraints

**Always:**
- The banner text is exactly "Can't reach the server. Retrying…". The recovery announcement is exactly "Reconnected." and is announced only; no visible "Reconnected." line.
- The banner follows DESIGN.md `connection-banner`: full viewport width above the 640px column, at least 32px tall, centred `caption` text in `muted-foreground` on `card`, a 1px bottom `border`. No icon, no colour, no close button. Design tokens only.
- Each appear and each clear is announced exactly once through `useAnnounce`. Repeated failures while the banner shows, retries and refetches announce nothing. The banner element itself is not a live region, so nothing is read twice.
- Current content stays visible and interactive: the list, the add input and the Login form keep their state while the banner shows.
- No horizontal scroll at 320px. The Login card stays centred with the banner shown, with no added vertical scroll at a normal viewport height.
- The existing rules stay as they are: the Loading… line stays hidden while unreachable, gateway and network errors never toast, and queries retry only unreachable errors.

**Never:**
- No new endpoint, no health probe, no polling timer, no `navigator.onLine`.
- No mutation retries, no queued or replayed actions, no optimistic updates.
- No banner text in the Login error slot. Login's envelope error handling is unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Main, list load fails | `GET /api/tasks` rejects (TypeError) | Banner shows, its text announced once; the query keeps retrying | no toast |
| Recovery | next retry returns 200 | Banner gone, "Reconnected." announced once, list shows | N/A |
| Repeated failures | 3 retries fail in a row | Banner stays, one announcement in total | N/A |
| Main, add fails | `POST /api/tasks` gets a 502, list cached | Banner shows; title kept; active queries refetched once | no toast, no error slot text |
| Login unreachable | `POST /api/auth/token` rejects or 502 | Banner above the login card; fields kept | Login error slot stays empty |
| Login reachable again | next login gets 401 or 200 | Banner clears and "Reconnected." is announced; a 401 shows its message as before | N/A |
| Plain 5xx | 500 | No banner; the error toast as before | toast |

</frozen-after-approval>

## Code Map

- `frontend/src/api/errors.ts` -- `isUnreachable`, `NetworkError`, `ServerError`, `GATEWAY_STATUSES`: reuse; don't redefine "unreachable".
- `frontend/src/api/client.ts` -- `configureClient` interceptors, the only place requests are observed. The response interceptor sees every response, including a 502. The error interceptor tags a TypeError with no response as `NetworkError`. Report reachability from there. Keep the 401 logic unchanged.
- New `frontend/src/api/connection.ts` -- a tiny external store like `api/token.ts` (`getUnreachable`, `setUnreachable`, `subscribeConnection`), for `useSyncExternalStore`. Changing it to its current value notifies nobody.
- `frontend/src/api/token.ts` -- the pattern to copy (listener set, subscribe returns the unsubscribe).
- `frontend/src/api/queryClient.ts` -- the retry policy (`shouldRetryQuery`, `retryDelay`): unchanged.
- `frontend/src/a11y/announce.tsx` -- `useAnnounce()`, the one polite region; `App` already wraps everything in `AnnounceProvider`.
- `frontend/src/App.tsx` -- `Shell`: render the banner above the column, inside `AnnounceProvider` and `QueryClientProvider`, so it shows on Login and Main. Login's `main` is `min-h-dvh`; with a banner above it, take the banner's height out (for example, make the shell a flex column with Login filling the remaining space), so no scroll is added.
- New `frontend/src/components/ConnectionBanner.tsx` (or under `src/api/`) -- reads the store; announces on each transition, never on mount with a reachable state; on becoming unreachable, refetches active queries once unless one is already fetching (`queryClient.isFetching() === 0`).
- `frontend/src/screens/LoginScreen.tsx` -- probably unchanged; its `onError` already ignores non-envelope errors. Check the comment there, which says retry rules apply.
- `frontend/src/tasks/testHarness.tsx` -- the harness for component tests (real client, mocked fetch). Reset the connection store in `cleanup` so tests don't leak state.
- `frontend/e2e/*.spec.ts` -- use `page.route('**/api/**', r => r.abort())` (or `fulfill({ status: 502 })`) to simulate the outage; the shared webServer must not be stopped.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/api/connection.ts` + test -- the store: set and subscribe, no notification on an unchanged value.
- [x] `frontend/src/api/client.ts` + `client.test.ts` -- a network rejection or 502/503/504 marks unreachable; any other response (2xx, 401, 422, 500) marks reachable; the 401 handling is unchanged.
- [x] `frontend/src/components/ConnectionBanner.tsx` + test -- markup and tokens per DESIGN.md; announces once each way; nothing on the first render; refetches active queries once on becoming unreachable unless one is fetching.
- [x] `frontend/src/App.tsx` -- mount the banner above the column; adjust the Login layout so it adds no scroll.
- [x] Component tests for both screens (`App.test.tsx` or the screen tests) -- every row of the I/O matrix, with fake timers for the retry back-off.
- [x] `frontend/src/tasks/testHarness.tsx` -- reset the connection store in `cleanup`.
- [x] Playwright -- Login: abort the token request, the banner shows, then unblock, log in, the banner goes and the main screen shows. Main: abort `/api/tasks`, the banner shows and the page has no horizontal scroll at 320px, then unblock and the banner goes.

**Acceptance Criteria:**
- Given the frontend, when `npm run lint && npm run build && npm test && npm run e2e` run on Node 24, then all pass, and `uv run pytest -q` still passes.
- Given the banner is showing, when the screen is inspected at 320px and 1280px, then it spans the viewport width, the column below is unchanged, and there is no horizontal scroll.

## Implementation Notes

- Store `api/connection.ts` (`getUnreachable`, `setUnreachable`, `subscribeConnection`), set only in `api/client.ts`: the response interceptor sets `GATEWAY_STATUSES.has(status)` (now exported from `errors.ts`) on every response, and the error interceptor sets it on a fetch `TypeError`. An AbortError changes nothing.
- `components/ConnectionBanner.tsx` sits first in `App`'s `Shell`, which is now a flex column; Login's `main` is `flex-1` instead of `min-h-dvh`, so the banner adds no scroll. On becoming unreachable it refetches active queries once when `isFetching() === 0`.
- The harness `cleanup`, `App.test.tsx` and `MainScreen.test.tsx` reset the module-global store; any new test rendering `App` outside the harness must too.
- Known effect of the design: if an action fails just as the server returns, the one refetch clears the banner almost at once (a flash, and both announcements).
- Verification: Vitest 277 (after the review patches, which also set `networkMode: 'always'`), Playwright 44 (new `e2e/connection.spec.ts` at 320px and 1280px), backend 436, lint and build clean. Screenshots of Login and Main with the banner at 320px and 1280px checked.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 10 findings), Edge Case Hunter (EC, 8), Verification Gap (VG, no gaps).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH1, EC2, EC3 | Device offline: TanStack's default `networkMode: 'online'` pauses queries and mutations without a request, so no banner shows, and a paused add is replayed when the device comes back online | medium | `retryer.js` `canFetch` returns `onlineManager.isOnline()` for `online` mode; `createQueryClient` sets no `networkMode`. A replayed add breaks the frozen Never "no queued or replayed actions" | patch: `networkMode: 'always'` for queries and mutations, with a test |
| BH2 | The Login 200-recovery test doesn't assert "Reconnected." | low | it asserts only `not.toBe(BANNER_TEXT)`; the matrix row asks for "Reconnected." | patch |
| BH3 | No e2e uses a 502, and the Login e2e doesn't check "Reconnected." | low | both use `route.abort()`; the AC names the Vite proxy 502 | patch: the Login e2e fulfils 502 and asserts the announcement |
| BH5 | The MainScreen fake-timer steps (2/4/8/16 s) are not the real back-off (1/2/4/8 s) | low | `retryer.js` calls `retryDelay(failureCount)` before incrementing, starting at 0 | patch: advance by the real delays |
| EC8 | The e2e comment's "1 s, 2 s, 4 s" back-off is wrong | false | the same `retryer.js` lines give 1 s first | rejected |
| EC1 | Concurrent responses straddling an outage flip the banner | low | needs a slow response landing after another request failed; the fix is a per-request sequence guard | rejected (rare, adds complexity) |
| EC4 | A hung server never shows the banner | low | needs a server that accepts but never answers; a local backend is either up or refused; needs a timeout signal | rejected (rare, adds complexity) |
| EC5 | A TypeError while reading the body after headers isn't marked unreachable | low | needs the connection to drop mid-body on small local JSON | rejected (rare, adds a branch) |
| EC6 | A TypeError thrown by a request interceptor shows a false banner | low | our only request interceptor sets a header and cannot throw a TypeError in practice | rejected |
| EC7 | Margins collapse differently in the new flex column | false | `MainScreen`'s root uses `pt-12` (padding, not margin), and the e2e layout tests pass | rejected |
| BH4 | The Main e2e recovery could race the back-off | low | unrouted within a few seconds of reload; the next retry lands well inside the 20 s timeout; passes | rejected |
| BH6 | The banner scrolls out of view on a long list | low | DESIGN.md "at the very top" is met; the add input it reports on sits near the top too | rejected |
| BH7 | A backend 503/504 reads as unreachable and retries forever | false | this is the frozen decision ("exactly what `isUnreachable` covers"); the backend sends no 503/504 | rejected |
| BH8 | A failed logout while unreachable is untested | low | the banner then truthfully shows on Login; the cache is cleared, so the refetch finds nothing | rejected |
| BH9 | `announced` lives in a ref and re-announces on remount | low | the banner mounts once at the root `Shell`, which never remounts outside HMR | rejected |
| BH10 | The diff omits the spec and sprint files | false | intentionally excluded | rejected |

## Verification

**Commands:**
- `cd frontend && source ~/.nvm/nvm.sh && nvm use 24 && npm run lint && npm run build && npm test` -- expected: pass.
- `cd frontend && source ~/.nvm/nvm.sh && nvm use 24 && npm run e2e` -- expected: pass (stop dev servers on :8000/:5173 first).
- `uv run pytest -q` -- expected: 436 pass.

**Manual checks:**
- Screenshots with the banner shown, at 320px and 1280px, on Login and Main.
