# Phase 6: Proof on a real feature, the Windows checks, and the npm release

**Parent PRD:** docs/prds/kiln-v1/kiln-v1-prd.md
**Technical design:** docs/prds/kiln-v1/technical-design.md — relevant sections: "Package and Distribution", "Windows", "Testing Approach" ("Keep-awake on Linux desktops", "Windows", "The release")

## Summary
Kiln takes a small real feature of three to five phases from `kiln run` to a pull request ready for review, on Windows and on macOS or Linux, through a self-split phase, a stop finished by hand and a Ctrl+C that `kiln run` resumes. The release workflow then publishes it to npm as one package installed with one command.

## Acceptance criteria covered
AC-INSTALL-01, AC-PROOF-01, AC-PROOF-02, AC-INSTALL-03 (also applies to this phase's work)

## Out of scope for this phase
Anything in docs/design/kiln-after-v1-ideas.md.

## Phase dependencies
5 (the complete browser view and its controls)

## Phase-specific notes
- Human actions this phase needs: Doug creates the `ensodynamics` organization on npm before the first publish (PRD, "Pending human actions"); a person on Windows runs proof gate 1's session, interrupt, resume and sleep checks, the keep-awake check and AC-PROOF-01; the manual keep-awake check on Ubuntu GNOME and KDE, recording PLAT-001.
- Each Windows piece the design marks untried that doesn't hold comes back as a product decision (PRD, "Depends On").
