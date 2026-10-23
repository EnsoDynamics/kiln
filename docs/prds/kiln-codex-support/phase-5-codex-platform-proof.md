# Phase 5: Prove the packaged Codex workflow on every platform

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — relevant sections: Codex process and version contract; Unattended execution profile; Authoritative evidence → Native PowerShell reader; Integration and Verification → Proof gates 2–4; Open Questions → Platform runtime proof.

## Summary

Demonstrate the packaged Kiln Codex workflow on macOS, Linux and native Windows, and run a real multi-phase PRD through its expected pull requests. Document the supported version and prerequisites only when the required real proofs pass.

## Acceptance criteria covered

AC-COMPAT-02, AC-PROOF-03.

AC-WORK-01, AC-WORK-02, AC-WORK-03, AC-WORK-04, AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase

Merging, deploying or publishing a release; changing published method skills; broadening version support without its own validation.

## Phase dependencies

1 (the recorded pre-integration proof); 3 (the integrated lifecycle, evidence reader and native Windows profile); 4 (passed real usage-refusal/recovery proof and bounded recovery implementation).

## Phase-specific notes

Complete the native Linux/Windows and installed-package matrix, including Windows parser/path coverage, rather than treating schema or macOS evidence as platform proof. The whole-workflow run uses at least two phases and the expected GitHub PRs; disposable proof repositories are not product repositories changed by this phase, so there is no Repositories line. Consolidate actual results in the shared proof-results document, retain any unrun case as an open release gap, and run the existing Claude regression path. No phase closes over an unrun mandatory proof.

## Inherited package verification failure

Phase 3a ran `npm run test:package` on 2026-10-23. The new installed production decoder/Acorn/helper smoke passed, as did package contents and CLI help. The existing browser assets case fails because it expects exactly two assets while the favicon adds a third. Both the favicon link and two-asset expectation already exist at baseline `59de3ed` (favicon commit `aaaba96`); this is not caused by the evidence reader. Resolve this existing package-matrix failure when proving the installed package here; do not treat the Phase 3a parser smoke as a passed whole package gate.
