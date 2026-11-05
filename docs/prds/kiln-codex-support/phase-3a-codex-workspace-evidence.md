# Phase 3a: Audit Codex conversation workspace evidence

**Closed:** 2026-10-23

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — Authoritative evidence; Native PowerShell reader; Persisted schema 4.
**Parent phase:** [Phase 3](phase-3-codex-session-workflow.md)

## Summary
Check complete saved Codex conversations, including descendants and terminal work, and bind outside-work confirmations to the exact evidence checked. Keep normal Codex execution gated.

## Acceptance criteria covered
AC-WORK-04. AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase
Execution, launch-profile readiness, live output and repair dispatch (3b); usage recovery (4); native platform/release proof (5).

## Phase dependencies
1 (qualified decoder and recorded proof); 2 (agent records and selection contracts).

## Phase-specific notes
Read the prerequisite proof and selection results. Promote the qualified raw decoder without broadening its grammar; implement the bounded paginated production reader, exact-frontier confirmation, native PowerShell interpretation and real saved-conversation proof. Missing evidence remains inconclusive and cannot be confirmed away. Phase 3b owns explicit repair dispatch; this check must retain the failed evidence obligation for it.

## Delivery authorization
Doug's source chat `01a1689e-dbff-7f61-9231-139a95505c95`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” Work in the same shared checkout, preserving unrelated staged `README.md` and local commits `1bf8365` and `59de3ed`.

## Delivery and validation

The production check and exact-evidence confirmation slice is complete. [Workspace evidence results](kiln-codex-support-workspace-evidence-results.md) records the interfaces, real saved-provider proof, parser boundary and continuation ownership. Final `npm run verify` passed dependency audit, ESLint, TypeScript/Svelte checks, 474 unit tests, all 13 prerequisite-proof tests and 388 integration tests (two existing skips; integration 82.44 seconds). Deliverable review is clean after ownership and PowerShell interpretation fixes; test hardening proves fresh reads through both phase and pull-request Check again and the remaining supported PowerShell writes.

The installed-package decoder/Acorn/helper smoke passed. The pre-existing favicon asset-count failure in the package browser case is recorded in Phase 5; the whole package gate is not claimed passed. Codex work dispatch remains gated for Phase 3b. Delivery is a local scoped commit only, excluding staged `README.md`, with no push authorized.
