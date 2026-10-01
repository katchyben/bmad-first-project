---
review: input-reconciliation
target: ../ARCHITECTURE-SPINE.md
inputs:
  - ../../../prds/prd-bmad-first-project-2026-10-01/prd.md (final)
  - ../../../prds/prd-bmad-first-project-2026-10-01/addendum.md
  - ../../../briefs/brief-bmad-first-project-2026-10-01/brief.md (+ brief addendum, consulted for system-field hand-off)
date: 2026-10-01
verdict: PASS WITH GAPS (no contradictions of the PRD; 5 high-priority holes where two builders would diverge)
---

# Input Reconciliation: Architecture Spine vs PRD/Brief

## Verdict

**Pass with gaps.** The spine doesn't contradict any FR or NFR. Every open question the PRD and brief left for architecture has an answer: frontend technology, auth, database, how undo works, where overdue is computed, and the wire format. The headline quiet requirements made it in correctly: the 5 s inclusive undo with zero grace (AD-8 `≤ 5 s`, server only), the non-past due date (AD-2), the 7-day absolute session (AD-6), "changes" meaning a different instant (AD-2 + AD-13 UTC normalisation), overdue computed and never stored (AD-9), and the finished time cleared by undo (AD-8).

The gaps are omissions, not conflicts. Three kinds came up: a data-model field the brief explicitly handed to architecture and nobody decided (`created_at`); precedence and edge rules that FastAPI's defaults resolve differently from the PRD wording (404 vs 422, `{"detail"}` bodies); and the frontend's time-based behaviour (the Undo control timer), which has no home other than "Deferred to UX".

## Findings

Severity: **H** = two builders will build incompatible or PRD-violating behaviour; **M** = likely divergence, easy fix; **L** = tidy-up.

### H1. `created_at` has no owner, source or precision (FR-13, FR-15, AD-3, Structural Seed)

- FR-13 and FR-15 both tie-break on **created time**. The brief addendum says "System fields (id, created/updated timestamps, status-changed timestamp) are left to architecture."
- The spine names `previous_status` and `finished_at` (AD-8) but never mentions `created_at`. The ER seed shows `TASK { int id }` only. The capability map lists FR-13/15 under AD-9/AD-10 only.
- Divergence: builder A uses a SQLite `CURRENT_TIMESTAMP` server default (second precision, the DB clock, not controllable by the fake Clock). Builder B sets it from the Clock port in the domain. Builder A's version breaks AD-3 and makes FR-13/FR-15 tie-break tests depend on the wall clock (NFR-6).
- **Fix:** add `created_at` to AD-8 or a new task-fields AD. Set it from the use case's `now` (AD-3). Store it as UTC with microseconds. Add FR-13 and FR-15 to AD-3's binds. List the full task columns in the seed: `id, title, description, due_at, status, previous_status, finished_at, created_at`.

### H2. Reading UTC timestamps back from SQLite is unspecified (AD-8, AD-9, AD-13, NFR-3)

- AD-13 says "stored as UTC". SQLAlchemy `DateTime` on SQLite drops tzinfo and returns **naive** datetimes. Comparing them with an aware `now` raises `TypeError`, or, if someone "fixes" it by making `now` naive, silently mixes conventions.
- This affects the undo window (`now − finished_at`), overdue (`due_at < now`), the past-date check and "changes = different instant".
- **Fix:** add one sentence to AD-4 or AD-13: the repository returns timezone-aware UTC datetimes to the domain (for example via a `TypeDecorator`), the domain only ever sees aware UTC, and microsecond precision is preserved. Add a round-trip test.

### H3. Error precedence and non-domain errors are undecided (NFR-2, PRD §4.2 "not-found for every op", AD-2, AD-12)

