# Kiln Continue Added Phases — Assumptions

These two proposed product choices accompany the [change PRD](kiln-continue-added-phases-prd.md). Work can proceed on them unless corrected.

### CONTINUE-001. Check on reopening and on request, without continuous monitoring? ⏳ PENDING (85% confidence)

**Assumption:** Kiln automatically checks a completed feature when `kiln run` starts again or its page is opened/reloaded. A visible Check for new phases button checks while the page remains open. The first release does not promise continuous polling of an idle page or monitoring after Kiln exits.

**Evidence:** Doug asks what happens “if you start Kiln” after another session adds phases. Existing AC-KEEP-01 keeps Kiln in its terminal with no background service. Neither source settles continuous checking while a finished page remains open. Always polling is a plausible alternative, but is unnecessary for the stated restart workflow.

**Impact if wrong:** Medium — someone leaving the finished page open may expect a new banner without reopening or clicking Check.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — also detect additions automatically while the finished page remains open
- [ ] Wrong — correct answer: _______________

### CONTINUE-002. Require a committed plan on the delivery base when restarting a finished run? ⏳ PENDING (85% confidence)

**Assumption:** For a previously finished run, Kiln can discover saved local additions, but the revised document set must be committed together in the configured delivery base before Continue becomes available. Prerequisite work may already be integrated or be explicit, authorized preparation in the next phase. An unfinished run handed back from a manual session instead uses its active workspace and normal completion checks, and automatically continues through its updated plan.

**Example:** In `pricing`'s National-Brand Compare plan, phases 9–15 are new work. Phase 9 explicitly brings in phase 8 from `wt/natb-pricing-delivery-audit`, with Doug's recorded authorization in its phase-specific notes. With the source available and authority established, Continue with 7 phases starts that preparation inside Kiln; the person does not have to merge it first.

**Evidence:** Doug's example begins after the earlier work was merged. The request does not decide whether a finished run should restart from uncommitted or unintegrated requirements. Requiring a settled requirements revision provides a reviewable starting point. This does not override documented, authorized preparation within a phase, such as the integration explicitly assigned to pricing's phase 9.

**Impact if wrong:** Medium — the person must first commit/integrate the changed requirements; a workflow that restarts a finished run directly from an unmerged requirements revision would need broader scope.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — Kiln should also restart finished work directly from an unmerged requirements revision
- [ ] Wrong — correct answer: _______________
