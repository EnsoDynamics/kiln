# Phase 1: Find each repository by its address, and ask before Start

**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "Names", "Finding a Checkout" ("The search"), "Asking Before Start" ("The answer"), "Worktree Folders and Labels", "Interfaces" (the two location routes before Start, "Snapshot", "Command line" for `kiln run`, `repository_details` and labels in "`kiln status --json`"), "Data Models", "Screens" (the settings while Kiln works), "Testing Approach"
**Model tier:** standard

## Summary
A phase document can name a repository by the path in its remote address (`acme-labs/admin`), and Kiln finds that repository's checkout by its `origin` anywhere the search reaches, without raising a permission prompt. When Kiln can't tell which checkout to use before Start, Documents found asks once and Kiln remembers the answer on this computer. Two repositories with the same short name get separate worktree folders and are shown by their whole path.

## Acceptance criteria covered
AC-NAME-01, AC-NAME-02, AC-FIND-01, AC-FIND-02, AC-FIND-03, AC-FIND-04, AC-FIND-05, AC-ASK-01, AC-ASK-02, AC-ASK-03, AC-ASK-04, AC-ASK-05, AC-FOLDER-01, AC-FOLDER-02, AC-SEE-01, AC-SEE-02, AC-SEE-04

## Out of scope for this phase
Everything that asks after Start (Phase 2): `kiln add-repository` taking address paths and its refusals, a session's recorded requests, the stop before a phase that asks, the question on other Needs you stops and billing holds, `kiln locate-repository`, `stop.locate[]` and the `locate_repository` capability in `kiln status`, the prompts' address-path form, and what a continuation or a base-branch start leaves out; mockup states 7 and 8. The `phase-split` skill change is made by hand outside the plan.

## Phase dependencies
None.

## Phase-specific notes
- After Start, the additions before a phase reach and find names as this phase builds them. Until Phase 2, a finding that ends in a question there fails the way a repository not found fails today.
- This phase takes the record to schema 25, with `shortName` and whole-path-form names. Phase 2 adds its own fields to that schema 25, since nothing is released between the two phases.
