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

1 (the recorded pre-integration proof); 3 (the integrated lifecycle, evidence reader and native Windows profile); 4 (validated bounded recovery implementation; actual quota proof is deferred to Doug’s live use under the PRD’s 2026-10-23 decision).

## Phase-specific notes

Complete the native Linux/Windows and installed-package matrix, including Windows parser/path coverage, rather than treating schema or macOS evidence as platform proof. The whole-workflow run uses at least two phases and the expected GitHub PRs; disposable proof repositories are not product repositories changed by this phase, so there is no Repositories line. Consolidate actual results in the shared proof-results document, retain any unrun case as an open release gap, and run the existing Claude regression path. No phase closes over an unrun mandatory proof.

## Inherited package verification failure

Phase 3b2's [workflow proof](kiln-codex-support-workflow-results.md) uses actual Codex, production Engine/API/browser and local Git, with a **local PR peer**. It proves native interruption, disk restart, explicit same-thread repair, original settings and a later fresh final conversation. It does not replace this phase's two real phases through actual GitHub PRs, cross-repository addition, manual terminal recovery, usage or native platform/package matrix. Its ordinary `results.forEach(text)` incompatibility was explicitly requalified in the design and static decoder; include that grammar in all platform/package proofs. Keep the bounded RECOVER-001 native cleanup contract and warning unchanged.

Phase 3a ran `npm run test:package` on 2026-10-23. The new installed production decoder/Acorn/helper smoke passed, as did package contents and CLI help. The existing browser assets case fails because it expects exactly two assets while the favicon adds a third. Both the favicon link and two-asset expectation already exist at baseline `59de3ed` (favicon commit `aaaba96`); this is not caused by the evidence reader. Resolve this existing package-matrix failure when proving the installed package here; do not treat the Phase 3a parser smoke as a passed whole package gate.

## Deferred live quota validation

Doug cannot supply an exhausted account and explicitly chose to validate actual quota recovery when it occurs in live use (PRD AC-PROOF-03; Phase 4’s decision and proof driver). Do not block platform/workflow implementation on that condition, spend down an account, or relabel protocol fixtures as a real refusal/recovery pass. Keep actual quota refusal, changed-account inference recovery and native repeated-refusal suppression listed as unproved until live evidence exists. The remaining native platform, package and assembled-workflow proofs are unchanged.

## Phase 4 implementation handoff

Read Phase 4’s closure/validation state and the shared proof results’ Gate 3 and Phase 4 sections. `codex-usage.ts` owns scalar terminal classification and semantic release/consumption. The protected runner rechecks fresh bracketed permission, calls the engine’s final authorization callback before allocating an automatic attempt, and saves consumption before dispatch. Preserve the original wait/run when permission becomes blocked or Ctrl+C cancels preflight; unknown/admin becomes the original quota stop. Meaningful model activity and parent terminal arrival/count are durable before cleanup, and crash reconciliation routes confirmed quota terminals back through quota policy rather than ordinary interruption resume.

Keep the existing fresh completion/workspace checks, exact evidence confirmations, original agent/thread/model/effort, independent account provenance and native cleanup warning/failure obligations. The new automated process guard asserts matching consumed permission, attempt fingerprint and account already exist on disk when `turn/start` reaches the child. Model activity clears consumed evidence idempotently; unchanged positive readings never purchase repeated attempts.

Phase 4’s full integration run passed 450 tests with two existing skips and one paused-CLI Start timeout (`src/kiln-run-underway.integration.test.ts:199`). The exact timeout also reproduces under full-suite load in the unchanged local predecessor `a88935f`. The complete CLI file passes separately in both trees; audit/lint/types, 487 unit and 14 protocol tests pass. Retain that honest baseline when running this phase’s complete package/platform verification; do not weaken assertions or adopt unrelated CLI changes as Codex implementation work.

Continue in the same local shared checkout and its local commits. Preserve unrelated staged root `README.md`. Doug’s source chat `01a1689e-dbff-7f61-9231-139a95505c95`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” The 2026-10-23 live-quota deferral changes only that proof gate; it grants no push, production, package publication or message-sending authority.
