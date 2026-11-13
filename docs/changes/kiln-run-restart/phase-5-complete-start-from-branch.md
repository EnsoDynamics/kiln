# Phase 5: Complete starting from an existing branch

**Added by delivery audit:** 2026-11-12, after every planned phase closed. It builds what earlier phases left out of the criteria below, confirmed in the whole-PRD audit at `522e983`.
**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "Starting From a Branch" (the branch list table, After Start), "Catching a Branch Up", "Interfaces" (the snapshot's `documents.start` and `needsYou.catchUp`)
**Phase plan:** [Kiln Run Restart phase plan](kiln-run-restart-phase-plan.md)
**Repositories:** kiln

## Summary
Finish Documents found and the catch-up offer: the base field reads **PR into** whenever an existing branch is selected, another started PRD's earlier-execution branches are unavailable, **Starting lets Kiln** names an open pull request even with development deployments on, and a multi-repository catch-up offer names each repository's own base.

## Acceptance criteria covered
AC-FROM-01 (completes it; owned by phase 2), AC-FROM-03 (completes it; owned by phase 2), AC-FROM-04 (completes it; owned by phase 2), AC-CURRENT-01 (completes it; owned by phase 2)

## What the audit found missing
- **AC-FROM-01:** the one-repository base label in `view/src/screens/DocumentsFound.svelte` reads **PR into** only when `prdStart?.hasBranch`, which `src/engine/start-from.ts:existingBranchPreview` sets false for an unavailable selected name, so with **A branch that already exists** selected and that name unavailable (behind origin, checked out in the person's checkout, another PRD's) the label still reads **Branch from, and PR into**.
- **AC-FROM-03:** `src/engine/start-from.ts:otherStartedBranches` collects only `settings.featureBranch` and `branchStem` from other started records, never `continuation.executions[].branch`, so another started PRD's earlier-execution branch is listed as available instead of unavailable naming that PRD (the design's branch-list row includes "an earlier execution's branch").
- **AC-FROM-04:** in the one-repository **Starting lets Kiln** list of `view/src/screens/DocumentsFound.svelte`, the `settings.developmentDeployments?.enabled` wording replaces the line naming the branch's open pull request, so with development deployments on the open pull request is never named; the several-repository list names it whatever the setting.
- **AC-CURRENT-01:** `CatchUpOffer` in `src/engine/start-from.ts` carries one `base`, the PRD repository's (set in `existingBranchPreview` and in `src/engine/engine.ts:readStoppedCatchUp`), and `view/src/components/CatchUpOffer.svelte` prints "behind `<that base>`" for every repository, so a repository with a different base is named with the wrong one.

## Phase dependencies
2 (Documents found's Start from, the branch list and the catch-up offer)
