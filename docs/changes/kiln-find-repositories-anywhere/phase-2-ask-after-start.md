# Phase 2: Ask at a stop after Start

**Parent PRD:** docs/changes/kiln-find-repositories-anywhere/kiln-find-repositories-anywhere-prd.md
**Technical design:** docs/changes/kiln-find-repositories-anywhere/technical-design.md — relevant sections: "Names" (a skipped phase's address-path key), "After Start" (all of it), "Interfaces", "Data Models", "Screens", "Testing Approach"
**Model tier:** standard

## Summary
After Start, a session asks Kiln for a repository by the path in its remote address. When Kiln can't tell where that repository is, or where a repository a phase names is, a Needs you stop asks the person, and the stop can be answered on the page or with `kiln locate-repository`. Continuations and base-branch starts leave such repositories for that stop.

## Acceptance criteria covered
AC-SESSION-01, AC-ASK-06, AC-ASK-07, AC-SEE-05, AC-FOLDER-02 (also applies to this phase's work)

## Out of scope for this phase
The search, the remembered-answer store, the checks an answer gets, Documents found's questions, worktree folders and labels (Phase 1, reused here). The Enso Method's `phase-split` change, made by hand outside the plan (technical design, "The Enso Method's `phase-split`").

## Phase dependencies
1 (name resolution, the search, the remembered-answer store and the checks an answer gets, labels, schema 25)
