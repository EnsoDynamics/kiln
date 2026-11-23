# Phase 3: Reach names together and show labels everywhere after Start

**Closed:** 2026-11-23

**Added by delivery audit:** 2026-11-22, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "Names", "Finding a Checkout", "After Start" ("A continuation and a base-branch start"), "Worktree Folders and Labels", "Data Models"
**Model tier:** standard

## Summary
After Start, Kiln treats a folder name and an address path that reach one repository as one repository, as it already does before Start, and a folder name reaches only the folder beside the PRD's repository. Every screen and terminal line shows a repository by its label, and a repository keeps its saved short name when a Folder missing restart or a continuation rebuilds the record.

## Acceptance criteria covered
AC-NAME-02 (completes it; owned by phase 1), AC-FIND-04 (completes it; owned by phase 1), AC-FOLDER-02 (completes it; owned by phase 1)

## What the audit found missing
- **AC-NAME-02:** after Start, `Engine.addNamedRepositories` and `Engine.reachForAddition` (`src/engine/engine.ts`) pass `resolveNames` one name at a time, and only from the phase and its ancestors. A phase that names `acme-labs/admin` while it or another phase names the folder `admin` is searched for, and may be asked about, when the folder should be used without a search.
- **AC-NAME-02:** `recordLabelSet` (`src/engine/plan-repositories.ts`) adds a folder name not yet set up, and that repository's address path, as two members. The plan then shows one repository as both `admin` and `acme/admin`.
- **AC-FIND-04:** `resolveNames` (`src/engine/repository-finding.ts`, step 2, the branch where no folder of that name is beside the PRD's repository) matches any entry whose `name` is the folder name and has no `shortName`. An entry set up from a search, under its short name, matches too. A phase naming `admin` then silently uses `~/code/acme-labs/admin` instead of reporting that `admin` isn't beside the PRD's repository.
- **AC-FOLDER-02:** done-check facts and items are prefixed with Kiln's name, not the label: `runDoneCheck` and `combineCommitted` in `src/engine/checks.ts`, fed by `Engine.checkedRepository` (`src/engine/engine.ts`). This includes "Clean in …".
- **AC-FOLDER-02:** pull-request check facts use Kiln's name. `runPullRequestChecks` in `src/engine/checks.ts` takes `repository: entry.name` from the engine's pull-request check.
- **AC-FOLDER-02:** the waiver wording that names repositories with unpushed work uses item subjects, which are Kiln's names (`src/engine/waivers.ts`, `joinNames(wording.repositoryWork)`).
- **AC-FOLDER-02:** the terminal's final-delivery `summary` ("<repo> #n ready · <repo> already merged into <base>") is built from Kiln's names in `Engine.complete` (`src/engine/engine.ts`), and `labelledEvent` (`src/kiln-command.ts`) leaves `summary` unlabelled.
- **AC-FOLDER-02:** the summary line for a PRD that is already underway prints Kiln's names. It comes from `kiln run`, through `pullRequestsReady` and the Complete case's "Already merged" list in `src/underway-output.ts`.
- **AC-FOLDER-02:** the development delivery panel shows `repositoryResults[].repository` and reasons built from `repo.name` (`src/engine/development-delivery.ts`; `view/src/components/DevelopmentDelivery.svelte`).
- **AC-FOLDER-02:** the Folder missing setup steps say "in <name>" with Kiln's name (`src/engine/folder-setup-start.ts`, `where`).
- **AC-FOLDER-02:** a start from the base branch on the Folder missing page rebuilds the entries without `shortName` (`Engine.activateFolderStart` in `src/engine/engine.ts`; `FolderSetupRepository` in `src/engine/folder-setup-start.ts` and `SetRepository` in `src/engine/folder-setup.ts` don't carry it). A continuation's accepted workspace does the same (`newAcceptance` in `src/engine/continuation-setup.ts`). Afterwards `acme+admin` is its own short name, so the two `admin` repositories are labelled `admin` and `acme+admin` instead of by their address paths.

## Phase dependencies
1 (names, the search, the labels and `shortName`); 2 (continuation and base-branch starts that leave a repository out, and the additions before a phase)
