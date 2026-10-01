---
review: input reconciliation
spines: [../DESIGN.md, ../EXPERIENCE.md]
decision-log: ../.memlog.md
inputs:
  - ../../../prds/prd-bmad-first-project-2026-10-01/prd.md
  - ../../../architecture/architecture-bmad-first-project-2026-10-01/ARCHITECTURE-SPINE.md
  - ../../../epics.md
date: 2026-10-01
---

# Input reconciliation: UX spines vs PRD, architecture, epics

## Verdict

**Pass with revisions.** No blocking contradiction with the PRD or the architecture. The spines respect API-owned ordering and filtering (AD-10), no optimistic updates (AD-11), the Undo timer starting on the response (AD-8), non-persisted filter and collapse state (FR-15, FR-16), no section in Done/Cancelled filters (FR-16), a due date that cannot be removed (FR-5, AD-7), server-side past-date checks (FR-4/FR-5, NFR-1) and single-key `localStorage` tokens (AD-11). The live overdue display fits PRD §9 Q3 and the architecture's Deferred row, and needs no API change.

What needs fixing:

- One UX rule needs data the AD-12 envelope does not carry: the per-field error placement in the inline edit row.
- One UX rule puts a requirement on the backend that no AD or backend story holds: API message copy written in the UX voice.
- `epics.md` still says "UX Design Requirements: None yet". The six frontend stories need AC updates to match the spines.

## Checklist (requested checks)

| Check | Result | Evidence |
|---|---|---|
| Client-side sorting / filtering | Consistent | EXPERIENCE Foundation "Authority"; Status filter calls `GET /api/tasks?status=…`. The All view splits by status, which AD-10 allows. The "Finished (n)" count is display-only. |
| Optimistic updates | Consistent | Foundation; Task row "on success the list refetches"; Add input; Delete confirm (AD-11, stories 2.5/3.5). |
| Undo timer origin | Consistent | Undo toast "open for exactly 5 s from that moment [success response]"; app-level store keyed by task ID (AD-8, story 3.5). One refinement is noted in F5. |
| Filter / collapse persistence | Consistent | Filter defaults to All and is not remembered. Finished starts collapsed on every visit and is never persisted (FR-15, FR-16). Keeping the collapse state across filter changes within a visit is allowed. |
| Done/Cancelled filter shows no section | Consistent | Status filter row; State Patterns "Filter = Done / Cancelled" (FR-16, story 3.6). The spines also drop the section for To do / In progress, which FR-16 implies. |
| Due date removable | Consistent | There is no "clear due date" control (DESIGN Inline edit row). An unchanged due date is never sent (FR-5, AD-7). |
| Past-date entry | Consistent | No pre-validation: the API message appears under the field (FR-4/FR-5, NFR-1). Calendar past-day disabling and preset roll-forward are affordances, not rules; the API still decides. Story 2.5 asks for "picker starts at or after the current time". |
| Error handling vs envelope | **Partial**. See F1, F2, F8, F9. | |
| Token handling | Consistent | One `localStorage` key; clear and route to Login on `unauthenticated`, silently (AD-11, story 1.6). See F8 for the login-401 edge case. |
| Live overdue recompute vs AD-9 / NFR-3 / PRD §9 Q3 | **Consistent, with conditions**. See F3. | |

## Findings

### F1 (Medium): Per-field error placement in the inline edit row has no data source in AD-12

- **Where:** EXPERIENCE Component Patterns, Inline edit row: "Errors show under the relevant field". Error toast: "for … edit-save errors not tied to a field". State Patterns "Field error".
- **Conflict:** AD-12's envelope is `{code, message, reason?}` with no field pointer, and `reason` is defined only for `undo_window_expired`. To place a `validation_error` under title, description or due, the frontend would have to parse the message. That breaks "One wording source" ("never rewords, maps…") and NFR-1 / AD-2 in spirit.
- **The add input is fine:** the add input shows its error in one place, "under the input".
- **Options:**
  - **(a) UX-only, recommended:** in the edit row, show any `validation_error` message in one error slot (under the title, or above Save/Cancel), linked via `aria-describedby`. Route `state_conflict` and `not_found` to the error toast. This makes "tied to a field" mean "`code == validation_error`".
  - **(b) Architecture change:** add an optional `field` (or field-specific `reason` values) to the envelope and the domain errors. This is not in AD-12 today and needs an architecture update.
