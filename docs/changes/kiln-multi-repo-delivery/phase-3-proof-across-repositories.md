# Phase 3: Proof on real features across repositories, and on Windows

**Parent PRD:** docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md
**Technical design:** docs/changes/kiln-multi-repo-delivery/technical-design.md — relevant sections: "Testing Approach" (AC-PROOF-01)

## Summary
A real PRD kept in a repository with no code runs from `kiln run` to an open pull request in every repository it changed, with one phase changing two code repositories and one session adding a repository nobody named; that run is repeated on Windows. Separately, a one-repository PRD's session adds a repository, and a session that edits a repository's own checkout is stopped and then cleared by the person.

## Acceptance criteria covered
AC-PROOF-01

## Out of scope for this phase
Anything not in this PRD, including publishing a new Kiln release.

## Phase dependencies
1 (multi-repository delivery and adding a repository); 2 (Stayed in the workspace and its confirmation)

## Phase-specific notes
- Human actions this phase needs: a person on Windows runs the multi-repository proof and the Windows checks the design's "Testing Approach" lists under AC-PROOF-01; the runs need real GitHub-hosted repositories and `gh` signed in to an account that can open pull requests on them, as in v1's Phase 6.
- A Windows behavior the design marks untried that doesn't hold comes back as a product decision.
