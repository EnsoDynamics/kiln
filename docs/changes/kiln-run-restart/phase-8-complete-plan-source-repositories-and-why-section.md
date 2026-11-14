# Phase 8: Complete Documents found's plan-source line and repository set, and the carry-on card's why section

**Closed:** 2026-11-13

**Added by delivery audit:** 2026-11-13, after every planned phase closed. It builds what earlier phases left out of the criteria below, confirmed in the whole-PRD audit at `6f397ca`.
**Parent PRD:** docs/changes/kiln-run-restart/kiln-run-restart-prd.md
**Technical design:** docs/changes/kiln-run-restart/kiln-run-restart-technical-design.md — relevant sections: "Starting From a Branch" (The starting point, The preview, Which repositories), "A Stopped Phase's Facts"
**Phase plan:** [Kiln Run Restart phase plan](kiln-run-restart-phase-plan.md)
**Repositories:** kiln

## Summary
Finish the last three parts. Documents found says where the plan was read only when the documents it shows were read there. With an existing branch, its repositories keep those an earlier Start set up. The carry-on card's "Why the earlier conversation can't be reopened" section is drawn as the mockup draws it.

## Acceptance criteria covered
AC-FROM-02 (completes it; owned by phase 2), AC-FROM-05 (completes it; owned by phase 2), AC-LOOK-01 (completes it; owned by phase 1)

## What the audit found missing
- **AC-FROM-02, existing branch:** `src/engine/start-from.ts:existingBranchPreview` sets `planSource` before it reads anything, then reads the documents and plan at `planSource.sha` only when no earlier problem stands: an unavailable name in another repository, or a failed `readRepository` read after the tip (no merge base, objects not reachable, commits not counted). When it skips the read, or the read throws or the plan has problems, the preview carries no usable `documents`/`plan`. `src/engine/snapshot.ts` (the `fromGit` fallback in the not-started branch) then shows the checkout's documents, while `startView` still passes `planSource`. So `view/src/screens/DocumentsFound.svelte`'s `.source-box` (`planSourceLine` in `view/src/lib/documents-found.ts`) says "Read from `<branch>`" over a plan that wasn't read there. AC-FROM-02 requires the page to say where the plan was read.
- **AC-FROM-02, new branch:** `src/engine/start-from.ts:newBranchPreview` always sets `planSource` to the base tip. The page always shows the checkout's documents, which match the base only when the base check's PRD tree comparison (`checkPrdTreeAt`) passes. When it fails, the page says "Read from `<base>`" over documents that aren't the base's.
- **AC-FROM-05:** with an existing branch selected, `src/engine/start-from.ts:existingBranchPreview` builds the selection from `input.repositories.filter(repository => repository.kind !== "named")`, then adds the repositories the start commit's plan names. A repository an earlier Start set up keeps kind `named` (from `Engine.startRepositories` / `checkoutRepositories` in `src/engine/engine.ts`; `finishSetup` keeps every entry set up before the one that failed), so it is dropped whenever the start commit's plan doesn't name it. The design ("Which repositories") puts "those an earlier Start set up" in the selection, which decides the name's availability, the repository rows and what Start sets up.
- **AC-LOOK-01:** `view/src/components/CarryOnCard.svelte`'s `.why` block draws "Why the earlier conversation can't be reopened" as a separate filled panel: deep background, full border, radius 12, padding 12px 14px, 13px text, heading in the main text colour. The mockup's "earlier conversation can't be reopened" and held states draw it as the card's last section: a 1px top rule with 14px top padding, no background or box, 12.5px dim text, a muted heading, and the fix command in its own small code box. It shows on the stopped and held pages (AC-CARRY-01, AC-CARRY-06), both of which AC-LOOK-01 names.

## Phase dependencies
2, 5 and 7 (Documents found's preview and plan-source line, as they now stand); 1 and 6 (the carry-on card)