- **Related inconsistency:** State Patterns lists "login" under "Field error | Message directly under the field". The Login card says the message goes "above the Log in button (it names neither field)" (FR-1). Align State Patterns with the Login card.

### F2 (Medium): "One wording source" puts a backend copy requirement in place that no AD or backend story holds

- **Where:** EXPERIENCE Voice and Tone: "API error messages are written in this voice … 'That time has already passed.' is the API's message, not UI copy". Memlog: "API messages follow the calm voice (single wording source)".
- **Gap:** AD-12 fixes the envelope shape, not message wording. Backend stories specify only categories and codes:
  - 2.1 and 2.3: `validation_error` (422)
  - 3.3: "a message saying the undo window has expired"
  - 1.5: `unauthenticated` with no hint
- **Risk:** nothing obliges the API to return "That time has already passed." or calm wording. Request-validation (shape) errors from Pydantic/FastAPI carry technical default text, such as "Input should be a valid datetime" or "Field required". Those reach the UI as written. The frontend normally sends well-formed bodies, but a malformed date from the time field would surface raw text.
- **Fix:** add backend ACs that fix the user-facing messages, at least:
  - past due date: "That time has already passed."
  - title blank or too long, and description too long
  - undo window expired
  - invalid credentials
  - not found
  - state conflict per action

  Also add a convention to AD-12 (or story 1.1): messages are plain, short sentences in the UX voice, and the request-validation handler replaces Pydantic default text with a calm generic message. This changes no API shape, only copy, but it must live in the backend stories or it will not be built.

### F3 (Medium, process): The live overdue display is consistent with PRD §9 Q3, but should be closed upstream and bounded

- **Where:** EXPERIENCE State Patterns "Overdue present": active rows are re-evaluated against the clock every minute and on window focus. This is display only and never re-sorts, filters, refetches or changes status.
- **Judgement: consistent.**
  - PRD §9 Q3 left open exactly this: "whether the frontend may refresh the indicator's display live … (display only; the API stays authoritative, per NFR-1)".
  - The architecture's Deferred table hands the question to this step ("display only (AD-9, AD-10 keep the API authoritative)").
  - It needs no endpoint or field change. AD-9's `is_overdue` stays the server's truth and the next fetch replaces the client view.
  - It also cannot contradict the server order. Overdue is a function of `due_at`, and active tasks are sorted by `due_at` ascending. The overdue set is therefore always a prefix of the active list, and a newly overdue row is already where the server would put it.
- **Tension to acknowledge:** NFR-3 says the server clock is the single source of "now" for the overdue indicator. The client uses the browser clock for display. PRD Q3 sanctions this, but the spine should state the limits explicitly:
  1. It only promotes active rows from not overdue to overdue (`status ∈ {to_do, in_progress}` and `due_at < browser now`). It never clears a server `is_overdue: true` and never marks finished rows.
  2. Browser/server clock skew can make the highlight appear slightly early or late until the next fetch. This is accepted.
  3. The row's accessible name ("overdue") updates with the visual.
  4. It is a frontend-only consequence, so it needs a Vitest fake-timer test (NFR-6).
- **Upstream touch-ups:**
  - Close PRD §9 Q3 as "Yes, display only".
  - Update the architecture Deferred row "Whether the frontend refreshes the overdue display live" to "Decided by UX".
  - Add an AC to story 2.5.

### F4 (Medium): UX requirements with no story home; `epics.md` still says "UX Design Requirements: None yet"

The following spine decisions have no AC in any story:

