---
title: 'Story 1.3c: App shell and global error toast'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '99fac91689ae6ada8d063684b81d4b5c0b67e3a9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The frontend has a themed design system (1.3b) but no shell: no layout column, no toast region, and server failures that carry no usable message are silently dropped. Story 1.6 onward needs all three in place.

**Approach:** This is the last part of Story 1.3. Replace the placeholder root with the fluid single-column shell, mount a Sonner `Toaster` themed on DESIGN.md's toast tokens, and add a global TanStack Query error hook that shows the fallback message in a persistent error toast for 5xx and envelope-less failures only.

## Boundaries & Constraints

**Always:**
- Shell: `lang="en"`; one centred column `width: 100%` up to 640px with a 16px gutter each side on `background`; no breakpoints; component heights are minimums; no horizontal scroll at a 320 CSS px viewport (400% zoom of 1280).
- `Toaster`: bottom centre; region label "Notifications" (Sonner's default, focused by Alt+T); themed on `toast-background`/`toast-foreground` (light and dark), with toast controls using `ring-on-toast` for the focus ring. Theme follows the OS (`theme="system"`): `next-themes` and the direct `date-fns` dependency are removed, and the undefined `cn-toast` class is dropped.
- Global error toast: a failed query or mutation whose error is a `ServerError` (5xx) or carries no envelope `message`, and isn't "unreachable" (a `NetworkError` or a gateway `ServerError` 502/503/504, per `isUnreachable()`) *(gateway exclusion amended by Benny on 2026-10-01 after review)*, shows `errorMessage()`'s "Something went wrong. Try again." as an error toast. It never auto-dismisses, has a close button whose accessible name is "Dismiss" (at least 24×24), and repeated failures reuse one toast instead of stacking. `NetworkError`, gateway errors and envelope errors are not toasted globally.
- The `?design-check` fixture (dev only) still renders, inside the shell, and gains a button that triggers the global error path, for e2e.

**Never:** No login screen, task UI, connection banner, undo toast or routing (later stories). No change to 1.3a's retry or 401 policy, or to 1.3b's tokens and components beyond `sonner.tsx` theming. No backend changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 5xx query | a query rejects with `ServerError(500)` | one error toast "Something went wrong. Try again." with a "Dismiss" button; still shown after 30 s | — |
| Envelope-less mutation | a mutation rejects with a non-envelope body (e.g. a string) | the same fallback toast | — |
| Repeated failures | two 5xx failures in a row | still exactly one toast | — |
| Envelope error | a query rejects with a 409 envelope | no global toast | — |
| Network error | a query rejects with `NetworkError` | no global toast | — |
| Gateway error | a mutation rejects with `ServerError(502/503/504)` | no global toast | — |
| Dismiss | activate "Dismiss" | the toast closes | — |
| Toast theme | the error toast in light / dark | background `toast-background` (#1F1F1F / #EAEAEA), text `toast-foreground` | — |
| Narrow viewport | 320 px wide | column = viewport minus 32px; `scrollWidth <= clientWidth` | — |
| Wide viewport | 1280 px wide | column 640px, centred | — |

</frozen-after-approval>

## Code Map

- `frontend/src/App.tsx` -- placeholder `<main>Todo</main>` plus the lazy dev-only `DesignCheck` behind `?design-check`. Wrap both in the shell, and mount the `Toaster` once outside the branch.
- `frontend/src/components/ui/sonner.tsx` -- the CLI wrapper uses `useTheme()` from `next-themes` (no provider), `--normal-bg: var(--popover)` and `classNames.toast: "cn-toast"`. Re-theme it here.
- `frontend/src/api/queryClient.ts` -- `createQueryClient()` with `retry: shouldRetryQuery`, `retryDelay`, refetch flags and `mutations.retry: false`. Add `queryCache`/`mutationCache` `onError` without touching the retry policy.
- `frontend/src/api/errors.ts` -- `errorMessage()`, `FALLBACK_MESSAGE`, `ServerError`, `NetworkError`, `isUnreachable()`. Add the "needs global toast" predicate beside them.
- `frontend/src/DesignCheck.tsx`, `frontend/e2e/design.spec.ts` -- the dev fixture and 1.3b's computed-style tests; keep them passing.
- `react-day-picker` already depends on `date-fns`, so removing the direct dependency doesn't break Calendar.
- Run all npm commands under Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`). Playwright starts its own servers on a scratch DB; never use `./data`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/components/ui/sonner.tsx`, `frontend/package.json` -- toast tokens, `ring-on-toast`, `theme="system"`, "Dismiss" close label; remove `next-themes`, direct `date-fns`, `cn-toast` -- UX-DR1, UX-DR15, UX-DR25
- [x] `frontend/src/App.tsx` -- the shell column and the mounted `Toaster` -- UX-DR2, UX-DR27
- [x] `frontend/src/api/errors.ts`, `frontend/src/api/errorToast.ts`, `frontend/src/api/queryClient.ts` -- the predicate, `showErrorToast()` with a fixed toast id, and the global cache hooks -- UX-DR15
- [x] `frontend/src/DesignCheck.tsx` -- a button that rejects a query with `ServerError(500)` through the real query client -- NFR6
- [x] `frontend/src/api/errorToast.test.tsx` -- the toast rows (render `Toaster`, fake timers for 30 s) -- NFR6
- [x] `frontend/e2e/shell.spec.ts` -- the theme, Dismiss and viewport rows -- NFR6

**Acceptance Criteria:**
- Given `frontend/` under Node 24, when `npm run lint`, `npm run build`, `npm test` and `npm run e2e` run, then all pass, with the 1.3a and 1.3b tests unchanged except where they assert the placeholder root.

## Implementation Notes

- Sonner's stylesheet is unlayered, so it beats Tailwind's layered utilities. Overrides in `sonner.tsx` use the `!` modifier or inline `style`. No CSS was added to `index.css`.
- On-toast focus ring: the Toaster sets `--ring: var(--ring-on-toast)`, and the base `:focus-visible` outline picks it up. The close button sits in the flow at the right edge (not Sonner's corner badge), so the 2px offset shows `toast-background`.
- The error toast passes `icon: null` (DESIGN.md: message plus close button) and uses fixed id `global-error` with `duration: Infinity`.
- The 1.3a/1.3b tests are unchanged: the shell keeps `<main>Todo</main>` as placeholder content, so the design.spec placeholder test still holds.

- Review patches (pass 1): `needsGlobalErrorToast` now returns false first for `isUnreachable()` (NetworkError and gateway 502/503/504) and TanStack's `isCancelledError()`; the Sonner toast uses `fontFamily: var(--font-sans)`. Tests added: 502/503/504/500/501/CancelledError rows, no toast for a mutation 503, no `[data-icon]` in the error toast, the computed toast font, the 320px toast inset/24px bottom gap, and ±1 geometry tolerances. The implementing agent stopped on a usage limit after applying these; they were verified in the main session (lint, build, 70 unit, 21 e2e; dropping the gateway exclusion fails 6 tests).

## Spec Change Log

- **2026-10-01, review pass 1 (intent gap, resolved by Benny).** Trigger: all three reviewers found that `needsGlobalErrorToast` toasts every `ServerError`, including 502/503/504, which `isUnreachable()` (Benny's 1.3a decision) treats as "server unreachable". Queries never reach the toast because they retry gateway errors forever, but mutations (`retry: false`) would show "Something went wrong." for a downed backend, which the connection banner (2.5) owns. Amended: gateway errors are excluded from the global toast; there's a new matrix row. Known-bad state avoided: a downed backend showing both the banner and a generic toast. Patched in place. KEEP: the fixed toast id, `duration: Infinity`, the Dismiss close button, the toast-token theming, the shell column and the cache hooks wired in `createQueryClient()`.

## Review Triage Log

Pass 1 (blind = B, edge-case = E, verification-gap = V):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| E1/B1/B2/V | Gateway 502/503/504 on a mutation gets the global toast, though `isUnreachable()` treats it as unreachable | medium | `needsGlobalErrorToast` returns true for every `ServerError`; tests only cover 500 and force a 503 toast | intent_gap → resolved by Benny (exclude gateway), patched in place |
| E3 | A cancelled query (e.g. unmount mid-fetch, since the generated queries consume the AbortSignal) reaches `QueryCache.onError` as an envelope-less `CancelledError` and shows "Something went wrong." | medium | TanStack v5 calls the cache `onError` for non-silent cancellations; `needsGlobalErrorToast` has no cancellation check | patch |
| B4 | The toast text uses Sonner's font stack, not the app's | low | Sonner's unlayered CSS sets `font-family`; `sonner.tsx` sets only `fontSize`; a direct style addition | patch |
| V1/B10 | The mobile 24px bottom offset is untested, and the 320px test doesn't check the toast stays inside the viewport | low | V: removing `mobileOffset` keeps everything green (24px is Sonner's desktop default) | patch |
| V2 | `icon: null` (no icon on the error toast) is untested | low | V: removing it keeps all tests green | patch |
| E5/B9 | Exact-pixel geometry asserts (column x/width, the 24px offset) are brittle to sub-pixel layout and classic scrollbars | low | `toBe` on computed boxes; a direct switch to ±1 tolerance | patch |
| E2/B3 | No per-call opt-out from the global toast | low | No query or mutation handles 5xx locally yet, and UX wants 5xx in the error toast anyway | reject |
| E4 | The shared toast id would overwrite a different direct message | low | `showErrorToast` is only called by the global handler, so the text is always the fallback | reject |
| B5 | Toast spacing, type and shadow are literals, not CSS tokens | low | Cosmetic; values match DESIGN.md | reject |
| B6 | e2e doesn't check toast padding, gap, radius or shadow | low | Low-value pixel checks; the font gap is covered by the B4 patch | reject |
| B7 | Redundant close-button classes; `hover:opacity-80` without `!` | low | Cosmetic | reject |
| B8 | `showErrorToast`'s no-argument branch; redundant `dismissible: true` | low | Cosmetic | reject |

## Design Notes

The global toast covers only failures with nothing user-specific to say. Envelope messages belong where the user acted (inline slots or per-action toasts in later stories), and network failures belong to the connection banner (2.5). Using one fixed toast id stops a refetching query that keeps failing with 5xx from stacking toasts.

## Verification

**Commands (Node 24, from `frontend/`):**
- `npm run lint && npm run build && npm test && npm run e2e` -- expected: all pass
