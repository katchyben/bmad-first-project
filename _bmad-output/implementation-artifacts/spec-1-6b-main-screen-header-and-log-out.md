---
title: 'Story 1.6b: Main screen header and Log out'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After logging in (1.6a), the owner sees a bare placeholder with no heading and no way to log out.

**Approach:** This is the last part of Story 1.6, split from 1.6a. When logged in (document title "Today — Todo"), show `<h1>` "Today" in heading typography with today's date beneath it ("Thursday, October 1": browser time zone, `en-US`, heading-date typography (14px/400), muted, 4px gap), a ghost "Log out" at the right end of the heading row (baseline-aligned, muted until hover), and 48px page top padding. Log out calls the generated `logoutMutation`, is `aria-disabled` while in flight, and whatever the result (including network failure) clears the token locally. 1.6a's auth state then drops all toasts, clears the query cache, shows Login and focuses Username. Tests: Vitest for logout including offline and 5xx; Playwright for log in → main → log out and for no horizontal scroll at 320px on both screens.

</frozen-after-approval>

## Implementation Notes

- New `frontend/src/screens/MainScreen.tsx`:
  - `<main className="pt-12">`, with a header row `flex items-baseline justify-between`. The `<h1>` "Today" uses heading typography (32px, light, −0.02em). The date sits underneath, in 14px muted text with `mt-1` (a 4px gap), formatted by the exported `formatHeadingDate` (`Intl.DateTimeFormat('en-US', {weekday:'long', month:'long', day:'numeric'})`) in the browser's time zone.
  - Log out is a shadcn `variant="ghost"` Button with `min-target`, in muted text that turns `foreground` on hover. While the request is in flight it has `aria-disabled` plus a ref guard against double clicks.
  - Logout uses the generated `logoutMutation` with `onSettled: clearToken`, so the token is cleared after the request completes. That timing means the request still carries the bearer header.
  - 1.6a's token listener then drops the query cache and toasts. LoginScreen focuses Username when it appears.
- `frontend/src/App.tsx`: the `LoggedIn` placeholder is replaced by `MainScreen`, which now sets the "Today — Todo" title itself.
- Tests:
  - New `frontend/src/screens/MainScreen.test.tsx` covers the date format, the header, and logout on success (bearer sent, `aria-disabled` while pending, the token kept until settled), on 5xx and offline (one request, no retry), and on a double click.
  - Existing placeholder assertions in `App.test.tsx`, `e2e/design.spec.ts` and `e2e/login.spec.ts` now look for the "Today" heading, or "Todo App" for Login.
  - New e2e tests: log in → main (heading and the browser's date) → log out (bearer sent, token gone, a reload stays on Login), and the 320px main screen.
- Mutation check: switching `onSettled` to `onSuccess` fails the 5xx and offline tests.
- Verified: frontend lint, build, 91 unit and 29 e2e tests; `uv run pytest` 219.
- Review patch (log out made fire-and-forget): `logOut` captures the token, sends `logout` with an explicit `Authorization: Bearer <token>` header, and clears the token at once, so Login shows immediately whatever the server does (no hang, no double reset on 401). The logout mutation sets `meta: { globalErrorToast: false }`, and `createQueryClient`'s `MutationCache.onError` skips the global toast for mutations that opt out (verified: removing the opt-out fails the 5xx test). The in-flight `aria-disabled` state was dropped as moot, since the screen is gone at once; a ref guard still blocks a second click.
- Tests updated: logout ends the session before the server answers, with the old token as bearer; 5xx, network and 401 all end it with no error toast and no retry; a server that never answers doesn't block. The e2e now proves server-side revocation: the old token gets 401 from `/api/auth/logout` afterwards. The 320px check covers the button width and that the heading doesn't overlap it. The no-token unit test asserts Log out is absent. `design.spec.ts` has a comment that its fake token will need a mock once Epic 2 adds a task query.

## Review Triage Log

- Log out can hang on a server that never answers (the token was cleared only in `onSettled`) — medium: real; patched (fire-and-forget with an explicit bearer header; immediate local clear).
- A failed logout briefly queues the global error toast — low: real (the global `onError` ran before `onSettled`); patched with a `meta` opt-out read by the `MutationCache`.
- A 401 on logout is untested; double clear and reset — low: patched (test added; the immediate clear removes the double reset, because the 401 hook only fires for the stored token, which is already null).
- The e2e "server-side" check only proved localStorage was empty — low: patched (the old token gets 401 afterwards).
- The 320px check skipped width and overlap — low: patched.
- The no-token test lost its negative check — low: patched (Log out absent).
- The design fixture's fake token will 401 once Epic 2 fetches — low: comment added; Epic 2 should mock its first query there.
- The heading date doesn't roll over at midnight — low: needs a midnight timer or focus refresh; any re-render corrects it; rare for a daily-use page. Reject.
- Keyboard double activation and pending announcement — low: the ref guard blocks repeats; the screen switches at once, so there's no lasting pending state. Reject.
- Brittle class-name and DOM-order assertions in the header test — low: cosmetic; layout is also covered by e2e. Reject.
- Test harness duplicated from `App.test.tsx` — low: cosmetic. Reject.