1. **Malformed or out-of-range IDs:** `/api/tasks/abc` gets FastAPI path validation, so it returns 422 `validation_error`, not `not_found`. An ID above SQLite's int64 range can raise an overflow error (500). The PRD says any op on a nonexistent ID is not-found. Decide: non-integer → 422 (state it explicitly) or 404, and make out-of-range IDs → 404.
2. **404 vs 409 vs 422 ordering:** take `PATCH` on a nonexistent ID with an invalid body, or `PATCH` on a **finished** task with a too-long title or a `status` field. FastAPI validates the body before the handler runs, so schema-level checks fire first. AD-2 says the domain owns the title/description limits, but nothing stops a builder from adding `max_length` in the Pydantic schema, which changes precedence and duplicates the rule. **Fix:** state the order (401 → 404 → 409 → 422 is the PRD-faithful reading, since an edit to a finished task "is rejected with a state-conflict error") and say whether HTTP schemas carry length constraints. If they do, the domain stays authoritative and precedence is documented.
3. **Non-domain errors:** AD-12 maps domain errors plus `RequestValidationError`. FastAPI's `OAuth2PasswordBearer` raises `HTTPException(401)` with `{"detail": ...}`, and Starlette's unknown-route 404 and 405 also produce `{"detail"}`. "Every error response" needs an `HTTPException` / `StarletteHTTPException` handler named too. Also say where `unauthenticated` originates: it isn't a domain error, yet AD-12 lists it in the domain mapping.

### H4. The frontend Undo control (5 s) has no architectural home (FR-11 last bullet, NFR-3, NFR-6)

- "The frontend shows an Undo control for 5 seconds after the user marks a task Done or Cancelled, then hides it." The capability map puts all UI behaviour under "Deferred to UX". But this consequence touches time, which the spine otherwise centralises (AD-3).
- Divergence: builder A starts a local timer when the 200 response arrives. Builder B computes the remaining time from the response's `finished_at` against the browser clock. That's subject to clock skew and is effectively the frontend deciding the window, which runs against NFR-1/NFR-3 intent.
- Also unspecified: whether the control survives a refetch, a filter change or the finished section collapsing. And because AD-10 forbids client-side filtering, the just-finished task moves to the finished section on refetch.
- **Fix:** add a frontend rule. The Undo timer is a local 5 s display timer started from the user's action (or response receipt; pick one). It never reads `finished_at` for the decision. The server is the sole judge, and a 409 from undo is shown as "undo window expired". Point NFR-6 at Vitest fake timers / Playwright `clock`.

### H5. Response shapes for create, patch, actions and delete are unspecified (FR-14 "every task carries an overdue indicator", FR-17, AD-9)

- AD-9 says `is_overdue` is computed "at read time". AD-7 doesn't say what action endpoints return. Builder A returns `204` from `/complete`. Builder B returns the task without `is_overdue`, because it isn't a "read". FR-14 says **every** task carries the indicator.
- **Fix:** one `TaskOut` schema (with `is_overdue`, `finished_at`, `previous_status`? decide which internal fields are exposed) returned by create, `GET`, `PATCH` and every action endpoint, computed with the same request `now`. `DELETE` → 204. `GET /api/tasks` returns a bare array or an envelope; decide which.

### M1. "—" cells as `state_conflict` are not pinned in the spine (§4.3 table, FR-12 third bullet, AD-7)

- AD-7 gives each action its own endpoint, which invites REST-idempotent thinking. `POST /start` on an In progress task, `/complete` on a Done task, or `/reopen` on a To do task might return 200 as a no-op. The PRD forbids that: "never silently ignored", and "—" actions are rejected exactly like "❌" ones.
- **Fix:** AD-7 should say "action endpoints are not idempotent: any action not allowed by the §4.3 table, including '—' cells and undo outside the window, raises `StateConflictError`". Better still, copy the transition table into the spine or reference it as the domain's source of truth.

### M2. The FR-11 "undo window has expired" message isn't distinguishable (FR-11 third bullet, AD-12)

- FR-11 requires that a late undo be rejected "with a state-conflict error **that says the undo window has expired**". That's different from undo on an active task, which is a generic state conflict. AD-12 has codes only, and messages are free text, so tests can't assert this reliably and the frontend can't tell the two apart.
- **Fix:** either fix the message text in the domain error, or add an optional machine-readable detail (for example `"reason": "undo_window_expired"`) to the envelope. The second option changes AD-12's shape, so decide it now.

### M3. PATCH semantics are undefined (FR-5)

- Partial update or full replace? Is `due_at: null` a validation error (FR-5: "cannot be removed") while omitting it leaves it unchanged? How is the description cleared: `null` or `""`, and is `""` stored as null? Is the title stored trimmed or as sent? Is an empty PATCH body valid?
- Builders will differ, and so will the generated client's types.
- **Fix:** state it. Partial update; omitted means unchanged; `null` for `title`/`due_at` → `validation_error`; `description` cleared with `null` (normalise `""` → null or not); title stored as sent (or trimmed), with emptiness checked after trimming.

