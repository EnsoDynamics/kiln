# Codex support for Kiln — Workflow integration results

**Recorded:** 2026-10-23 UTC. **Scope:** [Phase 3b2 — Connect Codex conversations to the phase and pull-request workflow](phase-3b2-codex-workflow-integration.md).

## Delivered contracts

The normal engine uses `runCodexSession` for phase and final PR conversations. The temporary execution gate is removed. Real preflight still rejects an unavailable/invalid agent, model, effort, installed method or protection profile before dispatch. Codex-only installation works without invoking Claude. The feature's agent is fixed once setup begins; each fresh conversation uses the selected next-session pair, and each resumed attempt uses its original recorded pair.

`CodexOutputReader` normalizes native parent, child, command/tool/result and error messages, keeps provider thread/turn/item identity, and deduplicates saved replay. Partial text is keyed by thread/item. Children without a reliably identified role remain subagent output; available saved child history is hydrated after a turn and during recovery checks. A visible notice explains that live child output may be unavailable and the display is not complete evidence. Item timestamps are explicitly arrival, turn or recovery times. Progress records reliable observed activity only; later activity cannot fill unobserved steps or imply completion.

Snapshots and browser views show the recorded agent, provider conversation ID, requested/effective/observed settings, original/attempt account provenance, and independent work/cleanup failures. Manual terminal turns are stored separately in `codex.recoveryObserved`, without invented launch or account provenance. Check again refreshes saved output and these facts through the evidence-only transport without dispatching work. Refresh failures remain visible and never grant workspace passage. Claude output, progress and saved records retain their existing path.

Every done and PR check obtains a fresh complete workspace audit. Unknown evidence remains unconfirmable; explicit same-conversation repair can still be offered when the conversation exists and cleanup/dispatch permit it. Notes precede repair instructions and the carry-on prompt, and the old failed audit remains an obligation. Missing conversations remove Resume while retaining a fresh-session prompt and failed evidence. Passing checks take precedence over another turn. Cleanup unknown, ambiguous dispatch and execution verification failures block automatic passage/resume. The RECOVER-001 warning appears in terminal/browser recovery guidance, independently of a work failure.

Sleep checks now occur before the runner marks an attempt ended, matching the existing Claude lifecycle. Only parent/child model messages count as resumed model activity; command completion does not suppress sleep recovery.

## Native integrated proof

`scripts/proof-run/codex-workflow-proof.mjs` runs the production Engine, local API/server, installed `codex-cli 0.162.1`, unchanged published implementation/review/hardening/refactor skills, disposable repository/worktree and local bare origin. Its `gh` peer implements only the local proof PR destination. **No real GitHub PR, product push, merge or deployment was performed.** GitHub network delivery and the assembled multi-platform/package release proof remain Phase 5.

The successful owned proof folder was `kiln-codex-workflow-AnLJuM` under the host's temporary directory. Owner-only raw logs/snapshots stay there; account details and tokens are not copied into the repo. The proof interrupted an actual `npm test` command, saved a native interrupted terminal and `tracked_processes_stopped`, then restarted the engine from disk. The original edit survived byte-for-byte. Next-session effort changed to Low, while explicit repair resumed the original phase conversation with High. The phase completed unchanged-method review/hardening, commit/refactor and push to its local bare origin, then the engine allocated a different final PR conversation with Low. Both final fresh audits passed before Complete.

| Fact | Recorded result |
|---|---|
| Phase provider thread | `01a16a12-619c-7b13-9718-0cc5a1c80768` |
| Phase local session | `9c53e0d6-b3f2-4576-8439-ecfa97d08169` |
| Phase attempts | Launch interrupted; person-resume completed, same provider thread, original `gpt-6.1-sol` / High |
| Phase audit | Complete, 49 decoded operations across parent and two children, zero findings/problems |
| Final PR provider thread | `01a16a1b-c336-7303-aecf-e0260ce17e57` |
| Final PR local session | `1abad94d-0f86-44d5-bf52-9c108606d339` |
| Final PR settings/audit | Fresh `gpt-6.1-sol` / Low; complete, five decoded operations, zero findings/problems |
| Native cleanup | Every attempt recorded `tracked_processes_stopped`; no universal containment claim |
| End state | Complete; same-thread recovery, preserved edit and original effort all asserted |

The live production browser was inspected during native work: Codex identity, native messages, child activity, settings/account facts and recovery warning appeared. Repeatable native-browser regressions exercise saved Phase detail and Needs you at 360/1280 widths, with Codex/child labels, timestamp provenance, observed/unobserved steps, requested/effective/observed facts and independent cleanup failure. They assert no horizontal overflow or browser errors.

### Failed probes and candidate requalification

The first native launch refused overlapping writable roots because Codex canonicalizes nested grants. The engine now requests the minimal workspace/assigned-external-worktree roots and still strictly verifies the effective protection profile. A second run completed the actual phase and local PR before the proof driver interrupted its PR command; fresh checks correctly completed without resuming. That run was not claimed as interruption/resume proof. The driver now targets the earlier actual test command.

The interrupted successful run initially produced inconclusive evidence for ordinary `results.forEach(text)`. This reopened candidate qualification rather than bypassing the check. The design explicitly admits exact reserved presentation globals as callbacks over already bounded, statically known arrays. No recorded JavaScript is evaluated; tool results remain opaque; arbitrary identifier/member callbacks, shadowing and output-derived tool inputs remain rejected. The added decoder regression and existing adversarial corpus pass. Rechecking the actual unchanged-method conversation with this revised static rule obtained complete coverage; explicit repair retained the original failed obligation until that fresh check passed. No Enso Method file was edited.

## Validation and handoffs

Deliverable review found and verified the manual recovery hydration fix. Independent test assessment led to fresh-conversation settings, saved browser output/progress and tool-only sleep regressions; the sleep regression caught and fixed a real end-of-attempt ordering bug. The focused workflow suite has eight passing tests. Final `npm run verify` passes: zero blocking dependency findings; lint, TypeScript and Svelte pass; 483 unit tests, 14 classifier proofs and 429 integration tests pass, with two existing skips. The final sleep assertion captures the persisted complete first-run audit before the resumed attempt has a dispatch. A concurrent focused/full browser run collided on the shared test port; the full suite passed and the focused suite was rerun alone.

[Phase 4](phase-4-codex-usage-recovery.md) is the next planned leaf and carries the implemented refusal/recovery interfaces and delivery restrictions. Actual quota refusal, changed-account recovery and repeat-refusal suppression remain its mandatory runtime proof; do not spend substantial allowance to manufacture exhaustion. [Phase 5](phase-5-codex-platform-proof.md) retains native Linux/Windows enforcement, installed-package verification, the existing favicon asset-count failure, two real phases through actual GitHub PRs and cross-repository assembly. Intermediate workflow closure establishes no release/platform support claim.

Doug's restrictions from source chat `01a1689e-dbff-7f61-9231-139a95505c95`, repeated in `01a169a3-f351-7d63-b5a7-957bec2fd46d`: “do not push without separate authorization.” “Do not modify or commit the Enso Method repo; its guidance edits await Doug's review.” This implementation continues in the same shared checkout, preserving unrelated staged `README.md` and local predecessor commits. Product commits remain local.