- **Design system setup:** shadcn/ui + Tailwind, the DESIGN.md token mapping for light and dark via `prefers-color-scheme`, and the system font stack. Natural home: story 1.3.
- **Keyboard model:** ⌘K, ↑/↓ roving selection, S/B/C/X/E/⌫/Z, the focus rules, and selection following the task by ID after refetch. Homes: 2.5, 2.6, 3.5.
- **Connection banner and retry policy:** "Can't reach the server. Retrying…", queries retried and mutations not. Also the "Loading…" line after 1 s. Home: 2.5, or 1.3 for the shared plumbing.
- **Add-task details:** presets (Tomorrow 9:00 AM preselected, Next Monday 9:00 AM), the "Pick date…" popover with calendar and time field, the "Add description" link and textarea, and focus staying in the input after add. Home: 2.5.
- **Live overdue display (F3).** Home: 2.5.
- **Error and Undo toasts:** the toast region, several toasts at once, no pause on hover, and the expired state fading after 3 s. Home: 3.5.
- **Accessibility floor:** live-region announcements, accessible row names, and `prefers-reduced-motion`. Spread across the stories.

Fix: fill in the "UX Design Requirements" section with UX-DR items that point at DESIGN.md and EXPERIENCE.md, and map each one to a story (see the AC list below).

### F5 (Low): The pending Undo past 5 s refines FR-11 and story 3.5

- **Where:** EXPERIENCE Undo toast: "once sent, the toast stays until the response even past 5 s".
- **Conflict:** FR-11 says "shows an Undo control for 5 seconds … then hides it", and story 3.5 says "for exactly 5 seconds from that moment, then disappears". This is not a real contradiction, because the server judges the window and the user already acted. The spine should still say that once Undo is sent, the link becomes non-interactive (pending), so the "control" is not usable after 5 s.
- **Fix:** update story 3.5's AC to match.

### F6 (Low): Description has no read surface outside edit

The task row anatomy is mark, title, overdue label and due time (DESIGN Task row). A task's description (FR-4/FR-5) is visible only by opening the inline edit row, and nothing shows that a task has one. No FR requires the description to be displayed, so this is not a contradiction. It is a gap worth a deliberate decision, either "accepted" or a small description indicator. SM-C1 (no extra features) argues for accepting it, but the spine should say so.

### F7 (Low, internal to the spine): Enter confirms Delete while Keep has focus

The delete confirm puts focus on Keep, yet Enter "confirms Delete (from anywhere in the confirm)". This overrides native button semantics: Enter on a focused button activates that button. It makes the destructive action the Enter default while the safe button looks focused. This is not an input contradiction, but stories 2.6 / FR-6 expect a deliberate confirm. Consider making Enter activate the focused button, or moving focus to Delete with Esc for Keep.

### F8 (Low): Login 401 vs the global `unauthenticated` handler

AD-11 says that on any `unauthenticated` response the client clears the token and routes to login. Invalid credentials on `POST /api/auth/token` also return `unauthenticated` (401), per story 1.5. The Login card needs the message shown, the username kept and the password cleared, so the global handler must not swallow or reset the login form. This tension already exists in AD-11 vs story 1.6, and the UX inherits it. Add a note to story 1.6 or 1.3: the login request is exempt from the redirect handler, or the handler is a no-op when already on Login and the error is still passed to the form.

### F9 (Low): Unspecified states

- **5xx or non-envelope responses:** AD-12 covers only the four categories plus 405. The spine has no treatment when `error.message` is absent. Suggest a frontend fallback string in the voice table, such as "Something went wrong. Try again."
- **Retry policy:** TanStack Query's default retry also retries 4xx (401, 404, 422) three times, and it stops after three attempts while the banner keeps saying "Retrying…". Specify retry only on network errors, and recovery through refetch-on-reconnect / refetch-on-focus or an interval so "Retrying…" stays true.
- **Logout failure:** if logout fails, for example because the server is unreachable, it is unspecified whether the token is still cleared. Suggest: always clear it locally.
- **Open Undo toasts on logout or 401:** unspecified. Suggest: drop them.

## PRD / story requirements with no UX home

None of substance. FR-17 (retrieve a single task) and NFR-4/5 are API-only and need no UX. Every frontend-facing FR consequence (FR-1, 2, 4–6, 11, 13–16) and every frontend story AC has a home in the spines. The reverse direction, UX with no story home, is F4.

## UX decisions that would need an API or architecture change

