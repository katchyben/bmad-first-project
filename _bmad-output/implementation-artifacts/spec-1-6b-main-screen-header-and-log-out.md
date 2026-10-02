---
title: 'Story 1.6b: Main screen header and Log out'
type: 'feature'
created: '2026-10-02'
status: 'in-progress'
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
