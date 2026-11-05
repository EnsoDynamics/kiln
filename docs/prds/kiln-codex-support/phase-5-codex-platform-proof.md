# Phase 5: Prove the packaged Codex workflow on macOS

**Closed:** 2026-10-23

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

## Proof preparation and retained fixture — 2026-10-23

The complete Mac package check passes all four cases after correcting the inherited two-asset assumption: the installed page ships JavaScript, CSS and an SVG favicon, each fetched successfully, plus bundled fonts. Installed decoder coverage includes the already qualified `results.forEach(text)` form. The initial package fix changed only its assertions; the native run subsequently required the strict-comparison decoder qualification below.

The reproducible actual-GitHub fixture and installed-entry-point driver are `scripts/proof-run/codex-packaged-workflow-files.json` and `scripts/proof-run/codex-packaged-workflow-proof.mjs`; prerequisites and exact execution boundaries are in `docs/release/kiln-codex-macos-validation.md`. The two phases build plain and uppercase greetings in one disposable repository, yielding one expected PR. The driver uses the installed `kiln` executable, normal authenticated API, real Codex and real `gh`, and requires Complete, distinct ordered Codex conversations for both phases and the final PR with matching requested/effective/observed settings and complete clean audits, distinct phase pushes, tests/clean worktree, matching pushed/PR head and unchanged base. No actual-GitHub pass is claimed by preparing it.

Owned local fixture: `/private/var/folders/p3/fyw8z5213xn41qkl15tr42d80000gn/T/kiln-codex-package-trqBpA`. Its manifest records seed `a23d918d597bbb650ded08c1ac9f600dbc06ca32`, intended private destination `EnsoDynamics/kiln-proof-codex-macos-20261023`, and the installed temporary `prefix/bin/kiln`. Seed mode performed no network writes. Preserve this folder and its owner-only evidence.

## Disposable proof authorization — 2026-10-23

Doug replied “Authorize disposable proof only” in chat `01a16abe-da90-7ae0-8c0a-be086b7b1742` to the explicit request to create private `EnsoDynamics/kiln-proof-codex-macos-20261023`, push its prepared seed and Kiln-assigned proof branch, and open its final PR. This authorizes those fixture writes only. Kiln product commits stay local; merges, deployments, package publication and Enso Method edits remain excluded. The authorized actual-GitHub run subsequently passed; see final validation below.

## Runtime qualification found by the packaged proof

Phase 1 of the disposable fixture completed and pushed `7ca35c00c2fd5ae136486840e2d9febabe83c2c0`, but the installed package correctly stopped at Needs you: an ordinary presentation wrapper compared an opaque settled-result status with `fulfilled` using strict equality. Its raw call `call_bd3aec293cfa43d985f3a2c3deb7e0c1` belongs to parent `01a16aca-ec0e-7441-a0fd-ab41be2f59b9`; the original audit was inconclusive and was not confirmed away.

The design now explicitly admits only strict primitive equality/inequality, preserving unknown opaque/pending values and visiting both operands and conditional branches. A sanitized recorded wrapper with original digest and exact expected calls, adversarial operand/branch/taint regressions, and an installed comparison smoke qualify this bounded extension. No recorded JavaScript is evaluated, no tool output supplies a tool input, and no method skill or proof prompt was changed to impose a different wrapper syntax. The original stopped snapshot, terminal and driver logs remain owner-only under the proof folder with `initial-native-audit-failure-` prefixes.

Repacking and reinstalling into the same temporary prefix lets the normal installed CLI reread the original saved evidence and continue the existing PRD. The driver preserves the fixed agent/settings and does not dispatch an unnecessary repair turn. Source and compiled decoder digests differ because TypeScript emits JavaScript; `installed-revision.json` compares the installed bytes with the compiled build and records the tarball digest. The assembled run and final verification subsequently passed as recorded below.


The final PR conversation `01a16ad4-8fdb-7e02-93a5-8c28b185f5de` opened actual [proof PR #1](https://github.com/EnsoDynamics/kiln-proof-codex-macos-20261023/pull/1), ready for review and mergeable at `0b27d19451970a00557517b4efd2839348c06b2f`. Its final fresh audit correctly stopped on a display-only tool-catalogue query in call `call_554bd5396294424fa1e350e836dec827`. The design was amended before the decoder: the reserved catalogue receives a pure syntax validator, never evaluation, callback execution, tool dispatch or literal input provenance. The original failed check remains retained under `final-pr-catalogue-audit-failure-` files; a raw fixture with digest, callback/operand/taint negatives and fresh installed smoke qualify this second ordinary form before rechecking the same final conversation. No new inference conversation or duplicate PR is required.


## Final validation and audit handoff — 2026-10-23

Phase 5 is complete under the PRD's approved Mac-only runtime and deferred live-quota scope. The installed normal entry point carried two real phases and a fresh final conversation to the expected actual GitHub PR. All 91 policy operations across seven owning conversations are completely audited with zero findings/problems. Driver-owned phase behavior, exact recorded settings, ordered distinct conversations/pushes, saved output, clean worktree, PR head and unchanged base checks pass. The shared proof results record exact identities, artifact hashes and reused evidence; the prerequisites document records the CLI/version and platform limits.

Final gate: `npm run audit && npm run lint && npm run typecheck && npm test && npm run test:codex-proof && npm run test:integration -- --maxWorkers=4` passes dependency audit (zero blocking findings), ESLint, TypeScript/Svelte (zero errors/warnings), 487 unit tests, 16 protocol proofs and 451 integration tests with two existing skips (final integration 270.03 seconds). The complete `npm run test:package` passes all four cases after both decoder qualifications. Independent deliverable review and test hardening completed with no remaining material findings, including a final audit of retained raw facts and artifact hashes. Refactor judgment follows the scoped local feature commit.

The initial default-concurrency `npm run verify` completed with 448 integration passes, two existing skips and three timing failures: the inherited paused-CLI Start timeout, a requestUserInput five-second elapsed assertion and a usage-reset polling deadline. Their runtime code/tests were unchanged. The complete suite passed with all assertions intact at four workers before the grammar fixes (488.64 seconds), after strict comparisons (304.37 seconds), and after the final catalogue rule (270.03 seconds). No timeout was loosened, test skipped, CLI change adopted or worker configuration committed. Preserve this execution distinction when reproducing the gate.

The seven planned leaves are closed. The next unit is **whole-PRD delivery audit**, followed by the whole-PRD test audit; neither runs in this implementing chat. Use the same local shared checkout, retaining all local predecessor commits and the unrelated staged README. Source restrictions remain: Doug in `01a1689e-dbff-7f61-9231-139a95505c95`, “do not push without separate authorization” and “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” The 2026-10-23 answer “Authorize disposable proof only” in `01a16abe-da90-7ae0-8c0a-be086b7b1742` was limited to the named proof repo's seed/feature pushes and PR; it grants no product push or future proof writes. No current human action remains in Phase 5. Product delivery is a scoped local commit; no merge, deployment, publication or Enso Method modification occurred.
