---
title: 'Story 2.5a: Show my tasks on the main screen'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '784b41441f480c22a116d45d2f0f3521df514f06'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-first-project-2026-10-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After logging in, the main screen shows only a heading. The tasks the API now serves are invisible.

**Approach:** Under the main screen header, render the `GET /api/tasks` list through the generated TanStack Query hook, exactly in API order, as one bordered list card in the 640px column. Implement Story 2.5a's acceptance criteria in `epics.md`: row anatomy and due format (UX-DR4, UX-DR7), overdue treatment and its live promotion (UX-DR5), the two-line title clamp (UX-DR6), the empty state (UX-DR18), the cold-load "Loading…" line and fade-in (UX-DR17, UX-DR29), and 400% zoom reflow.

Decisions (Benny's standing default to proceed on recommendations, 2026-10-02):
- The list is a plain `<ul aria-label="Tasks">` of `<li>` rows here. Selection, focus and `role="grid"` arrive in 2.5d, so the selected-row full title is 2.5d's too.
- A row's accessible name (`aria-label`) is `"<full title>, To do, due <due text>"`, plus `", overdue"` when overdue.

## Boundaries & Constraints

**Always:**
- No client-side sorting or filtering; rows render in response order. A row is overdue when the server says `is_overdue`, or when an active task's `due_at` is before the browser's current time. The client never clears a server `true` and never touches finished rows.
- Live promotion re-evaluates on a one-minute tick and on window focus, without a refetch or re-sort. It is silent: no announcement.
- Due text (UX-DR7), in the browser's time zone: "Yesterday, 5:00 PM" · "Today, 3:00 PM" · "Tomorrow, 9:00 AM" · a weekday within the next 6 days ("Fri, 10:00 AM") · otherwise "Oct 12, 9:00 AM", adding the year when it isn't the current year. This lives in a pure function with an explicit `now`.
- Overdue row: `overdue-tint` background, a 3px inset left rule in `overdue`, the mark in `overdue`, an `aria-hidden` lucide alert icon, the word "Overdue" (`overdue-label` typography) and the due time in `overdue`. It never relies on colour alone.
- Design tokens only, from `index.css` and DESIGN.md (`row-padding-*`, `row-gap`, `row-title`, `row-meta`). The empty-circle status mark is an 18px `aria-hidden` SVG.
- Cold load: no spinner or skeleton. If the first load is still pending after 1 s and the server is reachable, show one muted "Loading…" line in the list position, announced once in a polite live region. The list appears with the `fade` utility (180ms, off under reduced motion; the 1 s delay is unchanged). "Loading…" never shows on refetches.
- Empty state (no tasks): the 44px outlined ring, "Nothing due. Enjoy the quiet." and "Type above when something comes up."
- No horizontal scroll at a 320px viewport or at 400% zoom.

**Never:**
- No add input, chips, keyboard navigation, selection, row actions, connection banner or finished section (2.5b–2.5e, 2.6, Epic 3).
- No hand-written `fetch`; use the generated `listTasksOptions` (or equivalent) from `@/client/@tanstack/react-query.gen`.

</frozen-after-approval>

## Code Map

- `frontend/src/screens/MainScreen.tsx` -- header to keep; mount the list below it.
- `frontend/src/screens/MainScreen.test.tsx` -- the render harness (`fetchMock`, `renderApp`, `stubMatchMedia`) to extend or copy for list tests.
- `frontend/src/client/@tanstack/react-query.gen.ts` -- `listTasksOptions`; `frontend/src/client/types.gen.ts` -- `TaskResponse`.
- `frontend/src/api/queryClient.ts` and `frontend/src/api/errors.ts` -- retry policy and `isUnreachable` (for "server reachable" before showing Loading).
- `frontend/src/lib/motion.ts` and `frontend/src/index.css` -- `fade`, `min-target`, colour tokens (`overdue`, `overdue-tint`, `row-*`).
- New: `frontend/src/tasks/` -- `formatDue.ts` (pure), `useNow.ts` (minute tick plus focus), `TaskList.tsx` and `TaskRow.tsx`, with tests beside them.
- `frontend/e2e/shell.spec.ts` and `frontend/e2e/login.spec.ts` -- Playwright patterns. The e2e database is shared across tests: create tasks with unique titles through the API using the logged-in token, and assert relative order and visibility, not the whole list.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/tasks/formatDue.test.ts` then `formatDue.ts` -- every UX-DR7 form, including the year rule and both day boundaries.
- [x] `useNow` with fake-timer tests (minute tick, focus).
- [x] `TaskRow.tsx` and `TaskList.tsx` with component tests: API order kept; overdue treatment and accessible name; live promotion when the browser time passes `due_at`, and its limits (server `true` is never cleared; finished rows are never promoted); the two-line clamp class with the full title in the name; the empty state; "Loading…" only after 1 s while pending, never on refetch.
- [x] `MainScreen.tsx` -- mount `TaskList`.
- [x] `frontend/e2e/tasks.spec.ts` -- create two tasks through the API, reload, see them in order on the main screen; no horizontal scroll at 320px.

**Acceptance Criteria:**
- Given the frontend, when `npm run lint && npm run build && npx vitest run && npx playwright test` run on Node 24, then all pass, and `uv run pytest` still passes.

## Implementation Notes

- Tokens: DESIGN.md's row spacing and type roles were not yet in `index.css`, so `@theme` now defines `--spacing-row-padding-{x,y}`, `row-gap`, `row-min-height`, `status-mark`, `empty-*`, `heading-to-filter` and `--text-row-title`, `row-meta`, `overdue-label` (600), `empty-title` (300), `caption`. Class lists that mix `text-<role>` with `text-<colour>` are joined plainly, not with `cn()`, because tailwind-merge would drop one as a colour clash.
- The list sits `heading-to-filter` (26px) under the header, the next block in DESIGN.md's vertical order until 2.5b inserts the add input and 3.6 the filter tabs.
- Overdue logic lives in `tasks/overdue.ts` (`isShownOverdue`). `useNow` is a 60 s `setInterval` from mount plus window `focus`. TanStack's focus manager listens to `visibilitychange`, not `focus`, so the focus re-check never refetches.
- "Loading…": a `role="status"` `aria-live="polite"` paragraph is rendered empty while the first load is pending and gets its text after 1 s, so it is announced once. It is suppressed while `failureReason` is unreachable (2.5e's banner). Refetches never show it because the query is no longer `pending`. A non-retryable first-load failure renders nothing (the global toast covers it).
- The list and the empty state share one wrapper that fades from `opacity-0` to `opacity-100` on the next animation frame.
- The query uses the generated key (`listTasksQueryKey()`), not `['tasks']`; 2.5b should invalidate with that key.
- Test harnesses: `App.test.tsx` and `MainScreen.test.tsx` now answer `GET /api/tasks` with `[]` by default, since the logged-in screen loads the list on mount. The "token rejected" test counts calls relative to the list request. A new `tasks/testHarness.tsx` holds the shared render and fetch helpers for the list tests.

- Main-session verification: planning references (UX-DR…, "Story 2.5a") were removed from code comments. Mutations, each caught by Vitest: server `is_overdue` ignored (2 fail), `LOADING_DELAY_MS = 0` (1 fails), `line-clamp-2` removed (1 fails). After the review patches: Vitest 130, Playwright 32, backend 436, lint and build clean. Screenshots at 1280px light and 320px dark were checked against DESIGN.md.

## Spec Change Log

## Review Triage Log

Pass 1: Blind Hunter (BH, 11 findings), Edge Case Hunter (EC, 10), Verification Gap (VG, 1 gap plus 2 other).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| VG1 | the status word in the accessible name is tested only for To do | low | `STATUS_LABEL` breakage would pass every test | patch: a test for In progress, Done and Cancelled names |
| BH6 | the token-rejected test seeds `['tasks']`, not the real list key | low | the list uses `listTasksQueryKey()` | patch |
| EC7, BH9b | the e2e RegExp is built from an unescaped title | low | `tasks.spec.ts` | patch |
| BH10 | `isTasksRequest` and `answerOthersWith` duplicated in two test files | low | `App.test.tsx` and `MainScreen.test.tsx` | patch: move to `tasks/testHarness.tsx` |
| EC1, EC2, EC10 | a finished task with a server `is_overdue: true` renders overdue | maybe-false (medium if reachable) | the server's `view_task` ignores status (already deferred from 2.1b); no task can be finished in Epic 2 | defer: a frontend note in the ledger, fixed with the server rule in Epic 3 |
| BH3, EC5, VG-o1 | every status shows the To do empty-circle mark | low | In progress, Done and Cancelled marks are UX-DR4's Epic 3 rows (3.5, 3.6); only To do tasks exist now | rejected (later stories) |
| BH4 | `aria-label` on a plain `<li>` may be ignored by some screen readers | low | the interim markup; 2.5d replaces it with `role="grid"` rows, whose names are announced | rejected (superseded by 2.5d) |
| BH5 | the empty-state copy refers to an input that doesn't exist yet | low | exact UX copy (UX-DR18); 2.5b adds the input next | rejected |
| BH2, EC3 | an invalid `due_at` crashes the list | false | `TaskResponse.due_at` is always a server ISO date-time (AD-13) | rejected |
| BH1, EC4 | a failed cold load leaves the list area blank | low | 5xx → global toast; 401 → Login; network → retried while pending, banner in 2.5e; the list route has no other 4xx | rejected |
| BH7 | `useNow` ticks from mount, up to 59 s late; no `visibilitychange` | low | "re-evaluated every minute and on window focus" is met | rejected |
| BH8 | e2e never deletes its tasks | false | the Playwright webServer recreates the DB every run (`rm -rf` in `playwright.config.ts`) | rejected |
| BH9a, EC6 | a midnight-crossing run could flake | low | it needs a run that straddles local midnight | rejected |
| BH11, EC8, EC9 | token naming, redundant `aria-live`, an empty live region while unreachable, the spec's literal "To do" | low | cosmetic or harmless | rejected |

## Verification

**Commands:**
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npm run lint && npm run build && npx vitest run` -- expected: pass.
- `cd frontend && PATH=~/.nvm/versions/node/v24.8.0/bin:$PATH npx playwright test` -- expected: pass (30 existing plus the new tests).
- `uv run pytest` -- expected: 436 pass.
