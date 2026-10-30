# Phase 6: Complete preparation admission and grant recovery

**Added by delivery audit:** 2026-10-30, after every previously planned implementation leaf closed. It completes the missing preparation controls below.
**Parent PRD:** [Kiln Continue Added Phases](kiln-continue-added-phases-prd.md)
**Technical design:** [Whole-change design](kiln-continue-added-phases-technical-design.md) — Readiness and Planned Preparation: Target grants before acceptance and Preparation execution; Continuation Acceptance and Recovery.

## Summary
Require settled tracked work before preparation verification, and prevent a previously authorized target from regaining approval after an observed scope change.

## Acceptance criteria covered
AC-CONTINUE-07 (completes it; owned by phase 3b), AC-CONTINUE-09 (completes it; owned by phase 3b). AC-CONTINUE-08 and AC-OFFER-03 also apply to this work.

## What the audit found missing
- **AC-CONTINUE-07:** Normal Claude preparation return reaches `Engine.advancePreparation` without enforcing the tracked-process release evidence retained by `LiveOwnedProcesses`; `claude-session.ts` closes the scanner without requiring tracked descendants to exit or resolving scanner obstacles. The existing descendant-release checks are only in `reconcileTakeover`, so native verification can begin while known preparation background work remains alive.
- **AC-CONTINUE-09:** `Engine.checkCompletedPlanOwned` supersedes pending authority only when a complete replacement proposal has a different scope digest. A failed check may already have observed a changed bound base revision or candidate digest, yet retain pending authority; restoring old inputs makes that grant available again, contrary to irreversible supersession.

## Phase dependencies
3b (preparation lifecycle and pending target authority); 5 (completed discovery and preparation-return reconciliation boundaries).

## Phase-specific notes
The [fresh whole-PRD delivery audit](kiln-continue-added-phases-delivery-audit.md) records the exact paths and sibling checks. Reuse existing identity-aware process release and durable grant/command ownership; do not create a new approval flow or broaden process control. Distinguish a positively observed bound-input change from a read failure that establishes no change. Preserve original approval receipts and unrelated processes/work.

Prove the whole affected criteria for ordinary Claude and Codex preparation, takeover/restart and same-conversation admission, including tracked surviving descendants, unavailable/ambiguous inventory and safe retry. Prove changed source/base/settings observations followed by incomplete discovery, restoration of old bytes, restart and replay cannot revive a superseded grant; unchanged-scope failures remain held without fabricated change. Follow the design's applicable actual-provider/Git/browser standards using fictional disposable resources. Required gates remain `npm run verify` and `npm run test:package`; freeze sources/build output during integration.

## Successor
After this leaf closes and authorized development-base delivery completes, launch a fresh whole-PRD delivery audit. Once delivery is clean, launch whole-PRD test audit and continue any required completion/re-audit chain. One implementation leaf per chat.
