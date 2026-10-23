# Phase 5: Prove the packaged Codex workflow on macOS

**Parent PRD:** [Codex support for Kiln](kiln-codex-support-prd.md)
**Technical design:** [Codex support for Kiln](kiln-codex-support-technical-design.md) — relevant sections: Codex process and version contract; Unattended execution profile; Authoritative evidence → Native PowerShell reader; Integration and Verification → Proof gates 2–4; Open Questions → Linux/Windows runtime validation — unavailable, best effort.

## Summary

Close the remaining acceptance gaps on Doug’s available Mac: validate the installed Kiln package and run a real two-phase Codex PRD through its expected GitHub pull requests. Reuse earlier proof evidence. Linux/Windows compatibility is best effort and explicitly untested; native validation there is not required for closure.

## Acceptance criteria covered

AC-COMPAT-02, AC-PROOF-03.

AC-WORK-01, AC-WORK-02, AC-WORK-03, AC-WORK-04, AC-COMPAT-01 (also applies to this phase's work).

## Out of scope for this phase

Merging, deploying or publishing a release; changing published method skills; broadening version support without its own validation; provisioning Linux/Windows hosts or requiring native proofs on them.

## Phase dependencies

1 (the recorded pre-integration proof); 3 (the integrated lifecycle, evidence reader and native Windows profile); 4 (validated bounded recovery implementation; actual quota proof is deferred to Doug’s live use under the PRD’s 2026-10-23 decision).

## Phase-specific notes

Doug’s 2026-10-23 PRD decision limits runtime validation to the available Mac. Review Linux/Windows compatibility using existing source, fixtures and parser evidence; keep the designed readiness, protection and cleanup checks. Do not claim native validation, provision other hosts or block closure on unavailable platforms. Investigate reported compatibility problems when received.

Use the installed package’s normal entry point for the assembled run, covering at least two phases and their expected actual GitHub PRs. Disposable proof repositories are not product repositories changed by this phase, so there is no Repositories line. Consolidate results in the shared proof-results document and document the validated CLI/version, prerequisites and platform limits. Run Mac package verification and the existing Claude regression path. Required missing Mac/workflow evidence blocks closure; the approved platform and live-quota limits do not.

## Existing evidence and remaining gaps

| Boundary | Evidence already available | Work required here |
|---|---|---|
| Installed package | Phase 3a package contents, CLI help and installed decoder/Acorn/helper smoke passed; browser asset count failed | Resolve the inherited package assertion against actual shipped assets and pass the complete Mac package check. Exercise the latest assembled workflow from the installed package. |
| Multi-phase GitHub delivery | Phase 3b2 ran one real phase and a fresh final conversation, using a local PR peer | Run at least two real phases through expected actual GitHub PRs; this closes the assembly/network boundary the peer did not prove. |
| Native interruption, restart, same-thread/original-pair recovery | Phase 3b1 runner and Phase 3b2 integrated Mac proofs | Reuse those results; repeat only if changed behavior or the installed package introduces an unproved boundary. |
| Cross-repository addition, manual terminal work and complete audit | Phase 1 real provider/manual proof, followed by production reader coverage in Phase 3a | Reuse the recorded proof and production coverage; do not stage another manual/repository proof solely for this phase. |
| Model/effort, live/saved output, usage and Claude compatibility | Phase 2–4 adapter/browser evidence and regression tests | Observe ordinary behavior during the assembled run and run relevant existing regression checks; do not recreate completed standalone proof scenarios. |

Before running a proof, name the missing or changed boundary it establishes. A full routine verification gate after code fixes is still required; this evidence-reuse rule avoids duplicate bespoke proof runs.

## Inherited package verification failure

Phase 3b2's [workflow proof](kiln-codex-support-workflow-results.md) uses actual Codex, production Engine/API/browser and local Git, with a **local PR peer**. It proves native interruption, disk restart, explicit same-thread repair, original settings and a later fresh final conversation. It does not prove the remaining installed-package and two-real-phase actual-GitHub boundaries. Its Mac recovery evidence and the earlier repository/manual/usage evidence remain reusable as listed above. Its ordinary `results.forEach(text)` incompatibility was explicitly requalified in the design and static decoder; retain that grammar in installed-package coverage. Keep the bounded RECOVER-001 native cleanup contract and warning unchanged.

Phase 3a ran `npm run test:package` on 2026-10-23. The new installed production decoder/Acorn/helper smoke passed, as did package contents and CLI help. The existing browser assets case fails because it expects exactly two assets while the favicon adds a third. Both the favicon link and two-asset expectation already exist at baseline `59de3ed` (favicon commit `aaaba96`); this is not caused by the evidence reader. Resolve this existing package-matrix failure when proving the installed package here; do not treat the Phase 3a parser smoke as a passed whole package gate.

## Deferred live quota validation

Doug cannot supply an exhausted account and explicitly chose to validate actual quota recovery when it occurs in live use (PRD AC-PROOF-03; Phase 4’s decision and proof driver). Do not block platform/workflow implementation on that condition, spend down an account, or relabel protocol fixtures as a real refusal/recovery pass. Keep actual quota refusal, changed-account inference recovery and native repeated-refusal suppression listed as unproved until live evidence exists. The remaining required Mac installed-package and assembled-workflow proofs are unchanged; Linux/Windows native proof is outside the acceptance gate.

## Phase 4 implementation handoff

Read Phase 4’s closure/validation state and the shared proof results’ Gate 3 and Phase 4 sections. `codex-usage.ts` owns scalar terminal classification and semantic release/consumption. The protected runner rechecks fresh bracketed permission, calls the engine’s final authorization callback before allocating an automatic attempt, and saves consumption before dispatch. Preserve the original wait/run when permission becomes blocked or Ctrl+C cancels preflight; unknown/admin becomes the original quota stop. Meaningful model activity and parent terminal arrival/count are durable before cleanup, and crash reconciliation routes confirmed quota terminals back through quota policy rather than ordinary interruption resume.

Keep the existing fresh completion/workspace checks, exact evidence confirmations, original agent/thread/model/effort, independent account provenance and native cleanup warning/failure obligations. The new automated process guard asserts matching consumed permission, attempt fingerprint and account already exist on disk when `turn/start` reaches the child. Model activity clears consumed evidence idempotently; unchanged positive readings never purchase repeated attempts.

Phase 4’s full integration run passed 450 tests with two existing skips and one paused-CLI Start timeout (`src/kiln-run-underway.integration.test.ts:199`). The exact timeout also reproduces under full-suite load in the unchanged local predecessor `a88935f`. The complete CLI file passes separately in both trees; audit/lint/types, 487 unit and 14 protocol tests pass. Retain that honest baseline when running this phase’s complete Mac package/workflow verification; do not weaken assertions or adopt unrelated CLI changes as Codex implementation work.

Continue in the same local shared checkout and its local commits. Preserve unrelated staged root `README.md`. Doug’s source chat `01a1689e-dbff-7f61-9231-139a95505c95`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” The 2026-10-23 live-quota deferral changes only that proof gate; it grants no push, production, package publication or message-sending authority.
