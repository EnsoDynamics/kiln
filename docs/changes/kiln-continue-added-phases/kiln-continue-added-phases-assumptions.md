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

### CONTINUE-002. Require the revised plan and earlier work in the delivery base before continuing? ⏳ PENDING (85% confidence)

**Assumption:** For a previously finished run, Kiln can discover saved local additions, but Continue becomes available only once the revised document set and prerequisite implementation are committed and integrated into the configured delivery base. It does not automatically bring in someone else's unpublished branch. This also means a prior open PR must be integrated before this continuation starts. An unfinished run handed back from a manual session instead uses its active workspace and normal completion checks, and automatically continues through its updated plan.

**Example:** In `pricing`'s National-Brand Compare plan, phases 9–15 are new work, but the plan says phase 8 and its test audit remain on `wt/natb-pricing-delivery-audit`. Kiln shows seven new phases and explains that phase 8 must be integrated before starting phase 9. After that prerequisite is present and verified, Continue with 7 phases runs the revised plan.

**Evidence:** Doug's example begins after the earlier work was merged. The local `national-brand-compare-implementation-phases.md` explicitly identifies this outstanding prerequisite. The request does not decide whether Kiln should import uncommitted plans or combine unrelated unpublished work itself. Requiring a settled base preserves ownership and the earlier delivery without introducing that additional workflow.

**Impact if wrong:** Medium — the person must first commit/integrate the changed plan or earlier work; a desired workflow that continues directly from an unmerged branch would need broader scope.

**Confirm or Correct:**
- [ ] Correct as stated
- [ ] Wrong — Kiln should also prepare continuation directly from an unmerged revision
- [ ] Wrong — correct answer: _______________
