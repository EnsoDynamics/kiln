# Phase 3: Proof on real features across repositories

**Closed:** 2026-10-22

**Parent PRD:** docs/changes/kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md
**Technical design:** docs/changes/kiln-multi-repo-delivery/technical-design.md — relevant sections: "Testing Approach" (AC-PROOF-01)

## Summary
On macOS, a real PRD kept in a repository with no code runs from `kiln run` to an open pull request in every repository it changed, with one phase changing two code repositories and one session adding a repository nobody named. Separately, a one-repository PRD's session adds a repository, and a session that edits a repository's own checkout is stopped and then cleared by the person.

## Acceptance criteria covered
AC-PROOF-01

## Out of scope for this phase
Any run on Windows (PRD, Out of Scope); publishing a new Kiln release.

## Phase dependencies
1 (multi-repository delivery and adding a repository); 2 (Stayed in the workspace and its confirmation)

## Phase-specific notes
- Results: [Kiln multi-repo proof run results](../../design/kiln-multi-repo-proof-run-results.md).
- Human action this phase needs: the runs need real GitHub-hosted repositories and `gh` signed in to an account that can open pull requests on them, as in v1's Phase 6.

## Inherited from Phase 2
- Stayed in the workspace reads each session's Claude Code transcript under `CLAUDE_CONFIG_DIR`, or `~/.claude` when that is unset. A run made with `CLAUDE_CODE_SKIP_PROMPT_HISTORY` set keeps no transcript, so every session stops at Needs you with "No transcript found" (OUT-003). Run with transcripts kept.
- The stop-and-clear run (AC-PROOF-01's last sentence) is cleared on Needs you: tick "The changes outside the workspace have been dealt with", then press Check again. Kiln resumes nothing on its own once the check has failed, after an interruption too (AC-OUTSIDE-04).
- The runs need Kiln built from `develop` at or after Phase 2's commit. The packed 1.0.0 predates multi-repo delivery.
- The transcript reader was checked against one real Claude Code 2.1.307 transcript: a Write, a `cd … && git commit`, and a subagent's Write outside the workspace (`test/fixtures/transcript-outside-workspace/`). Phase 3's runs are its first use on full sessions.
