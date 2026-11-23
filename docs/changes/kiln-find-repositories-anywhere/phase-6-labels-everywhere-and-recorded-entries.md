# Phase 6: Show the label in the last places, and reach a recorded repository by one name only

**Added by delivery audit:** 2026-11-23, after every planned phase closed. It builds what earlier phases left out of the criteria below.
**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "Which repository a name reaches", "Worktree Folders and Labels", "Screens"
**Model tier:** standard

## Summary
Each remaining screen, message and terminal line that names a repository shows its label. That covers the PRD's own repository in the page header and the clean-checkout check. A plan folder name gets the label of the repository it reaches, never another one that shares its short name. A folder name reaches a recorded repository only by its exact spelling. A repository whose setup was left unfinished is reached as that entry, by any name, and is never counted twice or looked for again.

## Acceptance criteria covered
AC-FOLDER-02 (completes it; owned by phase 1), AC-NAME-02 (completes it; owned by phase 1), AC-FIND-04 (completes it; owned by phase 1)

## What the audit found missing
- **AC-FOLDER-02:** `Engine.labelOf` (`src/engine/engine.ts`) looks a plan folder name up by `shortName === name` and takes the first match. A plan might name `acme-labs/admin` and also the folder `admin` (origin `acme/admin`). The phase that names `admin` is then shown as `acme-labs/admin`, both before Start (`namedRows`) and after it (`recordLabelSet`). It should look the folder name up by the address path its folder reaches.
- **AC-FOLDER-02:** the PRD's repository is shown by Kiln's name, not its label, in two places:
  - the page header "Repository <name>": `FeatureHeader.svelte`, fed by `snapshot.feature.repositoryName` (`src/engine/snapshot.ts`, the `feature` block);
  - Documents found's passed check "Working tree of <name> is clean": built by `documentsFound` and `startCheckDocuments` in `src/engine/snapshot.ts`. `view/src/screens/DocumentsFound.svelte` splits the check on that name and redraws it.
- **AC-FOLDER-02:** the Reset footer's "In <name>, …" lines use Kiln's name. `Engine.resetPreview` sets `stays[].repository: entry.name`, and `stayLines` (`view/src/lib/reset.ts`) prints it.
- **AC-FOLDER-02:** these messages use Kiln's name:
  - `bindPreparation` in `src/engine/continuation-readiness.ts`: "Preparation repository … is unavailable." and "restore source … in …".
  - `accountCompletedLeaves` in `src/engine/completed-plan-accounting.ts`, all shown on the Complete screen's plan check: "… needs one unambiguous immutable work revision", "configure the delivery base for …", "… origin no longer identifies …", "restore immutable commit … in …" and "… work … is not verified in origin/…".
- **AC-FOLDER-02:** these audit refusal reasons in `src/audit/snapshots.ts` use Kiln's name:
  - `assignedPath`: "Cannot read <name>/<path>" and "Path escapes assigned repository …: <name>/<path>".
  - The submodule refusal: "Submodule content needs an assigned repository: <name>/<path>".
  - `snapshotChanges`, through `staleSnapshotReason`: "Added/Removed assigned repository …", "Changed repository identity: …" and "Changed branch: …".
- **AC-FOLDER-02:** `kiln status`, `kiln run` and the Waivers screen name repositories by Kiln's name:
  - the `kiln status` heading line: `progressHeading` in `src/control/waiver-facts.ts` joins `answer.repositories`;
  - the waived-item lines: `itemName` in `src/control/waiver-facts.ts` prints `item.subject` for repository work;
  - the Waivers screen's "Checked against": `againstText` and its `heads()` in `view/src/lib/waivers.ts` print the subject and the fingerprint names that `fillAgainst` (`src/engine/waivers.ts`) writes as `<name>=<head>`.
- **AC-FIND-04:** step 2 of `resolveNames` (`src/engine/repository-finding.ts`) matches the folder beside the PRD's repository to an entry with `samePath`. On macOS and Windows `samePath` ignores case, so after Start a plan's `Admin` reaches the entry recorded as `admin`. Before Start, and before this change, the same name failed `findRepository`'s exact listing check. Step 2 should require the exact spelling in the parent folder's listing.
- **AC-NAME-02:** step 3 of `resolveNames` matches a folder name's address path only against entries with `setupCompletedAt`. Suppose an entry's setup was left unfinished with its checkout elsewhere, and the plan also has a folder name whose folder beside the PRD's repository has the same `origin`. That repository then becomes a second `NamedRepository`, so Start's entry list or `Engine.addOne` gives it a second entry and worktree. Step 3 should reach any recorded entry with that address path.
- **AC-NAME-02:** the Folder missing setup panel (`src/engine/folder-setup.ts`, the loop over `written`) finds its `entry` only among entries with `setupCompletedAt`. An address path that reaches an unfinished entry therefore falls back to `findRepository` beside the PRD's repository by Kiln's name for it, not the entry's recorded checkout. `continuation-readiness.ts` already uses any entry of that name.

## Phase dependencies
1 (names, labels and the folder-name lookup); 3 and 5 (the label plumbing this extends)