| Decision | Change needed? |
|---|---|
| Live overdue display | No. Display-only, sanctioned by PRD §9 Q3 and the architecture Deferred row (F3). |
| Per-field error placement in the edit row | **Yes, unless the UX is relaxed** (F1): the envelope has no field pointer. |
| API messages written in the UX voice ("That time has already passed.") | No shape change. It adds backend copy ACs and a message convention, AD-12 or story 1.1 (F2). |
| "Finished (n)" count, selection by ID, toast keyed by task ID | No. Computed from the returned list or local state. |
| Inline delete confirm, "Add description" link, presets, calendar | No. Pure frontend. |

## Story ACs the spines refine or change (epics.md touch-up)

- **epics.md, "UX Design Requirements":** replace "None yet …" with UX-DR items that reference DESIGN.md and EXPERIENCE.md and map them to stories (F4).
- **1.3 Frontend skeleton:**
  - Set up shadcn/ui + Tailwind with the DESIGN.md tokens, light and dark via `prefers-color-scheme`, and the system font stack.
  - Query retry only on network errors; mutations not retried.
  - The `unauthenticated` handler does not interfere with the login request (F8).
- **1.6 Log in and out:**
  - Invalid credentials: the API message appears above Log in, the username is kept and the password cleared. Log in is disabled while the request is in flight.
  - After login or re-login, the app shows a fresh All view with Finished collapsed.
  - Log out is a ghost button in the header.
  - Token rejection is silent, with no message.
- **2.5 See and add tasks:**
  - The empty state means "no active tasks in the All view" (Finished may still render), not "no tasks". The filtered empty copy is "No tasks here."
  - Overdue highlighting also updates live for display only (F3), with a fake-timer test.
  - Due entry:
    - "Tomorrow 9:00 AM" is preselected, so title + Enter is a complete task, and "Next Monday 9:00 AM" is the second preset.
    - The "Pick date…" popover has a calendar with past days disabled and a time field.
    - The frontend does no pre-validation; the API's past-time message appears under the input.
  - Description is added through the "Add description" link and textarea.
  - Focus stays in the input after add.
  - ⌘K focuses the input.
  - The "Loading…" line appears after 1 s; the connection banner shows when the server is unreachable.
- **2.6 Edit and delete:**
  - Edit is offered for active tasks only (the story says "a task in the list").
  - Editing happens in an inline edit row (Edit button or E), where Enter saves and Esc discards.
  - An unchanged due date-time is never sent, and there is no clear-due control.
  - Delete happens in an inline row confirm ("Delete 'X'? This can't be undone." with Delete / Keep, the Delete button or ⌫, To do only), not a dialog.
  - Errors: `validation_error` appears in the edit row and other errors appear in an error toast (F1).
- **3.5 Status actions with Undo:**
  - The action set adds Edit to To do and In progress rows. Actions are revealed on hover or selection.
  - Keyboard shortcuts: S, B, C, X and Z.
  - A row's actions are disabled while its request is in flight.
  - Toast copy is "Marked 'X' done · Undo" / "Cancelled 'X' · Undo", with a visible countdown. Hover and focus do not pause it, and several toasts can be open at once.
  - Once Undo is sent, it stays pending until the response, even past 5 s (F5).
  - On expiry, the link and countdown are removed, the API message shows, and the toast fades after 3 s.
  - `state_conflict` and `not_found` appear in an error toast.
- **3.6 Finished section and filter:**
  - The Finished section starts collapsed on every visit (the story says only "resets to the default") and shows "Finished (n)".
  - Within a visit, the collapse state is kept across filter changes.
  - The section appears in the All view only; the To do and In progress filters are plain lists too.
  - Filtered empty state: "No tasks here."
- **Backend copy, from F2:**
  - 2.1 / 2.3: the past due date-time message is "That time has already passed.", and the title and description messages use the calm voice.
  - 3.3: wording of the undo-expired message.
  - 1.5: wording of the invalid-credentials message, which names neither field.
  - 1.1 / AD-12: a message-voice convention, plus a calm replacement for Pydantic's default request-validation text.
- **Upstream (not epics):** close PRD §9 Q3, and update the architecture Deferred row on the live overdue display (F3).
