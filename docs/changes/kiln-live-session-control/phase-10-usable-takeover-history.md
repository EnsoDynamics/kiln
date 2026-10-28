# Phase 10: Require usable history before takeover readiness

**Added by delivery audit:** 2026-10-28, publication reassessment after all nine implementation leaves closed.
**Parent PRD:** [Control a live Kiln session](kiln-live-session-control-prd.md)
**Technical design:** [Whole-change design](kiln-live-session-control-technical-design.md) — Release is a separate fact; Ownership admission; Local Interfaces; Snapshot and browser.

## Summary
Keep takeover pending, explain the history obstacle and refuse explicit completion acceptance until the exact saved conversation has usable history.

## Acceptance criteria covered
AC-LIVE-02 (completes it; owned by phase 2), AC-LIVE-04 (completes it; owned by phase 1), AC-MSG-05 (completes it; owned by phase 2), AC-TAKE-02 (completes it; owned by phase 1), AC-BACK-03 (completes it; owned by phase 1), AC-BOT-01 (completes it; owned by phase 3), AC-BOT-02 (completes it; owned by phase 3).

## What the audit found missing
- **AC-TAKE-02:** `src/live/ownership.ts::requireHistory` accepts nonempty metadata-only, empty-object, partial-only and wrong-conversation JSONL; `Engine.reconcileTakeoverOnce` can mark the conversation released without usable exact-conversation history.
- **AC-LIVE-02/04:** `PhaseHandoff` and `PausePanel` derive ready wording from that released hold, although the newer `Engine.transcriptMissing` correctly removes the resume command for unusable history. Availability and ready/pending guidance contradict each other.
- **AC-MSG-05:** Ended uncertain-delivery recovery uses the same weak `requireTakeoverReturn` history guard; reviewed Verify can clear its hold without usable exact-conversation history. Review remains required, but does not repair unavailable history.
- **AC-BACK-03:** Browser Verify reaches `recoverPhase` and `recordDone.finalTakeoverCheck` through the same weak history gate. Passing completion material can be accepted even while exact-conversation usability is unresolved; the stronger Resume-only checks do not guard Verify.
- **AC-BOT-01/02:** Bot status forwards the false released progress and `verify-and-advance` uses the same weak explicit-return guard. Bot handoff itself correctly withholds commands using the stronger history reader; retain that behavior.

## Conflict check
The owning criteria and the design explicitly require readable, usable exact-conversation history before terminal readiness and completion acceptance. `requireHistory` predates the publication at `5339c2d` unchanged; this was a missed omission, not a new intentional policy. Bot-control Phase 9 (`29851a2`) adds usable-history checks to ordinary recovery/inspection and says existing live-control release rules remain unchanged; it does not supersede this contract. No requirement rewrite, new capability or assumption is needed.

## Phase dependencies
1 (takeover release, browser ready state and explicit return); 2 (availability and uncertain-message recovery); 3 (shared bot status/return); 7–9 (retained release, recovery and message-order safeguards). Build on the published bot-control usable-history reader without changing that separately owned track.

## Phase-specific notes
One bounded completion slice fits one implementation session. Use one consistent exact-conversation usability decision at release and final hand-back; preserve provider/profile and ownership qualifications. Cover phase, delivery-audit and test-audit identities through actual controller/browser/bot entry points. Use disposable provider files for metadata-only, empty-object, partial-only, wrong-session, missing, corrupt and usable exact-session history. Retain supported partial trailing and legacy message records. Prove pending/no-ready-copy, concrete obstacle/retry, no automatic work or forced interruption, and refusal of Verify/advance despite otherwise passing completion material; after restoring valid history, a fresh explicit retry must work. Retain all ownership, review, independent pause, exact target and delivery obligations. No provider-wide exclusion or universal descendant containment is added.

## Publication and successor
Doug authorized pushing the current audit in chat `01a18274-6992-7ae2-bee2-a8b93feecda8`: “Go ahead and push. And then, what is the next step here? Is this completely done, or are there any next steps? If it's completely done, can we merge to develop?” This covers the audit publication and its accurate reassessment/next-work record. It does not authorize publication of this future implementation, production changes or messages to other chats. The successor uses implement-from-requirements' scoped commit default and holds its later publication for Doug.

After this phase closes and is published, obtain a fresh whole-PRD delivery audit, then test-audit affected-row reassessment. Preserve all nine earlier Closed lines, all previous validation portfolios and the publication reassessment's exact verification record. The earlier 20-Adequate test-audit verdict missed this usability part and is historical, not a waiver of the gap.