### M4. Session expiry vs the Clock port (FR-2, AD-3, AD-6, NFR-6)

- AD-3's rule implicitly covers this, since `datetime.now()` is allowed only in the clock adapter. But AD-3's binds omit FR-1 to FR-3, and AD-6 doesn't say the auth dependency uses the Clock port. NFR-6 needs the 7-day expiry tested without waiting.
- Boundary unspecified: is a session valid at exactly login + 7 days (`now < expires_at` or `≤`)? The PRD says "expires 7 days after login", which suggests `now ≥ expires_at` → expired. Pin it.
- AD-3 says "reads the Clock once per request", but the auth dependency and the use case each read it. Say they share one per-request `now`, or accept two reads.

### L1. Status filter query value validation (FR-16, AD-10)

- An unknown `?status=foo` → 422 `validation_error` (an enum query param gives this for free, but say so). The PRD's "All" means the parameter is omitted. Otherwise AD-10 matches FR-16 correctly, including showing Done/Cancelled in FR-15 order with no section. The "no separate section" rendering is a frontend concern; mention it in the UX hand-off.

### L2. NFR-5 "session tokens never appear in responses" vs the login response

- The login endpoint necessarily returns the token (AD-6). The reasonable reading is "never in logs or in any response other than issuing it", and the spine's logging convention covers the logs. Recommend a one-line PRD clarification, or note the interpretation in AD-6, so a strict test author doesn't flag it.

### L3. Account CLI semantics (FR-3 out-of-scope note, AD-6)

- "Created or changed only through the `create-account` CLI": does re-running it update the password of the single account, and does a password change revoke existing sessions? The ER seed shows `ACCOUNT { int id }` with no username or hash. Minor, but the CLI story will have to guess.

### L4. Title length unit (FR-4)

- "200 characters": Python `len` counts code points, while a JS `maxLength` counts UTF-16 units. The domain decides (AD-2), but note "code points" so frontend hints don't contradict it.

## Checks that passed (quiet requirements verified)

| Requirement | Spine coverage |
| --- | --- |
| 5 s undo, inclusive, zero grace, server-only | AD-8 `now − finished_at ≤ 5 s`, "enforced only on the server" |
| Finished time + previous status recorded; cleared by undo; new window on re-finish | AD-8 |
| Zero past-date tolerance (`due_at < now` rejected, equal accepted) | AD-2 "non-past", AD-3 (precision caveat: H2) |
| "Changes" = different instant, any offset | AD-2 + AD-13 UTC normalisation at boundary |
| 7-day absolute session, logout revokes | AD-6 (boundary/clock caveat: M4) |
| Status not settable on create or patch | AD-7 (rejects as validation_error; PRD-compatible) |
| Overdue true only when active and `due_at < now`; never stored | AD-9 + glossary (response-shape caveat: H5) |
| Server ordering FR-13/FR-15, ID final tie-break; filter keeps the same order | AD-10, IDs convention (created_at caveat: H1) |
| Error categories + HTTP codes match addendum | AD-12 (non-domain errors caveat: H3) |
| OpenAPI contract, frontend holds no rules | AD-11, AD-2, NFR-1 mapping |
| Live overdue refresh (PRD §9 Q3) | Explicitly deferred, display-only; acceptable |
| Collapse state / filter not remembered | Frontend; deferred to UX; acceptable |
| Brief open questions (frontend tech, login, undo server vs client, DB, overdue location) | All resolved |

## Suggested minimal edits

1. Add a task-fields line (H1) and the aware-UTC repository rule (H2) to AD-4/AD-8/AD-13. Extend AD-3's binds to FR-1–3, FR-13 and FR-15.
2. Extend AD-12 with: the precedence order, the handler for `HTTPException`/Starlette errors, the path-ID policy, and the undo-expired reason (H3, M2).
3. Extend AD-7: non-idempotent actions, "—" → `state_conflict`, a single `TaskOut` returned everywhere, partial-PATCH rules (M1, H5, M3).
4. Add a frontend AD (or a capability-map row not deferred to UX) for the Undo control timer (H4).
