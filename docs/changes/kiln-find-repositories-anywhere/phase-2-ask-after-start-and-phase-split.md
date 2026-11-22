# Phase 2: Ask at a stop after Start, and have phase-split write address paths

**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "Names" (a skipped phase's address-path key), "After Start" (all of it), "Interfaces", "Data Models", "Screens", "The Enso Method's `phase-split`", "Testing Approach", "Delivery"
**Repositories:** kiln, enso-method
**Model tier:** standard

## Summary
After Start, a session asks Kiln for a repository by the path in its remote address. When Kiln can't tell where that repository is, or where a repository a phase names is, a Needs you stop asks the person, and the stop can be answered on the page or with `kiln locate-repository`. Continuations and base-branch starts leave such repositories for that stop. The Enso Method's `phase-split` skill writes each repository on a phase document's `**Repositories:**` line by its address path.

## Acceptance criteria covered
AC-SESSION-01, AC-ASK-06, AC-ASK-07, AC-SEE-05, AC-SPLIT-01, AC-SPLIT-02, AC-FOLDER-02 (also applies to this phase's work)

## Out of scope for this phase
The search, the remembered-answer store, the checks an answer gets, Documents found's questions, worktree folders and labels (Phase 1, reused here).

## Phase dependencies
1 (name resolution, the search, the remembered-answer store and the checks an answer gets, labels, schema 25)

## Phase-specific notes
- The `**Repositories:**` line above uses folder names because the Kiln that runs this plan is a release from before this change, and it reads an address path as a broken plan.
- The `enso-method` change stays on its branch. The design's Delivery section, "After the build", merges it only after Kiln's release is published.
