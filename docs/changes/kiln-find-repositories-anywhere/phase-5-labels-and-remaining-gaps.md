# Phase 5: Show the label in the remaining places, and close the stop, link, name and colour gaps

**Added by delivery audit:** 2026-11-23, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "Worktree Folders and Labels", "Finding a Checkout", "The stops that ask", "Interfaces" ("Command line"), "Screens"
**Model tier:** standard

## Summary
Every remaining screen, message and terminal line that names a repository shows its label, not Kiln's name for it. A take-over or hand-back stop asks the session's repository questions as soon as it opens. A link beside the PRD's repository is refused even when it points at a recorded checkout. Two repositories set up at one Start never share a worktree folder name. The `kiln status` lines this change added get the drawn colours.

## Acceptance criteria covered
AC-FOLDER-02 (completes it; owned by phase 1), AC-ASK-07 (completes it; owned by phase 2), AC-FIND-04 (completes it; owned by phase 1), AC-FOLDER-01 (completes it; owned by phase 1), AC-SEE-05 (completes it; owned by phase 2)

## What the audit found missing
- **AC-FOLDER-02:** the early-merge targets pass `name={row.name}` to `EarlyMergeTarget` ("May merge into / Allow merging into <name> / <branch>"), in `view/src/components/DevelopmentDelivery.svelte` lines 97 and 143. They should pass `row.label`.
- **AC-FOLDER-02:** the catch-up offer prints "In <name>, the branch is n commits behind" (`view/src/components/CatchUpOffer.svelte:18`). `CatchUpOffer` (`src/engine/start-from.ts`) carries no label. It is built by `existingBranchPreview` and by `stoppedCatchUpOffer` through `Engine.readStoppedCatchUp`, and passed unlabelled at `snapshot.ts` (the stopped page and Documents found).
- **AC-FOLDER-02:** the audit's own "Everything committed" and "Pushed" facts write `${repo.name}: …`, in `repositoryChecks` (`src/audit/admission.ts`). These facts are shown on the audit stop and in `kiln status`.
- **AC-FOLDER-02:** audit refusal reasons name `repo.name` (`src/audit/snapshots.ts`: not on its assigned branch, setup incomplete, unresolved index entry, Git read failed). The audit card on Phase detail prints `{repository.name}: {revision}` (`view/src/screens/PhaseDetail.svelte:104`), built unlabelled at `snapshot.ts` (`row.audit.repositories`).
- **AC-FOLDER-02:** the Folder missing page text uses `repository.name`. In `view/src/lib/folder-missing.ts` this is `intro`, the plan card's prefix, the `factRows` prefix and `lostNote`. In `src/engine/folder-facts.ts` it is `availability`'s "in <name>, …" and "<name>’s saved folder holds something else."
- **AC-FOLDER-02:** Documents found's messages use Kiln's name:
  - `heldBy` (`view/src/lib/documents-found.ts`) says "<name>’s base branch".
  - The existing-branch start's `say` and `fieldError` (`src/engine/start-from.ts`) say "In <name>: …".
- **AC-FOLDER-02:** these refusal and error messages use `entry.name`, `repository.name` or `name` where the label belongs:
  - `Engine.addOne` ("That branch already exists in <name>") in `src/engine/engine.ts`.
  - `worktree-setup.ts`: the different-PRD-documents, worktree-listing, inside-a-checkout and branch-exists messages.
  - `catchUpRepository` in `start-from.ts`: no local branch, couldn't bring up to date, couldn't push.
  - `readPhaseWork` in `src/engine/stopped-phase.ts`: couldn't read commits or uncommitted changes.
  - `src/engine/preparation-verifier.ts`.
  - The engine's settle and catch-up messages: "Cannot record settled audit head", "Cannot read <name>'s feature head", "couldn't read … to settle a catch-up".
- **AC-ASK-07:** when a delivery-recovery or take-over hold ends with the session exited, `Engine.reconcileTakeoverOnce` (`src/engine/engine.ts`, the `finally` block) creates a `done_check` stop and emits "stopped", but never calls `refreshRequestQuestions`. A session's earlier request is therefore not asked on that Needs you stop until Check again.
- **AC-FIND-04:** in `resolveNames` step 2 (`src/engine/repository-finding.ts`), `besideEntry` compares with `samePath`, which follows a link at the folder beside the PRD's repository. A link there that points at a recorded entry's checkout then reaches that entry, when it should be refused as a link the way `findRepository` refuses one.
- **AC-FOLDER-01:** at Start, `giveNames` (`src/engine/repository-labels.ts`) checks a newcomer's whole-path form only against entries already written. It does not check other newcomers' names or the PRD's name. A folder named `acme+admin` beside the PRD's repository, alongside `acme/admin` and `other/admin`, gives two repositories the worktree folder `acme+admin`.
- **AC-SEE-05:** the `kiln status` lines for a stop that asks are written without colour. That covers the question lines and the "Controls: locate-repository …" line, from `locateText` and `progressText` in `src/control/waiver-facts.ts`, through `statusLead` in `src/control/client.ts`. Mockup state 7 draws the question lines light grey (#bdb6a8) and the Controls line grey (#8c8577). Colour them through `terminalColors` on a terminal only, as `kiln run` does.

## Phase dependencies
1 (labels, names and the folder-name lookup); 2 (the stops that ask and `kiln status`); 3 (the label plumbing it extends)
