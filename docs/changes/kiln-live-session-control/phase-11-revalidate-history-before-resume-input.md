# Phase 11: Revalidate history before resumed input

**Added by delivery audit:** 2026-10-28, whole-PRD assessment after all ten implementation leaves closed.
**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Ownership admission; Activity-specific evaluate, then act; Uncertainty recovery; Bot Extension.
**Repository:** kiln

## Summary
Keep hand-back held if saved conversation history becomes unusable during the final Resume checks, before supplying input to the resumed process.

## Acceptance criteria covered
AC-BACK-02 (completes it; owned by phase 1), AC-TAKE-04 (completes it; owned by phase 1), AC-MSG-05 (completes it; owned by phase 2), AC-BOT-02 (completes it; owned by phase 3).

## What the audit found missing
- **AC-BACK-02:** Browser Resume and stopped direct reply reach `Engine.runProcess`'s `beforePrompt` callback (`src/engine/engine.ts`). After earlier pre-spawn history checks it awaits completion and final terminal ownership, but never revalidates usable exact-conversation history before `runSessionProcess` writes the first prompt (`src/session/claude-session.ts`). Its local-material comparison covers Git/report bytes, not provider history.
- **AC-TAKE-04:** The same callback omits the final history part of the design's hand-back admission contract. Existing exclusive-owner checks still run; the gap is history revalidation at the final input boundary, not a new claim that terminal exclusion fails.
- **AC-MSG-05:** Explicit Resume/direct reply after uncertain-message review shares this callback, so its usual hand-back admission checks can use a history observation that predates the final asynchronous checks.
- **AC-BOT-02:** Bot Resume and stopped Reply share `applyControl` → `recoverPhase` → `resumeSession` → `runProcess`, inheriting the same omission for phases and both audit kinds.

## Conflict check
The existing design's Ownership admission requires readable history among admission facts, then requires revalidation at final dispatch/acceptance and before the new process's first prompt/effect. AC-BACK-02 promises the same conversation with terminal history; AC-MSG-05 retains usual checks; AC-BOT-02 inherits the browser return rules. The design explicitly maps this admission contract to AC-TAKE-04. The callback dates to the original takeover implementation `ae33be4`; no later policy deliberately removed this check. The reverse check shortlisted all 11 PRD/change summaries and read applicable handoff, usage recovery, completion-audit, bot-control, added-phase continuation, billing and development-recovery criteria. None supersedes it. Bot-control Phase 9 explicitly preserves live-control ownership/release rules; Phase 10 changes bounded output reads and receipt selection, not this contract. No requirement rewrite, new assumption or provider-wide ownership guarantee is needed.

## Phase dependencies
1 (same-conversation Resume and final prompt admission); 2 (reviewed uncertain-delivery return); 3 (shared bot return); 7–8 (retained release and recovery guards); 10 (usable-history predicate and correctly guarded release/Verify siblings).

## Phase-specific notes
One bounded capability fits one implementation session. Revalidate history at the final input boundary using the existing exact-conversation usability/corruption rules and effective attempt profile. Preserve completion rechecks, exact new-process self-exclusion, tracked ownership, review acknowledgements, dirty/incomplete Resume, original activity/round, durable dispatch and independent pause obligations. A failed final check supplies no prompt/reply, retains recovery and permits a fresh explicit retry after history is restored. Do not manufacture completion or automatically resend an uncertain message.

Exercise the actual resumed-process/controller boundary with disposable history files replaced during the final asynchronous checks, for phase, delivery-audit and test-audit identities through browser and bot return. Include reviewed uncertain-delivery recovery and stopped direct reply as well as Resume. Cover missing, corrupt and nonusable/wrong-conversation history, retained unsent reply/review state, and restoration followed by a new explicit retry. Preserve supported legacy/partial-trailing history. Retain the already implemented release and Verify final-history checks as siblings. Scripted process fixtures do not establish a fresh authenticated provider qualification.

The [Phase 10 leaf](phase-10-usable-takeover-history.md#independent-review-and-validation) owns the prior exact verification portfolio, runner-budget qualifications and non-green repository gate. All ten Closed leaves and their historical evidence remain unchanged; this phase adds no clean full-gate or new provider claim.

## Publication and successor
The audit's launch authority is Doug's exact quotation in [Phase 10's publication record](phase-10-usable-takeover-history.md#phase-10-publication-and-delivery-audit-launch-authorization--2026-10-28), source chat `01a182fa-d708-71c0-84c7-7018b3bec573`. It authorizes that implementation's publication and this audit launch; it does not authorize publishing this audit or later implementation, production changes or messages to other chats. Audit and implementation scoped commits follow their skill defaults; later publication remains held for Doug.

After this audit is authorized and published, the next planned unit is `implement-from-requirements` on this leaf. After its implementation is closed and authorized publication reaches the shared checkout, run a fresh whole-PRD delivery audit, then affected-row test-audit reassessment when delivery is clean. Bot-control and plan-continuation remain separately owned tracks.


## Audit publication and Phase 11 launch authorization — 2026-10-28

Doug authorized publication and the next implementation chat in Codex chat `01a18390-6e30-7791-bc72-19ebfabb535d`: “Okay, go ahead and push and then launch a new chat to continue with FIGS 11.” In the current audit/continuation context this names Phase 11, Revalidate history before resumed input.

This lifts the publication hold for audit commit `f2c55ac` and this authorization/current-state record. Publish them to `develop` by fast-forward, refresh the shared checkout, then launch a fresh `implement-from-requirements` chat on Phase 11. The audit remains non-clean: Phase 11 is the next planned unit. Both formal audit rounds, all ten Closed leaves, the non-green verification portfolio and provider qualifications remain unchanged; no runtime/test edit is required by publication.

The successor uses the implementation skill's scoped commit default. Publication of its later implementation or subsequent audits, production changes and messages to other chats remain held for explicit authorization. After Phase 11 closes and its authorized publication reaches the shared checkout, run a fresh whole-PRD delivery audit, then affected-row test-audit reassessment only when delivery is clean. Bot-control and plan-continuation remain separately owned tracks.
