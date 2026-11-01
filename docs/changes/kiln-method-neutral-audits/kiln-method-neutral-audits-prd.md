# PRD: Kiln method-neutral completion audits

**Follow-on to:** [Kiln automatic completion audits](../kiln-completion-audits/kiln-completion-audits-prd.md).
**Source:** Doug's direction, 2026-11-01, recorded in [the direction and findings](kiln-method-neutral-audits-direction.md "kiln:reference").
**Assumptions:** [kiln-method-neutral-audits-assumptions.md](kiln-method-neutral-audits-assumptions.md)

## Summary

Kiln keeps running a delivery audit and a test audit automatically before final delivery, but it stops enforcing how the Enso Method conducts them. The installed skill owns the audit. Kiln checks a sturdy minimum it can see for itself: whether the audit came to a natural end or stopped needing a person, whether the phase plan routes correctly afterwards, and whether the work is committed and pushed. Updating either skill, even while an audit runs, can no longer break Kiln.

## Business Context

Kiln's report validation encodes the current audit procedures: the method's grade and status vocabulary, independent assessor and reviewer conversations, red checks, paired suite runs, per-part quotes from the PRD, the `test-audit.md` record, the completion-phase origin marker and a hash of the installed skill. Each cited command is authenticated against Codex or Claude history. Doug changes the method often, and every stall of the consulting-prospect-intelligence test audit came from this layer, which took 14 fixes in a week. Doug's direction: rely on the skill doing what it says, catch an audit that did not reach a normal end, and keep only what is sturdy and stable. The same review covers the per-phase checks.

## Acceptance Criteria

### Kiln checks the outcome, not the procedure

- [ ] **AC-NEUTRAL-01 — An audit reports through a small Kiln-owned contract.** Each audit session ends by writing a short report at its assigned path, committed and pushed, stating which of four outcomes it reached, a plain-language summary, any completion phases it added, any decision a person must make, and for a test audit whether it changed implementation beyond tests and records. Kiln's session prompt defines that contract and maps it onto the skill's own ending; neither audit skill needs to know it exists. Kiln refuses a report only for its own facts: wrong execution or activity, an unknown outcome, a missing or malformed field, or a report too large to read.
  - Replaces in part: AC-AUDIT-03 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the report's content and what Kiln verifies in it; retaining results and refusing missing or contradictory ones remain).
- [ ] **AC-NEUTRAL-02 — Kiln does not check how the audit was done.** Kiln does not validate the method's grades or statuses, per-criterion or per-part coverage, quotes from the PRD, independent assessment, review or re-grading, red checks, baseline and final suite runs, superseded-criterion pointers, the `test-audit.md` record or any other method document. The installed skill owns all of that, and Kiln's prompt tells the session to follow it. Kiln does not read provider history to authenticate commands an audit cites ([EVID-001](kiln-method-neutral-audits-assumptions.md#evid-001-should-kiln-stop-checking-that-the-test-runs-an-audit-cites-really-ran)).
  - Replaces in part: AC-AUDIT-02 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (Kiln's enforcement of those rules; the audit still applies them).
  - Replaces in part: AC-TEST-01 and AC-TEST-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (Kiln's checking of assessment, red-check, re-grade and grade evidence; the outcome still gates completion under AC-NEUTRAL-03).
  - Replaces in part: AC-CHECK-01 and AC-CHECK-02 in `docs/changes/kiln-completion-checks/kiln-completion-checks-prd.md` (authenticated receipts for audits only; test and deployment receipts for development delivery remain).
- [ ] **AC-NEUTRAL-03 — A natural end advances; anything else stops at Needs you.** A report that passed, added completion phases or saved more test work for another session advances automatically. A report that says a person is needed stops at Needs you and shows each problem and the action it needs. A session that ends without a readable report at its path is also Needs you, never an automatic rerun; normal usage-limit and interruption recovery remain.
  - Replaces in part: AC-LOOP-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the stop is driven by the report's outcome and its absence, not by Kiln's reading of the audit's criteria).

### The plan routes correctly

- [ ] **AC-NEUTRAL-04 — The plan agrees with the outcome.** Kiln reads the phase plan after the audit and compares it with the plan when the audit started. The audit may append open phases but must leave every original phase's identity, order, scope and closure intact, and the report must name exactly the phases it appended. A passing report leaves no open phase. A completion-phases report appends at least one. A test continuation appends none and leaves no open phase. Kiln does not check how a completion phase is written: no origin marker, criterion labels or dependency section are required beyond what Kiln's plan reader already needs to schedule it.
  - Replaces in part: AC-LOOP-01 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (Kiln's checking of origin markers, affected criterion labels, missing-behavior text and dependencies; the audit still records them per the method).
- [ ] **AC-NEUTRAL-05 — Test work cannot loop without changing anything.** A test continuation is accepted only when the session changed some file in the assigned repositories other than its own report. Otherwise it stops at Needs you instead of starting another identical session.
  - Replaces in part: AC-TEST-02 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (progress is a change to the work, not a comparison of grades).
- [ ] **AC-NEUTRAL-06 — A test audit's implementation change returns to the delivery audit.** When a test audit reports that it changed implementation, Kiln runs a fresh delivery audit, then a fresh test audit, before final delivery. When it reports only test and record changes, Kiln does not repeat the delivery audit for them. Any change to the work after both audits are accepted invalidates them under the existing currentness rules.
  - Replaces in part: AC-TEST-03 and AC-RUN-03 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (the audit's own statement decides whether its changes were implementation; Kiln no longer classifies test files from assessor evidence).

### Sturdy facts still gate

- [ ] **AC-NEUTRAL-07 — Git and authority checks are unchanged.** Every assigned repository must be on its assigned branch, clean, and pushed before an audit result is accepted, and the report must not change while Kiln checks it. Development-delivery obligations, launch permissions, workspace and production restrictions, and final repository delivery checks remain as they are. An audit result grants no new permission.
- [ ] **AC-NEUTRAL-08 — Updating a skill cannot break a running audit.** Kiln still resolves exactly one enabled installed skill before launching an audit and stops at Needs you when it is missing. It records the skill's location for the prompt and its digest for history only; a skill that changes while the audit runs, or between audits, never invalidates the audit or its result.
  - Replaces in part: AC-RUN-04 in `docs/changes/kiln-completion-audits/kiln-completion-audits-prd.md` (evidence of loading the skill is no longer required).
- [ ] **AC-NEUTRAL-09 — Per-phase checks stay as they are.** The review of per-phase checks keeps all of them: phase closure is how Kiln's plan reader knows a phase finished, committed and pushed are Git facts, and development-delivery receipts enforce Kiln's own deployment authority rather than any method procedure. None reads a method skill's internal procedure.

### Upgrade

- [ ] **AC-NEUTRAL-10 — Running and finished executions carry over.** A result Kiln already accepted under the earlier contract stays a valid gate, judged by the currentness rules above, and its history stays inspectable. A report written to the earlier contract after the upgrade is refused with a reason naming the new contract, so the session can rewrite it. A retired snapshot request is refused without changing state.

## Out of Scope

- Editing the delivery-audit or test-audit skills; neither needs a change for this contract.
- Changing how Kiln runs implementation phases, final delivery or development deployments.
- Changing which audits run, their order, or the automatic build-and-audit loop.

The replacement lines above take effect when implemented; matching `Superseded by:` lines belong in the implementation commit.
