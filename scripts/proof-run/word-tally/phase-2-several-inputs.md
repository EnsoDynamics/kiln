# Phase 2: Several files and standard input

**Parent PRD:** docs/prds/word-tally/word-tally-prd.md
**Technical design:** docs/prds/word-tally/technical-design.md — relevant sections: "Output", "Standard input"

## Summary
`tally` counts several files with a total line, and counts standard input when given no file names.

## Acceptance criteria covered
AC-TALLY-03, AC-TALLY-04

## Phase dependencies
1

## Phase-specific notes
- Split this phase before building it, with `phase-split`: phase 2a, several files and the total line (AC-TALLY-03), then phase 2b, standard input (AC-TALLY-04), which depends on 2a. Then build 2a in this session. The split is deliberate: this feature is the end-to-end proof of a tool that has to follow a phase that splits itself.
