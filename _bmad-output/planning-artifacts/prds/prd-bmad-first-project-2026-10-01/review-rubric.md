# PRD Quality Review — Todo App (BMad Method demo)

- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-first-project-2026-10-01/prd.md` (+ `addendum.md`)
- **Rubric:** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Calibration:** solo learning (hobby) project; target ~2–3 pages; enterprise sections not expected.

## Overall verdict

This is a tight, honest PRD. The product rules are stated as decisions: permanent delete, the past-date check runs only on change, and undo is a revert rather than a transition. The glossary does real work, and the addendum keeps most implementation detail out of the requirements. The main risk is the status lifecycle. FR-7 to FR-10 have no testable consequences, and the §4.3 table uses "—" and "❌" without saying which one means "rejected". So the transitions a story writer most needs to test are the ones least clearly specified. The second risk is that a few product-visible numbers are passed to architecture as open questions even though they change what the FR tests check: the undo grace period, the past-date tolerance and how session expiry is counted.

## Decision-readiness — strong

The decisions are stated plainly, and each comes with its reasoning:
- FR-5: "The past-date check runs **only when the due date-time changes**".
- FR-6: "removes it permanently, with no undo or recycle bin".
- FR-11: "Switching directly between Done and Cancelled is rejected".
- §10 records that the three draft assumptions were confirmed by Benny.

The addendum's undo note says why undo is a revert: otherwise the table "would need Done → To do and Done → In progress edges that contradict FR-12". That is a trade-off made visible, not smoothed over. There are no "balances everything" phrases.

The one weak spot is §9. Its only item bundles six decisions under "For architecture", and two of them are really product decisions, because they change user-visible rules (see Scope honesty).

### Findings
- **low** Open Question pre-answers itself (§9) — "the undo implementation (revert using the stored previous status)" puts the answer inside the question. *Fix:* drop the parenthetical, or move it to the addendum as the recommended option.

## Substance over theater — strong

There are no personas, no innovation section and no padded vision. The Vision (§1) is specific to this project: "every task has a due date-time, moves through four statuses, and becomes a permanent record once finished". It also says why the strictness exists: to give each BMad step real decisions. Most NFRs have product-specific content (NFR-3 clock authority, NFR-6 controllable clock).

### Findings
- **low** Vague performance bound (§5 NFR-4) — "on a typical developer machine" is an adjective, not a bound. For a hobby project this is acceptable. *Fix:* name the reference environment (e.g. "the author's laptop, local DB"), or state that NFR-4 is a sanity target that is not tested.
- **low** Length slightly above target — about 2,100 words in prd.md, roughly 3.5–4 pages against a 2–3 page target. Little of it is filler. *Fix:* optional. Shortening §4.3 (see the Done-ness finding) would also improve clarity.

## Strategic coherence — adequate

There is a clear thesis: a deliberately strict rule set creates real decisions for each BMad step (§1, JTBD "Builder"). The features follow from it: due date-time is mandatory, the lifecycle is terminal, and the API is the single rule owner. SM-1 and SM-2 measure the learning goal, which is the real point of the project. SM-3 measures build quality.

### Findings
- **low** Counter-metric paired with the wrong metric (§8 SM-C1) — "feature count … Counterbalances SM-3". Feature creep doesn't trade off against test pass rate. It trades off against finishing the project (SM-1/SM-2). *Fix:* say "Counterbalances SM-2", or reword it as guarding against scope creep that would delay completing the sequence.
- **low** SM-1 not observable (§8) — "Validated by doing it" gives no pass condition. *Fix:* add a concrete trigger, e.g. "the next work project's brief → stories is produced without consulting this repo's artifacts".

## Done-ness clarity — adequate

Most FRs have crisp, testable consequences:
- FR-4 field limits and the past-date rule.
- FR-5's overdue-edit rule.
- FR-13 and FR-15 tie-breaks.
- FR-11's expired-undo error.

The status lifecycle is the exception. It is the most rule-dense part of the product and the least explicitly testable.

### Findings
- **high** Transition FRs have no consequences, and the table's "—" is ambiguous (§4.3, FR-7 to FR-10, FR-12). FR-7, FR-8, FR-9 and FR-10 have no "Consequences (testable)" block. The §4.3 table uses two symbols: "❌" (only in the Done and Cancelled rows) and "—" (used both for "already in that state" and for "not offered"). Several cells are therefore unclear:
  - Start on an In progress task.
  - Back to To do on a To do task.
  - Mark done on a Done task.
  - Cancel on a Cancelled task.
  - Undo on an active task.

  For each of these, a reader can't tell whether the result is a state-conflict error, an idempotent no-op, or impossible. FR-12's "Every disallowed transition in the §4.3 table is rejected" sits under *finished*-task immutability, so it is also unclear whether it covers the active-row "—" cells. FR-9 and FR-10 also don't say what side effects they have: opening the undo window and recording the finished time. Those appear only in the glossary and FR-15. *Fix:* use one symbol for "rejected with state-conflict error" in every illegal cell (including same-state and Undo-on-active), and add a footnote if any same-state action should be an idempotent no-op instead. Give FR-9 and FR-10 one-line consequences: "opens an undo window; sets the task's finished time".
- **medium** Undo window boundary versus grace period (§3 Undo window, FR-11, addendum "Undo mechanics"). The glossary fixes the window at "the 5 seconds". FR-11 rejects any undo "after the window closes". The addendum then suggests a server grace period that "changes the effective window that FR-11's tests check". If a grace period is adopted, the PRD's own definition becomes false. Behaviour at exactly 5.000 s is also unspecified. *Fix:* in FR-11, state the rule as "accepted if received within 5 s + G of the change, where G is set in architecture (default 0)", and say whether the boundary is inclusive.
- **medium** Session expiry is ambiguous (§4.1 FR-2) — "A session expires after 7 days" doesn't say whether this is 7 days from login (absolute) or from last activity (sliding). That gives two different tests and two different auth designs. *Fix:* pick one, e.g. "7 days after login, regardless of activity".
- **medium** Not-found is specified only for retrieve (FR-17, NFR-2). Edit (FR-5), delete (FR-6) and every transition (FR-7 to FR-11) say nothing about a nonexistent ID. NFR-2 lists the category but no FR says when the other operations raise it. *Fix:* add one cross-cutting line, e.g. to NFR-2 or the §4.2 intro: "any operation on a nonexistent task ID returns not-found".
- **medium** "Due date-time changes" is undefined for equivalent instants (FR-5). With NFR-3 offsets, the same instant can be sent as `10:00Z` or `12:00+02:00`. If a full-replace edit resends an overdue task's unchanged past due date-time in a different offset, a naive comparison would reject it. *Fix:* add "‘changes’ means a different instant; resubmitting the same instant in any offset is not a change".
- **low** UI-only consequences versus NFR-6 (FR-14 "frontend visually highlights", FR-15 collapse, FR-16 filter not remembered). NFR-6 and SM-3 require an automated test for every FR consequence, which implies frontend or E2E tests. The PRD doesn't say so. *Fix:* in NFR-6, say whether frontend consequences are covered by E2E/component tests or checked manually.
- **low** Tie-break direction for ID unstated (FR-13, FR-15) — "then by ID" doesn't give ascending or descending. *Fix:* add "(ascending)".

## Scope honesty — adequate

§6 Non-Goals and §7.2 are explicit and useful ("a task cannot be created already Done" heads off a real assumption). The Assumptions Index says "None open", and that is honest for the three listed items. The weaker spot is how open items are classified. §9 treats every unknown as an architecture choice, but two of them change product rules that FRs test.

### Findings
- **medium** Product decisions filed as architecture questions (§9, addendum "Time boundaries"). The past-date tolerance changes FR-4/FR-5 (is a due time 1 s in the past valid?). The undo grace period changes FR-11. These are user-visible rules, not internal mechanics. *Fix:* mark them as `[NOTE FOR PM]` on FR-4/FR-5/FR-11 with a default (e.g. tolerance 0, grace 0), and let architecture override only by updating the PRD.
- **low** Unflagged inferences — session sliding versus absolute (FR-2) and the "—" cell semantics (§4.3) are decisions the reader has to infer. *Fix:* resolve them as above. Otherwise tag them `[ASSUMPTION]` and index them in §10.

## Downstream usability — adequate

The PRD is chain-top: it feeds architecture, epics/stories and build, so this dimension matters. FR, UJ, NFR and SM IDs are contiguous and unique. Every UJ names its protagonist, and each feature section says which UJs it realises. Cross-references resolve: the glossary points to FR-12, and §0 gives the FR range. Each section stands alone reasonably well. The gaps are terms that downstream readers will need but that aren't in the glossary, plus one term collision.

### Findings
- **medium** "Overdue status" collides with the glossary term **Status** (§5 NFR-3, NFR-6). Glossary *Status* is exactly four values. NFR-3 ("past-date validation, overdue status and the undo window") and NFR-6 ("overdue status, the undo window, past dates") call overdue a "status". FR-14 correctly calls it an "overdue indicator". A story writer or architect could model Overdue as a fifth status. *Fix:* use "overdue indicator" everywhere, and add it to §3 as a derived, read-only flag.
- **medium** "Finished time" is used but never defined (FR-15, addendum "Deterministic ordering"). FR-15 orders by "the time they were finished". The addendum calls the same thing the "status-changed timestamp". The PRD doesn't say whether it resets after undo + re-finish. FR-11's "opens a new undo window" implies it does, but FR-15's ordering test depends on it. *Fix:* add a glossary entry. Suggested wording: "Finished time: when the task most recently became Done or Cancelled; cleared by undo".
- **medium** No requirement for how Undo appears in the UI (FR-11, UJ-2). FR-11 is API-level. UJ-2 has Benny "tap Undo". The addendum says "The UI hides the Undo control at 5 seconds", but no FR says the frontend must offer an Undo control after Done/Cancel or remove it when the window ends. A story writer would have to invent this. *Fix:* add a consequence to FR-11: "after marking Done or Cancelled, the frontend offers Undo for the undo window, then removes it".
- **low** "Client" undefined; "Account" is circular (FR-17, §3). FR-17 says "The user, or a client" without defining a client. The glossary defines Account as "the single pre-created user credential", and FR-1 then says "the pre-created account's credentials", which makes it "credentials of a credential". *Fix:* define Account as "the single pre-created user, identified by a username and password". Drop "or a client", or define it as "any API consumer (NFR-1)".

## Shape fit — strong

This is a hobby/solo PRD, and the shape is right. It has three short UJs with a named protagonist, a capability-spec feature list, and only light ceremony. Implementation detail is mostly kept in the addendum (HTTP codes, auth options, hashing, clock injection). The remaining mentions of FastAPI (§1, §7.1) and OpenAPI (NFR-1) are deliberate learning constraints carried over from the brief, not accidental leaks. "Task endpoint" (FR-3) and "carries an overdue indicator" (FR-14) are acceptable, because the API *is* the product surface under NFR-1.

### Findings
- **low** Implementation choices not labelled as constraints (§1, §7.1, NFR-1). Without a label, "FastAPI" and "OpenAPI" read as requirements an architect could question. *Fix:* label them once, e.g. "Constraint (learning goal): FastAPI backend; OpenAPI contract".

## Mechanical notes

- **Glossary drift:**
  - "overdue status" (NFR-3, NFR-6) versus "overdue indicator" (FR-14) versus glossary "Overdue".
  - "finished section" / "finished tasks section" / "collapsible section" (FR-15, FR-16): harmless, but pick one.
  - "time they were finished" (FR-15) versus "status-changed timestamp" (addendum).
  - "Mark done" (table) versus "mark … Done" (FR-9): fine.
- **Glossary wording:** "Finished tasks are terminal (FR-12)" isn't strictly true, because undo is an exit. §4.3 says so more precisely ("terminal, with a 5-second undo as the only exit"). Align the glossary.
- **ID continuity:** FR-1 to FR-17, NFR-1 to NFR-6, UJ-1 to UJ-3 and SM-1 to SM-3 + SM-C1 are all contiguous and unique, and all cross-references resolve. FR-3, FR-12 and FR-14 have no one-line statement before "Consequences". That is fine, but inconsistent with the other FRs.
- **Assumptions Index roundtrip:** there are no inline `[ASSUMPTION]` tags and the index says "None open". That roundtrip is consistent. See the Scope honesty finding about unflagged inferences.
- **UJ protagonists:** all three UJs name Benny and carry their context inline.
- **Required sections:** all are present for the hobby stakes.
- **Minor gaps a story writer may raise (optional to resolve):**
  - Whether a description can be cleared on edit.
  - Whether the title is trimmed before the 200-character check.
  - Whether a naive (offset-less) date-time is a validation error (NFR-3 implies it but doesn't say).
